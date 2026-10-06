# CYP-memo: auto-rollback script
# Policy: docs/auto-rollback-policy.md
# Default dry-run safety mode. Set CYP_AUTO_ROLLBACK_ENABLED=true + --execute to run for real.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue'

. (Join-Path $PSScriptRoot '..\_internal\common.ps1')
$Root = Get-Root $PSScriptRoot
$traceId = New-CypTraceId
$sw = [System.Diagnostics.Stopwatch]::StartNew()

$logDir = Join-Path $Root 'logs'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Force -Path $logDir | Out-Null }

$script:logFile = Join-Path $logDir 'auto-rollback.jsonl'
$script:cooldownFile = Join-Path $logDir 'auto-rollback-cooldown.json'
$script:cooldownSec = 1800
$script:maxConsecutive = 2
$script:promUrl = 'http://localhost:9090'
$script:metricsFile = $null

# ---------- functions ----------

function Get-CooldownState {
  if (-not (Test-Path -LiteralPath $script:cooldownFile)) {
    return [pscustomobject]@{
      last_rollback_ts = $null
      rollback_count_window = 0
      escalated = $false
      cooldown_seconds = $script:cooldownSec
    }
  }
  try {
    $raw = Get-Content -LiteralPath $script:cooldownFile -Raw -Encoding UTF8 -ErrorAction Stop
    return ($raw | ConvertFrom-Json -ErrorAction Stop)
  } catch {
    Write-Host "WARN: failed to read cooldown state, resetting: $($_.Exception.Message)"
    return [pscustomobject]@{
      last_rollback_ts = $null
      rollback_count_window = 0
      escalated = $false
      cooldown_seconds = $script:cooldownSec
    }
  }
}

function Save-CooldownState {
  param([Parameter(Mandatory=$true)][pscustomobject]$State)
  $json = $State | ConvertTo-Json -Depth 5
  Write-CypUtf8Text -Path $script:cooldownFile -Value ($json + "`n")
}

function Test-CooldownActive {
  param([Parameter(Mandatory=$true)][pscustomobject]$State)
  if (-not $State.last_rollback_ts) { return $false }
  try {
    $last = [DateTime]::Parse($State.last_rollback_ts).ToUniversalTime()
    $elapsed = ([DateTime]::UtcNow - $last).TotalSeconds
    return ($elapsed -lt $State.cooldown_seconds)
  } catch {
    return $false
  }
}

function Reset-CooldownState {
  $state = [pscustomobject]@{
    last_rollback_ts = $null
    rollback_count_window = 0
    escalated = $false
    cooldown_seconds = $script:cooldownSec
  }
  Save-CooldownState -State $state
  return $state
}

function Invoke-PromQuery {
  param([Parameter(Mandatory=$true)][string]$Query)
  try {
    $encoded = [Uri]::EscapeDataString($Query)
    $url = "$script:promUrl/api/v1/query?query=$encoded"
    $resp = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
    if ($resp.StatusCode -ne 200) { return $null }
    $data = $resp.Content | ConvertFrom-Json -ErrorAction Stop
    if ($data.status -ne 'success') { return $null }
    if (-not $data.data.result) { return $null }
    if ($data.data.result.Count -eq 0) { return $null }
    $val = $data.data.result[0].value[1]
    return [double]$val
  } catch {
    Write-Host "WARN: Prometheus query failed: $($_.Exception.Message)"
    return $null
  }
}

function Get-MetricFromFile {
  param([Parameter(Mandatory=$true)][string]$MetricName)
  if (-not $script:metricsFile) { return $null }
  if (-not (Test-Path -LiteralPath $script:metricsFile)) { return $null }
  try {
    $lines = Get-Content -LiteralPath $script:metricsFile -ErrorAction Stop
    foreach ($line in $lines) {
      if ($line -match "^$MetricName\s+([\d.eE+-]+)") {
        return [double]$Matches[1]
      }
    }
  } catch { }
  return $null
}

function Get-MetricValue {
  param(
    [Parameter(Mandatory=$true)][string]$PromQuery,
    [string]$LocalMetricName
  )
  if ($script:metricsFile -and (Test-Path -LiteralPath $script:metricsFile)) {
    $val = Get-MetricFromFile -MetricName $LocalMetricName
    if ($null -ne $val) { return $val }
  }
  return Invoke-PromQuery -Query $PromQuery
}

