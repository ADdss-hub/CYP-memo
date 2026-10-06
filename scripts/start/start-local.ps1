# CYP-memo: start local stack（CI02：配置恒为生产基准 APP_ENV=prod）
# 规范 2.2-禁3 / 2.5.4-4（F-02 端口占用须阻断启动）+ 2.4.1-2/3（F-03 度量独立计量、写盘失败退出非零）



Set-StrictMode -Version Latest



$ErrorActionPreference = 'Stop'



. (Join-Path $PSScriptRoot '..\_internal\common.ps1')



$Root = Get-Root $PSScriptRoot



Set-Location -LiteralPath $Root



# CI02：一键启动强制生产唯一基准（禁止非 prod / 非 production 配置漂移）



$env:APP_ENV = 'prod'



$env:NODE_ENV = 'production'



Write-Host 'CI02: APP_ENV=prod NODE_ENV=production (production-only baseline)'



# CFG-SYS-02 / CI01: ensure .env exists and inject selected keys into process env



# 本地 start 不注入 DATA_DIR；且 NODE_ENV/APP_ENV 以上方强制为准（不从 .env 覆盖为非生产值）



$DotEnvPath = Join-Path $Root '.env'



$DotEnvExample = Join-Path $Root '.env.example'



if (-not (Test-Path -LiteralPath $DotEnvPath) -and (Test-Path -LiteralPath $DotEnvExample)) {



  Copy-Item -LiteralPath $DotEnvExample -Destination $DotEnvPath



  Write-Host "NOTE: created .env from .env.example (edit as needed)."



}



if (Test-Path -LiteralPath $DotEnvPath) {



  $injectKeys = Get-CypInjectKeys



  Get-Content -LiteralPath $DotEnvPath -Encoding UTF8 | ForEach-Object {



    $line = $_.Trim()



    if (-not $line -or $line.StartsWith('#')) { return }



    $eq = $line.IndexOf('=')



    if ($eq -lt 1) { return }



    $key = $line.Substring(0, $eq).Trim()



    $val = $line.Substring($eq + 1).Trim()



    if ($val.StartsWith('"') -and $val.EndsWith('"')) { $val = $val.Substring(1, $val.Length - 2) }



    elseif ($val.StartsWith("'") -and $val.EndsWith("'")) { $val = $val.Substring(1, $val.Length - 2) }



    if ($injectKeys -contains $key) {



      $existing = [Environment]::GetEnvironmentVariable($key, 'Process')



      if ([string]::IsNullOrEmpty($existing)) {



        Set-Item -Path "Env:$key" -Value $val



      }



    }



  }



  Write-Host 'Injected .env keys (PORT/LOG_LEVEL/TZ/CYP_BOOTSTRAP_OWNER_PASSWORD/VITE_*; APP_ENV/NODE_ENV forced prod).'



}



$TimeoutSec = 120



if ($env:CYP_START_TIMEOUT) {



  $parsed = 0



  if ([int]::TryParse($env:CYP_START_TIMEOUT, [ref]$parsed) -and $parsed -gt 0) {



    $TimeoutSec = $parsed



  }



}



Write-Host '== CYP-memo start-local =='



Write-Host "Root: $Root"



if (-not (Test-CommandExists 'node')) {



  Write-Error 'Node.js not found. Install Node >= 20.19.6 then retry.'



  exit 1



}



$nodeVer = & node -v



Write-Host "Node: $nodeVer"



$inv = Get-PnpmInvoker -ProjectRoot $Root



if (-not $inv) {



  Write-Error 'pnpm not found (pnpm.cmd / corepack). Try: corepack enable && corepack prepare pnpm@10.11.0 --activate'



  exit 1



}



Write-Host "pnpm: $($inv.Display)"



# concurrently / 嵌套 pnpm 脚本依赖 PATH 上的 pnpm（仅 corepack 前缀不够）



$pnpmCmd = Get-Command 'pnpm.cmd' -ErrorAction SilentlyContinue



if (-not $pnpmCmd) { $pnpmCmd = Get-Command 'pnpm' -ErrorAction SilentlyContinue }



if ($pnpmCmd) {



  $pnpmDir = Split-Path -Parent $pnpmCmd.Source



  if ($env:Path -notlike "*$pnpmDir*") {



    $env:Path = "$pnpmDir;" + $env:Path



    Write-Host "PATH prepend: $pnpmDir"



  }



}



