@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
title Steam DLC Switcher - Instalador

set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
set "PLUGIN_ID=steam_dlc_switcher"
set "PS_HELPER=%SCRIPT_DIR%\tools\enable-plugin.ps1"
set "PS_CLEAN=%SCRIPT_DIR%\tools\cleanup-duplicates.ps1"

echo ========================================================
echo           STEAM DLC SWITCHER  -  INSTALADOR
echo ========================================================
echo.

rem --------------------------------------------------------------- detectar Steam
set "STEAMDIR="
for /f "tokens=2,*" %%a in ('reg query "HKCU\Software\Valve\Steam" /v "SteamPath" 2^>nul') do set "STEAMDIR=%%b"
if not defined STEAMDIR (
    for /f "tokens=2,*" %%a in ('reg query "HKLM\SOFTWARE\WOW6432Node\Valve\Steam" /v "InstallPath" 2^>nul') do set "STEAMDIR=%%b"
)
if not defined STEAMDIR set "STEAMDIR=C:\Program Files (x86)\Steam"
set "STEAMDIR=%STEAMDIR:/=\%"

if not exist "!STEAMDIR!\steam.exe" (
    echo [X] No se encuentra steam.exe en "!STEAMDIR!".
    echo.
    set /p "STEAMDIR=Escribe la ruta de tu carpeta de Steam: "
    if not exist "!STEAMDIR!\steam.exe" (
        echo [X] La ruta no es valida. Abortando.
        pause
        exit /b 1
    )
)

set "MILLENNIUM_DIR=!STEAMDIR!\millennium"
set "PLUGIN_DIR=!MILLENNIUM_DIR!\plugins\!PLUGIN_ID!"
set "CONFIG_FILE=!MILLENNIUM_DIR!\config\config.json"

echo [*] Steam:       !STEAMDIR!
if exist "!MILLENNIUM_DIR!\lib\millennium.dll" (
    echo [*] Millennium: detectado
) else (
    echo [X] Millennium NO esta instalado en:
    echo      !MILLENNIUM_DIR!
    echo.
    echo    Descargalo de https://millennium.app/ y vuelve a ejecutar este instalador.
    echo.
    pause
    exit /b 1
)
echo.

rem Las routines de Steam van aqui pero NO deben ejecutarse al caer: se salta al menu.
goto :menu

rem =============================================================== RUTINAS DE STEAM
:steam_running
tasklist /fi "IMAGENAME eq steam.exe" 2>nul | find /i "steam.exe" >nul
if errorlevel 1 (set "STEAM_RUNNING=0") else (set "STEAM_RUNNING=1")
exit /b 0

rem Espera activa a que Steam termine de cerrar (maximo 40 s)
rem Se usa ping y no timeout porque timeout falla si la entrada esta redirigida.
:wait_steam_closed
call :steam_running
if "!STEAM_RUNNING!"=="0" exit /b 0
if !WAITED! GEQ 40 exit /b 0
ping -n 3 127.0.0.1 >nul
set /a "WAITED+=2"
call :wait_steam_closed
exit /b 0

rem Cierra Steam si esta abierto. Los plugins no se recargan en caliente y los
rem ficheros estan bloqueados mientras corre, asi que va ANTES de copiar nada.
:close_steam
call :steam_running
if "!STEAM_RUNNING!"=="0" (
    echo     Steam ya estaba cerrado.
    exit /b 0
)

echo     Cerrando Steam... ^(puede tardar unos segundos^)
"!STEAMDIR!\steam.exe" -shutdown >nul 2>&1
set "WAITED=0"
call :wait_steam_closed

call :steam_running
if "!STEAM_RUNNING!"=="0" (
    echo     [OK] Steam cerrado.
    exit /b 0
)

echo     [aviso] Steam no se ha cerrado solo. Forzar el cierre?
set "ANS="
set /p "ANS=     Cerrar Steam a la fuerza? (s/N): "
if /i not "!ANS!"=="s" (
    echo     [aviso] Steam sigue abierto. Si la copia falla, cierralo y reintenta.
    exit /b 0
)
taskkill /F /IM steamwebhelper.exe /T >nul 2>&1
taskkill /F /IM steam.exe /T >nul 2>&1
set "WAITED=0"
call :wait_steam_closed
call :steam_running
if "!STEAM_RUNNING!"=="0" (echo     [OK] Steam cerrado.) else (echo     [X] No se ha podido cerrar Steam.)
exit /b 0

