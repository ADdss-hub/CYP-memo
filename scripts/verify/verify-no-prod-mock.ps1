# CYP-memo 生产Mock约束 · 生产零 Mock 门禁 (B2)
# Scan packages/{server,app,shared}/src; exclude tests/mocks
# Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>

$ErrorActionPreference = 'Stop'
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
if (-not (Test-Path (Join-Path $root 'packages'))) {
  $root = Resolve-Path (Join-Path $PSScriptRoot '../..')
}

$roots = @(
  (Join-Path $root 'packages/server/src'),
  (Join-Path $root 'packages/app/src'),
  (Join-Path $root 'packages/shared/src')
)

$patterns = @(
  'MOCK_DATA\s*=',
  'fakeSuccess\s*:\s*true',
  'return\s+\{\s*success:\s*true,\s*data:\s*\[\s*\]\s*\}\s*//\s*mock',
  'TODO:\s*mock\s+in\s+prod',
  'process\.env\.USE_MOCK\s*=\s*[''"]true',
  '__CYP_PROD_MOCK__'
)

$hits = @()
foreach ($dir in $roots) {
  if (-not (Test-Path $dir)) { continue }
  Get-ChildItem -Path $dir -Recurse -Include *.ts,*.vue,*.js -File |
    Where-Object {
      $_.FullName -notmatch '\\tests?\\|\\.test\\.|\\.spec\\.|__mocks__|node_modules'
    } |
    ForEach-Object {
      $text = Get-Content $_.FullName -Raw -ErrorAction SilentlyContinue
      if (-not $text) { return }
      foreach ($p in $patterns) {
        if ($text -match $p) {
          $hits += [pscustomobject]@{ File = $_.FullName.Replace($root, '.'); Pattern = $p }
        }
      }
    }
}

if ($hits.Count -gt 0) {
  Write-Host "FAIL 生产Mock约束: production mock markers found ($($hits.Count))"
  $hits | Format-Table -AutoSize | Out-String | Write-Host
  exit 1
}

Write-Host 'PASS 生产Mock约束: no production mock markers in server/app/shared src'
exit 0