function Write-ArLog {
  param(
    [Parameter(Mandatory=$true)][string]$Result,
    [string]$Level = 'none',
    [string]$Triggers = 'none',
    [string]$Action = 'none',
    [bool]$DryRun = $true,
    [bool]$CooldownActive = $false,
    [bool]$Escalated = $false,
    [double]$ErrorRate = 0,
    [double]$P95Latency = 0,
    [double]$Availability = 0,
    [int]$HealthFailCount = 0,
    [double]$MemUsage = 0,
    [string]$SnapshotUsed = $null,
    [string]$ErrorMsg = $null
  )
  $actualParts = @(
    "level=$Level",
    "triggers=$Triggers",
    "action=$Action",
    "dry_run=$DryRun",
    "cooldown=$CooldownActive",
    "escalated=$Escalated",
    "error_rate=$($ErrorRate.ToString('F4'))",
    "p95_latency=$($P95Latency.ToString('F3'))",
    "availability=$($Availability.ToString('F4'))",
    "health_fail=$HealthFailCount",
    "mem_usage=$($MemUsage.ToString('F1'))"
  )
  if ($SnapshotUsed) { $actualParts += "snapshot=$SnapshotUsed" }
  $actualStr = $actualParts -join ';'
  $fields = @{
    step_no = 1
    case_id = 'auto-rollback'
    scenario = 'auto_rollback_check'
    endpoint = 'ops'
    action = 'evaluate'
    target = 'metrics'
    result = $Result
    actual = $actualStr
    error = $ErrorMsg
    duration_ms = [int]$sw.Elapsed.TotalMilliseconds
  }
  Write-CypJsonl -Path $script:logFile -TraceId $traceId -Fields $fields | Out-Null
}

# ---------- args ----------
$DryRun = $true
$ResetCooldown = $false
$CheckCooldownOnly = $false
$ShowHelp = $false

for ($i = 0; $i -lt $args.Count; $i++) {
  $arg = [string]$args[$i]
  switch -Regex ($arg) {
    '^(--dry-run|-dry-run)$' { $DryRun = $true }
    '^(--execute|-execute)$' { $DryRun = $false }
    '^(--reset-cooldown|-reset-cooldown)$' { $ResetCooldown = $true }
    '^(--cooldown|-cooldown)$' { $CheckCooldownOnly = $true }
    '^(--help|-help|/\?|-h)$' { $ShowHelp = $true }
    default { }
  }
}

if ($ShowHelp) {
  Write-Host 'CYP-memo auto-rollback'
  Write-Host ''
  Write-Host 'Usage:'
  Write-Host '  scripts/rollback/auto-rollback.ps1 [options]'
  Write-Host ''
  Write-Host 'Options:'
  Write-Host '  --dry-run        Detect only, no execution (default safe mode)'
  Write-Host '  --execute        Real rollback (requires CYP_AUTO_ROLLBACK_ENABLED=true)'
  Write-Host '  --cooldown       Check cooldown status only'
  Write-Host '  --reset-cooldown Reset cooldown state'
  Write-Host '  --help           Show help'
  Write-Host ''
  Write-Host 'Environment variables:'
  Write-Host '  CYP_AUTO_ROLLBACK_ENABLED       Master switch (default false)'
  Write-Host '  CYP_AUTO_ROLLBACK_DRY_RUN       Dry-run mode (default true)'
  Write-Host '  CYP_AUTO_ROLLBACK_COOLDOWN_SEC  Cooldown seconds (default 1800)'
  Write-Host '  CYP_AUTO_ROLLBACK_MAX_CONSECUTIVE  Max consecutive rollbacks (default 2)'
  Write-Host '  CYP_AUTO_ROLLBACK_PROM_URL      Prometheus API URL (default http://localhost:9090)'
  Write-Host '  CYP_AUTO_ROLLBACK_METRICS_FILE  Local metrics file path'
  Write-Host '  CYP_AUTO_ROLLBACK_LOG_FILE      Log file path (default logs/auto-rollback.jsonl)'
  Write-Host ''
  Write-Host 'Policy: docs/auto-rollback-policy.md'
  exit 0
}

# ---------- config ----------
if ($env:CYP_AUTO_ROLLBACK_LOG_FILE) {
  $script:logFile = $env:CYP_AUTO_ROLLBACK_LOG_FILE
}

$enabled = $false
if ($env:CYP_AUTO_ROLLBACK_ENABLED -eq 'true') { $enabled = $true }

