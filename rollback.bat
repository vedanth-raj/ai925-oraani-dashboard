@echo off
setlocal enabledelayedexpansion

title AI925 & Oraani System Rollback Utility
cd /d "%~dp0"

echo ======================================================
echo    AI925 ^& ORAANI - ONE-CLICK EMERGENCY ROLLBACK
echo ======================================================
echo.

node tools\sync.js rollback

echo.
pause
