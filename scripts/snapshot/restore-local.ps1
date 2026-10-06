# CYP-memo 数据恢复（Windows · tar.gz）
# 用法: powershell -File scripts/snapshot/restore-local.ps1 -BackupFile <tar.gz> -Force -DataDir <dir>
# 无 -Force 则拒绝（禁止交互假成功）。恢复前必须过 sha256（有 sidecar 再验 gpg）。
param(
  [Parameter(Mandatory = $true)][string]$BackupFile,
  [string]$DataDir = '',
  [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot '..\_internal\common.ps1')
$Root = Get-Root $PSScriptRoot
if (-not $DataDir) { $DataDir = Join-Path $Root 'packages\server\data' }
if (-not (Test-Path -LiteralPath $BackupFile)) {
  Write-Error "backup missing: $BackupFile"
  exit 1
}
if (-not $Force) {
  Write-Error 'refusing restore without -Force (will overwrite DataDir)'
  exit 1
}

& node (Join-Path $Root 'scripts\verify\verify-artifact-integrity.mjs') $BackupFile
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$temp = Join-Path ([System.IO.Path]::GetTempPath()) ("cyp-memo-restore-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $temp | Out-Null
try {
  tar -xzf $BackupFile -C $temp
  $inner = Get-ChildItem -LiteralPath $temp -Directory | Select-Object -First 1
  $src = if ($inner) { $inner.FullName } else { $temp }
  $db = Join-Path $src 'database.sqlite'
  $uploads = Join-Path $src 'uploads'
  if (-not (Test-Path -LiteralPath $db) -and -not (Test-Path -LiteralPath $uploads)) {
    Write-Error 'backup has no database.sqlite or uploads'
    exit 1
  }
  New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
  if (Test-Path -LiteralPath $db) {
    Copy-Item -LiteralPath $db -Destination (Join-Path $DataDir 'database.sqlite') -Force
    Write-Host '  database restored'
  }
  if (Test-Path -LiteralPath $uploads) {
    $destUp = Join-Path $DataDir 'uploads'
    if (Test-Path -LiteralPath $destUp) { Remove-Item -LiteralPath $destUp -Recurse -Force }
    Copy-Item -LiteralPath $uploads -Destination $destUp -Recurse -Force
    Write-Host '  uploads restored'
  }
  Write-Host "OK restore -> $DataDir"
}
finally {
  Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue
}
