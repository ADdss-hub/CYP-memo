# CYP-memo extreme full-link pressure (real env only)
# powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify\verify-extreme-full-link.ps1
param(
  [string]$BaseUrl = 'http://127.0.0.1:5170',
  # 画像：LAN/NAS 自托管备忘录 · 小中团队设计 DAU≈50 → L2 极高=2×≈100；L3 旁路分享触顶
  [int]$Users = 80,
  [int]$MemosPerUser = 30,
  [int]$ShareFlood = 120,
  [int]$StressConcurrency = 48,
  [int]$StressOps = 80,
  [int]$StressFlood = 160
)
$ErrorActionPreference = 'Continue'
$fail = 0
$report = New-Object System.Collections.Generic.List[string]
function LogLine([string]$s) { [void]$report.Add($s); Write-Host $s }
function Pass([string]$n, [string]$d) { LogLine "[PASS] $n :: $d" }
function Fail([string]$n, [string]$d) { $script:fail++; LogLine "[FAIL] $n :: $d" }

LogLine "=== EXTREME full-link base=$BaseUrl users=$Users memos/user=$MemosPerUser shareFlood=$ShareFlood stress=c$StressConcurrency/ops$StressOps/flood$StressFlood ==="

# A ready
try {
  $ready0 = Invoke-RestMethod -Uri "$BaseUrl/healthz/ready" -TimeoutSec 30
  if ($ready0.success -ne $true -or $ready0.data.runtimeBase.batch -ne 'B9') {
    Fail 'A.ready' 'batch!=B9'; exit 2
  }
  Pass 'A.ready' "routes=$($ready0.data.runtimeBase.routeCount) perf=$($ready0.data.runtimeBase.items.'RB-L1-MGMT-PERF-01') resil=$($ready0.data.runtimeBase.items.'RB-L1-HOST-RESIL-01')"
} catch {
  Fail 'A.ready' $_.Exception.Message; exit 2
}

# D stress FIRST (clean IP budget) then mass users
LogLine '=== D. runtime-base stress (extreme) ==='
$stressOk = $false
$stressExit = 1
for ($sa = 0; $sa -lt 3; $sa++) {
  if ($sa -gt 0) {
    LogLine "[INFO] D.stress cool-down retry #$sa"
    Start-Sleep -Seconds (15 + $sa * 10)
  }
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'verify-runtime-base-stress.ps1') -BaseUrl $BaseUrl -Concurrency $StressConcurrency -OpsPerWorker $StressOps -FloodRounds $StressFlood
  $stressExit = $LASTEXITCODE
  if ($stressExit -eq 0) { $stressOk = $true; break }
}
if ($stressOk) { Pass 'D.stress' "c=$StressConcurrency ops=$StressOps flood=$StressFlood" }
else { Fail 'D.stress' "exit=$stressExit after retries" }

# cool-down: IP API budget window is 60s; mass register must wait
LogLine '[INFO] cool-down 65s before mass users (rate-limit window)'
Start-Sleep -Seconds 65

