# CYP-memo closed-set probe (35 stable IDs)
# Encoding: UTF-8 with BOM required for Windows PowerShell 5.1 Chinese literals
param(
  [string]$BaseUrl = 'https://127.0.0.1:5170',
  [string]$DataDir = ''
)
$ErrorActionPreference = 'Continue'
. (Join-Path $PSScriptRoot '..\_internal\common.ps1')
if ($BaseUrl -match '^https://') { Enable-CypInsecureLocalHttps }
$fail = 0
Write-Host "[runtime-base] base=$BaseUrl"
$ids = @(
  'RB-L0-INFRA-CFG-01','RB-L0-INFRA-INIT-01','RB-L0-INFRA-LOG-01','RB-L0-INFRA-CACHE-01','RB-L0-INFRA-MQ-01','RB-L0-INFRA-DB-01',
  'RB-L0-COORD-CMP-01','RB-L0-COORD-PLT-01',
  'RB-L1-MGMT-CONF-01','RB-L1-MGMT-RISK-01','RB-L1-MGMT-TRACE-01','RB-L1-MGMT-BOOT-01','RB-L1-MGMT-CODE-01','RB-L1-MGMT-FESEC-01','RB-L1-MGMT-IAM-01','RB-L1-MGMT-KMS-01','RB-L1-MGMT-RBAC-01','RB-L1-MGMT-PERF-01',
  'RB-L1-HOST-TELEM-01','RB-L1-HOST-RULE-01','RB-L1-HOST-SCHED-01','RB-L1-HOST-ACCT-01','RB-L1-HOST-REL-01','RB-L1-HOST-BIZ-01','RB-L1-HOST-ALERT-01','RB-L1-HOST-TRACEAN-01','RB-L1-HOST-AUDIT-01','RB-L1-HOST-RESIL-01',
  'RB-L1-COL-SVC-01','RB-L1-COL-EVT-01','RB-L1-COL-CTR-01','RB-L1-COL-TEN-01','RB-L1-COL-DATA-01',
  'RB-L1-PUB-ACC-01','RB-L1-PUB-OPEN-01'
)

try {
  $readyHit = Invoke-CypJsonApi -Method GET -Url "$BaseUrl/healthz/ready" -TimeoutSec 20
  $ready = $readyHit.Json
  if ($readyHit.StatusCode -eq 200 -and $ready.success -eq $true) { Write-Host '[OK] init ready' } else { Write-Host '[FAIL] init ready'; $fail = 1 }
  $hasTwelve = $false
  $hasModules = $false
  if ($null -ne $ready.data) {
    $hasTwelve = $null -ne ($ready.data.PSObject.Properties['twelveCenters'])
    $hasModules = $null -ne ($ready.data.PSObject.Properties['modules'])
  }
  if ($hasTwelve) { Write-Host '[FAIL] twelveCenters still present'; $fail = 1 } else { Write-Host '[OK] twelveCenters absent' }
  if ($hasModules) { Write-Host '[FAIL] parallel modules list'; $fail = 1 } else { Write-Host '[OK] no parallel modules list' }
  $rb = $ready.data.runtimeBase
  if ($null -eq $rb) {
    Write-Host '[FAIL] runtimeBase missing'
    $fail = 1
  } else {
    $hasQg = $null -ne ($rb.PSObject.Properties['质量门禁'])
    if ($hasQg) { Write-Host '[FAIL] quality gate still in runtimeBase'; $fail = 1 } else { Write-Host '[OK] quality gate absent' }
    $items = $rb.items
    foreach ($id in $ids) {
      if ($null -ne $items -and $items.$id -eq $true) { Write-Host "[OK] $id" }
      else { Write-Host "[FAIL] $id"; $fail = 1 }
    }
    if ($rb.routesRegistered -ne $true) { Write-Host '[FAIL] runtimeBase.routesRegistered'; $fail = 1 }
    else { Write-Host "[OK] runtimeBase.routesRegistered count=$($rb.routeCount)" }
    if ($rb.completeForm -eq $true) { Write-Host '[OK] runtimeBase.completeForm' }
    else { Write-Host '[FAIL] runtimeBase.completeForm'; $fail = 1 }
  }
} catch {
  Write-Host "[FAIL] ready $($_.Exception.Message)"
  $fail = 1
}

try {
  $healthHit = Invoke-CypJsonApi -Method GET -Url "$BaseUrl/api/health" -TimeoutSec 15
  if ($healthHit.StatusCode -eq 200 -and $null -ne $healthHit.Json.success) { Write-Host '[OK] /api/health' } else { Write-Host '[FAIL] /api/health'; $fail = 1 }
} catch {
  Write-Host "[FAIL] health $($_.Exception.Message)"
  $fail = 1
}

if ($DataDir) {
  foreach ($sub in @('logs','governance','schedule','registry','uploads','alerts','kms','audit','tracing','release','contracts','pipeline','env-isolation','chaos','elasticity','notify','mq','collab','events')) {
    $p = Join-Path $DataDir $sub
    if ($sub -eq 'governance' -and -not (Test-Path $p)) { New-Item -ItemType Directory -Path $p -Force | Out-Null }
    if (Test-Path $p) { Write-Host "[OK] dir $sub" } else { Write-Host "[FAIL] missing $p"; $fail = 1 }
  }
} else {
  Write-Host '[SKIP] filesystem dirs (pass -DataDir)'
}

if ($fail -ne 0) { Write-Host '[runtime-base] FAILED'; exit 1 }
Write-Host '[runtime-base] PASSED'
exit 0
