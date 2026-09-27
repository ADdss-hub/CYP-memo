# CYP-memo runtime-base heavy stress (real env, Windows PowerShell 5.1+)
param(
  [string]$BaseUrl = 'http://127.0.0.1:5170',
  [int]$Concurrency = 20,
  [int]$OpsPerWorker = 30,
  [int]$FloodRounds = 60
)
$ErrorActionPreference = 'Continue'
$fail = 0
Write-Host "=== stress base=$BaseUrl c=$Concurrency ops=$OpsPerWorker flood=$FloodRounds ==="

function Invoke-Http {
  param(
    [string]$Method,
    [string]$Uri,
    [hashtable]$Headers = $null,
    [string]$Body = $null,
    [int]$TimeoutSec = 45
  )
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  try {
    $p = @{ Uri = $Uri; Method = $Method; TimeoutSec = $TimeoutSec }
    if ($Headers) { $p.Headers = $Headers }
    if ($null -ne $Body) { $p.ContentType = 'application/json'; $p.Body = $Body }
    $resp = Invoke-WebRequest @p
    $sw.Stop()
    return @{ ok = $true; code = [int]$resp.StatusCode; ms = $sw.Elapsed.TotalMilliseconds; headers = $resp.Headers; body = $resp.Content }
  } catch {
    $sw.Stop()
    $code = 0
    if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
    return @{ ok = $false; code = $code; ms = $sw.Elapsed.TotalMilliseconds; err = $_.Exception.Message }
  }
}

# A baseline
$ready0 = $null
try {
  $ready0 = Invoke-RestMethod -Uri "$BaseUrl/healthz/ready" -TimeoutSec 20
  if ($ready0.success -ne $true -or $ready0.data.runtimeBase.batch -ne 'B9') {
    Write-Host '[FAIL] baseline ready/batch'; exit 1
  }
  Write-Host "[OK] baseline batch=$($ready0.data.runtimeBase.batch) routes=$($ready0.data.runtimeBase.routeCount)"
} catch {
  Write-Host "[FAIL] server down $($_.Exception.Message)"; exit 1
}

# B provision
$suffix = Get-Random -Maximum 9999999
$user = "stress_$suffix"
$pass = 'Stress1234!'
$provisioned = $false
$token = $null
for ($attempt = 0; $attempt -lt 6; $attempt++) {
  try {
    if ($attempt -gt 0) {
      $user = "stress_$suffix`_r$attempt"
      Start-Sleep -Seconds (3 + $attempt * 2)
    }
    $null = Invoke-RestMethod -Uri "$BaseUrl/api/auth/register" -Method POST -ContentType 'application/json' -Body (@{ username = $user; password = $pass; displayName = 'Stress' } | ConvertTo-Json) -TimeoutSec 30
    $login = Invoke-RestMethod -Uri "$BaseUrl/api/auth/login" -Method POST -ContentType 'application/json' -Body (@{ username = $user; password = $pass } | ConvertTo-Json) -TimeoutSec 30
    $token = $login.data.accessToken
    if (-not $token) { $token = $login.data.token }
    if (-not $token) { throw 'no token' }
    $provisioned = $true
    break
  } catch {
    $code = 0
    if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
    if ($code -ne 429 -and $attempt -ge 2) { break }
  }
}
if (-not $provisioned -or -not $token) {
  Write-Host "[FAIL] provision after retries (likely rate-limit E024)"
  exit 1
}
Write-Host "[OK] provisioned $user"

