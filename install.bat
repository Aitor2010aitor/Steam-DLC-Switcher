@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
title Instalador - Steam DLC Switcher

echo =======================================================
echo          INSTALADOR DE STEAM DLC SWITCHER
echo =======================================================
echo.

:: 1. Detectar ruta de Steam desde el Registro de Windows
set "STEAMPATH="
for /f "tokens=2*" %%a in ('reg query "HKCU\Software\Valve\Steam" /v "SteamPath" 2^>nul') do (
    set "STEAMPATH=%%b"
)

if not defined STEAMPATH (
    for /f "tokens=2*" %%a in ('reg query "HKLM\SOFTWARE\WOW6432Node\Valve\Steam" /v "InstallPath" 2^>nul') do (
        set "STEAMPATH=%%b"
    )
)

if not defined STEAMPATH (
    set "STEAMPATH=C:\Program Files (x86)\Steam"
)

:: Normalizar barras
set "STEAMPATH=!STEAMPATH:/=\!"

echo [*] Ruta detectada de Steam: "!STEAMPATH!"
if not exist "!STEAMPATH!\steam.exe" (
    echo [!] No se encontro steam.exe en la ruta especificada.
    set /p "STEAMPATH=Introduce manualmente la ruta de tu carpeta de Steam: "
)

:: 2. Verificar que Millennium este instalado
set "MILLENNIUM_DIR=!STEAMPATH!\millennium"
if not exist "!MILLENNIUM_DIR!" (
    echo.
    echo [ERROR] No se ha detectado Millennium en:
    echo "!MILLENNIUM_DIR!"
    echo.
    echo Por favor, instala primero Millennium desde: https://millennium.app/
    echo y vuelve a ejecutar este instalador.
    echo.
    pause
    exit /b 1
)

:: 3. Definir carpeta de destino del plugin
set "PLUGIN_DIR=!MILLENNIUM_DIR!\plugins\steam_dlc_switcher"
echo [*] Instalando plugin en:
echo     "!PLUGIN_DIR!"
echo.

:: Crear carpetas necesarias
if not exist "!PLUGIN_DIR!\.millennium\Dist" mkdir "!PLUGIN_DIR!\.millennium\Dist"
if not exist "!PLUGIN_DIR!\Dist" mkdir "!PLUGIN_DIR!\Dist"
if not exist "!PLUGIN_DIR!\frontend" mkdir "!PLUGIN_DIR!\frontend"

:: 4. Copiar archivos si existen localmente o descargarlos desde GitHub (solo archivos del plugin)
set "SRC_DIR=%~dp0"
if exist "!SRC_DIR!plugin.json" (
    echo [*] Copiando archivos esenciales del plugin...
    copy /y "!SRC_DIR!plugin.json" "!PLUGIN_DIR!\plugin.json" >nul
    copy /y "!SRC_DIR!index.js" "!PLUGIN_DIR!\index.js" >nul
    copy /y "!SRC_DIR!frontend\index.js" "!PLUGIN_DIR!\frontend\index.js" >nul
    copy /y "!SRC_DIR!Dist\index.js" "!PLUGIN_DIR!\Dist\index.js" >nul
    copy /y "!SRC_DIR!.millennium\Dist\index.js" "!PLUGIN_DIR!\.millennium\Dist\index.js" >nul
) else (
    echo [*] Descargando unicamente los archivos del plugin desde GitHub...
    set "REPO_URL=https://raw.githubusercontent.com/Aitor2010aitor/Steam-DLC-Switcher/main"
    curl -s -L "!REPO_URL!/plugin.json" -o "!PLUGIN_DIR!\plugin.json"
    curl -s -L "!REPO_URL!/index.js" -o "!PLUGIN_DIR!\index.js"
    curl -s -L "!REPO_URL!/frontend/index.js" -o "!PLUGIN_DIR!\frontend\index.js"
    curl -s -L "!REPO_URL!/Dist/index.js" -o "!PLUGIN_DIR!\Dist\index.js"
    curl -s -L "!REPO_URL!/.millennium/Dist/index.js" -o "!PLUGIN_DIR!\.millennium\Dist\index.js"
)

:: 5. Activar automaticamente en config.json de Millennium
set "CONFIG_FILE=!MILLENNIUM_DIR!\config\config.json"
if exist "!CONFIG_FILE!" (
    echo [*] Activando plugin en la configuracion de Millennium...
    powershell -NoProfile -Command ^
        "$p = '!CONFIG_FILE!';" ^
        "if (Test-Path $p) {" ^
        "  $json = Get-Content $p -Raw | ConvertFrom-Json;" ^
        "  if ($json.plugins.enabledPlugins -notcontains 'steam_dlc_switcher') {" ^
        "    $json.plugins.enabledPlugins += 'steam_dlc_switcher';" ^
        "    $json | ConvertTo-Json -Depth 10 | Set-Content $p -Encoding UTF8;" ^
        "  }" ^
        "}"
)

echo.
echo =======================================================
echo     INSTALACION COMPLETADA CON EXITO!
echo =======================================================
echo.
echo Pasos finales:
echo 1. Si tienes Steam abierto, cierralo por completo
echo    (Bandeja del sistema: Clic derecho en Steam ^> Salir de Steam).
echo 2. Vuelve a iniciar Steam.
echo 3. Abre Propiedades ^> DLC de cualquier juego y disfruta!
echo.
pause