rem Vuelve a abrir Steam al terminar
:open_steam
call :steam_running
if "!STEAM_RUNNING!"=="1" (
    echo     Steam ya esta abierto.
    exit /b 0
)
echo     Abriendo Steam...
start "" "!STEAMDIR!\steam.exe"

rem Si no aparece en 15 s, se reintenta con PowerShell
set "WAITED=0"
call :wait_steam_open
call :steam_running
if "!STEAM_RUNNING!"=="1" exit /b 0
echo     [aviso] Reintentando con otro metodo...
powershell -NoProfile -Command "Start-Process -FilePath '!STEAMDIR!\steam.exe'" >nul 2>&1
exit /b 0

rem Espera activa a que Steam aparezca (maximo 15 s)
:wait_steam_open
call :steam_running
if "!STEAM_RUNNING!"=="1" exit /b 0
if !WAITED! GEQ 15 exit /b 0
ping -n 2 127.0.0.1 >nul
set /a "WAITED+=1"
call :wait_steam_open
exit /b 0

rem =============================================================== MENU
:menu
echo ========================================================
echo                      QUE QUIERES HACER
echo ========================================================
echo   [1] Instalar / actualizar el plugin   ^(cierra y reabre Steam^)
echo   [2] Activar el plugin en la config de Millennium
echo   [3] Restaurar la copia de seguridad de config.json
echo   [4] Desinstalar el plugin
echo   [5] Limpiar instalaciones duplicadas
echo   [0] Salir
echo.
set "OPTION="
set /p "OPTION=Elige una opcion: "

if "!OPTION!"=="1" goto instalar
if "!OPTION!"=="2" goto activar
if "!OPTION!"=="3" goto restaurar
if "!OPTION!"=="4" goto desinstalar
if "!OPTION!"=="5" goto limpiar
if "!OPTION!"=="0" goto :fin
echo.
echo Opcion no valida.
echo.
goto menu

rem =============================================================== INSTALAR
:instalar
echo.
call :close_steam
echo.

echo --- Copia de seguridad del plugin actual ---
if exist "!PLUGIN_DIR!" (
    rem OJO: la copia va FUERA de plugins\, porque Millennium cargaria esa carpeta
    rem como si fuera otro plugin (y duplicaria los botones).
    set "BKDIR=!MILLENNIUM_DIR!\backup\!PLUGIN_ID!-!RANDOM!!RANDOM!"
    if not exist "!BKDIR!" mkdir "!BKDIR!" >nul 2>&1
    xcopy "!PLUGIN_DIR!" "!BKDIR!\" /E /I /Q /Y >nul 2>&1
    if exist "!BKDIR!" (echo     [OK] Copia guardada en !BKDIR!) else (echo     [aviso] No se pudo hacer la copia)
) else (
    echo     - no habia version anterior
)
echo.

echo --- Copiando archivos ---
if exist "!SCRIPT_DIR!\plugin.json" (
    echo     fuente: "!SCRIPT_DIR!"
    if not exist "!PLUGIN_DIR!\.millennium\Dist" mkdir "!PLUGIN_DIR!\.millennium\Dist" >nul 2>&1
    if not exist "!PLUGIN_DIR!\Dist"           mkdir "!PLUGIN_DIR!\Dist" >nul 2>&1
    if not exist "!PLUGIN_DIR!\frontend"       mkdir "!PLUGIN_DIR!\frontend" >nul 2>&1
    copy /y "!SCRIPT_DIR!\plugin.json"               "!PLUGIN_DIR!\plugin.json"                >nul
    copy /y "!SCRIPT_DIR!\index.js"                  "!PLUGIN_DIR!\index.js"                   >nul
    copy /y "!SCRIPT_DIR!\frontend\index.js"         "!PLUGIN_DIR!\frontend\index.js"          >nul
    copy /y "!SCRIPT_DIR!\Dist\index.js"             "!PLUGIN_DIR!\Dist\index.js"              >nul
    copy /y "!SCRIPT_DIR!\.millennium\Dist\index.js" "!PLUGIN_DIR!\.millennium\Dist\index.js" >nul
) else (
    echo [X] No se encuentra plugin.json junto al instalador.
    echo     Coloca TODO el repositorio en la misma carpeta y vuelve a ejecutar.
    pause
    goto menu
)
echo     [OK] Archivos copiados
echo.

