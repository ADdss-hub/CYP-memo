# Shared helpers for CYP-memo one-click scripts (dot-source only).
# Do not run this file directly.

Set-StrictMode -Version Latest

# UTF-8 session + safe writers (root-cause control for Windows mojibake)
. (Join-Path $PSScriptRoot 'encoding-utf8.ps1')

# 本机自签 HTTPS（R-TLS-001）：联调探针跳过证书校验；仅限本机脚本
$script:CypInsecureHttpsArmed = $false
function Enable-CypInsecureLocalHttps {
  if ($script:CypInsecureHttpsArmed) { return }
  try {
    # .NET Framework / PS 5.1：CertificatePolicy 比 ValidationCallback 更稳
    if (-not ([System.Management.Automation.PSTypeName]'CypTrustAllCerts').Type) {
      Add-Type -TypeDefinition @"
using System.Net;
using System.Security.Cryptography.X509Certificates;
public class CypTrustAllCerts : ICertificatePolicy {
  public bool CheckValidationResult(ServicePoint sp, X509Certificate certificate, WebRequest request, int certificateProblem) {
    return true;
  }
}
"@ -ErrorAction SilentlyContinue
    }
    if ([System.Management.Automation.PSTypeName]'CypTrustAllCerts'.Type) {
      [System.Net.ServicePointManager]::CertificatePolicy = New-Object CypTrustAllCerts
    }
    [System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }
    [System.Net.ServicePointManager]::SecurityProtocol = (
      [System.Net.SecurityProtocolType]::Tls12 -bor 3072
    )
  } catch { }
  $script:CypInsecureHttpsArmed = $true
}

. (Join-Path $PSScriptRoot 'cyp-https-api.ps1')

function Get-Root {
  param([string]$StartPath = $PSScriptRoot)
  $dir = $StartPath
  while ($dir) {
    $pkg = Join-Path $dir 'package.json'
    if (Test-Path -LiteralPath $pkg) {
      return (Resolve-Path -LiteralPath $dir).Path
    }
    $parent = Split-Path -Parent $dir
    if (-not $parent -or $parent -eq $dir) { break }
    $dir = $parent
  }
  $fallback = Resolve-Path (Join-Path $PSScriptRoot '..\..') -ErrorAction SilentlyContinue
  if ($fallback) { return $fallback.Path }
  throw "Cannot locate project root (package.json) from $StartPath"
}

function Test-Port {
  param(
    [Parameter(Mandatory = $true)][int]$Port,
    [string]$HostName = '127.0.0.1'
  )
  $hosts = @($HostName, '127.0.0.1', '::1', 'localhost') | Select-Object -Unique
  foreach ($h in $hosts) {
    try {
      $client = New-Object System.Net.Sockets.TcpClient
      $iar = $client.BeginConnect($h, $Port, $null, $null)
      $ok = $iar.AsyncWaitHandle.WaitOne(800, $false)
      if (-not $ok) { $client.Close(); continue }
      $client.EndConnect($iar) | Out-Null
      $client.Close()
      return $true
    } catch {
      # try next host
    }
  }
  # Windows: Vite often binds ::1 only; TcpClient to ::1 may fail — fall back to LISTEN table
  $pids = Get-ListeningPids -Port $Port
  if ($pids -and $pids.Count -gt 0) { return $true }
  return $false
}

function Invoke-Health {
  param(
    [Parameter(Mandatory = $true)][string]$Url,
    [int]$TimeoutSec = 5,
    [switch]$RequireSuccessJson
  )
  try {
    if ($Url -match '^https://') { Enable-CypInsecureLocalHttps }
    $resp = $null
    try {
      $resp = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec $TimeoutSec -ErrorAction Stop
    } catch {
      # PS5.1 自签偶发「连接已关闭」：curl -k 兜底
      if ($Url -match '^https://' -and (Get-Command curl.exe -ErrorAction SilentlyContinue)) {
        $tmp = [System.IO.Path]::GetTempFileName()
        $code = 0
        try {
          & curl.exe -k -fsS --max-time $TimeoutSec -o $tmp -w '%{http_code}' $Url 2>$null | ForEach-Object { $code = [int]$_ }
        } catch { $code = 0 }
        if ($code -ge 200 -and $code -lt 300 -and (Test-Path -LiteralPath $tmp)) {
          $body = [System.IO.File]::ReadAllText($tmp)
          Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
          if ($RequireSuccessJson) {
            $json = $body | ConvertFrom-Json -ErrorAction Stop
            if (-not $json.success) {
              return [pscustomobject]@{ Ok = $false; StatusCode = $code; Body = $body; Error = 'JSON success != true' }
            }
          }
          return [pscustomobject]@{ Ok = $true; StatusCode = $code; Body = $body; Error = $null }
        }
        Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
      }
      throw
    }
    if ($resp.StatusCode -lt 200 -or $resp.StatusCode -ge 300) {
      return [pscustomobject]@{ Ok = $false; StatusCode = [int]$resp.StatusCode; Body = $resp.Content; Error = "HTTP $($resp.StatusCode)" }
    }
    $body = $resp.Content
    if ($RequireSuccessJson) {
      $json = $body | ConvertFrom-Json -ErrorAction Stop
      if (-not $json.success) {
        return [pscustomobject]@{ Ok = $false; StatusCode = [int]$resp.StatusCode; Body = $body; Error = 'JSON success != true' }
      }
    }
    return [pscustomobject]@{ Ok = $true; StatusCode = [int]$resp.StatusCode; Body = $body; Error = $null }
  } catch {
    return [pscustomobject]@{ Ok = $false; StatusCode = 0; Body = $null; Error = $_.Exception.Message }
  }
}

