# CYP-memo: support-bundle 入口（R5 S-05）
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot '..\_internal\common.ps1')
$Root = Get-Root $PSScriptRoot

$Reason = 'manual'
if ($args.Count -ge 1 -and $args[0]) { $Reason = [string]$args[0] }

Write-Host '== CYP-memo support-bundle =='
$path = New-CypSupportBundle -Root $Root -Reason $Reason -TimeoutSec 60
Write-Host "Bundle: $path"
exit 0
