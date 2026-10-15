<img width="1379" height="627" alt="{2168E9D5-A707-402B-B7C5-405421BDBE15}" src="https://github.com/user-attachments/assets/1bffab29-d5df-48ce-a0b5-5f242f9076f3" />





# Steam DLC Switcher (Steam Millennium Plugin)

**Steam DLC Switcher** es un complemento para Steam (usando [Millennium](https://docs.steambrew.app/users/getting-started/installation) que añade botones interactivos para **activar o desactivar todos los DLCs** de cualquier juego con un solo clic en la ventana de Propiedades.

---

# 👋 Te han pasado una configuración de DLC

Si alguien te ha enviado un archivo llamado **`steam-dlc-switcher.txt`**, esto es para ti.
Ese archivo guarda **qué DLCs tiene activados esa persona** en un juego concreto, para que tú
puedas replicarlo en tu Steam **sin marcar DLCs uno a uno**.

## 1. Instala el complemento (solo la primera vez)

1. **Cierra Steam por completo** (bandeja del sistema → clic derecho → *Salir de Steam*).
2. Instala **[Millennium para Steam](https://docs.steambrew.app/users/getting-started/installation)** si aún no lo tienes.
3. Ejecuta **`install.bat`** y elige `[1] Instalar`.
4. Abre Steam de nuevo.

## 2. Aplica la configuración

1. Abre el juego **al que pertenece esa lista** en tu biblioteca.
   ⚠️ La lista es de **un solo juego**: si te la pasaron para *Train Simulator*, úsala solo ahí.
2. Clic derecho en el juego → **Propiedades** → pestaña **DLC**.
3. Verás cuatro botones verdes/rojos encima de la lista. Pulsa **`Importar`**.
4. Selecciona el archivo **`steam-dlc-switcher.txt`** que te pasaron.
5. Listo. Abajo aparecerá un aviso verde con cuántos DLC se han activado.

## 3. Qué hace y qué **no** hace

| | |
|---|---|
| ✅ Activa | **Solo los DLC que tú ya tienes.** Los que no poseas se muestran como *no disponibles* y se saltan. |
| ✅ Ignora | DLC que ya tenías activados (no los toca ni los duplica). |
| ❌ No compra | **No se descarga ni se compra nada.** Sin credenciales, sin pagos, sin redes. |
| ❌ No abre | No se abre ninguna web ni se envía nada a ningún servidor. Todo es local. |

Al terminar verás un resumen con el detalle, por ejemplo:

```
Importados 9 DLC activados (5 ya estaban activos). 3 no disponibles: ...
```

Los *no disponibles* son DLC de la lista que tu cuenta no posee. Es lo esperado: indica que quien
te pasó el archivo tiene DLC que tú no has comprado.

## 4. Curiosidades del archivo

Puedes abrirlo con el Bloc de notas. Es un texto plano y tiene este aspecto:

```text
Steam DLC Switcher export v1
1050490	Class 08 Intercity Livery Add-On
1050491	The Count of Monster Disco
1050492	Train Simulator: London Overground BR Class 313 EMU Add-On
```

La primera línea es la cabecera, y cada línea siguiente lleva el **ID** del DLC y su **nombre**
separados por un tabulador. Los números son los identificadores de Steam: si abres
`https://store.steampowered.com/app/1050490/` en el navegador, llegarás a esa página de la tienda.

## 5. Tus propias listas

El botón **`Exportar`** hace lo inverso: genera ese archivo con **los DLC que tengas activados
ahora mismo**. Úsalo para respaldar tu configuración o para pasársela a otro amigo.

---

## 🚀 Características
- **Un clic para todo:** Botones dedicados `[✓ Activar Todos]`, `[✕ Desactivar Todos]`, `[Exportar]` e `[Importar]`, sin menús ni ventanas intermedias.
- **Compartir listas:** `[Exportar]` descarga un TXT con **solo los DLC activados** (y lo copia al portapapeles). `[Importar]` activa los DLC de ese archivo en otro equipo, identificándolos por ID o por nombre.
- **Avisos visibles:** Steam (CEF) no implementa `window.alert()`, así que el plugin muestra los avisos como notificaciones dentro de la propia ventana.
- **Integración nativa:** Se integran directamente en la cabecera de la sección de DLC de Steam junto a *Buscar* y *Ver más en la tienda*.
- **Multi-idioma:** Compatible con Steam en español, inglés y otros idiomas.
- **Seguro y Privado:** 
  - 100% libre de telemetría y rastreo.
  - No envía datos ni realiza peticiones en segundo plano. Al importar, solo abre páginas de la tienda de Steam para los DLC que no aparecen o no están disponibles para activarse.
  - No lee ni expone datos de usuario, contraseñas ni credenciales.
  - Opera exclusivamente en el DOM de la interfaz de Steam.

---

## 📦 Instalación Rápida (Recomendada)

1. **Cierra Steam por completo** (bandeja del sistema → clic derecho → *Salir de Steam*). Los plugins no se recargan en caliente.
2. Asegúrate de tener instalado **[Millennium para Steam](https://docs.steambrew.app/users/getting-started/installation)**.
3. Ejecuta **`install.bat`** haciendo doble clic y elige `[1] Instalar`.
   - Detecta automáticamente tu instalación de Steam.
   - Hace copia de seguridad de tu versión anterior en `millennium\backup\`.
   - Copia el plugin y verifica que las 4 rutas de `index.js` son idénticas.
   - Activa el plugin en la configuración de Millennium **sin reescribir el resto del JSON**
     (guarda antes una copia en `config.json.bak-<fecha>`).
4. Vuelve a abrir Steam y comprueba en *Millennium > Complementos* que aparece la versión nueva.

### Otras opciones del instalador

| Opción | Qué hace |
|---|---|
| `[1]` | Instalar / actualizar el plugin |
| `[2]` | Volver a activar el plugin en la config de Millennium |
| `[3]` | Restaurar la copia de seguridad más reciente de `config.json` |
| `[4]` | Desinstalar el plugin (deja la copia de seguridad) |

---

## 🛠️ Instalación Manual

1. Descarga o clona este repositorio en tu carpeta de plugins de Millennium:
   ```text
   C:\Program Files (x86)\Steam\millennium\plugins\steam_dlc_switcher
   ```
2. Reinicia Steam por completo (desde la bandeja del sistema: *clic derecho en Steam > Salir de Steam*).
3. Abre Steam, ve a los ajustes de **Millennium > Complementos** y verifica que **Steam DLC Switcher** esté activado.
4. Abre la ventana de **Propiedades > DLC** de cualquier juego en tu biblioteca y verás los botones en la barra superior.

---

## 📂 Estructura del Proyecto

```text
steam_dlc_switcher/
├── .millennium/
│   └── Dist/
│       └── index.js      # Punto de entrada para el motor virtual de Millennium
├── Dist/
│   └── index.js          # Distribución estándar
├── frontend/
│   └── index.js          # Código fuente frontend
├── index.js              # Entrada raíz para compatibilidad
├── plugin.json           # Manifiesto y metadatos del plugin para Millennium
├── install.bat           # Instalador (menú: instalar / reparar / desinstalar)
├── tools/
│   └── enable-plugin.ps1 # Activa el plugin en config.json sin romperlo
├── test-plugin.js        # Pruebas (solo desarrollo, no se instala)
├── LICENSE               # Licencia MIT
└── README.md             # Documentación del proyecto
```

---

## 🔒 Auditoría de Seguridad para Código Abierto

Este proyecto ha sido auditado antes de su publicación:
- **Sin credenciales ni secretos:** No contiene rutas absolutas locales de desarrollo, tokens, correos ni datos personales.
- **Sin dependencias externas:** Todo el código está contenido en JavaScript nativo vanilla sin paquetes de terceros vulnerables.
- **Sin manipulación insegura:** No utiliza `eval()` ni inyecciones de `innerHTML`. Los elementos se construyen con `document.createElement()` seguro.

---

## 🤖 Guía para Inteligencias Artificiales y Mantenimiento

Si vas a actualizar o realizar cambios en este plugin mediante un asistente o agente de Inteligencia Artificial (por ejemplo, tras una actualización de Millennium o de Steam), consulta la guía técnica completa en:
- **[AGENTS.md](AGENTS.md)**: Explica las restricciones del motor `eval()` de Millennium, selectores del DOM de Steam, gestión de ventanas y pasos para diagnosticar problemas.

---

## 📄 Licencia

Este proyecto está bajo la licencia [MIT](LICENSE). Eres libre de usarlo, modificarlo y distribuirlo libremente.
