# CYP-memo · Windows 生产安装统一入口（闭集 35 · Server）
# 用法: powershell -File scripts/install/install.ps1 -InstallDir <路径> [-DataDir <路径>] [-Port <端口>]
# 实际转调 install-windows.ps1
param(
  [Parameter(Mandatory = $true)]
  [string]$InstallDir,
  [string]$DataDir = '',
  [int]$Port = 5170
)

$ErrorActionPreference = 'Stop'
$ScriptDir = $PSScriptRoot

$argsList = @('-InstallDir', $InstallDir)
if ($DataDir) { $argsList += @('-DataDir', $DataDir) }
$argsList += @('-Port', $Port)

& (Join-Path $ScriptDir 'install-windows.ps1') @argsList
exit $LASTEXITCODE
