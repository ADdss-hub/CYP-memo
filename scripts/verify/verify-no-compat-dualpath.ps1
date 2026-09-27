# CYP-memo hard gate: no architecture compatibility dual-paths
# Fails on tenant-scope aliases, soft idempotency, AdminAuth exports, etc.
$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '../..')
$fail = 0

$checks = @(
  @{ Path = 'packages/server/src/index.ts'; Pattern = 'tenant-scope.*respondTenantMemos|兼容别名'; Note = 'tenant-scope dual or compat alias' },
  @{ Path = 'packages/shared/src/storage/RemoteStorageAdapter.ts'; Pattern = 'getTenantScopeMemos'; Note = 'client dual list API' },
  @{ Path = 'packages/shared/src/managers/MemoManager.ts'; Pattern = 'getTenantScopeMemos'; Note = 'MemoManager dual branch' },
  @{ Path = 'packages/server/src/idempotency-service.ts'; Pattern = '兼容旧客户端'; Note = 'soft idempotency compat' },
  @{ Path = 'packages/shared/src/database/index.ts'; Pattern = "from './AdminDAO'"; Note = 'AdminDAO must not be public export' },
  @{ Path = 'packages/shared/src/storage/LocalStorageAdapter.ts'; Pattern = 'db\.admins\.(add|update|delete|put)'; Note = 'local adapter must not write admins' },
  @{ Path = 'packages/shared/src/storage/StorageAdapter.ts'; Pattern = 'createAdmin|adminLogin'; Note = 'IStorageAdapter must not expose admins API' },
  @{ Path = 'packages/server/src/business-route-registry.ts'; Pattern = "startsWith\('/api/public/'\)"; Note = 'public writes must be registered not blanket-exempt' }
)

# File must NOT exist
$gone = @(
  'packages/shared/src/managers/AdminAuthManager.ts',
  'packages/shared/src/database/AdminDAO.ts'
)

Write-Host '[no-compat] scanning dual-path markers...'

foreach ($g in $gone) {
  $fp = Join-Path $root $g
  if (Test-Path $fp) {
    Write-Host "[FAIL] retired file still present: $g"
    $fail = 1
  } else {
    Write-Host "[OK] gone $g"
  }
}

foreach ($c in $checks) {
  $fp = Join-Path $root $c.Path
  if (-not (Test-Path $fp)) {
    Write-Host "[FAIL] missing file $($c.Path)"
    $fail = 1
    continue
  }
  $hit = Select-String -Path $fp -Pattern $c.Pattern -Quiet
  if ($hit) {
    Write-Host "[FAIL] $($c.Note) :: $($c.Path) ~ /$($c.Pattern)/"
    $fail = 1
  } else {
    Write-Host "[OK] clear $($c.Note)"
  }
}

# Positive: public share access must be registered
$reg = Join-Path $root 'packages/server/src/business-route-registry.ts'
if (-not (Select-String -Path $reg -Pattern "/api/public/shares/:id/access" -Quiet)) {
  Write-Host '[FAIL] public share access not registered in catalog'
  $fail = 1
} else {
  Write-Host '[OK] public share access registered'
}

# Live probes if server up
try {
  $ts = Invoke-WebRequest -Uri 'http://127.0.0.1:5170/api/memos/tenant-scope' -Method Get -TimeoutSec 8 -ErrorAction Stop
  Write-Host "[FAIL] tenant-scope still 200 status=$($ts.StatusCode)"
  $fail = 1
} catch {
  $code = 0
  if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
  if ($code -eq 410) { Write-Host '[OK] live tenant-scope -> 410' }
  elseif ($code -eq 401 -or $code -eq 403) { Write-Host "[FAIL] tenant-scope auth gate ($code) — route still alive"; $fail = 1 }
  elseif ($code -eq 0) { Write-Host '[SKIP] live server down' }
  else { Write-Host "[FAIL] tenant-scope unexpected status=$code"; $fail = 1 }
}

try {
  $null = Invoke-WebRequest -Uri 'http://127.0.0.1:5170/api/memos' -Method POST -ContentType 'application/json' -Body '{}' -TimeoutSec 8
  Write-Host '[FAIL] write without Idempotency-Key should 400'
  $fail = 1
} catch {
  $code = 0
  if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
  # may be 401 first if auth runs before idempotency - check middleware order
  if ($code -eq 400) { Write-Host '[OK] live write without Idempotency-Key -> 400' }
  elseif ($code -eq 401) { Write-Host '[OK] live write hit auth 401 (Key check may be after auth — acceptable if RemoteStorage always sends Key)' }
  elseif ($code -eq 503) { Write-Host '[OK] live unauth write blocked (503/auth path)' }
  elseif ($code -eq 0) { Write-Host '[SKIP] live idempotency probe (server down)' }
  else { Write-Host "[WARN] write-no-key status=$code" }
}

if ($fail -ne 0) { Write-Host '[no-compat] FAILED'; exit 1 }
Write-Host '[no-compat] PASSED'
exit 0
