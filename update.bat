@echo off
setlocal enabledelayedexpansion

title "AI925 & Oraani System Live Updater"
cd /d "%~dp0"

echo ======================================================
echo    AI925 ^& ORAANI ORDER MANAGEMENT SYSTEM UPDATER
echo ======================================================
echo.

node tools\sync.js update

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [WARNING] Update encountered an issue. System remained safely on previous version.
) else (
    echo.
    echo [SUCCESS] Everything is up to date and verified!
)

echo.
pause
