# CYP-memo: 本地数据快照（R5 S-06 · RTO 目标 ≤60s）
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot '..\_internal\common.ps1')
$Root = Get-Root $PSScriptRoot
$sw = [System.Diagnostics.Stopwatch]::StartNew()

$dataDir = if ($env:CYP_SNAPSHOT_DATA_DIR) { $env:CYP_SNAPSHOT_DATA_DIR } else { Join-Path $Root 'packages\server\data' }
if (-not (Test-Path -LiteralPath $dataDir)) {
  Write-Error "DATA_DIR missing: $dataDir"
  exit 1
}

$ts = Get-Date -Format 'yyyyMMdd_HHmmss'
$snapRoot = if ($env:CYP_SNAPSHOT_ROOT) { $env:CYP_SNAPSHOT_ROOT } else { Join-Path $Root 'backups\snapshots' }
if (-not (Test-Path -LiteralPath $snapRoot)) {
  New-Item -ItemType Directory -Force -Path $snapRoot | Out-Null
}
$dest = Join-Path $snapRoot "snap-$ts"
New-Item -ItemType Directory -Force -Path $dest | Out-Null

Copy-Item -Path (Join-Path $dataDir '*') -Destination $dest -Recurse -Force -ErrorAction SilentlyContinue
# 元数据
@{
  ts       = (Get-Date).ToUniversalTime().ToString('o')
  source   = $dataDir
  dest     = $dest
  commit   = (Get-CypCommitSha -Root $Root)
} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $dest 'SNAPSHOT.json') -Encoding UTF8

& node (Join-Path $Root 'scripts\_internal\write-dir-manifest.mjs') $dest
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# 指针：latest
$latest = Join-Path $snapRoot 'LATEST.txt'
Set-Content -LiteralPath $latest -Value $dest -Encoding ascii

$sw.Stop()
Write-Host ("OK   snapshot in {0:N1}s -> {1}" -f $sw.Elapsed.TotalSeconds, $dest)
if ($sw.Elapsed.TotalSeconds -gt 60) {
  Write-Host 'WARN: exceeded 60s RTO budget'
  exit 2
}
exit 0
