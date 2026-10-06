@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0issue-gate-token.ps1" %*
exit /b %ERRORLEVEL%
