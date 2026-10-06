# 运行底座闭集核验（独立于旧编制探针）
param(
  [string]$BaseUrl = 'https://127.0.0.1:5170'
)
$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '../..')
$env:CYP_READY_URL = ($BaseUrl.TrimEnd('/') + '/healthz/ready')
node (Join-Path $PSScriptRoot 'verify-runtime-base.mjs')
exit $LASTEXITCODE