# C negative flood (sequential batches via runspace pool)
Write-Host '=== C. negative flood ==='
$neg410 = 0; $neg400 = 0; $neg503 = 0; $negBad = 0
$pool = [runspacefactory]::CreateRunspacePool(1, [Math]::Min(32, $Concurrency))
$pool.Open()
$jobs = @()
1..$FloodRounds | ForEach-Object {
  $i = $_
  $ps = [powershell]::Create().AddScript({
    param($BaseUrl, $i)
    $r = @{ c410 = 0; c400 = 0; c503 = 0; bad = 0 }
    try { Invoke-WebRequest -Uri "$BaseUrl/api/memos/tenant-scope" -Method GET -TimeoutSec 20 | Out-Null; $r.bad++ }
    catch { $c = 0; if ($_.Exception.Response) { $c = [int]$_.Exception.Response.StatusCode }; if ($c -eq 410) { $r.c410++ } else { $r.bad++ } }
    try { Invoke-WebRequest -Uri "$BaseUrl/api/memos" -Method POST -ContentType 'application/json' -Body '{}' -TimeoutSec 20 | Out-Null; $r.bad++ }
    catch { $c = 0; if ($_.Exception.Response) { $c = [int]$_.Exception.Response.StatusCode }; if ($c -eq 400) { $r.c400++ } else { $r.bad++ } }
    try {
      $h = @{ 'Idempotency-Key' = "flood-$i-$([guid]::NewGuid())" }
      Invoke-WebRequest -Uri "$BaseUrl/api/__stress_unregistered" -Method POST -Headers $h -ContentType 'application/json' -Body '{}' -TimeoutSec 20 | Out-Null
      $r.bad++
    } catch { $c = 0; if ($_.Exception.Response) { $c = [int]$_.Exception.Response.StatusCode }; if ($c -eq 503) { $r.c503++ } else { $r.bad++ } }
    $r
  }).AddArgument($BaseUrl).AddArgument($i)
  $ps.RunspacePool = $pool
  $jobs += @{ ps = $ps; handle = $ps.BeginInvoke() }
}
foreach ($j in $jobs) {
  $out = $j.ps.EndInvoke($j.handle)
  $j.ps.Dispose()
  foreach ($row in $out) {
    $neg410 += $row.c410; $neg400 += $row.c400; $neg503 += $row.c503; $negBad += $row.bad
  }
}
$pool.Close(); $pool.Dispose()
if ($neg410 -eq $FloodRounds -and $neg400 -eq $FloodRounds -and $neg503 -eq $FloodRounds -and $negBad -eq 0) {
  Write-Host "[OK] negative flood 410=$neg410 400=$neg400 503=$neg503"
} else {
  Write-Host "[FAIL] negative flood 410=$neg410 400=$neg400 503=$neg503 bad=$negBad expect=$FloodRounds"
  $fail = 1
}

# D idempotency storm
Write-Host '=== D. idempotency storm ==='
$idempKey = "idemp-storm-$([guid]::NewGuid())"
$memoBody = (@{ title = 'idemp-storm'; content = 'one' } | ConvertTo-Json)
$stormN = [Math]::Max(16, [Math]::Min(40, $Concurrency * 2))
$pool2 = [runspacefactory]::CreateRunspacePool(1, 32); $pool2.Open()
$jobs2 = @(); $createOk = 0; $createBad = 0; $replayHits = 0
1..$stormN | ForEach-Object {
  $ps = [powershell]::Create().AddScript({
    param($BaseUrl, $token, $idempKey, $memoBody)
    try {
      $h = @{ Authorization = "Bearer $token"; 'Idempotency-Key' = $idempKey }
      $resp = Invoke-WebRequest -Uri "$BaseUrl/api/memos" -Method POST -Headers $h -ContentType 'application/json' -Body $memoBody -TimeoutSec 40
      $replayed = $resp.Headers['Idempotency-Replayed']
      @{ ok = 1; replay = $(if ($replayed) { 1 } else { 0 }); code = [int]$resp.StatusCode }
    } catch {
      $c = 0; if ($_.Exception.Response) { $c = [int]$_.Exception.Response.StatusCode }
      @{ ok = 0; replay = 0; code = $c }
    }
  }).AddArgument($BaseUrl).AddArgument($token).AddArgument($idempKey).AddArgument($memoBody)
  $ps.RunspacePool = $pool2
  $jobs2 += @{ ps = $ps; handle = $ps.BeginInvoke() }
}
foreach ($j in $jobs2) {
  $out = $j.ps.EndInvoke($j.handle); $j.ps.Dispose()
  foreach ($row in $out) {
    if ($row.ok -eq 1) { $createOk++; if ($row.replay -eq 1) { $replayHits++ } }
    elseif ($row.code -eq 409) { $createOk++ }
    else { $createBad++ }
  }
}
$pool2.Close(); $pool2.Dispose()
if ($createOk -ge 1 -and $createBad -eq 0) {
  Write-Host "[OK] idemp storm ok=$createOk replayHeaders=$replayHits"
} else {
  Write-Host "[FAIL] idemp storm ok=$createOk bad=$createBad"
  $fail = 1
}