if ($env:CYP_AUTO_ROLLBACK_COOLDOWN_SEC) {
  $parsed = 0
  if ([int]::TryParse($env:CYP_AUTO_ROLLBACK_COOLDOWN_SEC, [ref]$parsed) -and $parsed -gt 0) {
    $script:cooldownSec = $parsed
  }
}

if ($env:CYP_AUTO_ROLLBACK_MAX_CONSECUTIVE) {
  $parsed = 2
  if ([int]::TryParse($env:CYP_AUTO_ROLLBACK_MAX_CONSECUTIVE, [ref]$parsed) -and $parsed -gt 0) {
    $script:maxConsecutive = $parsed
  }
}

if ($env:CYP_AUTO_ROLLBACK_PROM_URL) {
  $script:promUrl = $env:CYP_AUTO_ROLLBACK_PROM_URL
}

if ($env:CYP_AUTO_ROLLBACK_METRICS_FILE) {
  $script:metricsFile = $env:CYP_AUTO_ROLLBACK_METRICS_FILE
}

if ($DryRun -and $env:CYP_AUTO_ROLLBACK_DRY_RUN -eq 'false') {
  $DryRun = $false
}

# ---------- cooldown operations ----------
if ($ResetCooldown) {
  $state = Reset-CooldownState
  Write-Host 'OK   cooldown state reset.'
  Write-ArLog -Result 'pass' -Action 'cooldown_reset' -DryRun $DryRun
  exit 0
}

if ($CheckCooldownOnly) {
  $state = Get-CooldownState
  $active = Test-CooldownActive -State $state
  $remaining = 0
  if ($active -and $state.last_rollback_ts) {
    try {
      $last = [DateTime]::Parse($state.last_rollback_ts).ToUniversalTime()
      $remaining = [int]($state.cooldown_seconds - ([DateTime]::UtcNow - $last).TotalSeconds)
      if ($remaining -lt 0) { $remaining = 0 }
    } catch { }
  }
  Write-Host "Cooldown active   : $active"
  Write-Host "Last rollback     : $($state.last_rollback_ts)"
  Write-Host "Window count      : $($state.rollback_count_window) / $($script:maxConsecutive)"
  Write-Host "Escalated         : $($state.escalated)"
  Write-Host "Remaining seconds : $remaining"
  if ($active) { exit 1 } else { exit 0 }
}

# ---------- main ----------
Write-Host '== CYP-memo auto-rollback =='
Write-Host "Enabled     : $enabled"
Write-Host "Dry-run     : $DryRun"
Write-Host "Prom URL    : $($script:promUrl)"
$mfDisplay = if ($script:metricsFile) { $script:metricsFile } else { '(none)' }
Write-Host "Metrics file: $mfDisplay"
Write-Host "Cooldown    : $($script:cooldownSec)s"
Write-Host "Max consecutive: $($script:maxConsecutive)"

if (-not $enabled) {
  Write-Host ''
  Write-Host 'INFO: auto-rollback is DISABLED.'
  Write-Host '      Set CYP_AUTO_ROLLBACK_ENABLED=true to enable.'
  Write-Host '      Running in detect-only mode.'
}

$cooldownState = Get-CooldownState
$inCooldown = Test-CooldownActive -State $cooldownState
$escalated = [bool]$cooldownState.escalated

if ($inCooldown) {
  Write-Host ''
  Write-Host 'INFO: in cooldown period - no automatic rollback will be triggered.'
  Write-Host "      count=$($cooldownState.rollback_count_window)/$($script:maxConsecutive)"
  Write-Host "      escalated=$escalated"
}

if ($escalated) {
  Write-Host ''
  Write-Host 'WARN: escalated - manual intervention required.'
  Write-Host '      Use --reset-cooldown to clear.'
}

# ---------- collect metrics ----------
Write-Host ''
Write-Host '-- Collecting metrics --'

$errorRateQuery = 'rate(http_requests_total{code=~"5.."}[5m]) / clamp_min(rate(http_requests_total[5m]), 1e-9)'
$errorRate = Get-MetricValue -PromQuery $errorRateQuery -LocalMetricName 'api_error_rate_5m'
$erDisplay = if ($null -ne $errorRate) { $errorRate.ToString('P2') } else { '0.00%' }
$erNote = if ($null -eq $errorRate) { ' (no data)' } else { '' }
Write-Host "Error rate (5m)   : $erDisplay$erNote"

