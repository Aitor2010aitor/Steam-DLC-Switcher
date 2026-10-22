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
        clearTimeout: () => {},
        clearInterval: () => {},
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

// Cuadricula con muchas filas donde React "repinta" la lista entera cada vez que cambia
// un DLC: sustituye TODAS las casillas por nodos nuevos. Un clic sobre un nodo que ya no
// esta montado no llega al componente (React escucha en la raiz), asi que no hace nada.
function buildToggleDom(doc, count) {
    const state = [];
    const clicked = {};
    const cells = [];

    const grid = doc.createElement('div');
    grid.setAttribute('role', 'table');

    const headerRow = doc.createElement('div');
    headerRow.setAttribute('role', 'row');
    const colHeader = doc.createElement('div');
    colHeader.setAttribute('role', 'columnheader');
    colHeader.textContent = 'Instalar';
    headerRow.appendChild(colHeader);
    grid.appendChild(headerRow);

    function makeCheckbox(i) {
        const cell = cells[i];
        const cb = doc.createElement('div');
        cb.setAttribute('role', 'checkbox');
        cb.setAttribute('aria-checked', state[i] ? 'true' : 'false');
        cb.addEventListener('click', function () {
            // Nodo muerto: React ya lo sustituyo al repintar -> el clic se pierde.
            if (cell.childNodes[0] !== cb) return;
            clicked[i] = (clicked[i] || 0) + 1;
            state[i] = !state[i];
            repaint();
        });
        return cb;
    }

    function repaint() {
        cells.forEach(function (cell, i) {
            const fresh = makeCheckbox(i);
            cell.childNodes.splice(0, cell.childNodes.length, fresh);
            fresh.parentNode = cell;
        });
    }

    for (let i = 0; i < count; i++) {
        state.push(true);
        const row = doc.createElement('div');
        row.setAttribute('role', 'row');

        const cell = doc.createElement('div');
        cell.setAttribute('role', 'cell');
        cells.push(cell);
        cell.appendChild(makeCheckbox(i));

        const nameCell = doc.createElement('div');
        nameCell.setAttribute('role', 'cell');
        const a = doc.createElement('a');
        a.setAttribute('href', '#');
        a.textContent = 'DLC ' + i;
        nameCell.appendChild(a);

        row.appendChild(cell);
        row.appendChild(nameCell);
        grid.appendChild(row);
    }

    const topRow = doc.createElement('div');
    const search = doc.createElement('input');
    search.setAttribute('type', 'text');
    topRow.appendChild(search);

    doc.body.appendChild(topRow);
    doc.body.appendChild(grid);
    return { grid, state, clicked };
}

