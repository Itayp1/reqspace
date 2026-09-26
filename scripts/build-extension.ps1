# build-extension.ps1
# Packs the extension/ folder into a .crx file using Chrome's built-in --pack-extension flag.
# The resulting .crx is placed in the project root.
#
# Usage:
#   powershell -File scripts/build-extension.ps1
#
# Requirements:
#   - Google Chrome installed at the default path, OR
#     set the CHROME_PATH environment variable to the chrome.exe path.

param(
    [string]$ChromePath = $env:CHROME_PATH
)

$root      = Split-Path $PSScriptRoot -Parent
$extDir    = Join-Path $root "extension"
$pemFile   = Join-Path $root "extension.pem"
$outputCrx = Join-Path $root "extension.crx"
$destCrx   = Join-Path $root "server\public\extension\reqspace-transport.crx"

# Resolve Chrome path
if (-not $ChromePath) {
    $candidates = @(
        "C:\Program Files\Google\Chrome\Application\chrome.exe",
        "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        "${env:LOCALAPPDATA}\Google\Chrome\Application\chrome.exe"
    )
    foreach ($c in $candidates) {
        if (Test-Path $c) { $ChromePath = $c; break }
    }
}

if (-not $ChromePath -or -not (Test-Path $ChromePath)) {
    Write-Error "Chrome not found. Set CHROME_PATH or install Chrome to the default location."
    exit 1
}

Write-Host "Chrome: $ChromePath"
Write-Host "Extension: $extDir"

# Build the pack command
$args = @("--pack-extension=`"$extDir`"")
if (Test-Path $pemFile) {
    $args += "--pack-extension-key=`"$pemFile`""
    Write-Host "Using existing key: $pemFile"
} else {
    Write-Host "No .pem found — Chrome will generate a new key at: $pemFile"
}

$proc = Start-Process -FilePath $ChromePath -ArgumentList $args -Wait -PassThru -WindowStyle Hidden
if ($proc.ExitCode -ne 0) {
    Write-Error "Chrome exited with code $($proc.ExitCode)"
    exit 1
}

# Chrome places the .crx next to the extension folder
$generatedCrx = Join-Path $root "extension.crx"
if (-not (Test-Path $generatedCrx)) {
    Write-Error "Expected .crx not found at: $generatedCrx"
    exit 1
}

# Copy to server/public/extension/ so the web app can serve it
$destDir = Split-Path $destCrx -Parent
if (-not (Test-Path $destDir)) {
    New-Item -ItemType Directory -Force -Path $destDir | Out-Null
}
Copy-Item -Path $generatedCrx -Destination $destCrx -Force

Write-Host ""
Write-Host "========================================="
Write-Host " Build complete!"
Write-Host " CRX: $destCrx"
Write-Host "========================================="
Write-Host ""
Write-Host "To install in Chrome:"
Write-Host "  1. Open chrome://extensions"
Write-Host "  2. Enable Developer Mode"
Write-Host "  3. Drag reqspace-transport.crx into the page"