$latencyQuery = 'histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))'
$p95Latency = Get-MetricValue -PromQuery $latencyQuery -LocalMetricName 'http_request_duration_p95_seconds'
$latDisplay = if ($null -ne $p95Latency) { $p95Latency.ToString('N3') + 's' } else { '0.000s' }
$latNote = if ($null -eq $p95Latency) { ' (no data)' } else { '' }
Write-Host "P95 latency (5m)  : $latDisplay$latNote"

$availabilityQuery = 'rate(http_requests_total{code=~"2.."}[5m]) / clamp_min(rate(http_requests_total[5m]), 1e-9)'
$availability = Get-MetricValue -PromQuery $availabilityQuery -LocalMetricName 'api_availability_5m'
$avDisplay = if ($null -ne $availability) { $availability.ToString('P2') } else { '100.00%' }
$avNote = if ($null -eq $availability) { ' (no data)' } else { '' }
Write-Host "Availability (5m) : $avDisplay$avNote"

# health check (local probe)
$healthFailCount = 0
$healthUrl = 'https://127.0.0.1:5170/api/health'
$readyUrl = 'https://127.0.0.1:5170/healthz/ready'
$h1 = Invoke-Health -Url $healthUrl -TimeoutSec 3 -RequireSuccessJson
$h2 = Invoke-Health -Url $readyUrl -TimeoutSec 3 -RequireSuccessJson
if (-not $h1.Ok) { $healthFailCount++ }
if (-not $h2.Ok) { $healthFailCount++ }
Write-Host "Health check      : health=$($h1.Ok) ready=$($h2.Ok) (fail_count=$healthFailCount)"

# memory usage
$memQuery = '(1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes) * 100'
$memUsage = Get-MetricValue -PromQuery $memQuery -LocalMetricName 'memory_usage_percent'
if ($null -eq $memUsage) {
  $procMemQuery = 'process_resident_memory_bytes{job="cyp-memo"}'
  $procRss = Get-MetricValue -PromQuery $procMemQuery -LocalMetricName 'process_resident_memory_bytes'
  if ($null -ne $procRss) {
    $memUsage = ($procRss / 1GB) * 100
  }
}
$memDisplay = if ($null -ne $memUsage) { $memUsage.ToString('N1') + '%' } else { '0.0%' }
$memNote = if ($null -eq $memUsage) { ' (no data)' } else { '' }
Write-Host "Memory usage      : $memDisplay$memNote"

# ---------- policy evaluation ----------
Write-Host ''
Write-Host '-- Policy evaluation --'

$triggerList = New-Object System.Collections.Generic.List[string]
$highestLevel = 'none'
$highestOrder = 0

# C1: error rate
if ($null -ne $errorRate) {
  if ($errorRate -gt 0.20) {
    $highestLevel = 'L3'
    $highestOrder = 3
    $triggerList.Add('error_rate:L3')
    Write-Host "  C1 error_rate: L3 (>20%) - $($errorRate.ToString('P2'))"
  } elseif ($errorRate -gt 0.10) {
    if (3 -gt $highestOrder) {
      $highestLevel = 'L2'
      $highestOrder = 2
    }
    $triggerList.Add('error_rate:L2')
    Write-Host "  C1 error_rate: L2 (>10%) - $($errorRate.ToString('P2'))"
  } elseif ($errorRate -gt 0.05) {
    if (1 -gt $highestOrder) {
      $highestLevel = 'L1'
      $highestOrder = 1
    }
    $triggerList.Add('error_rate:L1')
    Write-Host "  C1 error_rate: L1 (>5%) - $($errorRate.ToString('P2'))"
  } else {
    Write-Host "  C1 error_rate: OK - $($errorRate.ToString('P2'))"
  }
} else {
  Write-Host '  C1 error_rate: SKIP (no data)'
}

# C2: P95 latency
if ($null -ne $p95Latency) {
  if ($p95Latency -gt 10) {
    $highestLevel = 'L3'
    $highestOrder = 3
    $triggerList.Add('p95_latency:L3')
    Write-Host "  C2 p95_latency: L3 (>10s) - $($p95Latency.ToString('N3'))s"
  } elseif ($p95Latency -gt 5) {
    if (2 -gt $highestOrder) {
      $highestLevel = 'L2'
      $highestOrder = 2
    }
    $triggerList.Add('p95_latency:L2')
    Write-Host "  C2 p95_latency: L2 (>5s) - $($p95Latency.ToString('N3'))s"
  } elseif ($p95Latency -gt 3) {
    if (1 -gt $highestOrder) {
      $highestLevel = 'L1'
      $highestOrder = 1
    }
    $triggerList.Add('p95_latency:L1')
    Write-Host "  C2 p95_latency: L1 (>3s) - $($p95Latency.ToString('N3'))s"
  } else {
    Write-Host "  C2 p95_latency: OK - $($p95Latency.ToString('N3'))s"
  }
} else {
  Write-Host '  C2 p95_latency: SKIP (no data)'
}

