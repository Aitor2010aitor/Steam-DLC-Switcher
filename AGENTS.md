# Guía de Arquitectura y Mantenimiento para Inteligencia Artificial (AI Agents)

Este archivo está diseñado específicamente para que cualquier **Inteligencia Artificial (LLM / Agente de Código)** comprenda la arquitectura interna, las limitaciones del motor Millennium, la estructura de la interfaz de Steam y cómo diagnosticar o actualizar este plugin si se producen futuras actualizaciones.

---

## 1. Propósito del Proyecto
- **Nombre:** Steam DLC Switcher (`steam_dlc_switcher`)
- **Objetivo:** Inyectar cuatro botones interactivos para activar/desactivar todos los DLCs y exportar/importar listas en **Propiedades > DLC**.
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
  "description": "Activa o desactiva todos los DLCs y permite exportar e importar listas.",
  "author": "Aitor",
  "version": "0.2.1",
  "useBackend": false,
  "frontend": "index.js"
}
```
Si se actualiza la versión, incrementa el campo `"version"` en `plugin.json` para que el usuario pueda verificar en los ajustes de Millennium que se ha cargado la nueva versión.

### ⚠️ Regla #4: NO reescribir el `config.json` de Millennium con `ConvertTo-Json`
El `install.bat` antiguo hacía esto y es capaz de **romper la configuración de Millennium**:

```powershell
# MAL: reescribe el JSON entero. Pierde el orden de claves, descarta claves
# desconocidas y con -Depth puede truncar objetos anidados.
$json = Get-Content $p -Raw | ConvertFrom-Json
$json.plugins.enabledPlugins += 'steam_dlc_switcher'
$json | ConvertTo-Json -Depth 10 | Set-Content $p -Encoding UTF8
```

Problemas: `ConvertTo-Json` **reordena** el objeto, `-Depth` trunca en profundidad, y
`Set-Content -Encoding UTF8` en Windows PowerShell 5.1 escribe **BOM**, que algunos lectores JSON
rechazan. Si el script falla a mitad, la config queda a medias y Millennium deja de arrancar sus plugins.

La versión correcta es [`tools/enable-plugin.ps1`](tools/enable-plugin.ps1):
1. Lee el texto y le quita el BOM.
2. Valida el JSON **antes** de tocar nada; si ya estaba corrupto, no escribe (exit 2).
3. Crea `config.json.bak-<timestamp>`.
4. Edita **solo** el array `enabledPlugins` de forma textual (todo lo demás queda byte a byte igual).
5. Vuelve a validar el resultado; si falla, **restaura la copia** (exit 4).
6. Escribe sin BOM con `[System.IO.File]::WriteAllText`.

**No edites nunca `config.json` a mano ni con `ConvertTo-Json`.**

### Ojo con las copias de seguridad del plugin
Guárdalas **fuera** de `millennium\plugins\`. Si creas `plugins\_backup\steam_dlc_switcher_x\`
con un `plugin.json` dentro, Millennium lo carga como **otro plugin** y vuelven a aparecer los
botones duplicados. El `install.bat` las mete en `millennium\backup\`.

### ⚠️ Plugins DUPLICADOS: una carpeta = una entrada en Millennium
Millennium crea una entrada en *Complementos* por **cada carpeta** de `millennium\plugins\` que
contenga un `plugin.json`. Si sobrevive una carpeta antigua con el mismo `name`, el plugin aparece
**dos veces** en la lista y sus dos copias se ejecutan a la vez.

Caso real registrado: apareció una carpeta llamada literalmente **`PLUGIN_ID`** (por una variable
sin expandir en una versión previa del instalador) con una copia completa del plugin dentro.
Resultado: dos "Steam DLC Switcher" en la UI de Millennium.

`tools\cleanup-duplicates.ps1` lo previene: escanea todos los `plugin.json` de `plugins\`,
compara su campo `name` y mueve a `backup\` los que no están en la carpeta canónica. **Nunca
borra**: los aparta con versión y fecha por si hay que recuperar algo.

El `install.bat` lo llama automáticamente en la opción `[1]` (después de copiar) y lo expone
también como `[5] Limpiar instalaciones duplicadas`.

**Regla: nunca dejes dos carpetas con el mismo campo `name` dentro de `plugins\`.**

### ⚠️ BATCH: los `!` deben ir emparejados (causa del bug del plugin duplicado)
Una línea como esta **NO expande nada**:
```bat
REM MAL: el ultimo ! no tiene pareja, cmd lo deja tal cual
set "PLUGIN_DIR=!MILLENNIUM_DIR!\plugins\!PLUGIN_ID"