# B mass users
LogLine '=== B. mass provision ==='
$tokens = New-Object System.Collections.Generic.List[string]
$usersOk = 0; $usersRl = 0; $usersBad = 0
$pool = [runspacefactory]::CreateRunspacePool(1, [Math]::Min(32, $Users)); $pool.Open()
$jobs = @()
1..$Users | ForEach-Object {
  $i = $_
  $ps = [powershell]::Create().AddScript({
    param($BaseUrl, $i)
    $u = "xuser_$i_$([guid]::NewGuid().ToString('N').Substring(0,8))"
    $pw = 'Stress1234!'
    $lastRl = 0
    for ($attempt = 0; $attempt -lt 6; $attempt++) {
      if ($attempt -gt 0) { Start-Sleep -Seconds (2 + $attempt * 3) }
      try {
        $null = Invoke-RestMethod -Uri "$BaseUrl/api/auth/register" -Method POST -ContentType 'application/json' -Body (@{ username = $u; password = $pw; displayName = "X$i" } | ConvertTo-Json) -TimeoutSec 40
        $login = Invoke-RestMethod -Uri "$BaseUrl/api/auth/login" -Method POST -ContentType 'application/json' -Body (@{ username = $u; password = $pw } | ConvertTo-Json) -TimeoutSec 40
        $tok = $login.data.accessToken; if (-not $tok) { $tok = $login.data.token }
        if ($tok) { return @{ ok = 1; rl = $lastRl; token = $tok } }
        return @{ ok = 0; rl = $lastRl; token = $null }
      } catch {
        $c = 0; if ($_.Exception.Response) { $c = [int]$_.Exception.Response.StatusCode }
        if ($c -eq 429) { $lastRl = 1; continue }
        return @{ ok = 0; rl = $lastRl; token = $null }
      }
    }
    return @{ ok = 0; rl = 1; token = $null }
  }).AddArgument($BaseUrl).AddArgument($i)
  $ps.RunspacePool = $pool
  $jobs += @{ ps = $ps; handle = $ps.BeginInvoke() }
}
foreach ($j in $jobs) {
  $out = $j.ps.EndInvoke($j.handle); $j.ps.Dispose()
  foreach ($row in $out) {
    if ($row.ok -eq 1 -and $row.token) { $usersOk++; [void]$tokens.Add([string]$row.token) }
    elseif ($row.rl -eq 1) { $usersRl++ }
    else { $usersBad++ }
  }
}
$pool.Close(); $pool.Dispose()
if ($usersOk -ge [Math]::Max(8, [int]($Users * 0.3))) {
  Pass 'B.mass_users' "ok=$usersOk rl429=$usersRl bad=$usersBad tokens=$($tokens.Count)"
} else {
  Fail 'B.mass_users' "ok=$usersOk rl429=$usersRl bad=$usersBad"
}

