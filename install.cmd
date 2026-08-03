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
  echo  [ERROR] Node.js was not found on PATH.
  echo          Install Node.js 22+ from https://nodejs.org,
  echo          then run this installer again.
  echo.
  pause
  exit /b 1
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
