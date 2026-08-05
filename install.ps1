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
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        Write-Host "  [ERROR] Node.js was not found, and winget is not available either." -ForegroundColor Red
        Write-Host "          Install Node.js 22+ from https://nodejs.org, then run this" -ForegroundColor Red
        Write-Host "          installer again." -ForegroundColor Red
        Write-Host ""
        Read-Host "Press Enter to exit"
        exit 1
    }

    Write-Host "  Node.js was not found. Installing Node.js LTS via winget..." -ForegroundColor Yellow
    Write-Host "  (this can take a minute)"
    winget install --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements --silent
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  [ERROR] Automatic Node.js installation failed." -ForegroundColor Red
        Write-Host "          Install Node.js 22+ from https://nodejs.org manually, then" -ForegroundColor Red
        Write-Host "          run this installer again." -ForegroundColor Red
        Write-Host ""
        Read-Host "Press Enter to exit"
        exit 1
    }

    # Refresh PATH from the registry so node is visible in THIS window.
    $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = "$machinePath;$userPath"
    if ($machinePath -like "*Program Files\nodejs*" -or $userPath -like "*Program Files\nodejs*") {
        $env:Path = "%ProgramFiles%\nodejs;$env:Path"
    }

    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        Write-Host "  [ERROR] Node.js is still not on PATH after installing it." -ForegroundColor Red
        Write-Host "          Close this window, open a NEW terminal, and re-run: install.ps1" -ForegroundColor Red
        Write-Host ""
        Read-Host "Press Enter to exit"
        exit 1
    }
    Write-Host "  Node.js is ready (installed just now)." -ForegroundColor Green
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