echo --- Verificando que las 4 rutas son identicas ---
set "VERIFY=OK"
fc /b "!SCRIPT_DIR!\index.js"                  "!PLUGIN_DIR!\index.js"                   >nul 2>&1 || set "VERIFY=KO"
fc /b "!SCRIPT_DIR!\frontend\index.js"         "!PLUGIN_DIR!\frontend\index.js"          >nul 2>&1 || set "VERIFY=KO"
fc /b "!SCRIPT_DIR!\Dist\index.js"             "!PLUGIN_DIR!\Dist\index.js"              >nul 2>&1 || set "VERIFY=KO"
fc /b "!SCRIPT_DIR!\.millennium\Dist\index.js" "!PLUGIN_DIR!\.millennium\Dist\index.js" >nul 2>&1 || set "VERIFY=KO"
if "!VERIFY!"=="OK" (
    echo     [OK] Las 4 copias coinciden
) else (
    echo     [X] Las copias NO coinciden
)
for /f "tokens=2 delims=:, " %%v in ('findstr /i "version" "!PLUGIN_DIR!\plugin.json"') do echo     version instalada: %%~v
echo.

call :limpiar
call :activar
echo.
echo ========================================================
echo        INSTALACION COMPLETADA
echo ========================================================
echo.
echo Steam se va a abrir de nuevo. En sus ajustes, en
echo Millennium ^> Complementos, activa "Steam DLC Switcher".
echo.
echo Si los botones siguen duplicados, ejecuta la opcion [5].
echo.
pause
call :open_steam
goto menu

rem =============================================================== LIMPIAR
:limpiar
echo.
if not exist "!PS_CLEAN!" (
    echo [aviso] No se encuentra "!PS_CLEAN!". Se omite la limpieza.
    exit /b 0
)
powershell -NoProfile -ExecutionPolicy Bypass -File "!PS_CLEAN!" -PluginsDir "!MILLENNIUM_DIR!\plugins" -PluginName "!PLUGIN_ID!" -CanonicalFolder "!PLUGIN_ID!" -BackupDir "!MILLENNIUM_DIR!\backup"
echo.
exit /b 0

rem =============================================================== ACTIVAR
:activar
if not exist "!PS_HELPER!" (
    echo [aviso] No se encuentra "!PS_HELPER!"
    exit /b 0
)
echo --- Activando el plugin en la config de Millennium ---
powershell -NoProfile -ExecutionPolicy Bypass -File "!PS_HELPER!" -ConfigPath "!CONFIG_FILE!" -PluginName "!PLUGIN_ID!"
echo.
exit /b 0

rem =============================================================== RESTAURAR
:restaurar
echo.
if not exist "!CONFIG_FILE!" (
    echo [aviso] No existe config.json. Nada que restaurar.
    goto menu
)
set "LATEST="
for /f "delims=" %%f in ('dir /b /o-d "!CONFIG_FILE!.bak-*" 2^>nul') do (
    if not defined LATEST set "LATEST=%%f"
)
if not defined LATEST (
    echo [aviso] No hay ninguna copia config.json.bak-* en la carpeta config.
    goto menu
)
echo     Copia mas reciente: !LATEST!
echo     ATENCION: esto restaurara la config TAL CUAL estaba en ese momento.
set /p "CONFIRM=Seguro? (s/N): "
if /i not "!CONFIRM!"=="s" (
    echo     Cancelado.
    goto menu
)
copy /y "!MILLENNIUM_DIR!\config\!LATEST!" "!CONFIG_FILE!" >nul
echo     [OK] config.json restaurado.
echo.
echo Se cierra Steam para que Millennium lo lea al volver a abrirlo.
echo.
pause
call :close_steam
call :open_steam
goto menu

rem =============================================================== DESINSTALAR
:desinstalar
echo.
echo Se va a quitar "!PLUGIN_ID!".
echo La copia de seguridad se deja intacta por si acaso.
set /p "CONFIRM=Seguro? (s/N): "
if /i not "!CONFIRM!"=="s" (
    echo     Cancelado.
    goto menu
)
call :close_steam
if exist "!PS_HELPER!" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "!PS_HELPER!" -ConfigPath "!CONFIG_FILE!" -PluginName "!PLUGIN_ID!" -Disable
)
if exist "!PLUGIN_DIR!" (
    rd /s /q "!PLUGIN_DIR!"
    echo     [OK] Plugin eliminado.
) else (
    echo     El plugin ya no estaba instalado.
)
echo.
echo Listo. Steam se vuelve a abrir.
echo.
pause
call :open_steam
goto menu

:fin
echo.
echo Hasta luego.
endlocal
exit /b 0