function Get-ListeningPids {
  param([Parameter(Mandatory = $true)][int]$Port)
  $set = New-Object 'System.Collections.Generic.HashSet[int]'
  try {
    $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    foreach ($c in @($conns)) {
      if ($c.OwningProcess -and $c.OwningProcess -gt 0) { [void]$set.Add([int]$c.OwningProcess) }
    }
  } catch { }
  if ($set.Count -eq 0) {
    try {
      $lines = netstat -ano -p tcp 2>$null
      foreach ($line in $lines) {
        if ($line -match ("^\s*TCP\s+\S+:{0}\s+\S+\s+LISTENING\s+(\d+)\s*$" -f $Port)) {
          [void]$set.Add([int]$Matches[1])
        }
      }
    } catch { }
  }
  return @($set)
}

function Test-CommandExists {
  param([string]$Name)
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

# Returns hashtable: FilePath, PrefixArgs (array), Display
function Get-PnpmInvoker {
  param([string]$ProjectRoot)

  $cmd = Get-Command 'pnpm.cmd' -ErrorAction SilentlyContinue
  if ($cmd) {
    return @{ FilePath = $cmd.Source; PrefixArgs = @(); Display = $cmd.Source }
  }
  $cmd2 = Get-Command 'pnpm' -ErrorAction SilentlyContinue
  if ($cmd2) {
    return @{ FilePath = $cmd2.Source; PrefixArgs = @(); Display = $cmd2.Source }
  }

  if ($ProjectRoot) {
    $localCmd = Join-Path $ProjectRoot 'node_modules\.bin\pnpm.CMD'
    if (Test-Path -LiteralPath $localCmd) {
      return @{ FilePath = $localCmd; PrefixArgs = @(); Display = $localCmd }
    }
    $localPs1 = Join-Path $ProjectRoot 'node_modules\.bin\pnpm.ps1'
    if (Test-Path -LiteralPath $localPs1) {
      return @{ FilePath = 'powershell.exe'; PrefixArgs = @('-NoProfile','-ExecutionPolicy','Bypass','-File', $localPs1); Display = $localPs1 }
    }
  }

  $core = Get-Command 'corepack.cmd' -ErrorAction SilentlyContinue
  if (-not $core) { $core = Get-Command 'corepack' -ErrorAction SilentlyContinue }
  if ($core) {
    return @{ FilePath = $core.Source; PrefixArgs = @('pnpm'); Display = "corepack pnpm ($($core.Source))" }
  }

  return $null
}

function Get-PnpmCmd {
  # Back-compat alias used by diagnose: returns display path or null
  $inv = Get-PnpmInvoker -ProjectRoot (Get-Root $PSScriptRoot)
  if (-not $inv) { return $null }
  return $inv.Display
}


# CI01: shared inject keys for start / compose / desktop
$script:CypInjectKeys = @(
  "PORT", "LOG_LEVEL", "TZ", "DATA_DIR",
  "CYP_BOOTSTRAP_OWNER_PASSWORD",
  "VITE_API_BASE", "VITE_API_PROXY_TARGET",
  "KMS_PORT", "KMS_AUTH_TOKEN", "CYP_KMS_REMOTE", "CYP_KMS_MASTER_KEY"
)

function Get-CypInjectKeys {
  return @($script:CypInjectKeys)
}

function New-CypTraceId {
  return ([guid]::NewGuid().ToString("N"))
}

function New-CypSpanId {
  return ([guid]::NewGuid().ToString("N").Substring(0, 16))
}

function Get-CypCommitSha {
  param([string]$Root)
  try {
    Push-Location -LiteralPath $Root
    $sha = (& git rev-parse --short HEAD 2>$null)
    if ($sha) { return ($sha.Trim()) }
  } catch {
  } finally {
    Pop-Location -ErrorAction SilentlyContinue
  }
  return "nogit"
}

# R5 S-04: one JSONL row with 19 fields (P2 section 2.6)
function Write-CypJsonl {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][hashtable]$Fields,
    [string]$TraceId,
    [string]$ParentSpanId
  )
  $fTrace = $Fields["trace_id"]
  $fSpan = $Fields["span_id"]
  $fParent = $Fields["parent_span_id"]
  $tid = if ($TraceId) { $TraceId } elseif ($fTrace) { [string]$fTrace } else { New-CypTraceId }
  $sid = if ($fSpan) { [string]$fSpan } else { New-CypSpanId }
  $parent = if ($ParentSpanId) { $ParentSpanId } elseif ($fParent) { $fParent } else { $null }

  $tsVal = $Fields["ts"]
  if (-not $tsVal) { $tsVal = (Get-Date).ToUniversalTime().ToString("o") }
  $levelVal = $Fields["level"]; if (-not $levelVal) { $levelVal = "info" }
  $stepVal = 0
  if ($null -ne $Fields["step_no"]) { $stepVal = [int]$Fields["step_no"] }
  $caseVal = $Fields["case_id"]; if (-not $caseVal) { $caseVal = "unknown" }
  $scenVal = $Fields["scenario"]; if (-not $scenVal) { $scenVal = "default" }
  $epVal = $Fields["endpoint"]; if (-not $epVal) { $epVal = "api" }
  $actVal = $Fields["action"]; if (-not $actVal) { $actVal = "assert" }
  $tgtVal = $Fields["target"]; if (-not $tgtVal) { $tgtVal = "" }
  $valVal = $null; if ($null -ne $Fields["value"]) { $valVal = $Fields["value"] }
  $expVal = $null; if ($null -ne $Fields["expected"]) { $expVal = $Fields["expected"] }
  $actlVal = $null; if ($null -ne $Fields["actual"]) { $actlVal = $Fields["actual"] }
  $durVal = 0; if ($null -ne $Fields["duration_ms"]) { $durVal = [int]$Fields["duration_ms"] }
  $urlVal = $Fields["url"]
  $shotVal = $Fields["screenshot"]
  $roleVal = $Fields["user_role"]
  $resVal = $Fields["result"]; if (-not $resVal) { $resVal = "pass" }
  $errVal = $Fields["error"]

  if ($valVal -is [string] -and $valVal -match "(?i)password|passwd|secret|token") {
    $valVal = "***"
  }

  $row = [ordered]@{}
  $row["ts"] = $tsVal
  $row["level"] = $levelVal
  $row["step_no"] = $stepVal
  $row["case_id"] = $caseVal
  $row["scenario"] = $scenVal
  $row["endpoint"] = $epVal
  $row["action"] = $actVal
  $row["target"] = $tgtVal
  $row["value"] = $valVal
  $row["expected"] = $expVal
  $row["actual"] = $actlVal
  $row["duration_ms"] = $durVal
  $row["url"] = $urlVal
  $row["screenshot"] = $shotVal
  $row["trace_id"] = $tid
  $row["span_id"] = $sid
  $row["parent_span_id"] = $parent
  $row["user_role"] = $roleVal
  $row["result"] = $resVal
  $row["error"] = $errVal

  $dir = Split-Path -Parent $Path
  if ($dir -and -not (Test-Path -LiteralPath $dir)) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
  }
  $json = ($row | ConvertTo-Json -Compress -Depth 6)
  Write-CypUtf8Text -Path $Path -Value ($json + "`n") -Append
  return $tid
}

