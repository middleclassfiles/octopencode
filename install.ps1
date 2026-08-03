#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Hydra one-click installer for Windows (PowerShell).
#>
$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot

Write-Host ""
Write-Host "============================================================"
Write-Host "  Hydra - one-click installer"
Write-Host "============================================================"
Write-Host ""

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "  [ERROR] Node.js was not found on PATH." -ForegroundColor Red
    Write-Host "          Install Node.js 22+ from https://nodejs.org," -ForegroundColor Red
    Write-Host "          then run this installer again." -ForegroundColor Red
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

& node scripts\install.mjs
$exitCode = $LASTEXITCODE

Write-Host ""
if ($exitCode -ne 0) {
    Write-Host "  Installer finished with errors. See the messages above." -ForegroundColor Red
    Write-Host "  You can run it again once the problems are fixed." -ForegroundColor Red
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit $exitCode
}

Write-Host "  Installer finished. Open a NEW terminal window, then run:" -ForegroundColor Green
Write-Host ""
Write-Host "      hydra"
Write-Host ""
Write-Host "  from the project directory you want to orchestrate." -ForegroundColor Green
Write-Host ""
Read-Host "Press Enter to exit"
exit 0
