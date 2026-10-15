<#
    .SYNOPSIS
    Habilita o deshabilita un plugin en la configuracion de Millennium de forma SEGURA.

    .DESCRIPTION
    NO reescribe el JSON entero con ConvertTo-Json. Eso pierde el orden de las claves,
    descarta claves desconocidas y con -Depth puede truncar objetos anidados, dejando
    la configuracion de Millennium rota.

    Aqui se hace una edicion TEXTUAL: solo se toca el array "enabledPlugins".
    Antes de escribir se hace copia de seguridad y se valida el JSON resultante.
    Si el resultado no es valido, se restaura la copia y no se toca nada.

    .PARAMETER ConfigPath
    Ruta de millennium\config\config.json

    .PARAMETER PluginName
    Nombre del plugin (campo "name" de plugin.json)

    .PARAMETER Disable
    Quita el plugin de enabledPlugins en lugar de anadirlo.

    .EXAMPLE
    powershell -ExecutionPolicy Bypass -File tools\enable-plugin.ps1 -ConfigPath "C:\...\config.json" -PluginName steam_dlc_switcher
#>
param(
    [Parameter(Mandatory = $true)][string]$ConfigPath,
    [Parameter(Mandatory = $true)][string]$PluginName,
    [switch]$Disable
)

$ErrorActionPreference = 'Stop'

function Say($msg)  { Write-Host "  $msg" }
function Ok($msg)   { Write-Host "  [OK] $msg" -ForegroundColor Green }
function Warn2($msg){ Write-Host "  [!] $msg" -ForegroundColor Yellow }
function Err($msg)  { Write-Host "  [X] $msg" -ForegroundColor Red }

# --- Millennium no ha creado la config todavia -------------------------------
if (-not (Test-Path -LiteralPath $ConfigPath)) {
    Warn2 "No existe todavia: $ConfigPath"
    Warn2 "Millennium la creara al arrancar. Activa el plugin desde Millennium > Complementos."
    exit 0
}

# --- Lectura ( tolerante a BOM ) --------------------------------------------
$raw = [System.IO.File]::ReadAllText($ConfigPath)
if ($raw.Length -gt 0 -and $raw[0] -eq [char]0xFEFF) {
    $raw = $raw.Substring(1)
    Say "Se ha ignorado un BOM UTF-8 al leer."
}

try {
    $null = $raw | ConvertFrom-Json -ErrorAction Stop
} catch {
    Err "config.json ya estaba corrupto ANTES de tocarlo: $($_.Exception.Message)"
    Err "No se modifica nada. Restaura una copia a mano desde config.json.bak-*"
    exit 2
}

# --- Copia de seguridad ------------------------------------------------------
$stamp   = Get-Date -Format 'yyyyMMdd-HHmmss'
$backup  = "$ConfigPath.bak-$stamp"
try {
    Copy-Item -LiteralPath $ConfigPath -Destination $backup -Force
    Ok "Copia de seguridad creada: $(Split-Path -Leaf $backup)"
} catch {
    Err "No se pudo crear la copia de seguridad. Abortando por seguridad: $($_.Exception.Message)"
    exit 2
}

# --- Edicion textual del array enabledPlugins --------------------------------
$rx = [regex]'"enabledPlugins"\s*:\s*\[(?<inner>[^\]]*)\]'
$m  = $rx.Match($raw)

if (-not $m.Success) {
    Warn2 'No se encontro el array "enabledPlugins" en config.json.'
    Warn2 'Estructura inesperada. Activa el plugin desde Millennium > Complementos.'
    exit 3
}

$current = @(
    $m.Groups['inner'].Value -split ',' |
        ForEach-Object { $_.Trim().Trim('"') } |
        Where-Object { $_ }
)
$present = $current -contains $PluginName

if ($Disable) {
    if (-not $present) { Say 'El plugin ya estaba desactivado. No hay nada que hacer.'; exit 0 }
    $newList = @($current | Where-Object { $_ -ne $PluginName })
    $action  = "deshabilitado"
} else {
    if ($present) { Say 'El plugin ya estaba habilitado. No hay nada que hacer.'; exit 0 }
    $newList = @($current) + @($PluginName)
    $action  = "habilitado"
}

$newInner = (($newList | ForEach-Object { '"' + $_ + '"' }) -join ', ')
$newRaw   = $raw.Substring(0, $m.Index) +
            '"enabledPlugins": [' + $newInner + ']' +
            $raw.Substring($m.Index + $m.Length)

# --- Validacion antes de escribir -------------------------------------------
try {
    $null = $newRaw | ConvertFrom-Json -ErrorAction Stop
} catch {
    Err 'El resultado no era JSON valido. Se RESTAURA la copia de seguridad.'
    Copy-Item -LiteralPath $backup -Destination $ConfigPath -Force
    exit 4
}

# --- Escritura sin BOM -------------------------------------------------------
try {
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($ConfigPath, $newRaw, $utf8NoBom)
} catch {
    Err "No se pudo escribir config.json: $($_.Exception.Message)"
    Err "Se RESTAURA la copia de seguridad."
    Copy-Item -LiteralPath $backup -Destination $ConfigPath -Force
    exit 4
}

Ok "Plugin '$PluginName' $action."
Say "enabledPlugins = [$newInner]"
exit 0