# E concurrent CRUD
Write-Host '=== E. concurrent CRUD ==='
$pool3 = [runspacefactory]::CreateRunspacePool(1, $Concurrency); $pool3.Open()
$jobs3 = @(); $crudOk = 0; $crudBad = 0; $crudRl = 0; $hostedMiss = 0
$lat = New-Object System.Collections.Generic.List[double]
1..$Concurrency | ForEach-Object {
  $wid = $_
  $ps = [powershell]::Create().AddScript({
    param($BaseUrl, $token, $OpsPerWorker, $wid)
    $ok = 0; $bad = 0; $rl = 0; $hostedMiss = 0; $latMs = @()
    for ($i = 0; $i -lt $OpsPerWorker; $i++) {
      $key = "w$wid-o$i-$([guid]::NewGuid())"
      $h = @{ Authorization = "Bearer $token"; 'Idempotency-Key' = $key }
      $sw = [System.Diagnostics.Stopwatch]::StartNew()
      try {
        $body = (@{ title = "s-$wid-$i"; content = "stress-$i" } | ConvertTo-Json)
        $c = Invoke-WebRequest -Uri "$BaseUrl/api/memos" -Method POST -Headers $h -ContentType 'application/json' -Body $body -TimeoutSec 50
        $hosted = [uri]::UnescapeDataString([string]$c.Headers['X-CYP-Hosted-Service'])
        if ($hosted -ne '业务协同对接') { $hostedMiss++ }
        $id = ($c.Content | ConvertFrom-Json).data.id
        $h2 = @{ Authorization = "Bearer $token"; 'Idempotency-Key' = "$key-p" }
        $null = Invoke-WebRequest -Uri "$BaseUrl/api/memos/$id" -Method PATCH -Headers $h2 -ContentType 'application/json' -Body (@{ title = "u-$wid-$i" } | ConvertTo-Json) -TimeoutSec 50
        $null = Invoke-WebRequest -Uri "$BaseUrl/api/memos/$id" -Method GET -Headers @{ Authorization = "Bearer $token" } -TimeoutSec 50
        if (($i % 3) -eq 0) {
          $h3 = @{ Authorization = "Bearer $token"; 'Idempotency-Key' = "$key-d" }
          $null = Invoke-WebRequest -Uri "$BaseUrl/api/memos/$id" -Method DELETE -Headers $h3 -TimeoutSec 50
        }
        $sw.Stop(); $latMs += $sw.Elapsed.TotalMilliseconds; $ok++
      } catch {
        $sw.Stop(); $latMs += $sw.Elapsed.TotalMilliseconds
        $c = 0
        if ($_.Exception.Response) { $c = [int]$_.Exception.Response.StatusCode }
        # 429/E024 = 限流韧性生效，高压下计为预期压力响应，不计硬失败
        if ($c -eq 429) { $rl++ } else { $bad++ }
      }
    }
    try {
      $null = Invoke-WebRequest -Uri "$BaseUrl/api/memos" -Method GET -Headers @{ Authorization = "Bearer $token" } -TimeoutSec 50
      $ok++
    } catch {
      $c = 0
      if ($_.Exception.Response) { $c = [int]$_.Exception.Response.StatusCode }
      if ($c -eq 429) { $rl++ } else { $bad++ }
    }
    @{ ok = $ok; bad = $bad; rl = $rl; hostedMiss = $hostedMiss; lat = $latMs }
  }).AddArgument($BaseUrl).AddArgument($token).AddArgument($OpsPerWorker).AddArgument($wid)
  $ps.RunspacePool = $pool3
  $jobs3 += @{ ps = $ps; handle = $ps.BeginInvoke() }
}
foreach ($j in $jobs3) {
  $out = $j.ps.EndInvoke($j.handle); $j.ps.Dispose()
  foreach ($row in $out) {
    $crudOk += $row.ok; $crudBad += $row.bad; $crudRl += $row.rl; $hostedMiss += $row.hostedMiss
    foreach ($ms in $row.lat) { [void]$lat.Add([double]$ms) }
  }
}
$pool3.Close(); $pool3.Dispose()
$totalCrud = $crudOk + $crudBad + $crudRl
$hardErrRate = if ($totalCrud -gt 0) { [math]::Round(100.0 * $crudBad / $totalCrud, 2) } else { 100 }
$rlRate = if ($totalCrud -gt 0) { [math]::Round(100.0 * $crudRl / $totalCrud, 2) } else { 0 }
$p50 = 0; $p95 = 0; $p99 = 0; $avg = 0
if ($lat.Count -gt 0) {
  $sorted = $lat | Sort-Object
  $avg = [math]::Round(($sorted | Measure-Object -Average).Average, 1)
  $p50 = [math]::Round($sorted[[int]([math]::Floor(($sorted.Count - 1) * 0.50))], 1)
  $p95 = [math]::Round($sorted[[int]([math]::Floor(($sorted.Count - 1) * 0.95))], 1)
  $p99 = [math]::Round($sorted[[int]([math]::Floor(($sorted.Count - 1) * 0.99))], 1)
}
Write-Host "[INFO] CRUD ok=$crudOk bad=$crudBad rl429=$crudRl hardErr=${hardErrRate}% rlRate=${rlRate}% hostedMiss=$hostedMiss avg=${avg}ms p50=${p50}ms p95=${p95}ms p99=${p99}ms"
# 硬失败（非限流）>5% 或 hosted 头缺失 → FAIL；纯 429 视为韧性生效
if ($hardErrRate -gt 5 -or $hostedMiss -gt 0) {
  Write-Host '[FAIL] CRUD pressure gate'
  $fail = 1
} else {
  Write-Host '[OK] CRUD under pressure'
}

