<#
    .SYNOPSIS
    Detecta y retira INSTALACIONES DUPLICADAS de un plugin de Millennium.

    .DESCRIPTION
    Millennium carga una entrada por CADA carpeta dentro de plugins\ que tenga un
    plugin.json. Si una carpeta con el mismo nombre de plugin pero distinto nombre de
    carpeta sobrevive de una instalacion anterior, aparece el plugin duplicado en la
    lista de Complementos y sus codigos se ejecutan dos veces (botones duplicados).

    Este script:
      1. Busca todas las carpetas con plugin.json dentro de plugins\.
      2. Lee el campo "name" de cada una.
      3. Las que coinciden con el plugin pero NO se llaman como la carpeta canonica
         se mueven a millennium\backup\ (no se borran: se conservan por si acaso).

    .PARAMETER PluginsDir
    Carpeta plugins\ de Millennium.

    .PARAMETER PluginName
    Valor del campo "name" de plugin.json (steam_dlc_switcher).

    .PARAMETER CanonicalFolder
    Nombre de carpeta que debe tener la instalacion buena (steam_dlc_switcher).

    .PARAMETER BackupDir
    Donde se mueven las sobrantes.

    .EXAMPLE
    powershell -File tools\cleanup-duplicates.ps1 -PluginsDir "C:\...\plugins" -PluginName steam_dlc_switcher -CanonicalFolder steam_dlc_switcher
#>
param(
    [Parameter(Mandatory = $true)][string]$PluginsDir,
    [Parameter(Mandatory = $true)][string]$PluginName,
    [Parameter(Mandatory = $true)][string]$CanonicalFolder,
    [string]$BackupDir
)

$ErrorActionPreference = 'Stop'

function Ok($m)   { Write-Host "  [OK] $m" -ForegroundColor Green }
function Warn2($m){ Write-Host "  [!] $m" -ForegroundColor Yellow }
function Err($m)  { Write-Host "  [X] $m" -ForegroundColor Red }

if (-not (Test-Path -LiteralPath $PluginsDir)) {
    Warn2 "No existe la carpeta de plugins: $PluginsDir"
    exit 0
}

$manifests = Get-ChildItem -LiteralPath $PluginsDir -Filter 'plugin.json' -Recurse -File -Force -ErrorAction SilentlyContinue

if (-not $manifests) {
    Ok "No hay ningun plugin instalado en $PluginsDir"
    exit 0
}

$keepers = @()
$stale   = @()

foreach ($manifest in $manifests) {
    $folder = Split-Path -Parent $manifest.FullName
    $folderName = Split-Path -Leaf $folder

    try {
        $data = Get-Content -LiteralPath $manifest.FullName -Raw | ConvertFrom-Json -ErrorAction Stop
    } catch {
        Warn2 "plugin.json ilegible en '$folderName', se deja como esta."
        continue
    }

    if ($data.name -ne $PluginName) { continue }   # no es nuestro plugin

    if ($folderName -eq $CanonicalFolder) {
        $keepers += $folder
    } else {
        $stale += [pscustomobject]@{ Folder = $folder; Name = $folderName; Version = $data.version }
    }
}

# --- Situacion normal -------------------------------------------------------
if ($stale.Count -eq 0) {
    if ($keepers.Count -eq 1) {
        Ok "Una sola instalacion de '$PluginName' ($CanonicalFolder). Nada que limpiar."
        exit 0
    }
    if ($keepers.Count -eq 0) {
        Warn2 "No hay ninguna instalacion de '$PluginName' todavia. Es normal si aun no lo has instalado."
        exit 0
    }
}

# --- Duplicados -------------------------------------------------------------
if ($stale.Count -gt 0) {
    Write-Host ""
    Warn2 "Se han encontrado $($stale.Count) instalacion(es) DUPLICADA(S) de '$PluginName'."
    Write-Host "      Millennium cargaria el plugin varias veces y los botones saldrian repetidos."
    Write-Host ""

    if (-not $BackupDir) {
        $BackupDir = Join-Path (Split-Path -Parent $PluginsDir) 'backup'
    }
    if (-not (Test-Path -LiteralPath $BackupDir)) {
        New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
    }

    foreach ($item in $stale) {
        $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
        $dest  = Join-Path $BackupDir "$($item.Name)-v$($item.Version)-$stamp"
        try {
            Move-Item -LiteralPath $item.Folder -Destination $dest -Force -ErrorAction Stop
            Ok "'$($item.Name)' (v$($item.Version)) movido a: $dest"
        } catch {
            Err "No se pudo mover '$($item.Name)': $($_.Exception.Message)"
            Err "Borralo a mano de: $($item.Folder)"
        }
    }
}

if ($keepers.Count -eq 0) {
    Warn2 "Ya no queda ninguna instalacion valida. Vuelve a ejecutar el instalador."
    exit 1
}

Ok "Instalacion unica y correcta: $CanonicalFolder"
exit 0