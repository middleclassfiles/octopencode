@echo off
setlocal
title Hydra Installer
cd /d "%~dp0"

echo.
echo ============================================================
echo   Hydra - one-click installer
echo ============================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  call :install_node_if_possible
  if errorlevel 1 exit /b 1
)

node scripts\install.mjs
set EXIT_CODE=%errorlevel%

echo.
if not "%EXIT_CODE%"=="0" (
  echo  Installer finished with errors. See the messages above.
  echo  You can run it again once the problems are fixed.
  echo.
  pause
  exit /b %EXIT_CODE%
)

echo.
echo  Installer finished. Open a NEW terminal window, then run:
echo.
echo      hydra
echo.
echo  from the project directory you want to orchestrate.
echo.
pause
endlocal
exit /b 0

:install_node_if_possible
where winget >nul 2>nul
if errorlevel 1 (
  echo  [ERROR] Node.js was not found, and winget is not available either.
  echo          Install Node.js 22+ from https://nodejs.org, then run this
  echo          installer again.
  echo.
  pause
  exit /b 1
)
echo  Node.js was not found. Installing Node.js LTS via winget...
echo  (this can take a minute)
winget install --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements --silent
if errorlevel 1 (
  echo.
  echo  [ERROR] Automatic Node.js installation failed.
  echo          Install Node.js 22+ from https://nodejs.org manually, then
  echo          run this installer again.
  echo.
  pause
  exit /b 1
)
rem Refresh PATH from the registry so node is visible in THIS window.
for /f "tokens=2*" %%a in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul') do set "SYS_PATH=%%b"
for /f "tokens=2*" %%a in ('reg query "HKCU\Environment" /v Path 2^>nul') do set "USER_PATH=%%b"
set "PATH=%SYS_PATH%;%USER_PATH%"
if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"
where node >nul 2>nul
if errorlevel 1 (
  echo  [ERROR] Node.js is still not on PATH after installing it.
  echo          Close this window, open a NEW terminal, and re-run: install.cmd
  echo.
  pause
  exit /b 1
)
echo  Node.js is ready (installed just now).
exit /b 0