// Pestana DLC con la lista COMPLETA en las props de React (details.vecDLC) pero solo
// unas pocas filas dibujadas en el DOM, que es lo que pasa con 700+ DLC.
function buildApiDom(doc, count) {
    const vecDLC = [];
    for (let i = 0; i < count; i++) {
        vecDLC.push({ unAppID: 2000 + i, strName: 'DLC ' + i, bEnabled: true });
    }

    const grid = doc.createElement('div');
    grid.setAttribute('role', 'table');

    const headerRow = doc.createElement('div');
    headerRow.setAttribute('role', 'row');
    const colHeader = doc.createElement('div');
    colHeader.setAttribute('role', 'columnheader');
    headerRow.appendChild(colHeader);
    grid.appendChild(headerRow);

    // Solo 3 filas montadas: el resto de DLC no esta en el DOM.
    for (let i = 0; i < 3; i++) {
        const row = doc.createElement('div');
        row.setAttribute('role', 'row');
        const cell = doc.createElement('div');
        cell.setAttribute('role', 'cell');
        const cb = doc.createElement('div');
        cb.setAttribute('role', 'checkbox');
        cb.setAttribute('aria-checked', 'true');
        cell.appendChild(cb);
        row.appendChild(cell);
        grid.appendChild(row);
    }

    const topRow = doc.createElement('div');
    const search = doc.createElement('input');
    search.setAttribute('type', 'text');
    topRow.appendChild(search);
    doc.body.appendChild(topRow);
    doc.body.appendChild(grid);

    // Cadena de fibers como React: div[role=table] -> componente hi({details})
    const detailsFiber = { memoizedProps: { details: { unAppID: 427100, vecDLC } }, return: null };
    grid.__reactFiber$zzz = { memoizedProps: {}, return: detailsFiber };

    return { grid, vecDLC };
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

// ============================================================================
// Toggle con lista grande y React repintando la lista en cada clic.
// La version con tandas (8 cada 30 ms) pulsaba nodos que ya no estaban montados:
// solo cambiaban los 8 primeros. La v1 los pulsa todos en la misma pasada.
// ============================================================================
console.log('\n=== ESCENARIO TOGGLE: 60 DLC y React repinta la lista en cada clic ===');
{
    const { doc: d3, win: w3, rafQueue: q3 } = makeDom();
    const data = buildToggleDom(d3, 60);
    const sb3 = { window: w3, console, Object, Array, Math, JSON, Date, String, RegExp, Uint8Array, TextDecoder };
    sb3.globalThis = sb3;
    vm.createContext(sb3);
    vm.runInContext(src, sb3, { filename: 'plugin.js' });
    while (q3.length) { const cb = q3.shift(); cb(); }

    const c3 = d3.querySelector('#dlc-toggle-custom-container');
    const btns3 = descendants(c3).filter(n => n.tagName === 'BUTTON');
    const off = btns3[1];
    check('boton Desactivar Todos presente', !!off && /Desactivar/.test(off.textContent),
        btns3.map(b => b.textContent).join(' | '));

    off.dispatch('click', { target: off, preventDefault() {}, stopPropagation() {} });
    // Se vacia la cola, que es donde antes vivian las tandas con setTimeout.
    while (q3.length) { const cb = q3.shift(); cb(); }

    const stillOn = data.state.filter(Boolean).length;
    check('los 60 DLC se desactivan (ninguna referencia muerta)', stillOn === 0,
        'quedan ' + stillOn + ' activados');

    const clickedCount = Object.keys(data.clicked).length;
    check('se pulso cada casilla una vez', clickedCount === 60, 'pulsadas: ' + clickedCount);
    check('ninguna casilla se pulso dos veces', Object.keys(data.clicked).every(k => data.clicked[k] === 1),
        JSON.stringify(data.clicked));
}

// ============================================================================
// Lista completa via API de Steam: 60 DLC en las props pero solo 3 dibujados.
// Pulsando casillas solo cambiaban los dibujados; SetDLCEnabled los cambia todos.
// ============================================================================
console.log('\n=== ESCENARIO API: 60 DLC en props, solo 3 dibujados ===');
{
    const { doc: d4, win: w4, rafQueue: q4 } = makeDom();
    const data4 = buildApiDom(d4, 60);

    const calls = [];
    w4.SteamClient = {
        Apps: {
            SetDLCEnabled(appid, dlcId, enabled) {
                calls.push({ appid, dlcId, enabled });
                const dlc = data4.vecDLC.find(x => x.unAppID === dlcId);
                if (dlc) dlc.bEnabled = enabled;
            },
        },
    };

    const sb4 = { window: w4, console, Object, Array, Math, JSON, Date, String, RegExp, Uint8Array, TextDecoder };
    sb4.globalThis = sb4;
    vm.createContext(sb4);
    vm.runInContext(src, sb4, { filename: 'plugin.js' });
    while (q4.length) { const cb = q4.shift(); cb(); }

    const c4 = d4.querySelector('#dlc-toggle-custom-container');
    const btns4 = descendants(c4).filter(n => n.tagName === 'BUTTON');
    const on4 = btns4[0];
    const off4 = btns4[1];

    off4.dispatch('click', { target: off4, preventDefault() {}, stopPropagation() {} });
    check('Desactivar llama a SetDLCEnabled para los 60', calls.length === 60, 'llamadas: ' + calls.length);
    check('con el appid correcto', calls.every(c => c.appid === 427100), JSON.stringify(calls[0]));
    check('todos a false, incluidos los no dibujados', calls.every(c => c.enabled === false));
    check('ninguno se quedo activado', data4.vecDLC.every(d => d.bEnabled === false));

    calls.length = 0;
    on4.dispatch('click', { target: on4, preventDefault() {}, stopPropagation() {} });
    check('Activar vuelve a llamar 60 veces', calls.length === 60, 'llamadas: ' + calls.length);
    check('todos a true', calls.every(c => c.enabled === true));

    // Exportar tiene que usar la lista completa, no solo las 3 filas dibujadas
    let downloaded4 = null;
    w4.Blob = class { constructor(parts) { downloaded4 = parts.join(''); } };
    const exp4 = btns4.find(b => b.textContent === 'Exportar');
    check('boton Exportar presente', !!exp4);
    exp4.dispatch('click', { target: exp4, preventDefault() {}, stopPropagation() {} });
    const lines4 = (downloaded4 || '').split('\r\n').filter(Boolean);
    check('Exportar incluye los 60 DLC (no solo los 3 dibujados)', lines4.length === 61,
        'lineas: ' + lines4.length);
    check('el export lleva IDs de los no dibujados', lines4.slice(1).every(l => /^\d+\t/.test(l)));
}

console.log('\n' + (fail === 0 ? 'RESULTADO FINAL: TODO OK' : 'RESULTADO FINAL: ' + fail + ' FALLOS'));
process.exit(fail === 0 ? 0 : 1);