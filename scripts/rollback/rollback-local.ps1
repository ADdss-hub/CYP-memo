# CYP-memo: 权威回滚入口（委托 snapshot SSOT）
# 安全：不静默清空；无快照则失败；回滚前由 SSOT 自动拍 pre-rollback 安全点。
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ssot = Join-Path $PSScriptRoot '..\snapshot\rollback-local.ps1'
if (-not (Test-Path -LiteralPath $ssot)) {
  Write-Error "Missing SSOT rollback script: $ssot"
  exit 1
}

& $ssot @args
exit $LASTEXITCODE
