@echo off
setlocal
chcp 65001 >nul
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8
REM CYP-memo: 权威回滚入口 → scripts/snapshot/rollback-local.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0rollback-local.ps1" %*
exit /b %ERRORLEVEL%
