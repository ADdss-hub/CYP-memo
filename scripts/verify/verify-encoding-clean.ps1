# CYP-memo encoding cleanliness gate (wrapper)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '..\_internal\common.ps1')
$Root = Get-Root $PSScriptRoot
$py = Get-Command python -ErrorAction SilentlyContinue
if (-not $py) { $py = Get-Command py -ErrorAction SilentlyContinue }
if (-not $py) { Write-Error 'python not found'; exit 2 }
& $py.Source (Join-Path $PSScriptRoot 'verify-encoding-clean.py') $Root @args
exit $LASTEXITCODE
