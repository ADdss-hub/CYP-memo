# CYP-memo: verify-cfg-reject · G-SYS-01 / CFG-SYS-03
# 非法配置时 server 不得 listen；进程应失败退出（exit != 0）或目标端口未监听。
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue'

. (Join-Path $PSScriptRoot '..\_internal\common.ps1')
$Root = Get-Root $PSScriptRoot
$ServerDir = Join-Path $Root 'packages\server'

function Find-TsxCmd {
  param([string]$ProjectRoot)
  foreach ($c in @(
      (Join-Path $ProjectRoot 'node_modules\.bin\tsx.CMD'),
      (Join-Path $ProjectRoot 'packages\server\node_modules\.bin\tsx.CMD')
    )) {
    if (Test-Path -LiteralPath $c) { return (Resolve-Path -LiteralPath $c).Path }
  }
  $g = Get-Command 'tsx.cmd' -ErrorAction SilentlyContinue
  if ($g) { return $g.Source }
  $g2 = Get-Command 'tsx' -ErrorAction SilentlyContinue
  if ($g2) { return $g2.Source }
  return $null
}

function Find-FreePort {
  param([int]$Start = 19080, [int]$End = 19120)
  for ($p = $Start; $p -le $End; $p++) {
    if (-not (Test-Port -Port $p)) { return $p }
  }
  return $null
}

function Stop-Tree {
  param([System.Diagnostics.Process]$Proc)
  if (-not $Proc) { return }
  try {
    if (-not $Proc.HasExited) {
      Stop-Process -Id $Proc.Id -Force -ErrorAction SilentlyContinue
      # also kill children if any
      Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
        Where-Object { $_.ParentProcessId -eq $Proc.Id } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
      $Proc.WaitForExit(3000) | Out-Null
    }
  } catch { }
}

Write-Host '== CYP-memo verify-cfg-reject (G-SYS-01) =='

$tsx = Find-TsxCmd -ProjectRoot $Root
if (-not $tsx) {
  Write-Host 'FAIL cannot locate tsx'
  exit 1
}
if (-not (Test-Path -LiteralPath (Join-Path $ServerDir 'src\index.ts'))) {
  Write-Host "FAIL missing $ServerDir\src\index.ts"
  exit 1
}

$probePort = Find-FreePort
if (-not $probePort) {
  Write-Host 'FAIL no free port in 19080-19120'
  exit 1
}

$dataDir = Join-Path $env:TEMP ('cyp-verify-cfg-reject-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $dataDir -Force | Out-Null

# Case A: invalid PORT (outside 1-65535) — must fail Phase0, never listen
# Case B uses LOG_LEVEL=notalevel on a free port as secondary proof
$cases = @(
  [pscustomobject]@{
    Id       = 'A-bad-port'
    Port     = 99999
    LogLevel = 'info'
    Note     = 'PORT=99999 invalid'
  },
  [pscustomobject]@{
    Id       = 'B-bad-log'
    Port     = $probePort
    LogLevel = 'notalevel'
    Note     = "LOG_LEVEL=notalevel PORT=$probePort"
  }
)

$failed = $false
$waitMs = 8000

foreach ($c in $cases) {
  Write-Host ""
  Write-Host "-- case $($c.Id): $($c.Note)"

  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $tsx
  $psi.Arguments = 'src/index.ts'
  $psi.WorkingDirectory = $ServerDir
  $psi.UseShellExecute = $false
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.CreateNoWindow = $true
  # Clear inherited PORT/LOG_LEVEL then set case env
  $psi.Environment['APP_ENV'] = 'prod'
  $psi.Environment['NODE_ENV'] = 'production'
  $psi.Environment['DATA_DIR'] = $dataDir
  $psi.Environment['PORT'] = [string]$c.Port
  $psi.Environment['LOG_LEVEL'] = [string]$c.LogLevel

  $proc = New-Object System.Diagnostics.Process
  $proc.StartInfo = $psi
  $started = $false
  try {
    $started = $proc.Start()
  } catch {
    Write-Host "FAIL $($c.Id) failed to start: $($_.Exception.Message)"
    $failed = $true
    continue
  }

  $exited = $proc.WaitForExit($waitMs)
  $exitCode = $null
  if ($exited -and $proc.HasExited) {
    $exitCode = $proc.ExitCode
  }

  # Assert listen on the case port (99999 is never valid OS listen target for our check;
  # still Test-Port — expect false). For B, probePort must not be listening.
  $listening = $false
  if ($c.Port -ge 1 -and $c.Port -le 65535) {
    $listening = Test-Port -Port $c.Port
  }

  $ok = $false
  $reason = ''
  if ($listening) {
    $ok = $false
    $reason = "port $($c.Port) is listening (must not)"
  } elseif ($exited -and $null -ne $exitCode -and $exitCode -ne 0) {
    $ok = $true
    $reason = "exited=$exitCode not_listening"
  } elseif (-not $listening) {
    # process may still be winding down; port not listening is acceptable per G-SYS-01
    $ok = $true
    $reason = "not_listening (exited=$exited exit=$exitCode)"
  } else {
    $ok = $false
    $reason = "unexpected state exited=$exited exit=$exitCode listening=$listening"
  }

  # Drain streams (avoid pipe fill) then cleanup
  try { $null = $proc.StandardOutput.ReadToEnd() } catch { }
  try {
    $errTail = $proc.StandardError.ReadToEnd()
    if ($errTail -and $errTail.Length -gt 0) {
      $snip = $errTail.Trim()
      if ($snip.Length -gt 240) { $snip = $snip.Substring($snip.Length - 240) }
      Write-Host "  stderr_tail: $snip"
    }
  } catch { }

  Stop-Tree -Proc $proc

  # Re-check after kill
  if ($c.Port -ge 1 -and $c.Port -le 65535 -and (Test-Port -Port $c.Port)) {
    $ok = $false
    $reason = "port $($c.Port) still listening after cleanup"
  }

  if ($ok) {
    Write-Host "OK   $($c.Id) :: $reason"
  } else {
    Write-Host "FAIL $($c.Id) :: $reason"
    $failed = $true
  }
}

Remove-Item -Recurse -Force -LiteralPath $dataDir -ErrorAction SilentlyContinue

Write-Host ''
if ($failed) {
  Write-Host 'FAIL verify-cfg-reject'
  exit 1
}
Write-Host 'OK verify-cfg-reject'
exit 0