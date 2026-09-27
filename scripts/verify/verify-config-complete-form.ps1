# Thin wrapper → Node UTF-8 probe (avoid PS 5.1 Chinese literal corruption)
param([string]$BaseUrl = 'http://127.0.0.1:5170')
$ErrorActionPreference = 'Stop'
$env:CYP_BASE_URL = $BaseUrl
node (Join-Path $PSScriptRoot 'verify-config-complete-form.mjs')
exit $LASTEXITCODE
