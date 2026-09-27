# CYP-memo: diagnose local environment
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue'

. (Join-Path $PSScriptRoot '..\_internal\common.ps1')
$Root = Get-Root $PSScriptRoot

$logDir = Join-Path $Root 'logs'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Force -Path $logDir | Out-Null }
$diagJsonl = Join-Path $logDir 'ops-diagnose.jsonl'
$traceId = New-CypTraceId
$sw = [System.Diagnostics.Stopwatch]::StartNew()

Write-CypJsonl -Path $diagJsonl -TraceId $traceId -Fields @{
  step_no = 1; case_id = 'S04-diagnose'; scenario = 'diagnose'; endpoint = 'ops'
  action = 'start'; target = 'diagnose'; result = 'pass'; duration_ms = 0
} | Out-Null

Write-Host '== CYP-memo diagnose =='
Write-Host "Time     : $(Get-Date -Format o)"
Write-Host "OS       : $([System.Environment]::OSVersion.VersionString)"
Write-Host "PSVersion: $($PSVersionTable.PSVersion)"
Write-Host "Root     : $Root"
Write-Host "CWD      : $(Get-Location)"

Write-Host ''
Write-Host '-- Toolchain --'
if (Test-CommandExists 'node') {
  Write-Host "Node     : $(& node -v)"
  Write-Host "NodePath : $((Get-Command node).Source)"
} else { Write-Host 'Node     : MISSING' }

$pnpm = Get-PnpmCmd
if ($pnpm) {
  Write-Host "pnpm     : $(& $pnpm -v)"
  Write-Host "pnpmPath : $pnpm"
} else { Write-Host 'pnpm     : MISSING' }

Write-Host "node_modules: $(Test-Path (Join-Path $Root 'node_modules'))"

Write-Host ''
Write-Host '-- Ports / Health --'
$portStates = @{}
foreach ($port in @(5170, 5173)) {
  $up = Test-Port -Port $port
  $pids = Get-ListeningPids -Port $port
  $portStates["$port"] = $up
  Write-Host ("Port {0}: listening={1} pids={2}" -f $port, $up, ($(if ($pids) { $pids -join ',' } else { '-' })))
}

$h = Invoke-Health -Url 'http://localhost:5170/api/health' -TimeoutSec 3 -RequireSuccessJson
Write-Host ("Health  : ok={0} err={1}" -f $h.Ok, $h.Error)
if ($h.Body) { Write-Host ("Body    : {0}" -f $h.Body.Substring(0, [Math]::Min(300, $h.Body.Length))) }

Write-Host ''
Write-Host '-- Recent logs (tail) --'
foreach ($name in @('local-all.out.log','local-all.err.log')) {
  $lp = Join-Path $Root "logs\$name"
  if (Test-Path $lp) {
    Write-Host "--- $name ---"
    Get-Content -LiteralPath $lp -Tail 15 -ErrorAction SilentlyContinue
  } else {
    Write-Host "--- $name : missing ---"
  }
}

$pidFile = Join-Path $Root 'logs\local-all.pid'
if (Test-Path $pidFile) {
  Write-Host "PID file: $(Get-Content $pidFile -Raw)"
}

$sw.Stop()
Write-CypJsonl -Path $diagJsonl -TraceId $traceId -Fields @{
  step_no = 2; case_id = 'S04-diagnose'; scenario = 'diagnose'; endpoint = 'ops'
  action = 'assert'; target = 'ports_health'; result = 'pass'
  actual = ("5170={0};5173={1};health={2}" -f $portStates['5170'], $portStates['5173'], $h.Ok)
  error = ($(if ($h.Ok) { $null } else { $h.Error }))
  duration_ms = [int]$sw.Elapsed.TotalMilliseconds
} | Out-Null

Write-Host ''
Write-Host 'diagnose done.'
exit 0
