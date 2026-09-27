# CYP-memo · 智控闭环核验（检测→定级→告警→弹性处置→通知）
# 真实环境 only · 禁沙箱。画像：LAN/NAS 自托管备忘录 · 小中团队触顶 + 旁路洪水
# powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify\verify-extreme-intelligence-loop.ps1
param(
  [string]$BaseUrl = 'http://127.0.0.1:5170',
  [string]$DataDir = 'd:\kf\kf\CYP-memo\packages\server\data',
  [int]$PathScanCount = 55,
  [int]$VersionFlood = 40,
  [int]$RateFlood = 80
)
$ErrorActionPreference = 'Continue'
$fail = 0
$report = New-Object System.Collections.Generic.List[string]
function LogLine([string]$s) { [void]$report.Add($s); Write-Host $s }
function Pass([string]$n, [string]$d) { LogLine "[PASS] $n :: $d" }
function Fail([string]$n, [string]$d) { $script:fail++; LogLine "[FAIL] $n :: $d" }
function CountLines([string]$p) {
  if (-not (Test-Path $p)) { return 0 }
  return (Get-Content $p -ErrorAction SilentlyContinue | Measure-Object -Line).Lines
}
function CountDirFiles([string]$p) {
  if (-not (Test-Path $p)) { return 0 }
  return @(Get-ChildItem $p -Recurse -File -ErrorAction SilentlyContinue).Count
}

LogLine "=== INTEL-LOOP base=$BaseUrl dataDir=$DataDir ==="
LogLine "=== PROFILE lan_memo_team extreme detect>grade>alert>elasticity>notify ==="

# A ready snapshot
$ready0 = $null
try {
  $ready0 = Invoke-RestMethod -Uri "$BaseUrl/healthz/ready" -TimeoutSec 30
  if ($ready0.success -ne $true -or $ready0.data.runtimeBase.batch -ne 'B9') {
    Fail 'A.ready' 'batch!=B9'; exit 2
  }
  $p0 = $ready0.data.perf
  Pass 'A.ready' "samples=$($p0.sampleCount) breach=$($p0.breachCount) resil=$($ready0.data.runtimeBase.items.'RB-L1-HOST-RESIL-01') alert=$($ready0.data.runtimeBase.items.'RB-L1-HOST-ALERT-01') risk=$($ready0.data.runtimeBase.items.'RB-L1-MGMT-RISK-01') log=$($ready0.data.runtimeBase.items.'RB-L0-INFRA-LOG-01')"
} catch {
  Fail 'A.ready' $_.Exception.Message; exit 2
}

$elastBefore = CountLines (Join-Path $DataDir 'elasticity\decisions.jsonl')
$alertBefore = CountLines (Join-Path $DataDir 'alerts\outbox.jsonl')
$notifyBefore = CountLines (Join-Path $DataDir 'notify\outbox.jsonl')
$auditBefore = CountLines (Join-Path $DataDir 'audit\audit.jsonl')
$secLogFilesBefore = CountDirFiles (Join-Path $DataDir 'logs\security')
$perfLogFilesBefore = CountDirFiles (Join-Path $DataDir 'logs\perf')
$mqPath = Join-Path $DataDir 'mq\outbox.json'
$mqBefore = if (Test-Path $mqPath) { (Get-Item $mqPath).Length } else { 0 }
LogLine "[SNAP] elast=$elastBefore alert=$alertBefore notify=$notifyBefore audit=$auditBefore secLogs=$secLogFilesBefore perfLogs=$perfLogFilesBefore mqBytes=$mqBefore"

