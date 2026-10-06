# CYP-memo gate_token 签发器（Windows PowerShell）· 规范 3.1.1
# 与 issue-gate-token.sh 逻辑等价（三平台等价）
# 落盘：logs/gate-tokens/YYYY-MM-DD.jsonl

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot '..\_internal\common.ps1')
$Root = Get-Root $PSScriptRoot
Set-Location -LiteralPath $Root

$GateDir = Join-Path $Root 'logs\gate-tokens'
$ArchiveDir = Join-Path $GateDir '_archive'
foreach ($d in @($GateDir, $ArchiveDir)) {
  if (-not (Test-Path -LiteralPath $d)) { New-Item -ItemType Directory -Force -Path $d | Out-Null }
}
$TsFile = Join-Path $GateDir ((Get-Date -Format 'yyyy-MM-dd') + '.jsonl')
$RetentionDays = if ($env:CYP_GATE_RETENTION_DAYS) { [int]$env:CYP_GATE_RETENTION_DAYS } else { 180 }

function New-CypRandomHex { param([int]$Bytes = 16)
  $b = New-Object byte[] $Bytes
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  return (($b | ForEach-Object { $_.ToString('x2') }) -join '')
}

function Get-CypSha256OfText { param([string]$Text)
  $sha = [System.Security.Cryptography.SHA256]::Create()
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($Text)
  return (($sha.ComputeHash($bytes) | ForEach-Object { $_.ToString('x2') }) -join '')
}

function Test-ReferenceChain {
  param([string]$Level)
  $files = @(Get-ChildItem -LiteralPath $GateDir -Filter '*.jsonl' -File -ErrorAction SilentlyContinue)
  $levels = @()
  foreach ($f in $files) {
    foreach ($line in @(Get-Content -LiteralPath $f.FullName -Encoding UTF8 -ErrorAction SilentlyContinue)) {
      if (-not $line) { continue }
      try { $o = $line | ConvertFrom-Json } catch { continue }
      if ($o.PSObject.Properties.Name -contains 'level' -and -not ($o.PSObject.Properties.Name -contains 'event')) {
        $levels += [string]$o.level
      }
    }
  }
  $need = switch ($Level) {
    'merge'   { @() }
    'qa'      { @('merge') }
    'staging' { @('merge', 'qa') }
    'prod'    { @('merge', 'qa', 'staging') }
    default   { @() }
  }
  foreach ($n in $need) {
    if ($levels -notcontains $n) {
      Write-Host "FAIL: level=$Level requires a prior $n token (3.1.1-4)" -ForegroundColor Red
      exit 3
    }
  }
}

function Invoke-Issue {
  param([string]$Level, [string]$Payload, [int]$ExpiresMin = 120)
  if (-not $Level -or -not $Payload) { Write-Host 'FAIL: --level/--payload required' -ForegroundColor Red; exit 2 }
  if (@('merge', 'qa', 'staging', 'prod') -notcontains $Level) { Write-Host "FAIL: bad level '$Level'" -ForegroundColor Red; exit 2 }

  Test-ReferenceChain -Level $Level

  $commit = Get-CypCommitSha -Root $Root
  $gateId = "gate.$Level.$(Get-Date -Format 'yyyyMMddHHmmss')"
  $digest = Get-CypSha256OfText -Text $Payload
  $token = New-CypRandomHex
  $issued = (Get-Date).ToUniversalTime().ToString('o')
  $expires = (Get-Date).ToUniversalTime().AddMinutes($ExpiresMin).ToString('o')

  $tokenPath = Join-Path $GateDir ".current.$Level.token"
  Write-CypUtf8Text -Path $tokenPath -Value $token

  $row = [ordered]@{
    ts             = $issued
    gate_id        = $gateId
    level          = $Level
    commit_sha     = $commit
    sha256         = $digest
    issuer         = 'issue-gate-token.ps1'
    issued_at      = $issued
    expires_at     = $expires
    signer         = 'local-dev'
    payload_digest = $digest
  }
  Write-CypUtf8Text -Path $TsFile -Value (($row | ConvertTo-Json -Compress) + "`n") -Append

  Write-Host 'OK   gate_token issued'
  Write-Host "  gate_id    : $gateId"
  Write-Host "  level      : $Level"
  Write-Host "  commit_sha : $commit"
  Write-Host "  sha256     : $digest"
  Write-Host "  expires_at : $expires"
  Write-Host "  token_file : logs/gate-tokens/.current.$Level.token"
  Write-Host "  audit      : $TsFile"
}