if (-not (Test-Path -LiteralPath (Join-Path $Root 'node_modules'))) {



  Write-Host ''



  Write-Host 'ERROR: node_modules missing. Install deps first:'



  Write-Host '  .workbuddy\install-with-vs.bat   (Windows / VS build tools path)'



  Write-Host '  OR: pnpm install'



  exit 1



}



# 规范 2.2-禁3 / 2.5.4-4：端口占用须阻断启动，禁止覆盖使用（拉起前预检）
$portPidFile = Join-Path $Root 'logs' 'local-all.pid'
$ownPid = $null
if (Test-Path -LiteralPath $portPidFile) {
  $pc = (Get-Content -LiteralPath $portPidFile -Encoding ascii -ErrorAction SilentlyContinue | Select-Object -First 1)
  if ($pc -match '^\d+$') { $ownPid = [int]$pc }
}
$portsFail = $false
foreach ($p in @(5170, 10170, 13175, 12000)) {
  if (-not (Test-Port -Port $p)) { continue }
  $pids = Get-ListeningPids -Port $p
  $isOwn = $false
  $detail = @()
  foreach ($pid in $pids) {
    $pname = 'unknown'
    try { $pr = Get-Process -Id $pid -ErrorAction SilentlyContinue; if ($pr) { $pname = $pr.ProcessName } } catch { }
    $detail += ("PID={0} ({1})" -f $pid, $pname)
    if ($ownPid -and $pid -eq $ownPid) { $isOwn = $true }
    try {
      $cim = Get-CimInstance -ClassName Win32_Process -Filter "ProcessId = $pid" -ErrorAction SilentlyContinue
      if ($cim -and $cim.CommandLine -and $cim.CommandLine -like "*$Root*") { $isOwn = $true }
    } catch { }
  }
  $detailStr = if ($detail.Count -gt 0) { $detail -join ', ' } else { 'unknown process' }
  if ($isOwn) {
    Write-Host ("FATAL: port $p already in use by THIS project's previous run. Run stop-local first, then retry. (see logs/local-all.pid)")
  } else {
    Write-Host ("FATAL: port $p already in use. Holder: $detailStr. Free it (Stop-Process -Id <pid> -Force) or change the port (set PORT / edit vite config) before starting.")
  }
  $portsFail = $true
}
if ($portsFail) { exit 1 }




$logDir = Join-Path $Root 'logs'



if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Force -Path $logDir | Out-Null }



$outLog = Join-Path $logDir 'local-all.out.log'



$errLog = Join-Path $logDir 'local-all.err.log'



$pidFile = Join-Path $logDir 'local-all.pid'



$startJsonl = Join-Path $logDir ("start-local-" + (Get-Date -Format 'yyyyMMdd_HHmmss') + '.jsonl')



$traceId = New-CypTraceId



$startSw = [System.Diagnostics.Stopwatch]::StartNew()



$argList = @($inv.PrefixArgs) + @('local:all')



Write-Host ("Starting: {0} {1} (background)..." -f $inv.FilePath, ($argList -join ' '))



$proc = Start-Process -FilePath $inv.FilePath -ArgumentList $argList -WorkingDirectory $Root -RedirectStandardOutput $outLog -RedirectStandardError $errLog -PassThru -WindowStyle Hidden

$proc.Id | Set-Content -LiteralPath $pidFile -Encoding ascii

# UTF-8 hygiene: strip Start-Process NUL pads / accidental UTF-16 as soon as file exists
# 日志可能仍被子进程占用：失败不阻断启动（生产优先：进程起来 > 即时修日志）
Start-Sleep -Milliseconds 200
try { Repair-CypTextFile -Path $outLog | Out-Null } catch { Write-Host "NOTE: skip repair $outLog ($($_.Exception.Message))" }
try { Repair-CypTextFile -Path $errLog | Out-Null } catch { Write-Host "NOTE: skip repair $errLog ($($_.Exception.Message))" }

Write-Host "Started PID $($proc.Id); logs: $outLog"

# 规范 2.4.1-2：healthcheck_ms 须独立计量（进程拉起 → ready 探针首次通过）
$hcSw = [System.Diagnostics.Stopwatch]::StartNew()