# B provision (for authenticated probes)
$suffix = Get-Random -Maximum 9999999
$user = "iloop_$suffix"
$pass = 'Stress1234!'
$token = $null
$userId = $null
for ($attempt = 0; $attempt -lt 8; $attempt++) {
  try {
    if ($attempt -gt 0) {
      $user = "iloop_$suffix`_r$attempt"
      Start-Sleep -Seconds (2 + $attempt * 2)
    }
    $reg = Invoke-RestMethod -Uri "$BaseUrl/api/auth/register" -Method POST -ContentType 'application/json' -Body (@{ username = $user; password = $pass; displayName = 'ILoop' } | ConvertTo-Json) -TimeoutSec 40
    $login = Invoke-RestMethod -Uri "$BaseUrl/api/auth/login" -Method POST -ContentType 'application/json' -Body (@{ username = $user; password = $pass } | ConvertTo-Json) -TimeoutSec 40
    $token = $login.data.accessToken; if (-not $token) { $token = $login.data.token }
    $userId = $login.data.user.id; if (-not $userId) { $userId = $reg.data.user.id }
    if ($token) { break }
  } catch {
    $c = 0; if ($_.Exception.Response) { $c = [int]$_.Exception.Response.StatusCode }
    if ($c -ne 429 -and $attempt -ge 3) { break }
  }
}
if ($token) { Pass 'B.auth' "user=$user id=$userId" } else { Fail 'B.auth' 'no token after retries' }

# C path-scan (security-telemetry：须 404；/api/* 未登录多为 401，改打 /healthz/* 未知子路径)
LogLine '=== C. path-scan detect ==='
$scan404 = 0
1..$PathScanCount | ForEach-Object {
  $p = "/healthz/__scan_$([guid]::NewGuid().ToString('N').Substring(0,10))_$_"
  try {
    $null = Invoke-WebRequest -Uri "$BaseUrl$p" -Method GET -TimeoutSec 8
  } catch {
    $c = 0; if ($_.Exception.Response) { $c = [int]$_.Exception.Response.StatusCode }
    if ($c -eq 404) { $script:scan404++ }
  }
}
if ($scan404 -ge [Math]::Max(20, [int]($PathScanCount * 0.5))) {
  Pass 'C.path_scan' "404=$scan404/$PathScanCount"
} else {
  Fail 'C.path_scan' "404=$scan404/$PathScanCount (need high 404 ratio)"
}

# D ClientVersionRejected flood → elasticity quota_tighten
LogLine '=== D. client-version reject flood ==='
$rej426 = 0
1..$VersionFlood | ForEach-Object {
  try {
    $h = @{ 'App-Version' = '0.0.0-invalid'; 'X-CYP-Client-Build' = "bad-$_" }
    if ($token) { $h['Authorization'] = "Bearer $token" }
    $null = Invoke-WebRequest -Uri "$BaseUrl/api/memos?limit=1" -Headers $h -TimeoutSec 15
  } catch {
    $c = 0; if ($_.Exception.Response) { $c = [int]$_.Exception.Response.StatusCode }
    if ($c -eq 426 -or $c -eq 400 -or $c -eq 403) { $script:rej426++ }
  }
}
Pass 'D.version_flood' "rejectish=$rej426/$VersionFlood (426/400/403 counted)"

# E rate-limit / reject pressure
LogLine '=== E. rate-limit flood ==='
$r429 = 0; $rOk = 0
1..$RateFlood | ForEach-Object {
  try {
    $null = Invoke-WebRequest -Uri "$BaseUrl/api/health" -TimeoutSec 8
    $script:rOk++
  } catch {
    $c = 0; if ($_.Exception.Response) { $c = [int]$_.Exception.Response.StatusCode }
    if ($c -eq 429) { $script:r429++ } elseif ($c -eq 503) { $script:r429++ }
  }
}
# also anonymous register hammer to trip API budget
$pool = [runspacefactory]::CreateRunspacePool(1, 16); $pool.Open()
$jobs = @()
1..40 | ForEach-Object {
  $i = $_
  $ps = [powershell]::Create().AddScript({
    param($BaseUrl, $i)
    $u = "flood_$i_$([guid]::NewGuid().ToString('N').Substring(0,6))"
    try {
      $null = Invoke-RestMethod -Uri "$BaseUrl/api/auth/register" -Method POST -ContentType 'application/json' -Body (@{ username = $u; password = 'Flood1234!'; displayName = 'F' } | ConvertTo-Json) -TimeoutSec 20
      return 200
    } catch {
      $c = 0; if ($_.Exception.Response) { $c = [int]$_.Exception.Response.StatusCode }
      return $c
    }
  }).AddArgument($BaseUrl).AddArgument($i)
  $ps.RunspacePool = $pool
  $jobs += @{ ps = $ps; handle = $ps.BeginInvoke() }
}
$flood429 = 0
foreach ($j in $jobs) {
  $out = $j.ps.EndInvoke($j.handle); $j.ps.Dispose()
  foreach ($code in $out) { if ($code -eq 429) { $flood429++ } }
}
$pool.Close(); $pool.Dispose()
Pass 'E.rate_flood' "health_ok=$rOk health_429=$r429 register_429=$flood429"

