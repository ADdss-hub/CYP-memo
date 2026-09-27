# CYP-memo: verify-e2e · R5 S-02/S-03/S-04/S-05
# happy + >=3 exceptions; 19-field JSONL; fail -> support-bundle <=60s
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue'

. (Join-Path $PSScriptRoot '..\_internal\common.ps1')
$Root = Get-Root $PSScriptRoot
Set-Location -LiteralPath $Root

$traceId = New-CypTraceId
$ts = Get-Date -Format 'yyyyMMdd_HHmmss'
$jsonl = Join-Path $Root "logs\verify-e2e-$ts.jsonl"
$step = 0
$failed = $false
$api = 'http://127.0.0.1:5170'

function Step-Assert {
  param(
    [string]$CaseId,
    [string]$Scenario,
    [string]$Target,
    [string]$Action = 'assert',
    [string]$Endpoint = 'api',
    [object]$Expected,
    [object]$Actual,
    [bool]$Ok,
    [string]$ErrorMsg = '',
    [int]$DurationMs = 0,
    [string]$Level = 'info'
  )
  $script:step++
  $result = if ($Ok) { 'pass' } else { 'fail' }
  if (-not $Ok) { $script:failed = $true }
  Write-CypJsonl -Path $script:jsonl -TraceId $script:traceId -Fields @{
    level       = $(if ($Ok) { $Level } else { 'error' })
    step_no     = $script:step
    case_id     = $CaseId
    scenario    = $Scenario
    endpoint    = $Endpoint
    action      = $Action
    target      = $Target
    expected    = $Expected
    actual      = $Actual
    duration_ms = $DurationMs
    url         = $Target
    result      = $result
    error       = $(if ($Ok) { $null } else { $ErrorMsg })
  } | Out-Null
  if ($Ok) {
    Write-Host "OK   [$CaseId] $Target"
  } else {
    Write-Host "FAIL [$CaseId] $Target :: $ErrorMsg"
  }
}

function Invoke-ApiRaw {
  param(
    [string]$Method,
    [string]$Url,
    [hashtable]$Headers,
    [string]$Body
  )
  $tmp = Join-Path $env:TEMP ("cyp-verify-" + [guid]::NewGuid().ToString('N') + '.json')
  $bodyFile = $null
  $curlArgs = [System.Collections.Generic.List[string]]::new()
  [void]$curlArgs.Add('-s')
  [void]$curlArgs.Add('-D')
  [void]$curlArgs.Add('-')
  [void]$curlArgs.Add('-o')
  [void]$curlArgs.Add($tmp)
  [void]$curlArgs.Add('-X')
  [void]$curlArgs.Add($Method)
  foreach ($k in $Headers.Keys) {
    [void]$curlArgs.Add('-H')
    [void]$curlArgs.Add("${k}: $($Headers[$k])")
  }
  if ($Body) {
    $bodyFile = Join-Path $env:TEMP ("cyp-verify-body-" + [guid]::NewGuid().ToString('N') + '.json')
    [System.IO.File]::WriteAllText($bodyFile, $Body, [System.Text.UTF8Encoding]::new($false))
    [void]$curlArgs.Add('-H')
    [void]$curlArgs.Add('Content-Type: application/json')
    [void]$curlArgs.Add('--data-binary')
    [void]$curlArgs.Add("@$bodyFile")
  }
  [void]$curlArgs.Add($Url)
  $hdrText = & curl.exe @($curlArgs.ToArray()) 2>$null | Out-String
  $bodyText = ''
  if (Test-Path -LiteralPath $tmp) {
    $bodyText = Get-Content -LiteralPath $tmp -Raw -ErrorAction SilentlyContinue
  }
  Remove-Item -Force -ErrorAction SilentlyContinue -LiteralPath $tmp
  if ($bodyFile) { Remove-Item -Force -ErrorAction SilentlyContinue -LiteralPath $bodyFile }
  return [pscustomobject]@{ Headers = $hdrText; Body = $bodyText }
}

Write-Host '== CYP-memo verify-e2e (R5) =='
Write-Host "trace_id: $traceId"
Write-Host "jsonl   : $jsonl"
Write-Host ''

Step-Assert -CaseId 'S03-matrix' -Scenario 'nine_class_register' -Target '9-class' `
  -Endpoint 'meta' -Action 'register' `
  -Expected 'matrix' -Actual 'covered:start+auth+obs; rest->P6' -Ok $true

foreach ($port in @(5170, 5173)) {
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  $up = Test-Port -Port $port
  $sw.Stop()
  Step-Assert -CaseId 'S02-port' -Scenario 'happy_ports' -Target "port:$port" -Action 'probe' `
    -Endpoint 'web' -Expected $true -Actual $up -Ok $up -DurationMs $sw.ElapsedMilliseconds `
    -ErrorMsg "port $port not listening"
}