Write-CypJsonl -Path $startJsonl -TraceId $traceId -Fields @{



  step_no = 1; case_id = 'S01-start'; scenario = 'start_local'; endpoint = 'api'



  action = 'spawn'; target = 'pnpm local:all'; result = 'pass'; duration_ms = 0



} | Out-Null



$healthUrl = 'https://127.0.0.1:5170/api/health'


$readyUrl = 'https://127.0.0.1:5170/healthz/ready'


$liveUrl = 'https://127.0.0.1:5170/health/live'


$deadline = (Get-Date).AddSeconds($TimeoutSec)



$ready = $false



$lastErr = 'pending'



$mcpHealthUrl = 'https://127.0.0.1:13175/healthz'
$kmsHealthUrl = 'http://127.0.0.1:12000/kms/v1/health'
$kmsEnabled = [bool]($env:KMS_AUTH_TOKEN -and $env:KMS_AUTH_TOKEN.Trim().Length -gt 0)

Write-Host "Waiting for API ready + MCP healthz + KMS health (timeout ${TimeoutSec}s)..."



while ((Get-Date) -lt $deadline) {



  if ($proc.HasExited) {



    Write-Host "FAIL: local:all exited early (code $($proc.ExitCode)). See $errLog"



    Write-CypJsonl -Path $startJsonl -TraceId $traceId -Fields @{



      step_no = 2; case_id = 'S01-start'; scenario = 'start_local'; endpoint = 'api'



      action = 'assert'; target = 'process'; result = 'fail'; level = 'error'



      error = "exited $($proc.ExitCode)"; duration_ms = [int]$startSw.Elapsed.TotalMilliseconds



    } | Out-Null



    New-CypSupportBundle -Root $Root -Reason 'start-early-exit' -JsonlPath $startJsonl -TimeoutSec 60 | Out-Null



    exit 1



  }



  $r = Invoke-Health -Url $readyUrl -TimeoutSec 3 -RequireSuccessJson


  $h = Invoke-Health -Url $healthUrl -TimeoutSec 3 -RequireSuccessJson


  $l = Invoke-Health -Url $liveUrl -TimeoutSec 3


  $liveOk = $false
  if ($l.Ok -and $l.Body) { $liveOk = [bool]($l.Body -match '"status"\s*:\s*"alive"') }


  $m = Invoke-Health -Url $mcpHealthUrl -TimeoutSec 3 -RequireSuccessJson:$false



  $mcpOk = $false
  if ($m.Ok -and $m.Body) {
    try {
      $mj = $m.Body | ConvertFrom-Json
      $mcpOk = [bool]$mj.ok
    } catch {
      $mcpOk = $m.Body -match '"ok"\s*:\s*true'
    }
  }

  $kmsOk = -not $kmsEnabled
  if ($kmsEnabled) {
    $k = Invoke-Health -Url $kmsHealthUrl -TimeoutSec 2 -RequireSuccessJson:$false
    if ($k.Ok -and $k.Body) {
      try {
        $kj = $k.Body | ConvertFrom-Json
        $kmsOk = ($kj.status -eq 'ok')
      } catch {
        $kmsOk = [bool]($k.Body -match '"status"\s*:\s*"ok"')
      }
    }
  }

  $lastErr = if ($r.Ok -and $h.Ok -and $liveOk -and $mcpOk -and $kmsOk) {
    'ok'
  } elseif (-not $r.Ok) {
    "ready: $($r.Error)"
  } elseif (-not $h.Ok) {
    "health: $($h.Error)"
  } elseif (-not $liveOk) {
    "live: $($l.Error)"
  } elseif (-not $mcpOk) {
    "mcp: $($m.Error)"
  } elseif (-not $kmsOk) {
    "kms: not ready"
  }



  $p5170 = Test-Port -Port 5170
  $p10170 = Test-Port -Port 10170
  $p13175 = Test-Port -Port 13175



  if ($r.Ok -and $h.Ok -and $liveOk -and $mcpOk -and $p5170 -and $p10170 -and $p13175) {



    $ready = $true



    break



  }



  Start-Sleep -Seconds 2



}
# 规范 2.4.1-2：healthcheck_ms 独立计量结束
$hcSw.Stop()



