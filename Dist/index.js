(function () {
    console.log("[Steam DLC Switcher] Inicializando plugin...");

    function isDLCArea(doc) {
        if (!doc || !doc.body) return false;

        // 1. Clases internas de Steam
        if (doc.querySelector('[class*="DlcGrid"], [class*="DlcHeader"], [class*="DlcTopRow"]')) {
            return true;
        }

        // 2. Comprobación por texto
        const text = doc.body.textContent || "";
        const lower = text.toLowerCase();
        if ((lower.includes("instalar") || lower.includes("install")) && (lower.includes("nombre") || lower.includes("name"))) {
            return true;
        }

        return false;
    }

    function findInsertionTarget(doc) {
        // Opción 1: DlcTopRow (junto al botón "Ver más en la tienda" y "Buscar")
        const topRow = doc.querySelector('[class*="DlcTopRow"]');
        if (topRow) {
            return { element: topRow, position: 'inside' };
        }

        // Opción 2: Justo encima de DlcGrid
        const grid = doc.querySelector('[class*="DlcGrid"]');
        if (grid && grid.parentElement) {
            return { element: grid, position: 'before' };
        }

        // Opción 3: Fila cabecera DlcHeader
        const header = doc.querySelector('[class*="DlcHeader"]');
        if (header && header.parentElement) {
            return { element: header, position: 'before' };
        }

        // Opción 4: Búsqueda heurística por texto de cabecera
        const elements = doc.querySelectorAll('*');
        for (const el of elements) {
            if (el.children.length === 0) {
                const t = el.textContent.trim().toLowerCase();
                if (t === 'instalar' || t === 'install') {
                    let row = el;
                    for (let i = 0; i < 4 && row.parentElement; i++) {
                        row = row.parentElement;
                        const rowT = row.textContent.toLowerCase();
                        if (rowT.includes('nombre') || rowT.includes('name')) {
                            return { element: row, position: 'before' };
                        }
                    }
                }
            }
        }
        return null;
    }

    function getCheckboxes(doc) {
        const container = doc.querySelector('[class*="DlcGrid"]') || doc.querySelector('[role="table"]') || doc.body;
        const candidates = container.querySelectorAll(
            'input[type="checkbox"], [role="checkbox"], [class*="Checkbox"], [class*="checkbox"], [class*="Install"]'
        );

        const result = [];
        candidates.forEach(el => {
            if (el.closest('#dlc-toggle-custom-container')) return;
            if (el.closest('[class*="DlcHeader"]')) return;
            if (el.getAttribute('role') === 'checkbox' || el.tagName === 'INPUT' || (el.className && typeof el.className === 'string' && (el.className.includes('Checkbox') || el.className.includes('checkbox')))) {
                result.push(el);
            } else {
                const inner = el.querySelector('[role="checkbox"], input[type="checkbox"], [class*="checkbox"]');
                if (inner) result.push(inner);
            }
        });
        return [...new Set(result)];
    }

    function toggleDLCs(doc, enable) {
        const checkboxes = getCheckboxes(doc);
        console.log(`[Steam DLC Switcher] Cambiando ${checkboxes.length} DLCs a: ${enable}`);

        checkboxes.forEach(cb => {
            let isChecked = false;
            if (cb.tagName === 'INPUT') {
                isChecked = cb.checked;
            } else if (cb.hasAttribute('aria-checked')) {
                isChecked = cb.getAttribute('aria-checked') === 'true';
            } else if (cb.classList && (cb.classList.contains('checked') || cb.classList.contains('active'))) {
                isChecked = true;
            } else {
                const inner = cb.querySelector('[class*="Checked"], [class*="checked"], svg');
                isChecked = !!inner;
            }

            if (isChecked !== enable) {
                cb.click();
                cb.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                cb.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });
    }

    function createButtonContainer(doc) {
        const container = doc.createElement('div');
        container.id = 'dlc-toggle-custom-container';
        container.style.cssText = 'display: inline-flex; gap: 8px; align-items: center; margin: 4px 10px 4px 0; z-index: 9999;';

        const btnEnable = doc.createElement('button');
        btnEnable.innerText = '✓ Activar Todos';
        btnEnable.title = 'Activa todos los DLC de la lista';
        btnEnable.style.cssText = 'background: #5cbe32; color: #fff; border: none; padding: 6px 12px; border-radius: 3px; font-weight: bold; font-size: 12px; cursor: pointer; transition: 0.2s; box-shadow: 0 1px 3px rgba(0,0,0,0.4);';
        btnEnable.onmouseenter = () => btnEnable.style.background = '#6dd63b';
        btnEnable.onmouseleave = () => btnEnable.style.background = '#5cbe32';
        btnEnable.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleDLCs(doc, true);
        };

        const btnDisable = doc.createElement('button');
        btnDisable.innerText = '✕ Desactivar Todos';
        btnDisable.title = 'Desactiva todos los DLC de la lista';
        btnDisable.style.cssText = 'background: #cd544b; color: #fff; border: none; padding: 6px 12px; border-radius: 3px; font-weight: bold; font-size: 12px; cursor: pointer; transition: 0.2s; box-shadow: 0 1px 3px rgba(0,0,0,0.4);';
        btnDisable.onmouseenter = () => btnDisable.style.background = '#df655c';
        btnDisable.onmouseleave = () => btnDisable.style.background = '#cd544b';
        btnDisable.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleDLCs(doc, false);
        };

        container.appendChild(btnEnable);
        container.appendChild(btnDisable);
        return container;
    }

    function tryInject(doc) {
        if (!doc || !doc.body) return;
        if (doc.getElementById('dlc-toggle-custom-container')) return;
        if (!isDLCArea(doc)) return;

        const target = findInsertionTarget(doc);
        if (!target || !target.element) return;

        console.log("[Steam DLC Switcher] Insertando botones...");
        const buttons = createButtonContainer(doc);
        if (target.position === 'inside') {
            target.element.insertBefore(buttons, target.element.firstChild);
        } else if (target.position === 'before') {
            target.element.parentElement.insertBefore(buttons, target.element);
        }
    }

    function watch(win) {
        try {
            if (!win || !win.document) return;
            const doc = win.document;
            const run = () => tryInject(doc);

            run();
            const obs = new win.MutationObserver(run);
            if (doc.body) {
                obs.observe(doc.body, { childList: true, subtree: true });
            } else {
                win.addEventListener('DOMContentLoaded', () => {
                    if (doc.body) obs.observe(doc.body, { childList: true, subtree: true });
                    run();
                });
            }
            win.setInterval(run, 1000);
        } catch (e) {
            console.error("[Steam DLC Switcher] Error observando ventana:", e);
        }
    }

    if (typeof window !== 'undefined') watch(window);
    if (typeof window !== 'undefined' && window.top && window.top !== window) {
        try { watch(window.top); } catch (e) {}
    }

    if (typeof Millennium !== 'undefined' && typeof Millennium.AddWindowCreateHook === 'function') {
        Millennium.AddWindowCreateHook((ctx) => {
            const w = (ctx && ctx.document) ? ctx : (ctx?.window || window);
            watch(w);
        });
    }

    console.log("[Steam DLC Switcher] Plugin cargado exitosamente.");
})();
