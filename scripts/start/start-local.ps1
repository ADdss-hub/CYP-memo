# CYP-memo: start local stack（CI02：配置恒为生产基准 APP_ENV=prod）



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



foreach ($p in @(5170, 5173)) {



  if (Test-Port -Port $p) {



    Write-Host "WARN: port $p already in use (will still health-check)."



  }



}



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



Write-CypJsonl -Path $startJsonl -TraceId $traceId -Fields @{



  step_no = 1; case_id = 'S01-start'; scenario = 'start_local'; endpoint = 'api'



  action = 'spawn'; target = 'pnpm local:all'; result = 'pass'; duration_ms = 0



} | Out-Null



$healthUrl = 'http://localhost:5170/api/health'



$readyUrl = 'http://localhost:5170/healthz/ready'



$deadline = (Get-Date).AddSeconds($TimeoutSec)



$ready = $false



$lastErr = 'pending'



Write-Host "Waiting for /healthz/ready + /api/health (timeout ${TimeoutSec}s)..."



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



  $lastErr = if ($r.Ok -and $h.Ok) { 'ok' } elseif (-not $r.Ok) { "ready: $($r.Error)" } else { "health: $($h.Error)" }



  $p5173 = Test-Port -Port 5173



  if ($r.Ok -and $h.Ok -and $p5173) {



    $ready = $true



    break



  }



  Start-Sleep -Seconds 2



}



if (-not $ready) {



  Write-Host 'FAIL: services not ready in time.'



  Write-Host "Last probe error: $lastErr"



  Write-Host ("Ports: 5170={0} 5173={1}" -f (Test-Port -Port 5170), (Test-Port -Port 5173))



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
  cold_start_ms = [int]$startSw.Elapsed.TotalMilliseconds
  trace_id      = $traceId
  ts            = (Get-Date).ToUniversalTime().ToString('o')
  commit        = (Get-CypCommitSha -Root $Root)
}
Write-CypUtf8Text -Path (Join-Path $logDir 'start-time.json') -Value (($startTimeObj | ConvertTo-Json) + "`n")



Write-CypJsonl -Path $startJsonl -TraceId $traceId -Fields @{



  step_no = 2; case_id = 'S01-start'; scenario = 'start_local'; endpoint = 'api'



  action = 'assert'; target = 'ready'; result = 'pass'



  duration_ms = [int]$startSw.Elapsed.TotalMilliseconds



} | Out-Null



Write-Host ''



Write-Host 'Ready.'



# CFG-SYS-06：与 server formatStartupReportLine 同形（禁口令）



$port = if ($env:PORT) { $env:PORT } else { '5170' }



$logLevel = if ($env:LOG_LEVEL) { $env:LOG_LEVEL } else { 'info' }



$tz = if ($env:TZ) { $env:TZ } else { 'Asia/Shanghai' }



$dataDirNote = 'packages/server/data (local; DATA_DIR not injected)'



Write-Host ("[CYP-memo startup] env=prod port={0} dataDir={1} logLevel={2} node=production version=local tz={3}" -f $port, $dataDirNote, $logLevel, $tz)



Write-Host '  App      : http://localhost:5173'



Write-Host '  API      : http://localhost:5170'



Write-Host '  Health   : http://localhost:5170/api/health'



Write-Host '  Ready    : http://localhost:5170/healthz/ready'



Write-Host '  Tenant   : http://localhost:5173/tenant (Owner 十权)'



Write-Host ''



Write-Host 'Owner seed: set CYP_BOOTSTRAP_OWNER_PASSWORD in .env for empty-DB seed; leave empty to skip seed and use self-register.'



Write-Host 'Stop with: scripts\stop\stop-local.bat'



exit 0



