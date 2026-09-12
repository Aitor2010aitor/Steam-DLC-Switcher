# Guía de Arquitectura y Mantenimiento para Inteligencia Artificial (AI Agents)

Este archivo está diseñado específicamente para que cualquier **Inteligencia Artificial (LLM / Agente de Código)** comprenda la arquitectura interna, las limitaciones del motor Millennium, la estructura de la interfaz de Steam y cómo diagnosticar o actualizar este plugin si se producen futuras actualizaciones.

---

## 1. Propósito del Proyecto
- **Nombre:** Steam DLC Switcher (`steam_dlc_switcher`)
- **Objetivo:** Inyectar dos botones interactivos (**"✓ Activar Todos"** y **"✕ Desactivar Todos"**) en la pestaña **Propiedades > DLC** de cualquier juego en el cliente de Steam.
- **Entorno de ejecución:** Motor de inyección de plugins **[Millennium](https://millennium.app/)** para Steam en Windows.

---

## 2. Motor de Millennium: Reglas Críticas e Internas

### ⚠️ Regla #1: Prohibido usar `export default` (Uso de `eval()`)
Millennium inyecta el script del frontend obteniendo el texto del archivo mediante `fetch()` y evaluándolo en el contexto del navegador mediante:
```javascript
// Cómo Millennium ejecuta el frontend internamente:
const _r = await fetch('...');
const _s = await _r.text();
(0, eval)(_s);
```
- **Consecuencia crítica:** Si el archivo contiene `export default ...` o cualquier sentencia `export`/`import` a nivel superior, `eval()` lanzará un error fatal:
  `SyntaxError: Unexpected token 'export'`.
- **Solución obligatoria:** Todo el código DEBE estar envuelto en una **función autoejecutable (IIFE)**:
  ```javascript
  (function () {
      // Todo el código del plugin aquí
  })();
  ```

### ⚠️ Regla #2: Replicación en todas las rutas de distribución
Millennium busca el archivo frontend en diferentes rutas según la versión o si fue pre-compilado:
1. `.millennium/Dist/index.js` (Ruta prioritaria que busca el motor interno de Millennium).
2. `Dist/index.js`
3. `frontend/index.js`
4. `index.js` (Raíz)

> **Instrucción para la IA:** Cada vez que modifiques la lógica en [`frontend/index.js`](file:///c:/Program%20Files%20%28x86%29/Steam/millennium/plugins/dlc_toggle_plugin/frontend/index.js), **DEBES copiar exactamente el mismo contenido** a las otras tres rutas (`.millennium/Dist/index.js`, `Dist/index.js`, e `index.js`).

### ⚠️ Regla #3: Manifiesto `plugin.json`
El archivo `plugin.json` define los metadatos. Debe contener:
```json
{
  "name": "steam_dlc_switcher",
  "common_name": "Steam DLC Switcher",
  "description": "Añade botones para activar o desactivar todos los DLCs de un juego de golpe.",
  "author": "Aitor",
  "version": "2.1.0",
  "useBackend": false,
  "frontend": "index.js"
}
```
Si se actualiza la versión, incrementa el campo `"version"` en `plugin.json` para que el usuario pueda verificar en los ajustes de Millennium que se ha cargado la nueva versión.

---

## 3. Arquitectura del DOM de Steam (Propiedades > DLC)

Valve construye la interfaz de usuario de Steam utilizando React.

### Elementos clave del DOM en la sección DLC:
1. **Fila superior (`DlcTopRow`):** 
   - Contiene el botón nativo *"Ver más en la tienda"* y el campo de búsqueda *"Buscar..."*.
   - Selector CSS: `[class*="DlcTopRow"]`.
   - **Punto óptimo de inyección:** Insertar los botones como primer hijo (`insertBefore(buttons, topRow.firstChild)`).
2. **Cuadrícula de DLCs (`DlcGrid`):**
   - Contenedor con `role="table"` que lista todos los DLCs del juego.
   - Selector CSS: `[class*="DlcGrid"]`.
3. **Cabecera de la tabla (`DlcHeader`):**
   - Selector CSS: `[class*="DlcHeader"]`.
   - Contiene los textos *"INSTALAR"* (o *"INSTALL"*) y *"NOMBRE"* (o *"NAME"*).
4. **Casillas de verificación de DLCs (Checkboxes):**
   - Cada fila de DLC contiene una casilla.
   - Selectores compatibles:
     - `[role="checkbox"]`
     - `input[type="checkbox"]`
     - `[class*="Checkbox"]` / `[class*="checkbox"]`
     - `[class*="Install"] [role="checkbox"]`
   - Estado de activación:
     - Si es `<input>`: `cb.checked`
     - Si es div/componente React: `cb.getAttribute('aria-checked') === 'true'` o `cb.classList.contains('checked')`.

### Disparo de eventos en React:
No basta con cambiar la propiedad `.checked`. Para que el estado de React en Steam procese el cambio, se deben disparar los eventos:
```javascript
cb.click();
cb.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
cb.dispatchEvent(new Event('change', { bubbles: true }));
```

---

## 4. Gestión de Ventanas y Renderizado React

Steam puede abrir la ventana de Propiedades de dos formas:
1. Como un modal flotante dentro de la ventana principal (`window.document`).
2. Como una ventana emergente nativa independiente de Chromium (`SteamClient.Browser`).

Por esta razón, la función `watch(win)`:
1. Observa inmediatamente la ventana actual (`window`).
2. Si existe `window.top` y es diferente, la observa también.
3. Se suscribe al gancho de Millennium para ventanas nuevas:
   ```javascript
   if (typeof Millennium !== 'undefined' && typeof Millennium.AddWindowCreateHook === 'function') {
       Millennium.AddWindowCreateHook((ctx) => {
           const w = (ctx && ctx.document) ? ctx : (ctx?.window || window);
           watch(w);
       });
   }
   ```
4. Utiliza `MutationObserver` (`childList: true`, `subtree: true`) más un intervalo de respaldo (heartbeat cada 1000 ms) para detectar cuando el usuario navega a la pestaña "DLC" desde otra pestaña (como "General" o "Actualizaciones").

---

## 5. Protocolo de Diagnóstico para Futuras Actualizaciones

Si en el futuro Steam o Millennium se actualizan y los botones dejan de aparecer:

### Paso 1: Comprobar si Millennium carga el plugin
- Pide al usuario que revise en Steam: **Millennium > Registros** o consulta `C:\Program Files (x86)\Steam\logs\cef_log.txt`.
- Si aparece `webkit plugin dlc_toggle_all failed to load`:
  - Verifica si alguien introdujo un `export` o `import` que rompa `eval()`.
  - Verifica que `.millennium/Dist/index.js` exista y tenga contenido.

### Paso 2: Comprobar si Valve cambió las clases CSS en Steam
Si Steam actualiza su interfaz web y cambia los nombres de clase:
1. Inspecciona los archivos empaquetados de Steam UI en:
   `C:\Program Files (x86)\Steam\steamui\chunk~*.js`
2. Busca la cadena `AppProperties_DLC` o `DlcTopRow` con Node.js o PowerShell:
   ```powershell
   Get-ChildItem "C:\Program Files (x86)\Steam\steamui\*.js" | Select-String -Pattern "AppProperties_DLC" -List
   ```
3. Comprueba cómo se llaman los nuevos componentes o clases de la pestaña DLC y actualiza los selectores en `isDLCArea()` y `findInsertionTarget()`.

### Paso 3: Mantener siempre la seguridad
- **Cero peticiones de red:** Nunca agregues llamadas a APIs remotas ni envío de datos.
- **Sin datos personales:** No incluyas nombres de usuario de Windows, rutas locales de tu máquina ni tokens.
- **Sin `innerHTML`:** Construye siempre los elementos mediante `document.createElement()`.