function New-CypSupportBundle {
  param(
    [Parameter(Mandatory = $true)][string]$Root,
    [string]$Reason = "verify-fail",
    [string]$JsonlPath,
    [int]$TimeoutSec = 60
  )
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  $sha = Get-CypCommitSha -Root $Root
  $ts = Get-Date -Format "yyyyMMdd_HHmmss"
  $outRoot = Join-Path $Root "support-bundles\$sha"
  if (-not (Test-Path -LiteralPath $outRoot)) {
    New-Item -ItemType Directory -Force -Path $outRoot | Out-Null
  }
  $stage = Join-Path $env:TEMP "cyp-memo-bundle-$ts"
  if (Test-Path -LiteralPath $stage) { Remove-Item -Recurse -Force -LiteralPath $stage }
  New-Item -ItemType Directory -Force -Path $stage | Out-Null

  try {
    # meta 行列表，后续收集过程中追加，归档前统一写入 META.txt
    $metaLines = [System.Collections.Generic.List[string]]::new()
    $metaLines.Add("reason=$Reason")
    $metaLines.Add(("ts=" + (Get-Date).ToUniversalTime().ToString("o")))
    $metaLines.Add("commit=$sha")
    $metaLines.Add("root=$Root")

    $envInfo = [ordered]@{}
    $envInfo["os"] = [System.Environment]::OSVersion.VersionString
    $envInfo["ps"] = "$($PSVersionTable.PSVersion)"
    if (Test-CommandExists "node") { $envInfo["node"] = (& node -v) } else { $envInfo["node"] = "MISSING" }
    $envInfo["cwd"] = "$Root"
    $ports = @{}
    $ports["5170"] = (Test-Port -Port 5170)
    $ports["5173"] = (Test-Port -Port 5173)
    $envInfo["ports"] = $ports
    Write-CypUtf8Text -Path (Join-Path $stage "env.json") -Value (($envInfo | ConvertTo-Json -Depth 5) + "`n")

    $h = Invoke-Health -Url "https://127.0.0.1:5170/api/health" -TimeoutSec 3 -RequireSuccessJson
    $r = Invoke-Health -Url "https://127.0.0.1:5170/healthz/ready" -TimeoutSec 3 -RequireSuccessJson
    $snap = @{ health = $h; ready = $r }
    Write-CypUtf8Text -Path (Join-Path $stage "health-snapshot.json") -Value (($snap | ConvertTo-Json -Depth 6) + "`n")

    # ---- Nomad 环境信息（若检测到 Nomad 则收集） ----
    $isNomadEnv = $false
    if ($env:NOMAD_ALLOC_ID -or $env:NOMAD_JOB_NAME -or (Test-CommandExists "nomad")) {
      $isNomadEnv = $true
      $nomadDir = Join-Path $stage "nomad"
      New-Item -ItemType Directory -Force -Path $nomadDir | Out-Null

      # 1. Nomad 环境变量（脱敏）
      $nomadEnv = @{}
      foreach ($k in @("NOMAD_ALLOC_ID","NOMAD_JOB_NAME","NOMAD_GROUP_NAME","NOMAD_TASK_NAME",
                       "NOMAD_NAMESPACE","NOMAD_REGION","NOMAD_DC","NOMAD_ALLOC_INDEX",
                       "NOMAD_CPU_LIMIT","NOMAD_MEMORY_LIMIT","NOMAD_PORT_api",
                       "NOMAD_PORT_mcp","NOMAD_PORT_http","NOMAD_META_version")) {
        if ($env:$k) { $nomadEnv[$k] = $env:$k }
      }
      Write-CypUtf8Text -Path (Join-Path $nomadDir "env.json") -Value (($nomadEnv | ConvertTo-Json -Depth 3) + "`n")

      # 2. 收集 deploy/nomad/ 下的 job spec 文件
      $nomadSpecDir = Join-Path $Root "deploy\nomad"
      if (Test-Path -LiteralPath $nomadSpecDir) {
        $specCopyDir = Join-Path $nomadDir "specs"
        New-Item -ItemType Directory -Force -Path $specCopyDir | Out-Null
        Get-ChildItem -LiteralPath $nomadSpecDir -Filter "*.nomad" -ErrorAction SilentlyContinue |
          ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $specCopyDir $_.Name) -Force }
      }

      # 3. 如果 nomad CLI 可用，查询 job / alloc 状态（非阻塞，失败则跳过）
      if (Test-CommandExists "nomad") {
        try {
          $jobStatus = & nomad job status -json cyp-memo 2>$null
          if ($jobStatus) {
            Write-CypUtf8Text -Path (Join-Path $nomadDir "job-status.json") -Value ($jobStatus -join "`n")
          }
        } catch { }

        if ($env:NOMAD_ALLOC_ID) {
          try {
            $allocStatus = & nomad alloc status -json $env:NOMAD_ALLOC_ID 2>$null
            if ($allocStatus) {
              Write-CypUtf8Text -Path (Join-Path $nomadDir "alloc-status.json") -Value ($allocStatus -join "`n")
            }
          } catch { }
        }
      }

      # 4. Consul 服务目录（若 consul CLI 可用）
      if (Test-CommandExists "consul") {
        try {
          $svcList = & consul catalog services 2>$null
          if ($svcList) {
            Write-CypUtf8Text -Path (Join-Path $nomadDir "consul-services.txt") -Value ($svcList -join "`n")
          }
        } catch { }
      }

      # 更新 meta
      $metaLines.Add("nomad=1")
      $metaLines.Add("nomad_job=$($env:NOMAD_JOB_NAME ?? 'n/a')")
      $metaLines.Add("nomad_alloc=$($env:NOMAD_ALLOC_ID ?? 'n/a')")
    } else {
      $metaLines.Add("nomad=0")
    }

    $logDir = Join-Path $Root "logs"
    if (Test-Path -LiteralPath $logDir) {
      $copyLogs = Join-Path $stage "logs"
      New-Item -ItemType Directory -Force -Path $copyLogs | Out-Null
      Get-ChildItem -LiteralPath $logDir -File -ErrorAction SilentlyContinue |
        Where-Object { $_.Length -lt 5MB } |
        ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $copyLogs $_.Name) -Force }
    }
    if ($JsonlPath -and (Test-Path -LiteralPath $JsonlPath)) {
      Copy-Item -LiteralPath $JsonlPath -Destination (Join-Path $stage (Split-Path -Leaf $JsonlPath)) -Force
    }

    Get-ChildItem -LiteralPath $stage -Recurse -File -ErrorAction SilentlyContinue | ForEach-Object {
      if ($_.Extension -match "\.(log|txt|json|jsonl)$" -and $_.Length -lt 2MB) {
        try {
          $c = Get-Content -LiteralPath $_.FullName -Raw -ErrorAction Stop
          $c2 = $c -replace "(?i)(`"?(?:password|passwd|token|authorization|apikey|secret)`"?\s*[:=]\s*)`"[^`"]*`"", "`$1`"***`""
          if ($c2 -ne $c) {
            Write-CypUtf8Text -Path $_.FullName -Value $c2
            Repair-CypTextFile -Path $_.FullName | Out-Null
          }
        } catch { }
      }
    }

    # ---- 写入 META.txt（所有 meta 信息收集完毕后统一写入） ----
    $metaContent = $metaLines -join "`n"
    Set-Content -LiteralPath (Join-Path $stage "META.txt") -Value $metaContent -Encoding utf8
    Repair-CypTextFile -Path (Join-Path $stage "META.txt") | Out-Null

    $hashLines = New-Object System.Collections.Generic.List[string]
    Get-ChildItem -LiteralPath $stage -Recurse -File | ForEach-Object {
      $rel = $_.FullName.Substring($stage.Length).TrimStart([char]92, [char]47)
      $hash = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
      [void]$hashLines.Add("$hash  $rel")
    }
    ($hashLines -join "`n") | Set-Content -LiteralPath (Join-Path $stage "MANIFEST.sha256") -Encoding ascii

    $archiveName = "support-bundle-$sha-$ts.tar.gz"
    $archivePath = Join-Path $outRoot $archiveName
    $tar = Get-Command "tar.exe" -ErrorAction SilentlyContinue
    if (-not $tar) { $tar = Get-Command "tar" -ErrorAction SilentlyContinue }
    if ($tar) {
      & $tar.Source -czf $archivePath -C $stage .
    } else {
      $zipPath = Join-Path $outRoot ("support-bundle-$sha-$ts.zip")
      Compress-Archive -Path (Join-Path $stage "*") -DestinationPath $zipPath -Force
      $archivePath = $zipPath
    }

    Get-ChildItem -LiteralPath $outRoot -File |
      Sort-Object LastWriteTime -Descending |
      Select-Object -Skip 30 |
      Remove-Item -Force -ErrorAction SilentlyContinue

    $sw.Stop()
    if ($sw.Elapsed.TotalSeconds -gt $TimeoutSec) {
      Write-Host "WARN: support-bundle took $([int]$sw.Elapsed.TotalSeconds)s (> ${TimeoutSec}s budget)"
    } else {
      Write-Host ("OK   support-bundle in {0:N1}s: {1}" -f $sw.Elapsed.TotalSeconds, $archivePath)
    }
    return $archivePath
  } finally {
    if (Test-Path -LiteralPath $stage) {
      Remove-Item -Recurse -Force -LiteralPath $stage -ErrorAction SilentlyContinue
    }
  }
}
