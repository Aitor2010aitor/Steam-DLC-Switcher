<img width="1379" height="627" alt="{2168E9D5-A707-402B-B7C5-405421BDBE15}" src="https://github.com/user-attachments/assets/1bffab29-d5df-48ce-a0b5-5f242f9076f3" />

 
> [!NOTE]  
> ***Corregido en la v0.2.4: activar y desactivar cambia TODOS los DLC de una vez (sin tener que bajar hasta el final), y exportar/importar también usan la lista completa. Si probaste una versión anterior, reinstala esta.***


# Steam DLC Switcher (Steam Millennium Plugin)

**Steam DLC Switcher** es un complemento para Steam (usando [Millennium](https://docs.steambrew.app/users/getting-started/installation) que añade botones interactivos para **activar o desactivar todos los DLCs** de cualquier juego con un solo clic en la ventana de Propiedades.

---

## ➕ Añadir

### Exportación de DLC

El botón **`Exportar`** genera un archivo `steam-dlc-switcher.txt` con **los DLC que tengas
activados en ese momento**. De paso lo copia al portapapeles, así que también puedes pegarlo
en un chat o en un correo.

El archivo es un texto plano, puedes abrirlo con el Bloc de notas:

```text
Steam DLC Switcher export v1
1050490	Class 08 Intercity Livery Add-On
1050491	The Count of Monster Disco
1050492	Train Simulator: London Overground BR Class 313 EMU Add-On
```

La primera línea es la cabecera. Cada línea siguiente lleva el **ID** del DLC y su **nombre**
separados por un tabulador. El ID es el identificador de Steam: si visitas
`https://store.steampowered.com/app/1050490/` llegas a la página de ese DLC en la tienda.

Pásale ese archivo a quien quieras: es la forma de compartir o respaldar tu configuración.

### Importación de DLC

El botón **`Importar`** aplica una lista de este tipo en tu Steam:


> [!IMPORTANT]  
> 1. Abre **el juego al que pertenece la lista** en tu biblioteca.
>    ⚠️ Cada lista es de **un solo juego**. Si es de *Train Simulator*, úsala solo en ese juego.
> 2. Clic derecho en el juego → **Propiedades** → pestaña **DLC**.
> 3. Pulsa **`Importar`**.
> 4. Selecciona el archivo `steam-dlc-switcher.txt`.
> 
> | | |
> |---|---|
> | ✅ Activa | **Solo los DLC que tú ya tienes.** Los que no poseas se saltan. |
> | ✅ Ignora | Los que ya tenías activados: no los toca ni los duplica. |
> | ❌ No compra | No se descarga ni se compra nada. Sin pagos, sin credenciales, sin red. |
> | ❌ No envía | Todo es local. No se sube nada a ningún servidor. |
> 
> Al terminar verás un resumen abajo, por ejemplo:
> 

```
Importados 9 DLC activados (5 ya estaban activos). 3 no disponibles: ...
```

Los *no disponibles* son DLC de la lista que tu cuenta no posee. Es lo esperado: indica que quien
te pasó el archivo tiene DLC que tú no has comprado.

---

## 🚀 Características
- **Un clic para todo:** Botones dedicados `[✓ Activar Todos]`, `[✕ Desactivar Todos]`, `[Exportar]` e `[Importar]`, sin menús ni ventanas intermedias.
- **Compartir listas:** `[Exportar]` descarga un TXT con **solo los DLC activados** (y lo copia al portapapeles). `[Importar]` activa los DLC de ese archivo en otro equipo, identificándolos por ID o por nombre.
- **Avisos visibles:** Steam (CEF) no implementa `window.alert()`, así que el plugin muestra los avisos como notificaciones dentro de la propia ventana.
- **Integración nativa y sin ocupar sitio:** Se meten en la **misma línea** que *Buscar* y *Ver más en la tienda*, así que **no añaden ni una fila de alto**: ves los mismos DLC que sin el plugin.
- **Multi-idioma:** Compatible con Steam en español, inglés y otros idiomas.
- **Seguro y Privado:** 
  - 100% libre de telemetría y rastreo.
  - No envía datos ni realiza peticiones en segundo plano. Al importar solo se leen los DLC de la lista local, nunca se abre ninguna web.
  - No lee ni expone datos de usuario, contraseñas ni credenciales.
  - Opera exclusivamente en el DOM de la interfaz de Steam.

---

## 📦 Instalación Rápida (Recomendada)

1. Abre Steam normalmente. **No hace falta que cierres nada**: el instalador lo hace por ti.
2. Asegúrate de tener instalado **[Millennium para Steam](https://docs.steambrew.app/users/getting-started/installation)**.
3. Ejecuta **`install.bat`** haciendo doble clic y elige `[1] Instalar`.
   - **Cierra Steam por ti** y espera a que termine. Si no se cierra solo, te preguntará si forzarlo.
   - Detecta automáticamente tu instalación de Steam.
   - Hace copia de seguridad de tu versión anterior en `millennium\backup\`.
   - Copia el plugin y verifica que las 4 rutas de `index.js` son idénticas.
   - Limpia instalaciones duplicadas que encuentre en `millennium\plugins\`.
   - Activa el plugin en la configuración de Millennium **sin reescribir el resto del JSON**
     (guarda antes una copia en `config.json.bak-<fecha>`).
   - **Vuelve a abrir Steam** al terminar.
4. En los ajustes de Steam, *Millennium > Complementos*, activa el interruptor del plugin.

### Otras opciones del instalador

| Opción | Qué hace |
|---|---|
| `[1]` | Instalar / actualizar el plugin |
| `[2]` | Volver a activar el plugin en la config de Millennium |
| `[3]` | Restaurar la copia de seguridad más reciente de `config.json` |
| `[4]` | Desinstalar el plugin (deja la copia de seguridad) |
| `[5]` | Limpiar instalaciones duplicadas |

> **Instalaciones duplicadas:** si el plugin aparece **dos veces** en *Millennium > Complementos*,
> es que hay dos carpetas con el mismo `name` dentro de `millennium\plugins\`. Ejecuta `[5]` (o
> reinstala con `[1]`, que ya lo hace): aparta la copia sobrante a `millennium\backup\` y deja
> solo la buena.

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
