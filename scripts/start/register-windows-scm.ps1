# CYP-memo · 注册 Windows SCM 服务（NSSM 或 WinSW）
# 干跑: powershell -File scripts/start/register-windows-scm.ps1 -DryRun
# 正式安装须管理员；本脚本不 sleep 冒充就绪。
param(
  [string]$InstallDir = '',
  [string]$ServiceName = 'CYP-memo',
  [string]$Port = '5170',
  [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$here = $PSScriptRoot
$repo = (Resolve-Path (Join-Path $here '..\..')).Path
if (-not $InstallDir) { $InstallDir = $repo }

$serverDir = Join-Path $InstallDir 'packages\server'
if (-not (Test-Path (Join-Path $serverDir 'dist\index.js'))) {
  $alt = Join-Path $InstallDir 'dist\index.js'
  if (Test-Path $alt) { $serverDir = $InstallDir }
}
$entry = Join-Path $serverDir 'dist\index.js'
$node = (Get-Command node -ErrorAction SilentlyContinue)
$nssm = Get-Command nssm -ErrorAction SilentlyContinue
$winswXml = Join-Path $repo 'deploy\windows\cyp-memo.xml'
$winswExe = @(
  (Join-Path $repo 'deploy\windows\winsw.exe'),
  (Join-Path $repo 'deploy\windows\CYP-memo.exe')
) | Where-Object { Test-Path $_ } | Select-Object -First 1

Write-Host "InstallDir : $InstallDir"
Write-Host "WorkingDir : $serverDir"
Write-Host "Entry      : $entry"
Write-Host "Node       : $(if ($node) { $node.Source } else { 'MISSING' })"
Write-Host "NSSM       : $(if ($nssm) { $nssm.Source } else { 'MISSING' })"
Write-Host "WinSW exe  : $(if ($winswExe) { $winswExe } else { 'MISSING' })"
Write-Host "WinSW xml  : $winswXml"
Write-Host "Service    : $ServiceName"
Write-Host "APP_ENV    : prod (forced)"

if ($DryRun) {
  Write-Host 'DryRun: no SCM change.'
  if (-not $node) { Write-Host 'NOTE: node not in PATH' }
  if (-not (Test-Path $entry)) { Write-Host "NOTE: missing entry $entry (build server dist before real install)" }
  if (-not $nssm -and -not $winswExe) {
    Write-Host 'NOTE: place NSSM on PATH or WinSW exe under deploy/windows to install for real.'
  }
  exit 0
}

if (-not $node) { Write-Error 'node not in PATH'; exit 1 }
if (-not (Test-Path $entry)) { Write-Error "missing $entry"; exit 1 }

$envExtra = "APP_ENV=prod NODE_ENV=production PORT=$Port"
if ($nssm) {
  & $nssm.Source install $ServiceName $node.Source
  & $nssm.Source set $ServiceName AppParameters "--conditions=cyp-node `"$entry`""
  & $nssm.Source set $ServiceName AppDirectory $serverDir
  & $nssm.Source set $ServiceName AppEnvironmentExtra $envExtra
  & $nssm.Source set $ServiceName AppExit Default Restart
  & $nssm.Source set $ServiceName AppThrottle 5000
  & $nssm.Source set $ServiceName Start SERVICE_AUTO_START
  Write-Host "OK registered via NSSM: $ServiceName"
  exit 0
}

if ($winswExe) {
  Write-Host "Run as Administrator: `"$winswExe`" install `"$winswXml`""
  Write-Error 'WinSW present; run the printed install command elevated. This script does not silently invoke install without NSSM.'
  exit 2
}

Write-Error 'NSSM or WinSW required. Scheduled Task is not SCM. Refusing to sc create node.exe.'
exit 1