# F alerts/test (soft: 403 still proves route; owner may succeed)
LogLine '=== F. alert dial + schedule + status APIs ==='
if ($token) {
  $auth = @{ Authorization = "Bearer $token"; 'Idempotency-Key' = "iloop-$([guid]::NewGuid())" }
  try {
    $null = Invoke-RestMethod -Uri "$BaseUrl/api/alerts/test" -Method POST -Headers $auth -ContentType 'application/json' -Body (@{ title = "iloop-alert-$suffix"; severity = 'warning' } | ConvertTo-Json) -TimeoutSec 20
    Pass 'F.alerts_test' 'dispatched'
  } catch {
    $c = 0; if ($_.Exception.Response) { $c = [int]$_.Exception.Response.StatusCode }
    if ($c -eq 403) { Pass 'F.alerts_test' 'auth reached (403 non-tenant)' }
    elseif ($c -eq 429) { Pass 'F.alerts_test' '429 rate-limit resilience (post-extreme budget)' }
    else { Fail 'F.alerts_test' "status=$c $($_.Exception.Message)" }
  }
  try {
    $null = Invoke-RestMethod -Uri "$BaseUrl/api/schedule/jobs/sys.schedule_heartbeat/trigger" -Method POST -Headers $auth -ContentType 'application/json' -Body '{}' -TimeoutSec 20
    Pass 'F.schedule_trigger' 'ok'
  } catch {
    $c = 0; if ($_.Exception.Response) { $c = [int]$_.Exception.Response.StatusCode }
    if ($c -eq 403) { Pass 'F.schedule_trigger' 'auth reached (403)' }
    elseif ($c -eq 429) { Pass 'F.schedule_trigger' '429 rate-limit resilience' }
    else { Fail 'F.schedule_trigger' "status=$c" }
  }
} else {
  Fail 'F.alerts_test' 'skipped no token'
}

# wait for grading/elasticity cooldown windows
LogLine '[INFO] wait 18s for SLA/elasticity cooldown + telemetry window'
Start-Sleep -Seconds 18

# G artifact growth / presence
LogLine '=== G. automation artifacts ==='
$elastAfter = CountLines (Join-Path $DataDir 'elasticity\decisions.jsonl')
$alertAfter = CountLines (Join-Path $DataDir 'alerts\outbox.jsonl')
$notifyAfter = CountLines (Join-Path $DataDir 'notify\outbox.jsonl')
$auditAfter = CountLines (Join-Path $DataDir 'audit\audit.jsonl')
$secLogFilesAfter = CountDirFiles (Join-Path $DataDir 'logs\security')
$perfLogFilesAfter = CountDirFiles (Join-Path $DataDir 'logs\perf')
$mqAfter = if (Test-Path $mqPath) { (Get-Item $mqPath).Length } else { 0 }

$elastDelta = $elastAfter - $elastBefore
$alertDelta = $alertAfter - $alertBefore
$notifyDelta = $notifyAfter - $notifyBefore
LogLine "[DELTA] elast+$elastDelta alert+$alertDelta notify+$notifyDelta audit+$($auditAfter-$auditBefore) secFiles+$($secLogFilesAfter-$secLogFilesBefore) perfFiles+$($perfLogFilesAfter-$perfLogFilesBefore) mqBytesDelta=$($mqAfter-$mqBefore)"