if (-not $ready) {



  Write-Host 'FAIL: services not ready in time.'



  Write-Host "Last probe error: $lastErr"



  Write-Host ("Ports: 5170={0} 10170={1} 13175={2}" -f (Test-Port -Port 5170), (Test-Port -Port 10170), (Test-Port -Port 13175))



  Write-Host "Logs: $outLog / $errLog"



  Write-CypJsonl -Path $startJsonl -TraceId $traceId -Fields @{



    step_no = 2; case_id = 'S01-start'; scenario = 'start_local'; endpoint = 'api'



    action = 'assert'; target = 'ready'; result = 'fail'; level = 'error'



    error = $lastErr; duration_ms = [int]$startSw.Elapsed.TotalMilliseconds



  } | Out-Null



  New-CypSupportBundle -Root $Root -Reason 'start-timeout' -JsonlPath $startJsonl -TimeoutSec 60 | Out-Null



  exit 1



}



$startSw.Stop()

try { Repair-CypTextFile -Path $outLog | Out-Null } catch { Write-Host "NOTE: skip repair $outLog ($($_.Exception.Message))" }
try { Repair-CypTextFile -Path $errLog | Out-Null } catch { Write-Host "NOTE: skip repair $errLog ($($_.Exception.Message))" }
$startTimeObj = @{
  ts                  = (Get-Date).ToUniversalTime().ToString('o')
  host                = $env:COMPUTERNAME
  commit_sha          = (Get-CypCommitSha -Root $Root)
  toolchain_versions  = @{
    node = (& node -v 2>$null)
    os   = [System.Environment]::OSVersion.VersionString
  }
  cold_start_ms       = [int]$startSw.Elapsed.TotalMilliseconds
  warm_start_ms       = 0
  healthcheck_ms      = [int]$hcSw.Elapsed.TotalMilliseconds
  e2e_smoke_ms        = 0
  stages              = @{
    app_boot_ms    = [int]$startSw.Elapsed.TotalMilliseconds
    ready_probe_ms = [int]$hcSw.Elapsed.TotalMilliseconds
  }
  result              = 'success'
  trace_id            = $traceId
}
# 规范 2.4.1-2：超阈值仅 WARN 不阻断（连续 3 次才报警）
if ([int]$startSw.Elapsed.TotalMilliseconds -gt 120000) { Write-Host ("WARN: cold_start_ms=" + [int]$startSw.Elapsed.TotalMilliseconds + " exceeds 120000ms (spec 2.4.1-2).") }
if ([int]$hcSw.Elapsed.TotalMilliseconds -gt 10000) { Write-Host ("WARN: healthcheck_ms=" + [int]$hcSw.Elapsed.TotalMilliseconds + " exceeds 10000ms (spec 2.4.1-2).") }
Write-CypUtf8Text -Path (Join-Path $logDir 'start-time.json') -Value (($startTimeObj | ConvertTo-Json) + "`n")



Write-CypJsonl -Path $startJsonl -TraceId $traceId -Fields @{



  step_no = 2; case_id = 'S01-start'; scenario = 'start_local'; endpoint = 'api'



  action = 'assert'; target = 'ready'; result = 'pass'



  duration_ms = [int]$startSw.Elapsed.TotalMilliseconds



} | Out-Null



Write-Host ''


Write-Host 'Ready.'


# ========== CI03：一服务一端口 · 端口隔离验证 ==========
# CI03-1 端口独立性 + CI03-2 端口段合规 + CI03-3 隔离级别 + CI03-4 服务健康
$ci03Sw = [System.Diagnostics.Stopwatch]::StartNew()
$ci03Pass = 0
$ci03Fail = 0
$ci03Results = @()

function Add-Ci03Result {
  param([string]$Item, [string]$Detail, [bool]$Ok)
  $script:ci03Results += [pscustomobject]@{ Item = $Item; Detail = $Detail; Ok = $Ok }
  if ($Ok) { $script:ci03Pass++ } else { $script:ci03Fail++ }
}

function Get-Ci03BindAddrs {
  param([int]$Port)
  $addrs = New-Object 'System.Collections.Generic.HashSet[string]'
  try {
    $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    foreach ($c in @($conns)) {
      if ($c.LocalAddress) { [void]$addrs.Add($c.LocalAddress.Trim()) }
    }
  } catch { }
  # fallback: netstat
  if ($addrs.Count -eq 0) {
    try {
      $lines = netstat -ano -p tcp 2>$null
      foreach ($line in $lines) {
        if ($line -match ("^\s*TCP\s+(\S+):{0}\s+\S+\s+LISTENING" -f $Port)) {
          [void]$addrs.Add($Matches[1].Trim())
        }
      }
    } catch { }
  }
  return @($addrs)
}

