// Arnés de pruebas: ejecuta el plugin real contra un DOM minimo y comprueba que
// la inyeccion ocurre UNA sola vez y que los atributos se aplican de verdad.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function makeSelectorEngine(root, doc) {
    // Soporta solo los selectores que usa el plugin.
    function matches(node, sel) {
        sel = sel.trim();
        if (sel.startsWith('#')) return node.getAttribute('id') === sel.slice(1);
        if (sel.startsWith('.')) return (node.className || '').split(/\s+/).includes(sel.slice(1));

        // "tag[attr="v"][attr*="v"]"  |  "[attr]"  |  "tag"
        const tagMatch = sel.match(/^[a-zA-Z][\w-]*/);
        const tag = tagMatch ? tagMatch[0].toUpperCase() : null;
        if (tag && node.tagName !== tag) return false;

        const attrRe = /\[([\w-]+)(?:([*^$~|]?=)"([^"]*)")?\]/g;
        let m;
        let any = false;
        while ((m = attrRe.exec(sel))) {
            any = true;
            const [, name, op, value] = m;
            const actual = node.getAttribute(name);
            if (actual === null) return false;
            if (op === '=') { if (actual !== value) return false; }
            else if (op === '*=') { if (!actual.includes(value)) return false; }
            else if (op === '^=') { if (!actual.startsWith(value)) return false; }
        }
        return any || !!tag;
    }

    function collect(node, out) {
        for (const child of node.childNodes) {
            out.push(child);
            collect(child, out);
        }
        return out;
    }

    function query(sel, from) {
        const list = String(sel).split(',').map(s => s.trim()).filter(Boolean);
        const all = collect(from || root, []);
        return all.filter(n => list.some(s => matches(n, s)));
    }
    return { query, matches };
}

function makeDom() {
    const doc = {
        __injections: 0,
        __singletonGuardHits: 0,
    };

    function createNode(tag) {
        const node = {
            tagName: String(tag).toUpperCase(),
            childNodes: [],
            attrs: {},
            style: {},
            className: '',
            textContent: '',
            _listeners: {},
            setAttribute(k, v) { this.attrs[k] = String(v); },
            getAttribute(k) { return this.attrs[k] === undefined ? null : this.attrs[k]; },
            removeAttribute(k) { delete this.attrs[k]; },
            hasAttribute(k) { return this.attrs[k] !== undefined; },
            addEventListener(t, fn) { (this._listeners[t] = this._listeners[t] || []).push(fn); },
            dispatch(t, ev) { (this._listeners[t] || []).forEach(fn => fn(ev || { preventDefault() {}, stopPropagation() {} })); },
            appendChild(c) {
                if (c.getAttribute && c.getAttribute('id') === 'dlc-toggle-custom-container') doc.__injections++;
                this.childNodes.push(c); c.parentNode = this; return c;
            },
            insertBefore(c, ref) {
                if (c.getAttribute && c.getAttribute('id') === 'dlc-toggle-custom-container') doc.__injections++;
                const i = this.childNodes.indexOf(ref);
                if (i === -1) return this.appendChild(c);
                this.childNodes.splice(i, 0, c); c.parentNode = this; return c;
            },
            remove() {
                if (this.parentNode) {
                    const i = this.parentNode.childNodes.indexOf(this);
                    if (i > -1) this.parentNode.childNodes.splice(i, 1);
                }
            },
            contains(other) {
                if (other === this) return true;
                return this.childNodes.some(c => c.contains(other));
            },
            closest(sel) {
                let cur = this;
                while (cur) {
                    if (cur.tagName && engine.matches(cur, sel.split(',')[0].trim())) return cur;
                    cur = cur.parentNode;
                }
                return null;
            },
            matches(sel) { return sel.split(',').some(s => engine.matches(this, s.trim())); },
            querySelector(sel) { return engine.query(sel, this)[0] || null; },
            querySelectorAll(sel) { return engine.query(sel, this); },
            get files() { return []; },
            get value() { return this._value || ''; },
            set value(v) { this._value = v; },
            click() { this.dispatch('click', { target: this }); },
        };
        node.style = { cssText: '' };
        node.classList = {
            contains: (c) => String(node.className).split(/\s+/).includes(c),
        };
        Object.defineProperty(node, 'parentElement', {
            get() { return this.parentNode || null; },
        });
        Object.defineProperty(node, 'previousElementSibling', {
            get() {
                if (!this.parentNode) return null;
                const kids = this.parentNode.childNodes;
                const i = kids.indexOf(this);
                return i > 0 ? kids[i - 1] : null;
            },
        });
        return node;
    }

    const body = createNode('body');
    doc.body = body;
    const engine = makeSelectorEngine(body, doc);
    doc.querySelector = sel => engine.query(sel)[0] || null;
    doc.querySelectorAll = sel => engine.query(sel);
    doc.getElementById = id => engine.query('#' + id)[0] || null;
    doc.contains = node => body.contains(node);
    doc.createElement = createNode;
    doc.addEventListener = () => {};

    // Cuenta cuantas veces se inserta el contenedor de botones.
    // (El conteo se hace en appendChild/insertBefore de cualquier nodo.)

    const rafQueue = [];
    const win = {
        document: doc,
        MutationObserver: class { observe() {} disconnect() {} },
        requestAnimationFrame: (cb) => { rafQueue.push(cb); return rafQueue.length; },
        setTimeout: (cb) => { rafQueue.push(cb); return rafQueue.length; },
        setInterval: () => 0,
        addEventListener: () => {},
        localStorage: { getItem: () => null, setItem: () => {} },
        navigator: {},
        URL: { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} },
        Blob: class {},
        open: () => null,
        console,
    };
    doc.defaultView = win;
    return { doc, win, rafQueue };
}

