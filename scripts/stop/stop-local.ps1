# CYP-memo: stop local stack by listening ports 5170/5173/5175 only
# 5175 = desktop Vite；产品壳 5174 已废止
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue'

. (Join-Path $PSScriptRoot '..\_internal\common.ps1')
$Root = Get-Root $PSScriptRoot
$logDir = Join-Path $Root 'logs'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Force -Path $logDir | Out-Null }
$stopJsonl = Join-Path $logDir 'ops-stop.jsonl'
$traceId = New-CypTraceId
$sw = [System.Diagnostics.Stopwatch]::StartNew()

Write-CypJsonl -Path $stopJsonl -TraceId $traceId -Fields @{
  step_no = 1; case_id = 'S04-stop'; scenario = 'stop'; endpoint = 'ops'
  action = 'start'; target = 'stop-local'; result = 'pass'; duration_ms = 0
} | Out-Null

Write-Host '== CYP-memo stop-local =='
$ports = @(5170, 5173, 5175)
$killed = New-Object System.Collections.Generic.List[int]

foreach ($port in $ports) {
  $listenPids = @(Get-ListeningPids -Port $port)
  if ($listenPids.Count -eq 0) {
    Write-Host "Port $port : no LISTEN process"
    continue
  }
  foreach ($procId in $listenPids) {
    if ($procId -le 0 -or $procId -eq 4) { continue }
    try {
      $p = Get-Process -Id $procId -ErrorAction Stop
      Write-Host "Port $port : stopping PID $procId ($($p.ProcessName))"
      Stop-Process -Id $procId -Force -ErrorAction Stop
      $killed.Add($procId) | Out-Null
    } catch {
      Write-Host "Port $port : failed to stop PID $procId : $($_.Exception.Message)"
    }
  }
}

$pidFile = Join-Path $Root 'logs\local-all.pid'
if (Test-Path -LiteralPath $pidFile) {
  Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
}

if ($killed.Count -eq 0) {
  Write-Host 'Nothing to stop.'
} else {
  Write-Host ("Stopped PIDs: {0}" -f ($killed -join ', '))
}

$sw.Stop()
Write-CypJsonl -Path $stopJsonl -TraceId $traceId -Fields @{
  step_no = 2; case_id = 'S04-stop'; scenario = 'stop'; endpoint = 'ops'
  action = 'assert'; target = 'ports'; result = 'pass'
  value = ($ports -join ','); actual = ($(if ($killed.Count) { $killed -join ',' } else { 'none' }))
  duration_ms = [int]$sw.Elapsed.TotalMilliseconds
} | Out-Null

exit 0