function Test-Ci03IsLoopbackOnly {
  param([int]$Port)
  $addrs = Get-Ci03BindAddrs -Port $Port
  if ($addrs.Count -eq 0) { return @($false, 'no listener', @()) }
  $nonLoopback = @()
  foreach ($a in $addrs) {
    if ($a -ne '127.0.0.1' -and $a -ne '::1' -and $a -ne 'localhost') {
      $isWildcard = ($a -eq '0.0.0.0' -or $a -eq '::' -or $a -eq '[::]' -or $a -eq '*')
      if ($isWildcard -or $a -notmatch '^(127\.|::1)') { $nonLoopback += $a }
    }
  }
  if ($nonLoopback.Count -gt 0) {
    return @($false, ("bound to non-loopback: " + ($nonLoopback -join ',')), $addrs)
  }
  return @($true, ("loopback only (" + ($addrs -join ',') + ")"), $addrs)
}

function Test-Ci03HasExternal {
  param([int]$Port)
  $addrs = Get-Ci03BindAddrs -Port $Port
  if ($addrs.Count -eq 0) { return @($false, 'no listener', @()) }
  $hasExt = $false
  foreach ($a in $addrs) {
    if ($a -eq '0.0.0.0' -or $a -eq '::' -or $a -eq '[::]' -or $a -eq '*') { $hasExt = $true; break }
    if ($a -ne '127.0.0.1' -and $a -ne '::1' -and $a -notmatch '^127\.') { $hasExt = $true; break }
  }
  if ($hasExt) {
    return @($true, ("externally reachable (" + ($addrs -join ',') + ")"), $addrs)
  }
  return @($false, ("loopback only (" + ($addrs -join ',') + ")"), $addrs)
}

# -- CI03-A：端口独立性验证（每个端口对应独立监听器）
Write-Host ''
Write-Host '-- CI03-A 端口独立性验证 --'
$portDefs = @(
  @{ Port = 5170;  Name = '产品统一网关'; Layer = 'L3-外部接入'; Segment = '5000-5999';  SegMin = 5000;  SegMax = 5999;  Bind = '0.0.0.0';     IsExternal = $true;  HealthUrl = 'https://127.0.0.1:5170/healthz/ready';     HealthCheck = 'success' },
  @{ Port = 10170; Name = '后端 API 服务'; Layer = 'L2-业务层';   Segment = '10000-10999'; SegMin = 10000; SegMax = 10999; Bind = '127.0.0.1';   IsExternal = $false; HealthUrl = 'https://127.0.0.1:10170/healthz/ready';    HealthCheck = 'success' },
  @{ Port = 13175; Name = 'MCP 旁路服务';   Layer = 'L4-旁路层';   Segment = '13000-13999'; SegMin = 13000; SegMax = 13999; Bind = '127.0.0.1';   IsExternal = $false; HealthUrl = 'https://127.0.0.1:13175/healthz';         HealthCheck = 'ok' },
  @{ Port = 12000; Name = 'KMS 密钥保险箱'; Layer = 'L1-基础设施'; Segment = '12000-12999'; SegMin = 12000; SegMax = 12999; Bind = '127.0.0.1';   IsExternal = $false; HealthUrl = 'http://127.0.0.1:12000/kms/v1/health';     HealthCheck = 'status' }
)

$kmsEnabled = [bool]($env:KMS_AUTH_TOKEN -and $env:KMS_AUTH_TOKEN.Trim().Length -gt 0)
$seenPids = New-Object 'System.Collections.Generic.HashSet[int]'
$portPidMap = @{}

foreach ($pd in $portDefs) {
  $port = $pd.Port
  $name = $pd.Name
  if ($port -eq 12000 -and -not $kmsEnabled) {
    Add-Ci03Result -Item "CI03-A 端口独立性 · $port ($name)" -Detail 'SKIP (KMS 未启用远程模式)' -Ok $true
    continue
  }
  $pids = Get-ListeningPids -Port $port
  if ($pids.Count -eq 0) {
    Add-Ci03Result -Item "CI03-A 端口独立性 · $port ($name)" -Detail 'FAIL (无监听器)' -Ok $false
    continue
  }
  $portPidMap[$port] = $pids
  $newPid = $false
  foreach ($pid in $pids) {
    if (-not $seenPids.Contains($pid)) { $seenPids.Add($pid) | Out-Null; $newPid = $true }
  }
  if ($newPid) {
    Add-Ci03Result -Item "CI03-A 端口独立性 · $port ($name)" -Detail "PASS (独立进程: $($pids -join ','))" -Ok $true
  } else {
    Add-Ci03Result -Item "CI03-A 端口独立性 · $port ($name)" -Detail "WARN (PID 与其他端口共享: $($pids -join ','))" -Ok $true
  }
}