function buildDlcDom(doc, opts) {
    // Replica la estructura real de Steam: role=table > role=row > role=cell > role=checkbox
    // opts.react = true  -> cuelga fibers de React con {dlc:{unAppID,strName,bEnabled}}
    // opts.react = false -> href="#" como hace Steam cuando BuildSteamURL() no resuelve
    const o = opts || {};
    const grid = doc.createElement('div');
    grid.setAttribute('role', 'table');

    const headerRow = doc.createElement('div');
    headerRow.setAttribute('role', 'row');
    const colHeader = doc.createElement('div');
    colHeader.setAttribute('role', 'columnheader');
    colHeader.textContent = 'Instalar';
    headerRow.appendChild(colHeader);
    grid.appendChild(headerRow);

    for (let i = 0; i < 3; i++) {
        const row = doc.createElement('div');
        row.setAttribute('role', 'row');

        const cellInstall = doc.createElement('div');
        cellInstall.setAttribute('role', 'cell');
        const cb = doc.createElement('div');
        cb.setAttribute('role', 'checkbox');
        // aria-checked DELIBERADAMENTE incorrecto si hay React: simula que el DOM miente
        cb.setAttribute('aria-checked', o.react ? 'false' : (i < 2 ? 'true' : 'false'));
        cellInstall.appendChild(cb);

        const cellName = doc.createElement('div');
        cellName.setAttribute('role', 'cell');
        const a = doc.createElement('a');
        // Steam pone href="#" cuando la URL no resuelve -> no hay appid en el DOM
        a.setAttribute('href', o.react ? '#' : 'https://store.steampowered.com/app/' + (1000 + i) + '/');
        a.textContent = 'DLC ' + i;
        cellName.appendChild(a);

        row.appendChild(cellInstall);
        row.appendChild(cellName);
        grid.appendChild(row);

        if (o.react) {
            // Cadena de fibers como React: celda -> fila -> componente pi({dlc})
            const dlc = { unAppID: 1000 + i, strName: 'React DLC ' + i, bEnabled: i < 2 };
            const rowFiber = { memoizedProps: { dlc }, return: null };
            const cbFiber = { memoizedProps: { checked: dlc.bEnabled }, return: rowFiber };
            cb.__reactFiber$abc123 = cbFiber;
        }
    }

    // Fila superior REAL de Steam: el buscador + "Ver mas en la tienda". Su clase va
    // hasheada (ZII4C3WPvs65P3yvAtV69), asi que el plugin debe hallarla por ESTRUCTURA:
    // es el hermano que va justo antes de la cuadricula y lleva un <input>.
    const topRow = doc.createElement('div');
    topRow.className = 'ZII4C3WPvs65P3yvAtV69';
    topRow.setAttribute('flow-children', 'row');
    const storeBtn = doc.createElement('button');
    storeBtn.textContent = 'Ver mas en la tienda';
    topRow.appendChild(storeBtn);
    const search = doc.createElement('input');
    search.setAttribute('type', 'text');
    search.setAttribute('placeholder', 'Buscar');
    topRow.appendChild(search);

    doc.body.appendChild(topRow);
    doc.body.appendChild(grid);
    return grid;
}

// ---------------------------------------------------------------- ejecutar
const src = fs.readFileSync(path.join(__dirname, 'frontend', 'index.js'), 'utf8');
const { doc, win, rafQueue } = makeDom();
buildDlcDom(doc);

const sandbox = { window: win, console, Object, Array, Math, JSON, Date, String, RegExp, Uint8Array, TextDecoder };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(src, sandbox, { filename: 'plugin.js' });

const containers = () => doc.querySelectorAll('#dlc-toggle-custom-container').length;

// Simula lo que hace React: montarlo todo genera cientos de mutaciones -> se encola via rAF
for (let i = 0; i < 200; i++) {
    const cb = rafQueue.shift();
    if (cb) cb();
}

let pass = 0, fail = 0;
function check(name, cond, extra) {
    if (cond) { console.log('  OK   ' + name); pass++; }
    else { console.log('  FAIL ' + name + (extra ? '  -> ' + extra : '')); fail++; }
}