REM BIEN
set "PLUGIN_DIR=!MILLENNIUM_DIR!\plugins\!PLUGIN_ID!"
```
Cuando cmd no encuentra el `!` de cierre, **deja el texto literal**. Resultado: `PLUGIN_DIR`
valía `...\plugins\PLUGIN_ID` en vez de `...\plugins\steam_dlc_switcher`, así que el instalador
creaba una carpeta nueva llamada `PLUGIN_ID` con una copia del plugin y Millennium lo cargaba
como un segundo plugin. El `plugins\steam_dlc_switcher` real se quedaba en su versión antigua.

**Reglas para `install.bat`:**
- Todo `!VAR!` va con pareja. Compruébalo: toda línea debe tener un número **par** de `!`.
- Nunca uses `timeout /t` dentro de una rutina: falla si la entrada está redirigida. Usa
  `ping -n 3 127.0.0.1 >nul`.
- Nunca pongas un paréntesis sin escapar dentro de un bloque `if ( ... )`:
  `echo     (no habia)` abre un bloque nuevo y rompe el `if/else` entero. Usa `^(` o reescribe.
- Las rutinas (`call :label`) deben ir **después** de un `goto :menu`, o al caer se ejecutan
  solas y el script termina antes de tiempo.
- Al probarlo automatizado con la entrada redirigida (`"1" | cmd /c install.bat`), al llegar al
  EOF `set /p` devuelve vacío y el **menú se repite en bucle infinito**. No es un fallo del
  script (en una consola real no hay EOF): filtra la salida o mata el proceso al terminar.

### El instalador cierra y reabre Steam
Los plugins no se recargan en caliente y los ficheros están bloqueados mientras corre Steam, así
que la opción `[1]` hace, en este orden:
1. `close_steam` → `steam.exe -shutdown`, espera activa hasta 40 s; si no cierra, pregunta antes
   de hacer `taskkill /F`.
2. Copia, verifica y limpia.
3. `open_steam` → `start "" steam.exe`, espera 15 s y si no aparece reintenta con
   `powershell Start-Process`.

---

## 3. Arquitectura del DOM de Steam (Propiedades > DLC)

Valve construye la interfaz de usuario de Steam utilizando React.

### ⚠️ CRÍTICO: Valve hashea los nombres de clase CSS
Las builds de producción de Steam **no** ponen `DlcGrid`, `DlcTopRow`, etc. en el DOM. En
`steamui/sp.js` el mapa de estilos es literalmente:

```javascript
DlcTopRow:"ZII4C3WPvs65P3yvAtV69", DlcGrid:"_3sXdOJ9DEh5zdS54_ptwgW",
DlcHeader:"_1SKB0Xc7OpWlOlr-wSi8ho", Install:"_2nXS1OQvhODwzoAc75AEKR",
Name:"bP2Ipgau61tQ0ZGNU5LM", NameText:"a19KifKnB2YZP_hYoFsar"
```

Por tanto **`[class*="DlcGrid"]`, `[class*="DlcTopRow"]` y `[class*="DlcHeader"]` NO matchean nada**
y `querySelectorAll` devuelve una NodeList vacía. Este fue el bug que dejó rotas la exportación
y la importación en las versiones anteriores.

**Regla: localiza el DOM por roles ARIA (estable entre builds), no por clases CSS.**
Los nombres de clase antiguos se mantienen solo como plan B en las constantes `LEGACY_*`.

### Estructura real de la pestaña DLC (verificada contra `sp.js`)
```text
div[class={NoScroll}]                              <- contenedor raíz
├── div[class={DlcTopRow}] flow-children="row"     <- botón "Ver más en la tienda" + buscador
├── div[class={DlcGrid}] role="table"              <- CUADRÍCULA  (findDlcTable)
│   ├── div[role="row"]  style="display:contents"  <- fila CABECERA
│   │   └── div[role="columnheader"][aria-sort]    <- "Instalar" / "Nombre" / "Añadido" / "Tamaño"
│   └── div[role="row"]  style="display:contents"  <- una por DLC  (getDlcRows)
│       ├── div[class={Install}] role="cell"
│       │   └── div[role="checkbox"][aria-checked] <- LA CASILLA
│       ├── div role="cell" > a[href=".../app/<dlcId>/"]
│       │   └── div[class={NameText}]              <- NOMBRE del DLC
│       ├── div[class={Added}] role="cell"
│       └── div[class={SizeDisk}] role="cell"
└── div[class={DlcArt}]  (imagen, aria-hidden)
```

Puntos clave:
- **Cuadrícula:** `div[role="table"]` que contenga `[role="columnheader"]`.
- **Filas:** `div[role="row"]` **sin** `[role="columnheader"]` (ese filtro descarta la cabecera).
- **Cabecera:** el texto es `#AppProperties_Dlc_Installed` → "Instalar"/"Install" y
  `#AppProperties_Dlc_Name` → "Nombre"/"Name" (ver `steamui/localization/steamui_*-json.js`).
- **Casilla:** el componente `SettingsCheckBox` (`sp.js`, módulo `76982`, exportado como `Yh`)
  mantiene el estado en `this.state.checked` y renderiza
  `<div role="checkbox" aria-checked="true|false" class="DialogCheckbox Active" tabindex="0">`.
  El estado se lee de **`aria-checked`**; `"DialogCheckbox"` / `"Active"` **no** están hasheados
  y sirven de respaldo en `isCheckboxEnabled()`.
  Ojo: `GetPanelElementProps()` devuelve `onActivate` (no `onClick`), por eso hay que pulsar
  sobre el elemento (`cb.click()`) para que el `Toggle()` interno llame a
  `SteamClient.Apps.SetDLCEnabled(appid, dlcId, nuevoEstado)`.
- **ID del DLC:** Steam **no** lo expone en el DOM. El `<a>` del nombre se renderiza con
  `href="#"`, porque su componente es:
  ```javascript
  function l(C,P){ const {href:D="#",...z}=C; return jsx(u,{ref:P,href:D,...z}) }  // b.Ii
  ```
  Es decir, si `BuildSteamURL("StoreAppPage", unAppID)` no resuelve, el `href` vale literalmente
  `#`. Por eso `a[href*="/app/"]` **no matchea nada** y `extractAppId()` devuelve `''`.
  Consecuencia observed en un caso real: un `.txt` exportado con **719 líneas y la columna del ID
  vacía**, lo que obligaba a la importación a adivinar por nombre y activaba DLCs de más.
- **Punto de inyección:** dentro de `div[class={DlcTopRow}]`, que es `flex row`. La fila se
  localiza **por estructura**, no por clase: es el hermano anterior de `div[role="table"]` que
  contiene un `<input>` (el buscador). Si no se encuentra, plan B: `table.parentElement.insertBefore(buttons, table)`.
  - ⚠️ `[class*="DlcTopRow"]` **no matchea** (la clase va hasheada: `ZII4C3WPvs65P3yvAtV69`), y ese
    fue el bug de "me toca bajar la barra para ver más DLC": al no hallar la fila, los botones se
    inyectaban **en una línea propia** antes de la cuadrícula y robaban una fila entera de DLC.
  - Los botones son compactos a propósito (11px, padding 3px 8px, `flex-wrap:nowrap`,
    `flex:0 0 auto`, sin márgenes verticales): tienen que caber **en la misma línea** que el
    buscador. Así el plugin no añade ni un píxel de alto y se ven los mismos DLC que sin él.
    Alta de la fila = 0. Si añades estilos, comprueba que la fila no crece ni salta de línea.

### ⚠️ Fuente de verdad: las props de React (v0.2.0)
El DOM de Steam **miente**. Ni el `href` ni `aria-checked` son fiables, así que
`getDlcEntries()` lee primero los datos reales del componente React:

```javascript
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
        if (props && props.dlc && props.dlc.unAppID) return props.dlc;   // props del componente de fila
        fiber = fiber.return || fiber._owner || null;
    }
    return null;
}
```

El componente de fila se llama `pi` y recibe `{appid, dlc, bHideImages}`, donde `dlc` es:
```javascript
{ unAppID, strName, bEnabled, strState, lDiskUsageBytes, rtPurchaseDate }
```

Con eso se obtienen **id, nombre y estado de una sola vez y sin suposiciones**. El scraping del DOM
(`extractAppId`, `extractName`, `isCheckboxEnabled`) queda **solo como plan B** para cuando React no
cuelga sus claves internas del nodo.

`exportActiveDLCs()` avisa si algún DLC sale sin ID, para no repetir el fichero a ciegas.

### Disparo de eventos en React:
Para que el estado de React en Steam procese el cambio, se debe hacer clic en el control:
```javascript
cb.click();
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

### ⚠️ Rendimiento: no colgar Steam
Al pinchar en la pestaña **DLC**, React monta la cuadrícula completa y eso genera **cientos de
mutaciones** en un solo frame. Si el `MutationObserver` hace trabajo pesado en cada una, **Steam
se cuelga**. Cuatro salvaguardas obligatorias en `watch()`:

1. **Agrupar por frame.** El callback del observer solo encola (`state.scheduled`) y el trabajo real
   corre en `requestAnimationFrame` → como máximo una comprobación por frame.
2. **Nunca usar `doc.body.textContent` en caliente.** Copia el árbol entero a un string gigante.
   El fallback textual de `isDLCArea()` está limitado a **una ejecución cada 3 s** por documento
   (`state.textCheckedAt`). La detección por roles ARIA es la que se usa de verdad.
3. **Cachear la tabla.** `findDlcTable(doc, state)` guarda `state.table` y solo re-escanea si
   `doc.contains(state.table)` es falso. `state.table = null` tras inyectar para forzar re-escaneo.
4. **Latido barato.** El `setInterval` de 1000 ms solo llama a `run()` si
   `doc.getElementById(CONTAINER_ID)` no existe (o sea, si React desmontó nuestros botones).

Aparte, `toggleDLCs()` pulsa las casillas **todas en la misma pasada**, como la primera versión
publicada (commit `7fb44ae`). Antes se pulsaban en tandas de 8 cada 30 ms, y con listas grandes
(700+ DLC) **solo cambiaban las 8 primeras**: React repinta la lista al cambiar cada DLC y las
casillas que faltaban por pulsar quedan fuera del DOM, así que los clics se pierden.
La casilla se **vuelve a leer de su fila** (`row.querySelector`) justo antes de pulsarla, por si
React la ha sustituido al repintar la fila anterior.
El test `test-plugin.js` reproduce esto: 60 DLC con React sustituyendo todas las casillas en cada
clic. Con las tandas solo cambiaba 1; con la pasada única, los 60.

### ⚠️ `el()` DEBE aplicar `opts.attrs`
`el(doc, tag, opts)` centraliza la creación de nodos. Si se le olvida el bloque de `attrs`,
**ningún atributo se aplica nunca** y el plugin se rompe de forma silenciosa:

| Llamada | Atributo perdido | Síntoma |
|---|---|---|
| `el(doc,'div',{attrs:{id:CONTAINER_ID}})` | `id` | `getElementById` siempre `null` → **se reinyectaba en bucle**:Steam se colgaba y se veían 15+ copias de los botones |
| `el(doc,'input',{attrs:{type:'file'}})` | `type="file"` | El botón **Importar** no hacía nada |
| `el(doc,'a',{attrs:{href:url,download:name}})` | `href`, `download` | El botón **Exportar** no descargaba nada |
| `el(doc,'div',{attrs:{id:TOAST_ID}})` | `id` | Cada `notify()` creaba un toast nuevo que nunca se ocultaba |

Bloque obligatorio:
```javascript
if (o.attrs) {
    Object.keys(o.attrs).forEach(function (key) {
        var value = o.attrs[key];
        if (value !== undefined && value !== null) node.setAttribute(key, String(value));
    });
}
```

Como cinturón y tirantes, `tryInject()` comprueba el contenedor por `getElementById` **y** por
`querySelector('#' + CONTAINER_ID)`.

### Pruebas: `test-plugin.js`
Hay un arnés que ejecuta el plugin real contra un DOM mínimo simulado y verifica que:
- el contenedor se inyecta **exactamente una vez** aunque se simulen 200 mutaciones del DOM,
- los atributos (`id`, `type="file"`) se aplican de verdad,
- se detectan las filas de DLC y el contenedor se inserta **dentro de la fila del buscador**
  (el hermano que va justo antes de la cuadrícula), no en una línea propia.

Ejecuta `node test-plugin.js` **después de tocar `frontend/index.js`**. Reproduce la estructura
real de Steam (`role="table"` > `role="row"` > `role="cell"` > `role="checkbox"` con `aria-checked`)
e incluye un escenario con `href="#"` y `aria-checked` **deliberadamente erróneo**, que solo pasa
si se leen las props de React.
El fichero no se copia al plugin al instalar: `install.bat` solo copia `plugin.json`, `index.js` y
las tres rutas de `index.js`.

---

## 5. Protocolo de Diagnóstico para Futuras Actualizaciones

Si en el futuro Steam o Millennium se actualizan y los botones dejan de aparecer:

### Paso 1: Comprobar si Millennium carga el plugin
- Pide al usuario que revise en Steam: **Millennium > Registros** o consulta `C:\Program Files (x86)\Steam\logs\cef_log.txt`.
- Si aparece `webkit plugin dlc_toggle_all failed to load`:
  - Verifica si alguien introdujo un `export` o `import` que rompa `eval()`.
  - Verifica que `.millennium/Dist/index.js` exista y tenga contenido.

### Paso 2: Comprobar si Valve cambió la estructura del DOM de Steam
**No busques clases CSS: están hasheadas.** Busca los *roles ARIA* y los componentes del JSX:
```powershell
# La pestaña DLC vive en sp.js (bundle de "shared preferences" / AppProperties)
$c = [IO.File]::ReadAllText("C:\Program Files (x86)\Steam\steamui\sp.js")
$i = $c.IndexOf('.DlcTopRow')      # aunque la clase esté hasheada, el nombre legible sigue en el JS
$c.Substring([Math]::Max(0,$i-600), 1300)
```
Eso imprime el JSX real de la pestaña DLC (el componente que la renderiza). Para ver a qué
hash corresponde cada clase, busca el hash en `steamui\css\sp.css`:
```powershell
Select-String -Path "C:\Program Files (x86)\Steam\steamui\css\sp.css" -Pattern "_3sXdOJ9DEh5zdS54_ptwgW" -SimpleMatch
```

Si cambió la estructura, **actualiza las funciones de escaneo, no los selectores de clase**:
- `findDlcTable(doc)` → sigue buscando `div[role="table"]` con `[role="columnheader"]` dentro.
- `getDlcRows(table)` → `div[role="row"]` filtrando la cabecera.
- `isCheckboxEnabled(cb)` → debe seguir leyendo `aria-checked`.
- `extractAppId(row, link)` → debe seguir sacando el ID del `href .../app/<id>/`.

### Paso 3: Mantener siempre la seguridad
- **Sin peticiones de datos ni telemetría:** Nunca agregues llamadas a APIs ni envío de datos. La importación puede abrir páginas de Steam para DLCs que no estén en la lista actual.
- **Sin datos personales:** No incluyas nombres de usuario de Windows, rutas locales de tu máquina ni tokens.
- **Sin `innerHTML`:** Construye siempre los elementos mediante `document.createElement()`.

### Exportación e importación (v0.2.0)
**Los cuatro botones hacen su trabajo con UN solo clic.** No hay modales ni paneles: el usuario
pidió explícitamente el comportamiento directo del principio.

**Motivo crítico:** Steam corre sobre CEF y **`window.alert()`, `confirm()` y `prompt()` no están
implementados** — son no-ops silenciosos. Cualquier mensaje de estado vía `alert()` es invisible
para el usuario y el plugin "parece roto". Todos los botones dan feedback con
`notify(doc, mensaje, kind, duracion)`, que pinta un toast en el DOM (`#dlc-switcher-toast`).

- **Exportar** (`exportActiveDLCs`): genera el archivo con **solo los DLC ACTIVADOS** y a la vez
  lo descarga (`steam-dlc-switcher.txt`), lo copia al portapapeles y lo guarda en `localStorage`
  (`steam-dlc-switcher:last-export`). Toast: "Exportados N DLC activados a ...".
  - ⚠️ No hagas `link.remove()` justo después de `link.click()`: en Chromium eso **cancela la
    descarga**. Retrasa la eliminación con `setTimeout`.
  - El `<input type="file">` para importar se crea una sola vez junto a los botones y se reutiliza
    (`fileInput.value = ''` antes de leer, para poder elegir el mismo archivo otra vez).
- **Importar** (`importDLCs`): abre el selector de archivos, parsea y activa los DLC disponibles
  (por ID o, si no hay ID, por nombre). Toast con los activados y los que ya estaban activos;
  si faltan DLC, muestra hasta 3 y el toast dura 12 s.
  - No abras páginas de la tienda automáticamente: tras el `await` de lectura del archivo se pierde
    el *user gesture* y el popup blocker las bloquea.
- **Formato:** `Steam DLC Switcher export v1` + `ID<TAB>Nombre` por línea.
- **Parsing tolerante:** `parseImportText()` acepta cabecera ausente, BOM UTF-8, UTF-16 LE/BE
  (detecta la marca en los bytes y usa `TextDecoder`), tabulaciones o espacios, y descarta
  duplicados.
