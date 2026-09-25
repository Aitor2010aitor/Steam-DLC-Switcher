# Steam DLC Switcher (Steam Millennium Plugin)

**Steam DLC Switcher** es un complemento para Steam (usando [Millennium](https://docs.steambrew.app/users/getting-started/installation) que añade botones interactivos para **activar o desactivar todos los DLCs** de cualquier juego con un solo clic en la ventana de Propiedades.

---

## 🚀 Características
- **Un clic para todo:** Botones dedicados `[✓ Activar Todos]` y `[✕ Desactivar Todos]`.
- **Integración nativa:** Se integran directamente en la cabecera de la sección de DLC de Steam junto a *Buscar* y *Ver más en la tienda*.
- **Multi-idioma:** Compatible con Steam en español, inglés y otros idiomas.
- **Seguro y Privado:** 
  - 100% libre de telemetría y rastreo.
  - No realiza peticiones de red externas (`fetch`, `XHR` o conexiones a servidores).
  - No lee ni expone datos de usuario, contraseñas ni credenciales.
  - Opera exclusivamente en el DOM de la interfaz de Steam.

---

## 📦 Instalación Rápida (Recomendada)

1. Asegúrate de tener instalado **[Millennium para Steam](https://docs.steambrew.app/users/getting-started/installation)**.
2. Descarga este repositorio (o el archivo [`install.bat`](install.bat)).
3. Ejecuta **`install.bat`** haciendo doble clic.
   - Detectará automáticamente tu instalación de Steam.
   - Instalará el plugin en `Steam\millennium\plugins\steam_dlc_switcher`.
   - Activará el plugin en la configuración de Millennium automáticamente.
4. Reinicia Steam y ¡listo!

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
├── install.bat           # Instalador automático en 1 clic
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