# -- CI03-B：端口段合规性验证
Write-Host ''
Write-Host '-- CI03-B 端口段合规性验证 --'
foreach ($pd in $portDefs) {
  $port = $pd.Port
  $name = $pd.Name
  if ($port -eq 12000 -and -not $kmsEnabled) {
    Add-Ci03Result -Item "CI03-B 端口段合规 · $port ($name)" -Detail 'SKIP (KMS 未启用远程模式)' -Ok $true
    continue
  }
  $inRange = ($port -ge $pd.SegMin -and $port -le $pd.SegMax)
  if ($inRange) {
    Add-Ci03Result -Item "CI03-B 端口段合规 · $port ($name)" -Detail "PASS ($port ∈ $($pd.SegSegment))" -Ok $true
  } else {
    Add-Ci03Result -Item "CI03-B 端口段合规 · $port ($name)" -Detail "FAIL ($port 不在 $($pd.SegSegment) 段内)" -Ok $false
  }
}

# -- CI03-C：隔离级别验证
Write-Host ''
Write-Host '-- CI03-C 隔离级别验证 --'
foreach ($pd in $portDefs) {
  $port = $pd.Port
  $name = $pd.Name
  if ($port -eq 12000 -and -not $kmsEnabled) {
    Add-Ci03Result -Item "CI03-C 隔离级别 · $port ($name)" -Detail 'SKIP (KMS 未启用远程模式)' -Ok $true
    continue
  }
  if ($pd.IsExternal) {
    $result = Test-Ci03HasExternal -Port $port
    $ok = $result[0]
    $detail = $result[1]
    if ($ok) {
      Add-Ci03Result -Item "CI03-C 隔离级别 · $port ($name · $($pd.Layer))" -Detail "PASS ($detail)" -Ok $true
    } else {
      Add-Ci03Result -Item "CI03-C 隔离级别 · $port ($name · $($pd.Layer))" -Detail "FAIL (L3 网关应对外暴露，$detail)" -Ok $false
    }
  } else {
    $result = Test-Ci03IsLoopbackOnly -Port $port
    $ok = $result[0]
    $detail = $result[1]
    if ($ok) {
      Add-Ci03Result -Item "CI03-C 隔离级别 · $port ($name · $($pd.Layer))" -Detail "PASS ($detail)" -Ok $true
    } else {
      Add-Ci03Result -Item "CI03-C 隔离级别 · $port ($name · $($pd.Layer))" -Detail "FAIL (后端服务应仅环回，$detail)" -Ok $false
    }
  }
}

# -- CI03-D：各服务独立健康检查
Write-Host ''
Write-Host '-- CI03-D 服务独立健康检查 --'
foreach ($pd in $portDefs) {
  $port = $pd.Port
  $name = $pd.Name
  if ($port -eq 12000 -and -not $kmsEnabled) {
    Add-Ci03Result -Item "CI03-D 服务健康 · $port ($name)" -Detail 'SKIP (KMS 未启用远程模式)' -Ok $true
    continue
  }
  $h = Invoke-Health -Url $pd.HealthUrl -TimeoutSec 3 -RequireSuccessJson:$false
  $healthOk = $false
  if ($h.Ok -and $h.Body) {
    if ($pd.HealthCheck -eq 'success') {
      $healthOk = [bool]($h.Body -match '"success"\s*:\s*true')
    } elseif ($pd.HealthCheck -eq 'ok') {
      try {
        $mj = $h.Body | ConvertFrom-Json -ErrorAction SilentlyContinue
        $healthOk = [bool]$mj.ok
      } catch {
        $healthOk = [bool]($h.Body -match '"ok"\s*:\s*true')
      }
    } elseif ($pd.HealthCheck -eq 'status') {
      try {
        $kj = $h.Body | ConvertFrom-Json -ErrorAction SilentlyContinue
        $healthOk = ($kj.status -eq 'ok')
      } catch {
        $healthOk = [bool]($h.Body -match '"status"\s*:\s*"ok"')
      }
    }
  }
  if ($healthOk) {
    Add-Ci03Result -Item "CI03-D 服务健康 · $port ($name)" -Detail "PASS ($($pd.HealthUrl) → 200)" -Ok $true
  } else {
    Add-Ci03Result -Item "CI03-D 服务健康 · $port ($name)" -Detail "FAIL ($($pd.HealthUrl) → $($h.Error))" -Ok $false
  }
}