function Invoke-Verify {
  param([string]$TokenFile, [string]$Level)
  if (-not $TokenFile -or -not (Test-Path -LiteralPath $TokenFile)) {
    Write-Host "FAIL: token file missing: $TokenFile" -ForegroundColor Red; exit 2
  }
  $expected = (Get-Content -LiteralPath $TokenFile -Raw -Encoding UTF8).Trim()
  if (-not $expected) { Write-Host 'FAIL: empty token' -ForegroundColor Red; exit 3 }

  $lvl = $Level
  if (-not $lvl) {
    if ($TokenFile -match '\.current\.([a-z]+)\.token') { $lvl = $Matches[1] }
  }
  if (-not $lvl) { Write-Host 'FAIL: cannot infer level; pass --level' -ForegroundColor Red; exit 2 }

  $record = $null
  $files = @(Get-ChildItem -LiteralPath $GateDir -Filter '*.jsonl' -File -ErrorAction SilentlyContinue |
    Sort-Object Name)
  foreach ($f in $files) {
    foreach ($line in @(Get-Content -LiteralPath $f.FullName -Encoding UTF8 -ErrorAction SilentlyContinue)) {
      if (-not $line) { continue }
      try { $o = $line | ConvertFrom-Json } catch { continue }
      if (($o.PSObject.Properties.Name -contains 'level') -and -not ($o.PSObject.Properties.Name -contains 'event')) {
        if ([string]$o.level -eq $lvl) { $record = $o }
      }
    }
  }
  if (-not $record) { Write-Host "FAIL: no audit record for level=$lvl" -ForegroundColor Red; exit 4 }

  $exp = [datetime]::Parse($record.expires_at).ToUniversalTime()
  if ((Get-Date).ToUniversalTime() -gt $exp) {
    Write-Host "FAIL: gate_token expired (level=$lvl)" -ForegroundColor Red; exit 5
  }

  Write-Host 'OK   gate_token valid'
  Write-Host "  level      : $lvl"
  Write-Host "  gate_id    : $($record.gate_id)"
  Write-Host "  expires_at : $($record.expires_at)"
  exit 0
}

function Invoke-Archive {
  param([int]$Days = $RetentionDays)
  $cutoff = (Get-Date).AddDays(-$Days).ToString('yyyy-MM-dd')
  $dest = Join-Path $ArchiveDir $cutoff
  if (-not (Test-Path -LiteralPath $dest)) { New-Item -ItemType Directory -Force -Path $dest | Out-Null }
  $moved = 0
  foreach ($f in @(Get-ChildItem -LiteralPath $GateDir -Filter '*.jsonl' -File -ErrorAction SilentlyContinue)) {
    $base = [System.IO.Path]::GetFileNameWithoutExtension($f.Name)
    if ([string]::CompareOrdinal($base, $cutoff) -lt 0) {
      Move-Item -LiteralPath $f.FullName -Destination $dest -Force
      $moved++
    }
  }
  Write-Host "OK   archived $moved file(s) older than $Days days -> $dest"
}

# ---- arg parse ----
$sub = ''
$level = ''; $payload = ''; $tokenFile = ''; $expiresMin = 120; $days = 0
if ($args.Count -gt 0) { $sub = $args[0] }
$i = 1
while ($i -lt $args.Count) {
  switch ($args[$i]) {
    '--level'        { $level = $args[$i + 1]; $i += 2 }
    '--payload'      { $payload = $args[$i + 1]; $i += 2 }
    '--token-file'   { $tokenFile = $args[$i + 1]; $i += 2 }
    '--expires-min'  { $expiresMin = [int]$args[$i + 1]; $i += 2 }
    '--older-than-days' { $days = [int]$args[$i + 1]; $i += 2 }
    default          { Write-Host "unknown arg: $($args[$i])" -ForegroundColor Red; exit 2 }
  }
}

switch ($sub) {
  'issue'   { Invoke-Issue -Level $level -Payload $payload -ExpiresMin $expiresMin }
  'verify'  { Invoke-Verify -TokenFile $tokenFile -Level $level }
  'archive' { if ($days -gt 0) { Invoke-Archive -Days $days } else { Invoke-Archive } }
  default   { Write-Host 'usage: issue-gate-token.ps1 {issue|verify|archive} ...' -ForegroundColor Red; exit 2 }
}