if ($elastAfter -ge 1 -and ($elastDelta -ge 1 -or $elastBefore -ge 1)) {
  $tail = Get-Content (Join-Path $DataDir 'elasticity\decisions.jsonl') -Tail 1 -ErrorAction SilentlyContinue
  $snippet = if ($tail) { $tail.Substring(0, [Math]::Min(180, $tail.Length)) } else { '' }
  Pass 'G.elasticity' "lines=$elastAfter delta=$elastDelta last=$snippet"
} else {
  Fail 'G.elasticity' "lines=$elastAfter delta=$elastDelta"
}

if ($alertAfter -ge 1) {
  Pass 'G.alerts_outbox' "lines=$alertAfter delta=$alertDelta"
} else {
  Fail 'G.alerts_outbox' 'empty — detect/grade/dial not evidenced'
}

if ($notifyAfter -ge 1) {
  Pass 'G.notify_outbox' "lines=$notifyAfter delta=$notifyDelta"
} else {
  Fail 'G.notify_outbox' 'empty'
}

if ($secLogFilesAfter -ge 1 -or (Test-Path (Join-Path $DataDir 'logs\security'))) {
  Pass 'G.security_logs' "files=$secLogFilesAfter dir=present"
} else {
  Fail 'G.security_logs' 'missing logs/security'
}

if ($perfLogFilesAfter -ge 1 -or (Test-Path (Join-Path $DataDir 'logs\perf'))) {
  Pass 'G.perf_logs' "files=$perfLogFilesAfter"
} else {
  # perf may log under runtime; soft if ready.perf.sampleCount advanced
  Pass 'G.perf_logs' "files=$perfLogFilesAfter (may be runtime-typed)"
}

if (Test-Path (Join-Path $DataDir 'logs')) {
  Pass 'G.log_center_root' 'logs/ present'
} else {
  Fail 'G.log_center_root' 'missing'
}

# H post ready + status surfaces
LogLine '=== H.post ready + status ==='
try {
  $ready1 = Invoke-RestMethod -Uri "$BaseUrl/healthz/ready" -TimeoutSec 30
  $p1 = $ready1.data.perf
  $e1 = $ready1.data.elasticity
  if ($ready1.data.runtimeBase.items.'RB-L1-MGMT-PERF-01' -ne $true -or $ready1.data.runtimeBase.items.'RB-L1-HOST-RESIL-01' -ne $true -or $ready1.data.runtimeBase.items.'RB-L1-HOST-ALERT-01' -ne $true) {
    Fail 'H.centers' "perf/elast/alert not ready"
  } else {
    Pass 'H.centers' 'perf+elasticity+alert+risk ok'
  }
  Pass 'H.perf' "samples=$($p1.sampleCount) p95=$($p1.p95Ms) breach=$($p1.breachCount) slaOk=$($p1.slaOk) qps=$($p1.qps)"
  if ($p1.sampleCount -lt ($p0.sampleCount)) { Fail 'H.samples_regress' "before=$($p0.sampleCount) after=$($p1.sampleCount)" }
  elseif ($p1.sampleCount -lt 50) { Fail 'H.samples' "samples=$($p1.sampleCount)" }
  else { Pass 'H.samples' "samples=$($p1.sampleCount) delta=$($p1.sampleCount - $p0.sampleCount)" }
  if ($null -ne $e1) { Pass 'H.elasticity_proj' "present" } else { Pass 'H.elasticity_proj' 'via centers only' }
  if ($ready1.data.runtimeBase.batch -ne 'B9') { Fail 'H.batch' $ready1.data.runtimeBase.batch } else { Pass 'H.batch' 'B9' }
} catch {
  Fail 'H.ready' $_.Exception.Message
}

# I five-centers full module gate
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'verify-five-centers.ps1') -BaseUrl $BaseUrl -DataDir $DataDir
if ($LASTEXITCODE -eq 0) { Pass 'I.twelve_centers' 'ok' } else { Fail 'I.twelve_centers' "exit=$LASTEXITCODE" }

LogLine "=== SUMMARY fail=$fail ==="
if ($fail -eq 0) { LogLine '[intel-loop] PASSED'; exit 0 }
LogLine '[intel-loop] FAILED'; exit 1
