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
foreach ($port in @(5170, 10170, 13175)) {
  $up = Test-Port -Port $port
  $pids = Get-ListeningPids -Port $port
  $portStates["$port"] = $up
  Write-Host ("Port {0}: listening={1} pids={2}" -f $port, $up, ($(if ($pids) { $pids -join ',' } else { '-' })))
}

$h = Invoke-Health -Url 'https://127.0.0.1:5170/api/health' -TimeoutSec 3 -RequireSuccessJson
Write-Host ("Health  : ok={0} err={1}" -f $h.Ok, $h.Error)
if ($h.Body) { Write-Host ("Body    : {0}" -f $h.Body.Substring(0, [Math]::Min(300, $h.Body.Length))) }

Write-Host ''
Write-Host '-- Auto-rollback --'
$arEnabled = if ($env:CYP_AUTO_ROLLBACK_ENABLED -eq 'true') { $true } else { $false }
Write-Host "Enabled       : $arEnabled"
$cooldownFile = Join-Path $logDir 'auto-rollback-cooldown.json'
if (Test-Path -LiteralPath $cooldownFile) {
  try {
    $cd = Get-Content -LiteralPath $cooldownFile -Raw -Encoding UTF8 -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
    $inCd = $false
    $remaining = 0
    if ($cd.last_rollback_ts) {
      try {
        $last = [DateTime]::Parse($cd.last_rollback_ts).ToUniversalTime()
        $elapsed = ([DateTime]::UtcNow - $last).TotalSeconds
        $inCd = ($elapsed -lt $cd.cooldown_seconds)
        $remaining = [Math]::Max(0, [int]($cd.cooldown_seconds - $elapsed))
      } catch { }
    }
    Write-Host "In cooldown   : $inCd $(if ($inCd) { "(${remaining}s remaining)" } else { '' })"
    Write-Host "Window count  : $($cd.rollback_count_window)"
    Write-Host "Escalated     : $($cd.escalated)"
    Write-Host "Last rollback : $($cd.last_rollback_ts)"
  } catch {
    Write-Host "Cooldown state: read error ($($_.Exception.Message))"
  }
} else {
  Write-Host 'Cooldown state: none (no rollback yet)'
}
$arLog = Join-Path $logDir 'auto-rollback.jsonl'
if (Test-Path -LiteralPath $arLog) {
  $recent = Get-Content -LiteralPath $arLog -Tail 3 -ErrorAction SilentlyContinue
  $count = 0
  foreach ($line in $recent) {
    if ($line) { $count++ }
  }
  Write-Host "Log entries   : $count recent (in auto-rollback.jsonl)"
} else {
  Write-Host 'Log file      : none (no checks run yet)'
}

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
  actual = ("5170={0};10170={1};13175={2};health={3}" -f $portStates['5170'], $portStates['10170'], $portStates['13175'], $h.Ok)
  error = ($(if ($h.Ok) { $null } else { $h.Error }))
  duration_ms = [int]$sw.Elapsed.TotalMilliseconds
} | Out-Null

Write-CypJsonl -Path $diagJsonl -TraceId $traceId -Fields @{
  step_no = 3; case_id = 'S04-diagnose'; scenario = 'diagnose'; endpoint = 'ops'
  action = 'check'; target = 'auto_rollback'; result = 'pass'
  actual = ("enabled={0};cooldown={1};escalated={2}" -f $arEnabled, $(if (Test-Path $cooldownFile) { 'yes' } else { 'no' }), $(if ($cd -and $cd.escalated) { $cd.escalated } else { 'false' }))
  duration_ms = [int]$sw.Elapsed.TotalMilliseconds
} | Out-Null

Write-Host ''
Write-Host 'diagnose done.'
exit 0
