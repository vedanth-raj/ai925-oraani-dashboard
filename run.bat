@echo off
setlocal enabledelayedexpansion

title AI925 Order Management System Launcher
cd /d "%~dp0"

echo ========================================================
echo       AI925 Order Management System (Local-First)
echo ========================================================
echo.
echo Checking everything the app needs. Anything missing is installed automatically.
echo.

:: ---------------------------------------------------------------
:: 1. Node.js (installs the LTS version when missing or too old)
:: ---------------------------------------------------------------
where node >nul 2>nul
if errorlevel 1 goto install_node
node tools\check-setup.js node-version
if errorlevel 1 (
    echo [INFO] Node.js is older than this app needs. Updating it...
    goto install_node
)
goto node_ok

:install_node
echo [INFO] Installing Node.js LTS. Windows may ask for permission - choose Yes.
where winget >nul 2>nul
if errorlevel 1 goto install_node_msi
winget install --exact --id OpenJS.NodeJS.LTS --silent --accept-source-agreements --accept-package-agreements
goto node_installed

:install_node_msi
echo [INFO] Downloading the Node.js installer from nodejs.org...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $v=(Invoke-RestMethod 'https://nodejs.org/dist/index.json' | Where-Object { $_.lts } | Select-Object -First 1).version; Invoke-WebRequest ('https://nodejs.org/dist/' + $v + '/node-' + $v + '-x64.msi') -OutFile (Join-Path $env:TEMP 'ai925-node-lts.msi')"
if errorlevel 1 (
    echo [ERROR] Could not download Node.js. Check the internet connection, or install it from https://nodejs.org/
    pause
    exit /b 1
)
msiexec /i "%TEMP%\ai925-node-lts.msi" /passive /norestart

:node_installed
:: The installer updates PATH for new windows only, so add the usual install folder to this one
set "PATH=%ProgramFiles%\nodejs;%APPDATA%\npm;%PATH%"
where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js was installed but this window cannot see it yet.
    echo Close this window and run run.bat again.
    pause
    exit /b 1
)

:node_ok
for /f "delims=" %%v in ('node -v') do echo [OK] Node.js %%v

:: ---------------------------------------------------------------
:: 2. Server dependencies
:: ---------------------------------------------------------------
node tools\check-setup.js server-deps
if errorlevel 1 (
    echo [INFO] Installing server dependencies...
    call npm install
    if errorlevel 1 (
        echo [ERROR] Failed to install server dependencies.
        pause
        exit /b 1
    )
)
:: Native modules must match this Node.js version (e.g. node_modules copied from another laptop)
node -e "require('better-sqlite3')" >nul 2>nul
if errorlevel 1 (
    echo [INFO] Rebuilding the database module for this Node.js version...
    call npm rebuild better-sqlite3
    node -e "require('better-sqlite3')" >nul 2>nul
    if errorlevel 1 (
        echo [INFO] Re-installing server dependencies...
        call npm install
    )
)
echo [OK] Server dependencies

:: ---------------------------------------------------------------
:: 3. Client app: dependencies, then a fresh build when the source changed
:: ---------------------------------------------------------------
node tools\check-setup.js client-deps
if errorlevel 1 (
    echo [INFO] Installing client dependencies...
    call npm --prefix client install
    if errorlevel 1 (
        echo [ERROR] Failed to install client dependencies.
        pause
        exit /b 1
    )
)
echo [OK] Client dependencies

node tools\check-setup.js client-build
if errorlevel 1 (
    echo [INFO] Building the web app...
    call npm --prefix client run build
    if errorlevel 1 (
        echo [ERROR] Failed to build the web app.
        pause
        exit /b 1
    )
)
echo [OK] Web app is up to date

:: ---------------------------------------------------------------
:: 4. Ensure .env with permanent Ngrok static domain configuration
:: ---------------------------------------------------------------
if not exist ".env" (
    (
        echo # AI925 Order Management System - Environment Configuration
        echo NGROK_AUTHTOKEN=3L6ahuT8juRgo9EGsKUkeBEdSpb_3oo2qqfmiacGwt6n2TMSN
        echo NGROK_DOMAIN=vedanthdeviloper.ngrok-free.app
        echo PORT=3000
        echo NODE_ENV=production
    ) > ".env"
)

echo.
echo [OK] Everything is ready.
echo.

:: ---------------------------------------------------------------
:: 5. Check for live cloud updates (Zero Data Loss)
:: ---------------------------------------------------------------
echo [INFO] Checking for live updates from cloud repository...
node tools\sync.js check

:: ---------------------------------------------------------------
:: 6. Start the system launcher
:: ---------------------------------------------------------------
:start_server
echo [INFO] Starting AI925 Server...
node launch.js
echo.
echo [INFO] Server stopped.
echo Press any key to restart AI925 Server, or close this window to exit.
pause
goto start_server
