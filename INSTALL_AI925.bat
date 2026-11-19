@echo off
setlocal enabledelayedexpansion

title AI925 & Oraani Order Management System - Automated Installer
color 0A

echo ==============================================================================
echo        AI925 & ORAANI ORDER MANAGEMENT SYSTEM - 1-CLICK AUTO INSTALLER        
echo ==============================================================================
echo.
echo Installing and setting up everything automatically. Please do not close this window.
echo This will take 1-2 minutes depending on your internet connection.
echo.

:: ------------------------------------------------------------------------------
:: 1. Define Installation Directory (Desktop folder)
:: ------------------------------------------------------------------------------
set "INSTALL_DIR=%USERPROFILE%\Desktop\AI925-Oraani-System"
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"
cd /d "%INSTALL_DIR%"

echo [1/6] Target Directory: "%INSTALL_DIR%"
echo.

:: ------------------------------------------------------------------------------
:: 2. Check and Install Node.js LTS (Windows 10/11 automated)
:: ------------------------------------------------------------------------------
echo [2/6] Checking for Node.js runtime environment...
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo       Node.js is missing. Installing Node.js LTS automatically...
    where winget >nul 2>nul
    if %ERRORLEVEL% EQU 0 (
        winget install --exact --id OpenJS.NodeJS.LTS --silent --accept-source-agreements --accept-package-agreements
    ) else (
        echo       Downloading Node.js installer from nodejs.org...
        powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $v=(Invoke-RestMethod 'https://nodejs.org/dist/index.json' | Where-Object { $_.lts } | Select-Object -First 1).version; Invoke-WebRequest ('https://nodejs.org/dist/' + $v + '/node-' + $v + '-x64.msi') -OutFile (Join-Path $env:TEMP 'ai925-node-lts.msi')"
        msiexec /i "%TEMP%\ai925-node-lts.msi" /passive /norestart
    )
    set "PATH=%ProgramFiles%\nodejs;%APPDATA%\npm;%PATH%"
)
echo       [OK] Node.js is ready.
echo.

:: ------------------------------------------------------------------------------
:: 3. Download Latest System Code from Cloud Repository
:: ------------------------------------------------------------------------------
echo [3/6] Downloading latest application code from cloud...
set "TEMP_ZIP=%TEMP%\ai925_latest.zip"
set "TEMP_EXTRACT=%TEMP%\ai925_extract"

if exist "%TEMP_ZIP%" del /f /q "%TEMP_ZIP%"
if exist "%TEMP_EXTRACT%" rmdir /s /q "%TEMP_EXTRACT%"
mkdir "%TEMP_EXTRACT%"

curl.exe -s -L "https://github.com/vedanth-raj/ai925-oraani-dashboard/archive/refs/heads/main.zip" -o "%TEMP_ZIP%"
if not exist "%TEMP_ZIP%" (
    powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://github.com/vedanth-raj/ai925-oraani-dashboard/archive/refs/heads/main.zip' -OutFile '%TEMP_ZIP%'"
) else (
    for %%F in ("%TEMP_ZIP%") do if %%~zF LSS 1000 (
        del "%TEMP_ZIP%"
        powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://github.com/vedanth-raj/ai925-oraani-dashboard/archive/refs/heads/main.zip' -OutFile '%TEMP_ZIP%'"
    )
)

tar.exe -xf "%TEMP_ZIP%" -C "%TEMP_EXTRACT%"
for /d %%D in ("%TEMP_EXTRACT%\*") do (
    xcopy "%%D\*" "%INSTALL_DIR%\" /E /I /H /Y >nul
)

del /f /q "%TEMP_ZIP%"
rmdir /s /q "%TEMP_EXTRACT%"
echo       [OK] Latest application files downloaded.
echo.

:: ------------------------------------------------------------------------------
:: 4. Install Dependencies
:: ------------------------------------------------------------------------------
echo [4/6] Setting up system libraries (first-time only)...
call npm install --loglevel=error
call npm --prefix client install --loglevel=error

:: Create permanent Ngrok environment configuration
if not exist "%INSTALL_DIR%\.env" (
    (
        echo # AI925 Order Management System - Environment Configuration
        echo NGROK_AUTHTOKEN=3L6ahuT8juRgo9EGsKUkeBEdSpb_3oo2qqfmiacGwt6n2TMSN
        echo NGROK_DOMAIN=vedanthdeviloper.ngrok-free.app
        echo PORT=3000
        echo NODE_ENV=production
    ) > "%INSTALL_DIR%\.env"
)

echo       [OK] System libraries installed.
echo.

:: ------------------------------------------------------------------------------
:: 5. Compile Frontend Application
:: ------------------------------------------------------------------------------
echo [5/6] Building user interface...
call npm --prefix client run build
echo       [OK] User interface ready.
echo.

:: ------------------------------------------------------------------------------
:: 6. Create Desktop Shortcut for easy launch anytime
:: ------------------------------------------------------------------------------
echo [6/6] Creating Desktop shortcut...
powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut([System.IO.Path]::Combine([Environment]::GetFolderPath('Desktop'), 'AI925 & Oraani System.lnk')); $s.TargetPath = '%INSTALL_DIR%\run.bat'; $s.WorkingDirectory = '%INSTALL_DIR%'; $s.IconLocation = '%INSTALL_DIR%\client\public\favicon.png'; $s.Save()"
echo       [OK] Shortcut created on Desktop: "AI925 & Oraani System".
echo.

echo ==============================================================================
echo                     INSTALLATION COMPLETED SUCCESSFULLY!                      
echo ==============================================================================
echo.
echo Launching the application now...
echo In future, you can simply open "AI925 & Oraani System" on your Desktop!
echo.
timeout /t 3 >nul

start "" "%INSTALL_DIR%\run.bat"
exit
