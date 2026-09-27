@echo off
setlocal
chcp 65001 >nul
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8
REM CYP-memo support-bundle
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0support-bundle.ps1" %*
exit /b %ERRORLEVEL%
