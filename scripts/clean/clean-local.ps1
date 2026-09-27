# CYP-memo: clean local build/temp; --purge requires confirm and cleans more (not DB by default)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot '..\_internal\common.ps1')
$Root = Get-Root $PSScriptRoot
Set-Location -LiteralPath $Root

$Purge = $false
foreach ($a in $args) {
  if ($a -eq '--purge' -or $a -eq '-Purge') { $Purge = $true }
}

$logDir = Join-Path $Root 'logs'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Force -Path $logDir | Out-Null }
$cleanJsonl = Join-Path $logDir 'ops-clean.jsonl'
$traceId = New-CypTraceId
$sw = [System.Diagnostics.Stopwatch]::StartNew()

Write-CypJsonl -Path $cleanJsonl -TraceId $traceId -Fields @{
  step_no = 1; case_id = 'S04-clean'; scenario = 'clean'; endpoint = 'ops'
  action = 'start'; target = 'clean-local'; result = 'pass'
  value = ($(if ($Purge) { 'purge' } else { 'default' })); duration_ms = 0
} | Out-Null

Write-Host '== CYP-memo clean-local =='
Write-Host "Root: $Root"

function Remove-PathSafe([string]$Rel) {
  $full = Join-Path $Root $Rel
  if (Test-Path -LiteralPath $full) {
    Write-Host "Removing: $Rel"
    Remove-Item -LiteralPath $full -Recurse -Force -ErrorAction Continue
  } else {
    Write-Host "Skip (missing): $Rel"
  }
}

# Default: dist + temp only (never DB)；admin 包已退役，不再清理其路径
$defaultTargets = @(
  'packages\app\dist',
  'packages\server\dist',
  'packages\desktop\dist',
  'packages\shared\dist',
  'tmp',
  'temp',
  '.tmp'
)

foreach ($t in $defaultTargets) { Remove-PathSafe $t }

# Vite caches (safe temp)
Get-ChildItem -Path (Join-Path $Root 'packages') -Filter 'node_modules\.vite' -Recurse -Directory -ErrorAction SilentlyContinue |
  ForEach-Object {
    Write-Host "Removing: $($_.FullName.Substring($Root.Length).TrimStart('\','/'))"
    Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction Continue
  }

if (-not $Purge) {
  $sw.Stop()
  Write-CypJsonl -Path $cleanJsonl -TraceId $traceId -Fields @{
    step_no = 2; case_id = 'S04-clean'; scenario = 'clean'; endpoint = 'ops'
    action = 'assert'; target = 'default'; result = 'pass'; duration_ms = [int]$sw.Elapsed.TotalMilliseconds
  } | Out-Null
  Write-Host 'Done (default). Use --purge for deeper clean (still keeps DB unless you delete data yourself).'
  exit 0
}

Write-Host ''
Write-Host 'WARNING: --purge will also remove build caches and logs/local-all*.log'
Write-Host 'Database / data directories are NOT deleted by this script.'
$confirm = Read-Host 'Type YES to continue purge'
if ($confirm -ne 'YES') {
  $sw.Stop()
  Write-CypJsonl -Path $cleanJsonl -TraceId $traceId -Fields @{
    step_no = 2; case_id = 'S04-clean'; scenario = 'clean'; endpoint = 'ops'
    action = 'assert'; target = 'purge'; result = 'fail'; level = 'warn'
    error = 'aborted'; duration_ms = [int]$sw.Elapsed.TotalMilliseconds
  } | Out-Null
  Write-Host 'Aborted.'
  exit 1
}

$purgeTargets = @(
  'logs\local-all.out.log',
  'logs\local-all.err.log',
  'logs\local-all.pid',
  'packages\app\node_modules\.cache',
  'packages\server\node_modules\.cache',
  'packages\desktop\node_modules\.cache'
)
foreach ($t in $purgeTargets) { Remove-PathSafe $t }

$sw.Stop()
Write-CypJsonl -Path $cleanJsonl -TraceId $traceId -Fields @{
  step_no = 2; case_id = 'S04-clean'; scenario = 'clean'; endpoint = 'ops'
  action = 'assert'; target = 'purge'; result = 'pass'; duration_ms = [int]$sw.Elapsed.TotalMilliseconds
} | Out-Null

Write-Host 'Purge clean done (DB preserved).'
exit 0