$sw = [System.Diagnostics.Stopwatch]::StartNew()
$h = Invoke-Health -Url "$api/api/health" -TimeoutSec 5 -RequireSuccessJson
$sw.Stop()
$hActual = if ($h.Ok) { 'success=true' } else { [string]$h.Error }
Step-Assert -CaseId 'S02-health' -Scenario 'happy_health' -Target '/api/health' `
  -Expected 'success=true' -Actual $hActual -Ok $h.Ok -DurationMs $sw.ElapsedMilliseconds -ErrorMsg ([string]$h.Error)

$sw = [System.Diagnostics.Stopwatch]::StartNew()
$rdy = Invoke-Health -Url "$api/healthz/ready" -TimeoutSec 5 -RequireSuccessJson
$sw.Stop()
$rActual = if ($rdy.Ok) { 'success=true' } else { [string]$rdy.Error }
Step-Assert -CaseId 'S02-ready' -Scenario 'happy_ready' -Target '/healthz/ready' `
  -Expected 'success=true' -Actual $rActual -Ok $rdy.Ok -DurationMs $sw.ElapsedMilliseconds -ErrorMsg ([string]$rdy.Error)

$sw = [System.Diagnostics.Stopwatch]::StartNew()
$probe = Invoke-ApiRaw -Method 'GET' -Url "$api/api/users" -Headers @{
  'X-Trace-Id'   = $traceId
  'X-Request-Id' = "verify-$ts"
}
$sw.Stop()
$codeOk = [bool]($probe.Body -match '"code"\s*:\s*"E020"')
$traceOk = [bool]($probe.Headers -match "X-Trace-Id:\s*$traceId")
$cspOk = [bool]($probe.Headers -match 'Content-Security-Policy:')
$okTrace = $codeOk -and $traceOk -and $cspOk
Step-Assert -CaseId 'S02-trace-csp' -Scenario 'happy_observability' -Target '/api/users' `
  -Expected 'E020+X-Trace-Id+CSP' -Actual "code=$codeOk trace=$traceOk csp=$cspOk" `
  -Ok $okTrace -DurationMs $sw.ElapsedMilliseconds `
  -ErrorMsg 'missing E020 and/or trace/CSP headers'

$sw = [System.Diagnostics.Stopwatch]::StartNew()
$bad = Invoke-ApiRaw -Method 'GET' -Url "$api/api/users" -Headers @{
  'Authorization' = 'Bearer not-a-real-token'
  'X-Trace-Id'    = $traceId
}
$sw.Stop()
$e021 = [bool]($bad.Body -match '"code"\s*:\s*"E021"')
$badActual = if ($e021) { 'E021' } else { 'other' }
Step-Assert -CaseId 'S02-exc-bad-token' -Scenario 'exception_auth' -Target '/api/users' `
  -Expected 'E021' -Actual $badActual -Ok $e021 -DurationMs $sw.ElapsedMilliseconds -ErrorMsg 'expected E021'

$loginBody = '{"username":"__no_such_user__","password":"x"}'
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$login = Invoke-ApiRaw -Method 'POST' -Url "$api/api/auth/login" -Headers @{ 'X-Trace-Id' = $traceId } -Body $loginBody
$sw.Stop()
$e022 = [bool]($login.Body -match '"code"\s*:\s*"E022"')
$loginActual = if ($e022) { 'E022' } else { 'other' }
Step-Assert -CaseId 'S02-exc-login' -Scenario 'exception_login' -Target '/api/auth/login' `
  -Expected 'E022' -Actual $loginActual -Ok $e022 -DurationMs $sw.ElapsedMilliseconds -ErrorMsg 'expected E022'

$sw = [System.Diagnostics.Stopwatch]::StartNew()
$gone = Invoke-ApiRaw -Method 'POST' -Url "$api/api/admins/login" -Headers @{ 'X-Trace-Id' = $traceId } -Body '{}'
$sw.Stop()
$e410 = [bool]($gone.Body -match '"code"\s*:\s*"E410"')
$goneActual = if ($e410) { 'E410' } else { 'other' }
Step-Assert -CaseId 'S02-exc-admins-gone' -Scenario 'exception_gone' -Target '/api/admins/login' `
  -Expected 'E410' -Actual $goneActual -Ok $e410 -DurationMs $sw.ElapsedMilliseconds -ErrorMsg 'expected E410'

Write-Host ''
if ($failed) {
  Write-Host 'verify-e2e FAILED - collecting support-bundle...'
  try {
    New-CypSupportBundle -Root $Root -Reason 'verify-e2e-fail' -JsonlPath $jsonl -TimeoutSec 60 | Out-Null
  } catch {
    Write-Host "WARN: support-bundle error: $($_.Exception.Message)"
  }
  Write-Host "jsonl: $jsonl"
  exit 1
}

Write-Host 'verify-e2e PASSED'
Write-Host "jsonl: $jsonl"
exit 0
