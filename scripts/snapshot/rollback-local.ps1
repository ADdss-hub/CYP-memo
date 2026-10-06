# CYP-memo: 从最近快照回滚（R5 S-06 · RTO ≤60s）
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot '..\_internal\common.ps1')
$Root = Get-Root $PSScriptRoot
$sw = [System.Diagnostics.Stopwatch]::StartNew()

$snapRoot = if ($env:CYP_SNAPSHOT_ROOT) { $env:CYP_SNAPSHOT_ROOT } else { Join-Path $Root 'backups\snapshots' }
$latestFile = Join-Path $snapRoot 'LATEST.txt'
$src = $null
if ($args.Count -ge 1 -and $args[0]) {
  $src = [string]$args[0]
} elseif (Test-Path -LiteralPath $latestFile) {
  $src = (Get-Content -LiteralPath $latestFile -Raw).Trim()
}
if (-not $src -or -not (Test-Path -LiteralPath $src)) {
  Write-Error 'No snapshot. Run scripts/snapshot/snapshot-local.ps1 first, or pass a snap path.'
  exit 1
}

& node (Join-Path $Root 'scripts\verify\verify-dir-manifest.mjs') $src
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$dataDir = if ($env:CYP_SNAPSHOT_DATA_DIR) { $env:CYP_SNAPSHOT_DATA_DIR } else { Join-Path $Root 'packages\server\data' }
if (-not (Test-Path -LiteralPath $dataDir)) {
  New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
}

# 回滚前自动再拍一份安全点
$safety = Join-Path $snapRoot ("pre-rollback-" + (Get-Date -Format 'yyyyMMdd_HHmmss'))
New-Item -ItemType Directory -Force -Path $safety | Out-Null
Copy-Item -Path (Join-Path $dataDir '*') -Destination $safety -Recurse -Force -ErrorAction SilentlyContinue

Get-ChildItem -LiteralPath $dataDir -Force -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -ne '.' } |
  Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

Get-ChildItem -LiteralPath $src -Force |
  Where-Object { $_.Name -ne 'SNAPSHOT.json' -and $_.Name -ne 'MANIFEST.sha256' } |
  ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $dataDir -Recurse -Force }

$sw.Stop()
Write-Host ("OK   rollback in {0:N1}s from {1}" -f $sw.Elapsed.TotalSeconds, $src)
Write-Host "Safety copy: $safety"
Write-Host 'NOTE: restart server to reload sql.js memory from disk if already running.'
if ($sw.Elapsed.TotalSeconds -gt 60) {
  Write-Host 'WARN: exceeded 60s RTO budget'
  exit 2
}
exit 0