# -- CI03 汇总输出
$ci03Sw.Stop()
Write-Host ''
Write-Host '== CI03 端口隔离验证清单 =='
foreach ($r in $ci03Results) {
  $status = if ($r.Ok) { 'PASS' } else { 'FAIL' }
  $marker = if ($r.Ok) { '  [PASS]' } else '  [FAIL]' }
  if ($r.Detail -match '^SKIP') { $marker = '  [SKIP]' }
  Write-Host ("{0} {1}" -f $marker, $r.Item)
  Write-Host ("         {0}" -f $r.Detail)
}
Write-Host ''
Write-Host ("CI03 汇总: PASS={0} FAIL={1} ({2:N0}ms)" -f $ci03Pass, $ci03Fail, $ci03Sw.ElapsedMilliseconds)

# 写入 JSONL
Write-CypJsonl -Path $startJsonl -TraceId $traceId -Fields @{
  step_no = 3; case_id = 'CI03-port-isolation'; scenario = 'ci03_validation'; endpoint = 'meta'
  action = 'assert'; target = 'ci03_summary'; result = $(if ($ci03Fail -eq 0) { 'pass' } else { 'fail' })
  expected = 'all_pass'; actual = "pass=$ci03Pass fail=$ci03Fail"
  duration_ms = [int]$ci03Sw.ElapsedMilliseconds
} | Out-Null

if ($ci03Fail -gt 0) {
  Write-Host 'FATAL: CI03 端口隔离验证未通过。'
  New-CypSupportBundle -Root $Root -Reason 'ci03-port-isolation-fail' -JsonlPath $startJsonl -TimeoutSec 60 | Out-Null
  exit 1
}

Write-Host 'CI03 验证全部通过。'


# CFG-SYS-06：与 server formatStartupReportLine 同形（禁口令）



$port = if ($env:PORT) { $env:PORT } else { '5170' }



$logLevel = if ($env:LOG_LEVEL) { $env:LOG_LEVEL } else { 'info' }



$tz = if ($env:TZ) { $env:TZ } else { 'Asia/Shanghai' }



$dataDirNote = 'packages/server/data (local; DATA_DIR not injected)'



$advertiseIp = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.IPAddress -notlike '127.*' -and $_.PrefixOrigin -ne 'WellKnown' } |
  Select-Object -ExpandProperty IPAddress -First 1)
if (-not $advertiseIp) { $advertiseIp = '127.0.0.1' }



Write-Host ("[CYP-memo startup] env=prod port={0} dataDir={1} logLevel={2} node=production version=local tz={3}" -f $port, $dataDirNote, $logLevel, $tz)



Write-Host ("  Product  : https://{0}:5170 (产品统一网关 · 静态资源 + API代理 + MCP代理 · TLS)" -f $advertiseIp)



Write-Host ("  Health   : https://{0}:5170/api/health" -f $advertiseIp)



Write-Host ("  Ready    : https://{0}:5170/healthz/ready" -f $advertiseIp)



Write-Host ("  Live     : https://{0}:5170/health/live" -f $advertiseIp)



Write-Host ("  Tenant   : https://{0}:5170/tenant (Owner 十权)" -f $advertiseIp)



Write-Host ("  API      : 127.0.0.1:10170 (后端 API 服务 · 仅环回 · 经网关代理)" -f $advertiseIp)



Write-Host ("  MCP      : https://{0}:5170/mcp (旁路环回同启 · 经产品入口)" -f $advertiseIp)



Write-Host ''



Write-Host '可选热重载（内部工具，非产品入口）: pnpm local:hmr → :5173'



Write-Host ''



Write-Host 'Owner seed: set CYP_BOOTSTRAP_OWNER_PASSWORD in .env for empty-DB seed; leave empty to skip seed and use self-register.'



Write-Host 'Stop with: scripts\stop\stop-local.bat'



exit 0