console.log('\n--- Inyeccion ---');
const injected = doc.querySelector('#dlc-toggle-custom-container');
check('el contenedor existe', containers() === 1, 'hay ' + containers());
check('NO se duplica tras 200 mutaciones', doc.__injections === 1, 'inyecciones: ' + doc.__injections);
check('el contenedor tiene id', !!(injected && injected.getAttribute('id')), 'sin id: el guard de getElementById no protegeria');

console.log('\n--- Atributos (el bug del attrs) ---');
function descendants(node, out = []) {
    for (const c of node.childNodes) { out.push(c); descendants(c, out); }
    return out;
}
const btns = injected ? descendants(injected).filter(n => n.tagName === 'BUTTON') : [];
check('hay 4 botones', btns.length === 4, 'hay ' + btns.length);
check('los botones tienen texto', btns.every(b => b.textContent && b.textContent.length > 0),
    btns.map(b => JSON.stringify(b.textContent)).join(' '));
const fileInput = doc.querySelectorAll('input[type="file"]');
check('input type=file existe', fileInput.length === 1, 'hay ' + fileInput.length);
check('el input file esta oculto', fileInput[0].style.cssText.indexOf('display:none') > -1, fileInput[0].style.cssText);

console.log('\n--- Deteccion de DLC ---');
const grid = doc.querySelector('[role="table"]');
const rows = grid.querySelectorAll('[role="row"]').filter(r => !r.querySelector('[role="columnheader"]'));
check('3 filas de DLC detectadas', rows.length === 3, 'hay ' + rows.length);

const container = doc.querySelector('#dlc-toggle-custom-container');
check('insertado DENTRO de la fila del buscador (no en linea propia)',
    container && container.parentNode === grid.previousElementSibling,
    'padre: ' + (container && container.parentNode && container.parentNode.className));
check('los botones van detras del buscador, sin empujar la cuadricula',
    container && container.parentNode.childNodes[container.parentNode.childNodes.length - 1] === container);

console.log('\n' + (fail === 0 ? 'TODO OK' : fail + ' FALLOS') + '  (' + pass + ' correctas)');

// ============================================================================
// Escenario real: Steam pone href="#" (no hay appid en el DOM) y aria-checked
// mintiendo. Solo las props de React dan id/nombre/estado correctos.
// ============================================================================
console.log('\n=== ESCENARIO STEAM REAL: href="#" + aria-checked erroneo ===');
{
    const { doc: d2, win: w2, rafQueue: q2 } = makeDom();
    buildDlcDom(d2, { react: true });
    const sb2 = { window: w2, console, Object, Array, Math, JSON, Date, String, RegExp, Uint8Array, TextDecoder };
    sb2.globalThis = sb2;
    vm.createContext(sb2);
    vm.runInContext(src, sb2, { filename: 'plugin.js' });
    while (q2.length) { const cb = q2.shift(); cb(); }

    const c2 = d2.querySelector('#dlc-toggle-custom-container');
    check('contenedor inyectado una vez', d2.querySelectorAll('#dlc-toggle-custom-container').length === 1);

    const grid2 = d2.querySelector('[role="table"]');
    const rows2 = grid2.querySelectorAll('[role="row"]').filter(r => !r.querySelector('[role="columnheader"]'));
    const links2 = rows2.map(r => r.querySelector('a[href*="/app/"]'));
    check('el DOM NO tiene ningun enlace /app/ (como en Steam real)', links2.every(l => l === null));

    // El boton Exportar debe generar un texto con IDs y solo los activados
    const desc = descendants(c2).filter(n => n.tagName === 'BUTTON').find(b => b.textContent === 'Exportar');
    check('boton Exportar presente', !!desc);

    let downloaded = null;
    w2.Blob = class { constructor(parts) { downloaded = parts.join(''); } };
    let clickedAnchor = null;
    doc.__anchorSpy = null;
    desc.dispatch('click', {
        target: desc, preventDefault() {}, stopPropagation() {},
    });

    check('se genero el fichero', downloaded !== null);
    if (downloaded) {
        const lines = downloaded.split('\r\n').filter(Boolean);
        check('cabecera correcta', lines[0] === 'Steam DLC Switcher export v1', lines[0]);
        check('solo los 2 DLC activados por React', lines.length === 3, 'lineas: ' + lines.length);
        check('todos tienen ID', lines.slice(1).every(l => /^\d+\t/.test(l)), JSON.stringify(lines.slice(1, 3)));
        check('nombres vienen de React', lines[1].indexOf('React DLC') > -1, lines[1]);
        check('NO hay lineas sin ID (bug del fichero de 719 lineas)',
            lines.slice(1).every(l => l.split('\t')[0].length > 0));
    }
}

console.log('\n' + (fail === 0 ? 'RESULTADO FINAL: TODO OK' : 'RESULTADO FINAL: ' + fail + ' FALLOS'));
process.exit(fail === 0 ? 0 : 1);