# C3: availability
if ($null -ne $availability) {
  if ($availability -lt 0.90) {
    $highestLevel = 'L3'
    $highestOrder = 3
    $triggerList.Add('availability:L3')
    Write-Host "  C3 availability: L3 (<90%) - $($availability.ToString('P2'))"
  } elseif ($availability -lt 0.95) {
    if (2 -gt $highestOrder) {
      $highestLevel = 'L2'
      $highestOrder = 2
    }
    $triggerList.Add('availability:L2')
    Write-Host "  C3 availability: L2 (<95%) - $($availability.ToString('P2'))"
  } elseif ($availability -lt 0.99) {
    if (1 -gt $highestOrder) {
      $highestLevel = 'L1'
      $highestOrder = 1
    }
    $triggerList.Add('availability:L1')
    Write-Host "  C3 availability: L1 (<99%) - $($availability.ToString('P2'))"
  } else {
    Write-Host "  C3 availability: OK - $($availability.ToString('P2'))"
  }
} else {
  Write-Host '  C3 availability: SKIP (no data)'
}

# C4: health check
if ($healthFailCount -ge 2) {
  if (2 -gt $highestOrder) {
    $highestLevel = 'L2'
    $highestOrder = 2
  }
  $triggerList.Add('health_check:L2')
  Write-Host "  C4 health_check: L2 (>=2 fails) - $healthFailCount"
} elseif ($healthFailCount -ge 1) {
  if (1 -gt $highestOrder) {
    $highestLevel = 'L1'
    $highestOrder = 1
  }
  $triggerList.Add('health_check:L1')
  Write-Host "  C4 health_check: L1 (>=1 fail) - $healthFailCount"
} else {
  Write-Host '  C4 health_check: OK - 0 fails'
}

# C5: memory usage
if ($null -ne $memUsage) {
  if ($memUsage -gt 95) {
    if (2 -gt $highestOrder) {
      $highestLevel = 'L2'
      $highestOrder = 2
    }
    $triggerList.Add('memory_usage:L2')
    Write-Host "  C5 memory_usage: L2 (>95%) - $($memUsage.ToString('N1'))%"
  } elseif ($memUsage -gt 90) {
    if (2 -gt $highestOrder) {
      $highestLevel = 'L2'
      $highestOrder = 2
    }
    $triggerList.Add('memory_usage:L2')
    Write-Host "  C5 memory_usage: L2 (>90%) - $($memUsage.ToString('N1'))%"
  } elseif ($memUsage -gt 85) {
    if (1 -gt $highestOrder) {
      $highestLevel = 'L1'
      $highestOrder = 1
    }
    $triggerList.Add('memory_usage:L1')
    Write-Host "  C5 memory_usage: L1 (>85%) - $($memUsage.ToString('N1'))%"
  } else {
    Write-Host "  C5 memory_usage: OK - $($memUsage.ToString('N1'))%"
  }
} else {
  Write-Host '  C5 memory_usage: SKIP (no data)'
}

$triggerSummary = 'none'
if ($triggerList.Count -gt 0) {
  $triggerSummary = $triggerList -join ';'
}

Write-Host ''
Write-Host "Highest rollback level: $highestLevel"

# ---------- execute rollback ----------
$rollbackResult = 'skip'
$rollbackError = $null
$snapshotUsed = $null
$actionTaken = 'none'

