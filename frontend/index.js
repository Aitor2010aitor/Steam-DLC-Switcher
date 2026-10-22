(function () {
    'use strict';

    console.log('[Steam DLC Switcher] Inicializando plugin...');

    var CONTAINER_ID = 'dlc-toggle-custom-container';
    var TOAST_ID = 'dlc-switcher-toast';
    var STORAGE_KEY = 'steam-dlc-switcher:last-export';
    var FORMAT_V1 = 'Steam DLC Switcher export v1';
    var FILE_NAME = 'steam-dlc-switcher.txt';

    // Steam genera las clases CSS con hashes (_3sXdOJ9DEh5zdS54_ptwgW), asi que
    // [class*="DlcGrid"] no existe en el DOM actual. Localizamos por roles ARIA
    // (estables entre actualizaciones) y dejamos los nombres antiguos como plan B.
    var LEGACY_TABLE = '[class*="DlcGrid"]';
    var LEGACY_TOP_ROW = '[class*="DlcTopRow"]';
    var LEGACY_ROW = '[class*="DlcRow"], [class*="DlcEntry"], [class*="DlcItem"]';
    var ID_ATTRS = ['data-appid', 'data-app-id', 'data-dlc-appid', 'data-dlc-id', 'data-dlcid'];
    var CHECKBOX_SEL = '[role="checkbox"], input[type="checkbox"]';

    // -------------------------------------------------------------------- utils
    function viewOf(doc) {
        return doc.defaultView || doc.parentWindow || window;
    }

    function el(doc, tag, opts) {
        var node = doc.createElement(tag);
        var o = opts || {};
        if (o.text !== undefined && o.text !== null) node.textContent = String(o.text);
        if (o.title) node.title = o.title;
        if (o.style) node.style.cssText = o.style;
        if (o.attrs) {
            Object.keys(o.attrs).forEach(function (key) {
                var value = o.attrs[key];
                if (value !== undefined && value !== null) node.setAttribute(key, String(value));
            });
        }
        if (o.on) {
            Object.keys(o.on).forEach(function (key) {
                node.addEventListener(key, o.on[key]);
            });
        }
        return node;
    }

    function cleanText(value) {
        return String(value === undefined || value === null ? '' : value)
            .replace(/[\t\r\n]+/g, ' ')
            .replace(/\s+/g, ' ')
            .replace(/^[\s\-–—•]+/, '')
            .trim();
    }

    // ------------------------------------------------------------- DLC scanning
    function findDlcTable(doc, state) {
        if (state && state.table && doc.contains(state.table)) return state.table;
        var table = scanDlcTable(doc);
        if (state) state.table = table;
        return table;
    }

    function scanDlcTable(doc) {
        var tables = Array.prototype.slice.call(doc.querySelectorAll('[role="table"]'));
        for (var i = 0; i < tables.length; i++) {
            if (tables[i].querySelector('[role="columnheader"]')) return tables[i];
        }
        return doc.querySelector(LEGACY_TABLE);
    }

    function getDlcRows(table) {
        if (!table) return [];
        var rows = Array.prototype.slice.call(table.querySelectorAll('[role="row"]'))
            .filter(function (row) { return !row.querySelector('[role="columnheader"]'); });
        if (!rows.length) rows = Array.prototype.slice.call(table.querySelectorAll(LEGACY_ROW));
        return rows;
    }

    function extractAppId(row, link) {
        if (link) {
            var match = link.href.match(/\/app\/(\d+)(?:\/|$)/);
            if (match) return match[1];
        }
        var selector = ID_ATTRS.map(function (attr) { return '[' + attr + ']'; }).join('');
        var candidates = [row].concat(Array.prototype.slice.call(row.querySelectorAll(selector)));
        for (var i = 0; i < candidates.length; i++) {
            for (var j = 0; j < ID_ATTRS.length; j++) {
                var value = candidates[i].getAttribute(ID_ATTRS[j]);
                if (value && /^\d+$/.test(value)) return value;
            }
        }
        return '';
    }

    function extractName(row, link) {
        var nameElement = row.querySelector('[class*="NameText"], [class*="DlcName"], [class*="Name"]');
        var cells = row.querySelectorAll('[role="cell"]');
        var nameCell = cells.length > 1 ? cells[1] : cells[0];
        var raw = (nameElement && nameElement.textContent) ||
            (link && link.textContent) ||
            (nameCell && nameCell.textContent) ||
            row.getAttribute('aria-label') || '';
        return cleanText(raw);
    }

    // El componente SettingsCheckBox de Steam renderiza:
    //   <div role="checkbox" aria-checked="true|false" class="DialogCheckbox Active">
    // `aria-checked` es la fuente de verdad; "DialogCheckbox"/"Active" NO estan hasheados,
    // asi que sirven de respaldo si Steam cambia la implementacion del componente.
    function isCheckboxEnabled(cb) {
        if (!cb) return false;
        if (cb.tagName === 'INPUT') return !!cb.checked;

        var aria = cb.getAttribute('aria-checked');
        if (aria === 'true') return true;
        if (aria === 'false') return false;

        if (cb.classList) {
            if (cb.classList.contains('Active')) return true;
            if (cb.classList.contains('DialogCheckbox')) return false;
        }
        var inner = cb.querySelector('div[class*="DialogCheckbox"]');
        if (inner) return inner.classList.contains('Active');
        return false;
    }

    function isDlcUnavailable(cb) {
        if (!cb) return true;
        if (cb.getAttribute('aria-disabled') === 'true') return true;
        if (cb.hasAttribute && cb.hasAttribute('disabled')) return true;
        return !!(cb.classList && cb.classList.contains('Disabled'));
    }

    // ------------------------------------------------------------- Datos de React
    // Steam NO siempre expone el appid en el DOM: el <a> del nombre se renderiza con
    // href="#" cuando BuildSteamURL() no resuelve, asi que [href*="/app/"] no matchea.
    // El DLC (id, nombre y estado) vive en las props del componente React de la fila,
    // que si es accesible desde el DOM mediante las claves internas de React.
    function getReactFiber(node) {
        for (var key in node) {
            if (key.indexOf('__reactFiber$') === 0 || key.indexOf('__reactInternalInstance$') === 0) {
                return node[key];
            }
        }
        return null;
    }

    function getDlcDataFromReact(node) {
        var fiber = getReactFiber(node);
        var guard = 0;
        while (fiber && guard++ < 80) {
            var props = fiber.memoizedProps;
            if (props && props.dlc && props.dlc.unAppID) return props.dlc;
            fiber = fiber.return || fiber._owner || null;
        }
        return null;
    }

    function getDlcEntries(doc, state) {
        var rows = getDlcRows(findDlcTable(doc, state));
        var entries = [];

        rows.forEach(function (row) {
            var checkbox = row.querySelector(CHECKBOX_SEL);
            if (!checkbox) return;
            var link = row.querySelector('a[href*="/app/"]');

            // Fuente preferida: las props de React de Steam. Fija a la vez id, nombre y
            // estado, sin depender de atributos del DOM que pueden faltar o mentir.
            var dlc = getDlcDataFromReact(checkbox) || getDlcDataFromReact(row);

            entries.push({
                row: row,
                checkbox: checkbox,
                appId: dlc && dlc.unAppID ? String(dlc.unAppID) : extractAppId(row, link),
                name: dlc && dlc.strName ? cleanText(dlc.strName) : extractName(row, link),
                enabled: dlc && typeof dlc.bEnabled === 'boolean' ? dlc.bEnabled : isCheckboxEnabled(checkbox),
                available: !isDlcUnavailable(checkbox)
            });
        });
        return entries;
    }

    // ------------------------------------------------------------- Notificación
    // Steam corre sobre CEF y window.alert() NO esta implementado (no-op silencioso),
    // asi que todo el feedback se pinta en el DOM.
    function notify(doc, message, kind, duration) {
        var view = viewOf(doc);
        var toast = doc.getElementById(TOAST_ID);
        if (!toast) {
            toast = el(doc, 'div', { attrs: { id: TOAST_ID } });
            doc.body.appendChild(toast);
        }
        var color = kind === 'error' ? '#a33b32' : (kind === 'warn' ? '#8a6d1f' : '#2f6d3f');
        toast.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);' +
            'z-index:2147483646;max-width:90vw;padding:10px 18px;border-radius:6px;color:#fff;' +
            'font-size:13px;font-family:"Motiva Sans","Segoe UI",sans-serif;' +
            'box-shadow:0 6px 24px rgba(0,0,0,0.5);text-align:center;pointer-events:none;' +
            'display:block;background:' + color + ';';
        toast.textContent = message;
        if (toast.dlcTimer) view.clearTimeout(toast.dlcTimer);
        toast.dlcTimer = view.setTimeout(function () { toast.style.display = 'none'; }, duration || 6000);
    }

    // ------------------------------------------------------------------ Almacen
    function saveToStorage(doc, text) {
        try {
            viewOf(doc).localStorage.setItem(STORAGE_KEY, text);
        } catch (error) { /* almacenamiento no disponible */ }
    }

    // -------------------------------------------------------------- Exportación
    function buildExportText(entries) {
        var lines = [FORMAT_V1];
        entries.forEach(function (entry) {
            lines.push([entry.appId || '', cleanText(entry.name)].join('\t'));
        });
        return lines.join('\r\n') + '\r\n';
    }

    function downloadText(doc, filename, text) {
        var view = viewOf(doc);
        try {
            var blob = new view.Blob([text], { type: 'text/plain;charset=utf-8' });
            var url = view.URL.createObjectURL(blob);
            var link = el(doc, 'a', { attrs: { href: url, download: filename } });
            link.style.display = 'none';
            doc.body.appendChild(link);
            link.click();
            // OJO: quitar el <a> de forma sincrona cancela la descarga en Chromium.
            view.setTimeout(function () {
                link.remove();
                view.URL.revokeObjectURL(url);
            }, 3000);
            return true;
        } catch (error) {
            console.error('[Steam DLC Switcher] No se pudo descargar el archivo:', error);
            return false;
        }
    }

    function copyText(doc, text) {
        var view = viewOf(doc);
        if (view.navigator && view.navigator.clipboard && view.navigator.clipboard.writeText) {
            view.navigator.clipboard.writeText(text).catch(function () { /* sin portapapeles */ });
        }
    }

    // Un solo clic: genera el archivo de los DLC ACTIVADOS y lo deja descargado,
    // copiado en el portapapeles y guardado para la importación.
    function exportActiveDLCs(doc) {
        var entries = getDlcEntries(doc);
        if (!entries.length) {
            notify(doc, 'No se ha encontrado ninguna lista de DLC en esta ventana.', 'error');
            return;
        }

        var active = entries.filter(function (entry) { return entry.enabled; });
        if (!active.length) {
            notify(doc, 'No hay ningun DLC activado en esta lista.', 'warn');
            return;
        }

        var text = buildExportText(active);
        saveToStorage(doc, text);
        copyText(doc, text);

        var sinId = active.filter(function (entry) { return !entry.appId; });
        var mensaje = 'Exportados ' + active.length + ' DLC activados a ' + FILE_NAME + ' (tambien copiados al portapapeles).';
        if (sinId.length) {
            mensaje += ' AVISO: ' + sinId.length + ' sin ID, no se podran importar con seguridad.';
        }
        console.log('[Steam DLC Switcher] ' + mensaje + '\n' + text);

        if (downloadText(doc, FILE_NAME, text)) {
            notify(doc, mensaje, sinId.length ? 'warn' : undefined, sinId.length ? 12000 : 6000);
        } else {
            notify(doc, 'Exportados ' + active.length + ' DLC activados al portapapeles. La descarga fue bloqueada.', 'warn');
        }
    }

    // -------------------------------------------------------------------- Lectura
    function readFileAsText(file) {
        return file.arrayBuffer().then(function (buffer) {
            var bytes = new Uint8Array(buffer);
            var decoder;
            if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
                return new TextDecoder('utf-16le').decode(bytes.subarray(2));
            }
            if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) {
                return new TextDecoder('utf-16be').decode(bytes.subarray(2));
            }
            if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
                return new TextDecoder('utf-8').decode(bytes.subarray(3));
            }
            return new TextDecoder('utf-8').decode(bytes);
        });
    }

    function parseImportText(raw) {
        var text = String(raw || '').replace(/^\uFEFF/, '');
        var lines = text.split(/\r?\n/);

        var header = (lines[0] || '').trim();
        if (/^Steam DLC Switcher export v\d+$/i.test(header)) lines.shift();

        var records = [];
        lines.forEach(function (rawLine) {
            var line = rawLine.replace(/\s+$/, '');
            if (!line.trim()) return;
            if (line.trim().charAt(0) === '#') return;

            var columns = line.split('\t');
            var appId = (columns[0] || '').trim();
            var name = (columns.slice(1).join('\t') || '').trim();

            if (columns.length === 1) {
                var loose = line.trim().match(/^(\d+)\s*[,;:\-]\s*(.+)$/) || line.trim().match(/^(\d+)\s+(.+)$/);
                if (loose) {
                    appId = loose[1];
                    name = loose[2].trim();
                } else {
                    appId = '';
                    name = line.trim();
                }
            }
            if (appId && !/^\d+$/.test(appId)) {
                name = cleanText(appId + ' ' + name);
                appId = '';
            }
            if (!appId && !name) return;
            records.push({ appId: appId, name: cleanText(name) });
        });

        if (!records.length) throw new Error('El archivo no contiene ningun DLC.');

        var seen = {};
        return records.filter(function (record) {
            var key = record.appId || ('name:' + record.name.toLocaleLowerCase());
            if (seen[key]) return false;
            seen[key] = true;
            return true;
        });
    }

    // ---------------------------------------------------------------- Importación
    function resolveEntry(byId, byName, record) {
        if (record.appId && byId[record.appId]) return byId[record.appId];
        var key = record.name.toLocaleLowerCase();
        if (key && byName[key]) return byName[key];
        return null;
    }

    function importDLCs(doc, records) {
        var entries = getDlcEntries(doc);
        if (!entries.length) {
            notify(doc, 'No se ha encontrado ninguna lista de DLC en esta ventana.', 'error');
            return;
        }

        var byId = {};
        var byName = {};
        entries.forEach(function (entry) {
            if (entry.appId) byId[entry.appId] = entry;
            if (entry.name) byName[entry.name.toLocaleLowerCase()] = entry;
        });

        var activated = 0;
        var already = 0;
        var missing = [];
        var toClick = [];

        records.forEach(function (record) {
            var entry = resolveEntry(byId, byName, record);
            if (!entry || !entry.available) {
                missing.push(record);
                return;
            }
            if (entry.enabled) {
                already++;
                return;
            }
            toClick.push(function () {
                // Se relee la casilla de su fila al pulsarla: si React la ha sustituido
                // (re-render al cambiar el DLC anterior) la referencia guardada ya no vale.
                var cb = entry.row.querySelector(CHECKBOX_SEL) || entry.checkbox;
                if (cb && !isCheckboxEnabled(cb)) cb.click();
            });
            activated++;
        });

        var summary = function () {
            var message = 'Importados ' + activated + ' DLC activados (' + already + ' ya estaban activos).';
            if (missing.length) {
                var names = missing.slice(0, 3).map(function (record) {
                    return record.name || ('ID ' + record.appId);
                }).join(', ');
                if (missing.length > 3) names += '...';
                message += ' ' + missing.length + ' no disponibles: ' + names;
            }
            notify(doc, message, missing.length ? 'warn' : undefined, missing.length ? 12000 : 6000);
            console.log('[Steam DLC Switcher] ' + message);
        };

        if (!toClick.length) {
            summary();
            return;
        }
        // Todo en la misma pasada, igual que los botones de activar/desactivar. Con tandas
        // (setTimeout) React repinta entre tanda y tanda y las casillas que faltaban por
        // pulsar se quedan fuera del DOM.
        toClick.forEach(function (click) { click(); });
        summary();
    }

    // -------------------------------------------------------------------- Toggle
    // Logica de la PRIMERA version publicada en GitHub (commit 7fb44ae): recoger las
    // casillas de la cuadricula y pulsarlas TODAS EN LA MISMA PASADA.
    // Antes se pulsaban en tandas de 8 cada 30 ms. Entre tanda y tanda React vuelve a
    // pintar la fila del DLC que acaba de cambiar y las casillas que faltaban por pulsar
    // se quedan fuera del DOM: con listas grandes (700+ DLC) solo cambiaban las 8 primeras.
    function toggleDLCs(doc, enable) {
        var table = findDlcTable(doc);
        var rows = getDlcRows(table);
        var changed = 0;

        function apply(checkbox) {
            if (!checkbox) return;
            // Mismo criterio que la v1: el estado sale de la propia casilla (aria-checked).
            if (isCheckboxEnabled(checkbox) === enable) return;
            checkbox.click();
            changed++;
        }

        if (rows.length) {
            // La casilla se relee de su fila justo antes de pulsarla, por si React la ha
            // sustituido al repintar la fila anterior.
            rows.forEach(function (row) {
                apply(row.querySelector(CHECKBOX_SEL));
            });
        } else if (table) {
            Array.prototype.slice.call(table.querySelectorAll(CHECKBOX_SEL)).forEach(apply);
        }

        if (!changed) {
            notify(
                doc,
                table
                    ? 'No hay ningun DLC que ' + (enable ? 'activar' : 'desactivar') + '.'
                    : 'No se ha encontrado ninguna lista de DLC en esta ventana.',
                table ? undefined : 'error'
            );
            return;
        }
        notify(doc, changed + ' DLC(s) ' + (enable ? 'activados' : 'desactivados') + '.');
    }

    // ------------------------------------------------------------------- Botones
    function makeButton(doc, text, background, title, handler) {
        // Compactos a proposito: tienen que caber en la misma linea que el buscador para
        // no anadir alto y que se vean los mismos DLC que sin el plugin.
        var btn = el(doc, 'button', {
            text: text,
            title: title,
            style: 'background:' + background + ';color:#fff;border:none;padding:3px 8px;border-radius:3px;' +
                'font-weight:bold;font-size:11px;line-height:1.2;white-space:nowrap;cursor:pointer;' +
                'box-shadow:0 1px 2px rgba(0,0,0,0.35);transition:filter .15s;'
        });
        btn.addEventListener('mouseenter', function () { btn.style.filter = 'brightness(1.15)'; });
        btn.addEventListener('mouseleave', function () { btn.style.filter = 'none'; });
        btn.addEventListener('click', function (event) {
            event.preventDefault();
            event.stopPropagation();
            handler();
        });
        return btn;
    }

    function createButtonContainer(doc) {
        var container = el(doc, 'div', { attrs: { id: CONTAINER_ID } });
        // Una sola linea, sin margenes verticales y sin encogerse: asi comparte la altura de
        // la fila del buscador y no empuja la lista de DLC hacia abajo.
        container.style.cssText = 'display:inline-flex;gap:6px;align-items:center;flex-wrap:nowrap;' +
            'flex:0 0 auto;margin:0;padding:0;align-self:center;';

        container.appendChild(makeButton(doc, '✓ Activar Todos', '#5cbe32',
            'Activa todos los DLC de la lista', function () { toggleDLCs(doc, true); }));

        container.appendChild(makeButton(doc, '✕ Desactivar Todos', '#cd544b',
            'Desactiva todos los DLC de la lista', function () { toggleDLCs(doc, false); }));

        container.appendChild(makeButton(doc, 'Exportar', '#3b6e9e',
            'Exporta a un archivo TXT los DLC activados', function () { exportActiveDLCs(doc); }));

        var fileInput = el(doc, 'input', {
            attrs: { type: 'file', accept: '.txt,text/plain' },
            style: 'display:none'
        });
        fileInput.addEventListener('change', function () {
            var file = fileInput.files && fileInput.files[0];
            fileInput.value = '';
            if (!file) return;
            readFileAsText(file).then(function (text) {
                importDLCs(doc, parseImportText(text));
            }).catch(function (error) {
                console.error('[Steam DLC Switcher] Error importando archivo:', error);
                notify(doc, 'No se pudo importar el archivo: ' + error.message, 'error');
            });
        });
        container.appendChild(fileInput);

        container.appendChild(makeButton(doc, 'Importar', '#586574',
            'Importa un archivo TXT de Steam DLC Switcher', function () { fileInput.click(); }));

        return container;
    }

    // ------------------------------------------------------------------ Inyeccion
    function isDLCArea(doc, state) {
        if (findDlcTable(doc, state)) return true;
        if (doc.querySelector(LEGACY_TOP_ROW)) return true;

        // El fallback por texto es MUY caro: doc.body.textContent copia el arbol entero.
        // Al pinchar en la pestaña DLC React monta la cuadricula con cientos de mutaciones,
        // asi que sin este limite Steam se cuelga. Se evalua como maximo una vez cada 3 s.
        var now = Date.now();
        if (state.textCheckedAt && (now - state.textCheckedAt) < 3000) return false;
        state.textCheckedAt = now;

        var lower = (doc.body.textContent || '').toLowerCase();
        return (lower.indexOf('instalar') !== -1 || lower.indexOf('install') !== -1) &&
            (lower.indexOf('nombre') !== -1 || lower.indexOf('name') !== -1);
    }

    // La fila superior (la del buscador) NO se puede buscar por clase: Valve la hashea
    // (DlcTopRow -> ZII4C3WPvs65P3yvAtV69). Se localiza por estructura: es el hermano
    // que va justo antes de la cuadricula y lleva el <input> del buscador.
    function findTopRow(doc, table) {
        if (table) {
            var prev = table.previousElementSibling;
            if (prev && prev.querySelector && prev.querySelector('input')) return prev;
        }
        return doc.querySelector(LEGACY_TOP_ROW);
    }

    function findInsertionTarget(doc, state) {
        var table = findDlcTable(doc, state);

        // Dentro de la fila del buscador: comparte linea, asi que el plugin no anade
        // ninguna fila de alto y se ven los mismos DLC que sin instalarlo.
        var topRow = findTopRow(doc, table);
        if (topRow) return { element: topRow, position: 'append' };

        // Plan B: linea propia antes de la cuadricula (peor, pero funciona).
        if (table && table.parentElement) return { element: table, position: 'before' };

        return null;
    }

    function tryInject(doc, state) {
        if (!doc || !doc.body) return;
        // Doble barrera: getElementById + querySelector. Si por lo que sea se perdiera el
        // id, el contenedor ya insertado seguiria impidiendo la inyeccion duplicada.
        if (doc.getElementById(CONTAINER_ID) || doc.querySelector('#' + CONTAINER_ID)) return;
        if (!isDLCArea(doc, state)) return;

        var target = findInsertionTarget(doc, state);
        if (!target || !target.element) return;

        console.log('[Steam DLC Switcher] Insertando botones...');
        var buttons = createButtonContainer(doc);
        if (target.position === 'append') {
            target.element.appendChild(buttons);
        } else if (target.position === 'inside') {
            target.element.insertBefore(buttons, target.element.firstChild);
        } else if (target.element.parentElement) {
            target.element.parentElement.insertBefore(buttons, target.element);
            // Va en linea propia: necesita un poco de aire para no pegarse a la cuadricula.
            buttons.style.margin = '4px 10px';
            buttons.style.flexWrap = 'wrap';
        }
        state.table = null; // React puede desmontar la tabla: obligamos a re-escanear.
    }

    function watch(win) {
        try {
            if (!win || !win.document || !win.document.body) return;
            var doc = win.document;
            if (doc.__dlcSwitcherState) return;

            var state = { table: null, textCheckedAt: 0, scheduled: false };
            doc.__dlcSwitcherState = state;

            var run = function () { tryInject(doc, state); };

            // El callback del MutationObserver se agrupa por frame: Steam muta el DOM
            // cientos de veces al montar una pantalla y solo comprobamos una vez por frame.
            var raf = win.requestAnimationFrame
                ? function (cb) { return win.requestAnimationFrame(cb); }
                : function (cb) { return win.setTimeout(cb, 50); };

            function schedule() {
                if (state.scheduled) return;
                state.scheduled = true;
                raf(function () {
                    state.scheduled = false;
                    run();
                });
            }

            run();

            // Latido de respaldo: solo trabaja si React ha desmontado nuestros botones.
            win.setInterval(function () {
                if (!doc.getElementById(CONTAINER_ID)) run();
            }, 1000);

            var obs = new win.MutationObserver(schedule);
            try {
                obs.observe(doc.body, { childList: true, subtree: true });
            } catch (error) {
                win.addEventListener('DOMContentLoaded', function () {
                    try {
                        obs.observe(doc.body, { childList: true, subtree: true });
                    } catch (err) { /* el body no existe todavia */ }
                    run();
                });
            }
        } catch (error) {
            console.error('[Steam DLC Switcher] Error observando ventana:', error);
        }
    }

    if (typeof window !== 'undefined') watch(window);
    if (typeof window !== 'undefined' && window.top && window.top !== window) {
        try { watch(window.top); } catch (error) { /* ventana no accesible */ }
    }

    if (typeof Millennium !== 'undefined' && typeof Millennium.AddWindowCreateHook === 'function') {
        Millennium.AddWindowCreateHook(function (ctx) {
            var win = (ctx && ctx.document) ? ctx : ((ctx && ctx.window) || window);
            watch(win);
        });
    }

    console.log('[Steam DLC Switcher] Plugin cargado exitosamente.');
})();