# C data-flow storm
LogLine '=== C. data-flow storm ==='
$memoOk = 0; $memoRl = 0; $memoBad = 0; $shareTotal = 0
$useTokens = @($tokens | Select-Object -First ([Math]::Min(24, $tokens.Count)))
if ($useTokens.Count -lt 1) {
  Fail 'C.data_flow' 'no tokens'
} else {
  $pool2 = [runspacefactory]::CreateRunspacePool(1, [Math]::Min(24, $useTokens.Count)); $pool2.Open()
  $jobs2 = @()
  for ($ti = 0; $ti -lt $useTokens.Count; $ti++) {
    $tok = $useTokens[$ti]
    $ps = [powershell]::Create().AddScript({
      param($BaseUrl, $token, $MemosPerUser, $ShareFloodHalf)
      $ok = 0; $rl = 0; $bad = 0; $shareOk = 0
      for ($m = 0; $m -lt $MemosPerUser; $m++) {
        $key = "x-$m-$([guid]::NewGuid())"
        $h = @{ Authorization = "Bearer $token"; 'Idempotency-Key' = $key }
        try {
          $body = (@{ title = "xmemo-$m"; content = ("pad-" + ('x' * 200) + "-$m"); tags = @('extreme','load') } | ConvertTo-Json)
          $c = Invoke-WebRequest -Uri "$BaseUrl/api/memos" -Method POST -Headers $h -ContentType 'application/json' -Body $body -TimeoutSec 60
          $id = ($c.Content | ConvertFrom-Json).data.id
          $null = Invoke-WebRequest -Uri "$BaseUrl/api/memos/$id" -Method GET -Headers @{ Authorization = "Bearer $token" } -TimeoutSec 40
          if ($m -lt $ShareFloodHalf -and $id) {
            try {
              $h2 = @{ Authorization = "Bearer $token"; 'Idempotency-Key' = "$key-s" }
              $null = Invoke-WebRequest -Uri "$BaseUrl/api/shares" -Method POST -Headers $h2 -ContentType 'application/json' -Body (@{ memoId = $id } | ConvertTo-Json) -TimeoutSec 40
              $shareOk++
            } catch {
              $c2 = 0; if ($_.Exception.Response) { $c2 = [int]$_.Exception.Response.StatusCode }
              if ($c2 -eq 429) { $rl++ }
            }
          }
          $ok++
        } catch {
          $c = 0; if ($_.Exception.Response) { $c = [int]$_.Exception.Response.StatusCode }
          if ($c -eq 429) { $rl++ } else { $bad++ }
        }
      }
      try {
        $null = Invoke-WebRequest -Uri "$BaseUrl/api/memos?limit=50" -Headers @{ Authorization = "Bearer $token" } -TimeoutSec 40
        $ok++
      } catch {
        $c = 0; if ($_.Exception.Response) { $c = [int]$_.Exception.Response.StatusCode }
        if ($c -eq 429) { $rl++ } else { $bad++ }
      }
      @{ ok = $ok; rl = $rl; bad = $bad; shareOk = $shareOk }
    }).AddArgument($BaseUrl).AddArgument($tok).AddArgument($MemosPerUser).AddArgument([Math]::Max(1, [int]($ShareFlood / [Math]::Max(1, $useTokens.Count))))
    $ps.RunspacePool = $pool2
    $jobs2 += @{ ps = $ps; handle = $ps.BeginInvoke() }
  }
  foreach ($j in $jobs2) {
    $out = $j.ps.EndInvoke($j.handle); $j.ps.Dispose()
    foreach ($row in $out) {
      $memoOk += $row.ok; $memoRl += $row.rl; $memoBad += $row.bad; $shareTotal += $row.shareOk
    }
  }
  $pool2.Close(); $pool2.Dispose()
  $totalM = $memoOk + $memoRl + $memoBad
  $hardRate = if ($totalM -gt 0) { [math]::Round(100.0 * $memoBad / $totalM, 2) } else { 100 }
  if ($hardRate -le 10 -and $memoOk -ge 20) {
    Pass 'C.data_flow' "ok=$memoOk rl429=$memoRl bad=$memoBad hardErr=${hardRate}% shares=$shareTotal"
  } else {
    Fail 'C.data_flow' "ok=$memoOk rl429=$memoRl bad=$memoBad hardErr=${hardRate}% shares=$shareTotal"
  }
}

# E five-centers
LogLine '=== E. runtime gates ==='
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'verify-five-centers.ps1') -BaseUrl $BaseUrl
if ($LASTEXITCODE -eq 0) { Pass 'E.five_centers' 'ok' } else { Fail 'E.five_centers' "exit=$LASTEXITCODE" }

# F snapshot
LogLine '=== F.post snapshot ==='
try {
  $ready1 = Invoke-RestMethod -Uri "$BaseUrl/healthz/ready" -TimeoutSec 30
  $p = $ready1.data.perf
  Pass 'F.ready' "batch=$($ready1.data.runtimeBase.batch) samples=$($p.sampleCount) p95=$($p.p95Ms) p99=$($p.p99Ms) breach=$($p.breachCount) slaOk=$($p.slaOk) qps=$($p.qps)"
  if ($p.sampleCount -lt 100) { Fail 'F.samples' "samples=$($p.sampleCount)" }
} catch { Fail 'F.ready' $_.Exception.Message }

$df = 'D:\kf\kf\CYP-memo\packages\server\data\elasticity\decisions.jsonl'
if (Test-Path $df) {
  $n = (Get-Content $df | Measure-Object -Line).Lines
  $tail = Get-Content $df -Tail 1
  $snippet = if ($tail) { $tail.Substring(0, [Math]::Min(160, $tail.Length)) } else { '' }
  if ($n -ge 1) { Pass 'F.elasticity_decisions' "lines=$n last=$snippet" }
  else { Fail 'F.elasticity_decisions' 'empty' }
} else {
  Fail 'F.elasticity_decisions' 'missing'
}

LogLine "=== SUMMARY fail=$fail ==="
if ($fail -eq 0) { LogLine '[extreme] PASSED'; exit 0 }
LogLine '[extreme] FAILED'; exit 1