if ($highestLevel -eq 'none') {
  Write-Host 'All metrics within thresholds. No action needed.'
  $rollbackResult = 'pass'
} elseif ($highestLevel -eq 'L1') {
  Write-Host 'L1 alert triggered - logging only, no automatic rollback.'
  $rollbackResult = 'alert'
  $actionTaken = 'log_alert'
} else {
  Write-Host ''
  Write-Host "-- Rollback action: $highestLevel --"

  if ($inCooldown -or $escalated) {
    Write-Host 'SKIP: in cooldown or escalated - no automatic rollback.'
    $rollbackResult = 'cooldown_blocked'
    $actionTaken = 'blocked'
  } elseif ($DryRun) {
    Write-Host 'DRY-RUN: would execute rollback, but --dry-run is set.'
    Write-Host '         Use --execute and CYP_AUTO_ROLLBACK_ENABLED=true.'
    $rollbackResult = 'dry_run'
    $actionTaken = "dry_run_$highestLevel"
  } elseif (-not $enabled) {
    Write-Host 'SKIP: auto-rollback disabled.'
    Write-Host '      Set CYP_AUTO_ROLLBACK_ENABLED=true to enable.'
    $rollbackResult = 'disabled'
    $actionTaken = 'disabled'
  } else {
    $actionTaken = $highestLevel
    $execSw = [System.Diagnostics.Stopwatch]::StartNew()

    try {
      if ($highestLevel -eq 'L3') {
        Write-Host 'L3 hard rollback: snapshot rollback + service restart'
        $rollbackScript = Join-Path $PSScriptRoot 'rollback-local.ps1'
        if (-not (Test-Path -LiteralPath $rollbackScript)) {
          throw "rollback script not found: $rollbackScript"
        }
        Write-Host "  Running: $rollbackScript"
        & $rollbackScript
        if ($LASTEXITCODE -ne 0) {
          throw "rollback-local.ps1 exited with code $LASTEXITCODE"
        }
        $snapRoot = Join-Path $Root 'backups\snapshots'
        if ($env:CYP_SNAPSHOT_ROOT) { $snapRoot = $env:CYP_SNAPSHOT_ROOT }
        $latestFile = Join-Path $snapRoot 'LATEST.txt'
        if (Test-Path -LiteralPath $latestFile) {
          $snapshotUsed = (Get-Content -LiteralPath $latestFile -Raw).Trim()
        }
        Write-Host '  Rollback OK. Now restarting service...'
      }

      Write-Host '  Restarting service...'
      $stopScript = Join-Path $Root 'scripts\stop\stop-local.ps1'
      $startScript = Join-Path $Root 'scripts\start\start-local.ps1'
      if (Test-Path -LiteralPath $stopScript) {
        & $stopScript
      }
      Start-Sleep -Seconds 3
      if (Test-Path -LiteralPath $startScript) {
        & $startScript
        if ($LASTEXITCODE -ne 0) {
          throw "start-local.ps1 exited with code $LASTEXITCODE"
        }
      }

      $execSw.Stop()
      $rollbackResult = 'success'
      $durStr = $execSw.Elapsed.TotalSeconds.ToString('N1')
      Write-Host "  Rollback completed in ${durStr}s"
    } catch {
      $execSw.Stop()
      $rollbackResult = 'fail'
      $rollbackError = $_.Exception.Message
      Write-Host "  Rollback FAILED: $rollbackError"
    }
  }
}

# ---------- update cooldown ----------
if ($rollbackResult -eq 'success' -and -not $inCooldown) {
  if ($highestLevel -eq 'L2' -or $highestLevel -eq 'L3') {
    $cooldownState.last_rollback_ts = [DateTime]::UtcNow.ToString('o')
    $cooldownState.rollback_count_window = [int]$cooldownState.rollback_count_window + 1
    if ($cooldownState.rollback_count_window -ge $script:maxConsecutive) {
      $cooldownState.escalated = $true
      Write-Host ''
      Write-Host "WARN: reached $($script:maxConsecutive) consecutive rollbacks - escalated."
    }
    Save-CooldownState -State $cooldownState
  }
}

# ---------- log and exit ----------
$sw.Stop()

$erVal = if ($null -ne $errorRate) { $errorRate } else { 0.0 }
$latVal = if ($null -ne $p95Latency) { $p95Latency } else { 0.0 }
$avVal = if ($null -ne $availability) { $availability } else { 1.0 }
$memVal = if ($null -ne $memUsage) { $memUsage } else { 0.0 }

Write-ArLog -Result $rollbackResult `
  -Level $highestLevel `
  -Triggers $triggerSummary `
  -Action $actionTaken `
  -DryRun $DryRun `
  -CooldownActive $inCooldown `
  -Escalated $escalated `
  -ErrorRate $erVal `
  -P95Latency $latVal `
  -Availability $avVal `
  -HealthFailCount $healthFailCount `
  -MemUsage $memVal `
  -SnapshotUsed $snapshotUsed `
  -ErrorMsg $rollbackError

Write-Host ''
Write-Host "Result: $rollbackResult (level=$highestLevel, action=$actionTaken)"
Write-Host "Log   : $($script:logFile)"

if ($rollbackResult -eq 'fail') { exit 1 }
if ($inCooldown -and $highestLevel -ne 'none') { exit 2 }
exit 0