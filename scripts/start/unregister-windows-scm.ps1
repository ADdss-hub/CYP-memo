# CYP-memo · 卸载 Windows SCM 服务
param(
  [string]$ServiceName = 'CYP-memo',
  [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$nssm = Get-Command nssm -ErrorAction SilentlyContinue
$svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue

Write-Host "Service : $ServiceName present=$(if ($svc) { 'yes' } else { 'no' })"
if ($DryRun) {
  Write-Host 'DryRun: no SCM change.'
  exit 0
}

if ($nssm -and $svc) {
  & $nssm.Source stop $ServiceName
  & $nssm.Source remove $ServiceName confirm
  Write-Host "OK removed via NSSM: $ServiceName"
  exit 0
}

if ($svc) {
  Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
  sc.exe delete $ServiceName | Out-Null
  Write-Host "OK sc delete $ServiceName"
  exit 0
}

Write-Host "OK nothing to remove ($ServiceName not installed)"
exit 0