# F post ready (closed set 35)
Write-Host '=== F. post-stress ready ==='
try {
  $ready1 = Invoke-RestMethod -Uri "$BaseUrl/healthz/ready" -TimeoutSec 20
  $rb = $ready1.data.runtimeBase
  $items = $rb.items
  $ids = @(
    'RB-L0-INFRA-CFG-01','RB-L0-INFRA-INIT-01','RB-L0-INFRA-LOG-01','RB-L0-INFRA-CACHE-01','RB-L0-INFRA-MQ-01','RB-L0-INFRA-DB-01',
    'RB-L0-COORD-CMP-01','RB-L0-COORD-PLT-01',
    'RB-L1-MGMT-CONF-01','RB-L1-MGMT-RISK-01','RB-L1-MGMT-TRACE-01','RB-L1-MGMT-BOOT-01','RB-L1-MGMT-CODE-01','RB-L1-MGMT-FESEC-01','RB-L1-MGMT-IAM-01','RB-L1-MGMT-KMS-01','RB-L1-MGMT-RBAC-01','RB-L1-MGMT-PERF-01',
    'RB-L1-HOST-TELEM-01','RB-L1-HOST-RULE-01','RB-L1-HOST-SCHED-01','RB-L1-HOST-ACCT-01','RB-L1-HOST-REL-01','RB-L1-HOST-BIZ-01','RB-L1-HOST-ALERT-01','RB-L1-HOST-TRACEAN-01','RB-L1-HOST-AUDIT-01','RB-L1-HOST-RESIL-01',
    'RB-L1-COL-SVC-01','RB-L1-COL-EVT-01','RB-L1-COL-CTR-01','RB-L1-COL-TEN-01','RB-L1-COL-DATA-01',
    'RB-L1-PUB-ACC-01','RB-L1-PUB-OPEN-01'
  )
  $bad = @($ids | Where-Object { $items.$_ -ne $true })
  if ($ready1.success -eq $true -and $rb.routesRegistered -eq $true -and $rb.completeForm -eq $true -and $bad.Count -eq 0 -and $null -eq $ready1.data.modules) {
    Write-Host "[OK] post-stress ready routes=$($rb.routeCount) items=35"
  } else {
    Write-Host "[FAIL] post-stress ready degraded bad=$bad"
    $fail = 1
  }
} catch {
  Write-Host "[FAIL] post-stress ready $($_.Exception.Message)"
  $fail = 1
}

Write-Host "=== SUMMARY fail=$fail hardErr=${hardErrRate}% rl429=${rlRate}% p95=${p95}ms ==="
if ($fail -ne 0) { Write-Host '[stress] FAILED'; exit 1 }
Write-Host '[stress] PASSED'
exit 0
