@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title Study Desktop

where node >nul 2>nul
if errorlevel 1 goto NONODE

if not exist "node_modules" (
  echo.
  echo   First run: installing dependencies...
  echo   This may take a few minutes, please wait.
  echo.
  call npm install --no-audit --no-fund
  if errorlevel 1 goto FAIL
)

if not exist "dist\index.html" (
  echo.
  echo   Building frontend...
  echo.
  call npm run build
  if errorlevel 1 goto FAIL
) else (
  rem Rebuild quietly so page edits take effect; fall back to old build on error
  call npm run build >nul 2>&1
  if errorlevel 1 echo   [warn] frontend build failed, using previous build
)

node server/index.js
set "CODE=%ERRORLEVEL%"

echo.
if not "%CODE%"=="0" (
  echo   Server exited with code %CODE%
  echo   Please screenshot the messages above.
)
echo   Press any key to close this window.
pause
exit /b %CODE%

:FAIL
echo.
echo   [ERROR] Install or build failed.
echo   Please screenshot the messages above.
echo.
pause
exit /b 1

:NONODE
echo.
echo   [ERROR] Node.js not found.
echo.
echo   Install it first: https://nodejs.org
echo   Keep the default options, then double-click this file again.
echo.
pause
exit /b 1
