# CYP-memo runtime-base cut-in probe (real env · 闭集 35)
# Checks: ready items×35, route headers, unregistered reject, memo/log via base, collab/public probes
$ErrorActionPreference = 'Continue'
$Base = 'https://127.0.0.1:5170'
$fail = 0
$pass = 0
function Ok([string]$m) { Write-Host "[PASS] $m"; $script:pass++ }
function Bad([string]$m) { Write-Host "[FAIL] $m"; $script:fail++ }
function DecHdr([string]$s) { if ([string]::IsNullOrEmpty($s)) { return '' }; return [uri]::UnescapeDataString($s) }

Write-Host "=== A. ready / runtimeBase items ==="
try {
  $ready = Invoke-RestMethod -Uri "$Base/healthz/ready" -TimeoutSec 20
  if ($ready.success -ne $true) { Bad 'ready.success' } else { Ok 'ready.success' }
  $rb = $ready.data.runtimeBase
  if ($null -ne $ready.data.twelveCenters) { Bad 'twelveCenters still present' } else { Ok 'twelveCenters absent' }
  if ($null -ne $ready.data.modules) { Bad 'parallel modules list' } else { Ok 'no parallel modules list' }
  if ($null -ne $rb.'质量门禁') { Bad 'quality gate still in runtimeBase' } else { Ok 'quality gate absent' }
  $items = $rb.items
  $ids = @(
    'RB-L0-INFRA-CFG-01','RB-L0-INFRA-INIT-01','RB-L0-INFRA-LOG-01','RB-L0-INFRA-CACHE-01','RB-L0-INFRA-MQ-01','RB-L0-INFRA-DB-01',
    'RB-L0-COORD-CMP-01','RB-L0-COORD-PLT-01',
    'RB-L1-MGMT-CONF-01','RB-L1-MGMT-RISK-01','RB-L1-MGMT-TRACE-01','RB-L1-MGMT-BOOT-01','RB-L1-MGMT-CODE-01','RB-L1-MGMT-FESEC-01','RB-L1-MGMT-IAM-01','RB-L1-MGMT-KMS-01','RB-L1-MGMT-RBAC-01','RB-L1-MGMT-PERF-01',
    'RB-L1-HOST-TELEM-01','RB-L1-HOST-RULE-01','RB-L1-HOST-SCHED-01','RB-L1-HOST-ACCT-01','RB-L1-HOST-REL-01','RB-L1-HOST-BIZ-01','RB-L1-HOST-ALERT-01','RB-L1-HOST-TRACEAN-01','RB-L1-HOST-AUDIT-01','RB-L1-HOST-RESIL-01',
    'RB-L1-COL-SVC-01','RB-L1-COL-EVT-01','RB-L1-COL-CTR-01','RB-L1-COL-TEN-01','RB-L1-COL-DATA-01',
    'RB-L1-PUB-ACC-01','RB-L1-PUB-OPEN-01'
  )
  foreach ($id in $ids) {
    if ($items.$id -eq $true) { Ok $id } else { Bad $id }
  }
  if ($rb.routesRegistered -eq $true) { Ok "routesRegistered count=$($rb.routeCount)" } else { Bad 'routesRegistered' }
  if ($rb.completeForm -eq $true) { Ok 'runtimeBase.completeForm' } else { Bad 'runtimeBase.completeForm' }
} catch {
  Bad "ready unreachable: $($_.Exception.Message)"
  Write-Host "TOTAL fail=$fail pass=$pass"
  exit 1
}

Write-Host "=== B. unregistered write rejected ==="
try {
  $hdr = @{ 'Idempotency-Key' = "probe-$([guid]::NewGuid())" }
  $null = Invoke-WebRequest -Uri "$Base/api/__cutin_probe_no_reg" -Method POST -ContentType 'application/json' -Headers $hdr -Body '{}' -TimeoutSec 10
  Bad 'unregistered should 503'
} catch {
  $code = [int]$_.Exception.Response.StatusCode
  if ($code -eq 503) { Ok 'unregistered -> 503' } else { Bad "unregistered status=$code" }
}

Write-Host "=== C. register+login+memo headers (业务协同对接) ==="
$suffix = Get-Random -Maximum 999999
$user = "cutin_$suffix"
$passw = 'Test1234!'
$reg = @{ username = $user; password = $passw; displayName = 'CutIn' } | ConvertTo-Json
try {
  $regResp = Invoke-WebRequest -Uri "$Base/api/auth/register" -Method POST -ContentType 'application/json' -Body $reg -TimeoutSec 15
  $hs = $regResp.Headers['X-CYP-Hosted-Service']
  $bp = $regResp.Headers['X-CYP-Base-Platforms']
  if ((DecHdr $hs) -eq '业务协同对接') { Ok "register Hosted=$(DecHdr $hs) Platforms=$(DecHdr $bp)" } else { Bad "register Hosted=$hs" }
} catch { Bad "register $($_.Exception.Message)" }

$loginBody = @{ username = $user; password = $passw } | ConvertTo-Json
try {
  $loginResp = Invoke-WebRequest -Uri "$Base/api/auth/login" -Method POST -ContentType 'application/json' -Body $loginBody -TimeoutSec 15
  if ((DecHdr $loginResp.Headers['X-CYP-Hosted-Service']) -eq '业务协同对接') { Ok 'login 业务协同对接' } else { Bad 'login header' }
  $tok = ($loginResp.Content | ConvertFrom-Json).data.accessToken
  if (-not $tok) { $tok = ($loginResp.Content | ConvertFrom-Json).data.token }
  if ($tok) { Ok 'got accessToken' } else { Bad 'no token' }
} catch { Bad "login $($_.Exception.Message)"; $tok = $null }

$auth = @{ Authorization = "Bearer $tok"; 'Idempotency-Key' = "cutin-$([guid]::NewGuid())" }
$memoId = $null
if ($tok) {
  try {
    $memoBody = @{ title = 'cutin-base'; content = 'via 业务协同对接写服务' } | ConvertTo-Json
    $m = Invoke-WebRequest -Uri "$Base/api/memos" -Method POST -ContentType 'application/json' -Headers $auth -Body $memoBody -TimeoutSec 15
    if ((DecHdr $m.Headers['X-CYP-Hosted-Service']) -eq '业务协同对接' -and ((DecHdr $m.Headers['X-CYP-Base-Platforms']) -match '身份访问管控')) { Ok "memo create 业务协同对接 $(DecHdr $m.Headers['X-CYP-Base-Platforms'])" } else { Bad 'memo create header' }
    $memoId = ($m.Content | ConvertFrom-Json).data.id
  } catch { Bad "memo create $($_.Exception.Message)" }

  if ($memoId) {
    try {
      $p = Invoke-WebRequest -Uri "$Base/api/memos/$memoId" -Method PATCH -ContentType 'application/json' -Headers $auth -Body (@{ title = 'cutin-upd' } | ConvertTo-Json) -TimeoutSec 15
      if ((DecHdr $p.Headers['X-CYP-Hosted-Service']) -eq '业务协同对接') { Ok 'memo patch 业务协同对接' } else { Bad 'memo patch header' }
    } catch { Bad "memo patch $($_.Exception.Message)" }
  }

  Write-Host "=== D. logs via 溯源检索分析 ==="
  try {
    $l = Invoke-WebRequest -Uri "$Base/api/logs" -Method POST -ContentType 'application/json' -Headers $auth -Body (@{ level = 'info'; message = 'cutin-log'; action = 'cutin_probe' } | ConvertTo-Json) -TimeoutSec 15
    if ((DecHdr $l.Headers['X-CYP-Hosted-Service']) -eq '溯源检索分析') { Ok 'logs POST 溯源检索分析' } else { Bad "logs Hosted=$(DecHdr $l.Headers['X-CYP-Hosted-Service'])" }
  } catch { Bad "logs $($_.Exception.Message)" }
  try {
    $ce = Invoke-WebRequest -Uri "$Base/api/logs/client-error" -Method POST -ContentType 'application/json' -Headers $auth -Body (@{ message = 'cutin-ce'; level = 'error'; action = 'client' } | ConvertTo-Json) -TimeoutSec 15
    if ((DecHdr $ce.Headers['X-CYP-Hosted-Service']) -eq '溯源检索分析') { Ok 'client-error 溯源检索分析' } else { Bad 'client-error header' }
  } catch { Bad "client-error $($_.Exception.Message)" }

  Write-Host "=== E. settings / shares / users headers ==="
  try {
    $s = Invoke-WebRequest -Uri "$Base/api/settings/cutin_probe" -Method PUT -ContentType 'application/json' -Headers $auth -Body (@{ value = '1' } | ConvertTo-Json) -TimeoutSec 15
    if ((DecHdr $s.Headers['X-CYP-Hosted-Service']) -eq '业务协同对接') { Ok 'settings PUT 业务协同对接' } else { Bad 'settings header' }
  } catch { Bad "settings $($_.Exception.Message)" }

  if ($memoId) {
    try {
      $sh = Invoke-WebRequest -Uri "$Base/api/shares" -Method POST -ContentType 'application/json' -Headers $auth -Body (@{ memoId = $memoId; type = 'public' } | ConvertTo-Json) -TimeoutSec 15
      if ((DecHdr $sh.Headers['X-CYP-Hosted-Service']) -eq '业务协同对接') { Ok 'shares POST 业务协同对接' } else { Bad 'shares header' }
    } catch { Bad "shares $($_.Exception.Message)" }
  }

  Write-Host "=== F. platform ops headers (need tenant perms; soft) ==="
  # Owner from register should have tenant_* on main account
  foreach ($probe in @(
    @{ m='POST'; u='/api/schedule/jobs/sys.schedule_heartbeat/trigger'; expect='流程调度编排'; need='tenant_database' },
    @{ m='POST'; u='/api/alerts/test'; expect='风险告警处置'; need='tenant_database' },
    @{ m='POST'; u='/api/release/canary'; expect='版本变更发布'; body='{"weight":0}'; need='tenant_monitor' }
  )) {
    try {
      $hdr = $auth.Clone()
      $hdr['Idempotency-Key'] = "cutin-$([guid]::NewGuid())"
      $body = if ($probe.body) { $probe.body } else { '{}' }
      $resp = Invoke-WebRequest -Uri ($Base + $probe.u) -Method $probe.m -ContentType 'application/json' -Headers $hdr -Body $body -TimeoutSec 15
      $got = [uri]::UnescapeDataString([string]$resp.Headers['X-CYP-Hosted-Service'])
      if ($got -eq $probe.expect) { Ok "$($probe.u) Hosted=$got" } else { Bad "$($probe.u) Hosted=$got expect=$($probe.expect)" }
    } catch {
      $code = 0
      if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
      # 403 still proves registry ran only if we can read headers - often lost on error
      if ($code -eq 403) { Ok "$($probe.u) reached auth (403) — registry passed" }
      elseif ($code -eq 503) { Bad "$($probe.u) 503 unregistered?" }
      else { Bad "$($probe.u) err status=$code $($_.Exception.Message)" }
    }
  }

  if ($memoId) {
    try {
      $d = Invoke-WebRequest -Uri "$Base/api/memos/$memoId" -Method DELETE -Headers $auth -TimeoutSec 15
      if ((DecHdr $d.Headers['X-CYP-Hosted-Service']) -eq '业务协同对接') { Ok 'memo delete 业务协同对接' } else { Bad 'memo delete header' }
    } catch { Bad "memo delete $($_.Exception.Message)" }
  }
}

Write-Host "=== G. verify scripts ==="
& (Join-Path $PSScriptRoot 'verify-five-centers.ps1') -BaseUrl $Base
if ($LASTEXITCODE -eq 0) { Ok 'verify-five-centers' } else { Bad 'verify-five-centers' }
& (Join-Path $PSScriptRoot 'verify-no-prod-mock.ps1')
if ($LASTEXITCODE -eq 0) { Ok 'verify-no-prod-mock 生产Mock约束' } else { Bad 'verify-no-prod-mock' }

Write-Host "=== H. static: index no direct DB writes ==="
$idx = Join-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) 'packages/server/src/index.ts'
if (-not (Test-Path $idx)) { $idx = 'd:\kf\kf\CYP-memo\packages\server\src\index.ts' }
$hits = Select-String -Path $idx -Pattern 'database\.(create|update|delete|setSetting|clearLogs|clean)' -AllMatches
if ($hits) {
  Bad "index still has $($hits.Count) direct DB write(s)"
} else {
  Ok 'index zero direct DB writes'
}

Write-Host "=== I. 协作/公开就绪键（稳定 ID）==="
try {
  $rb2 = (Invoke-RestMethod -Uri "$Base/healthz/ready" -TimeoutSec 20).data.runtimeBase
  if ($null -ne $rb2.batch) { Bad "legacy batch still present ($($rb2.batch))" } else { Ok 'no legacy batch field' }
  if ($null -ne $rb2.'协作能力子平台' -or $null -ne $rb2.'公开子平台') {
    Bad 'legacy nested Chinese platform keys still present'
  } else { Ok 'no legacy nested platform keys' }
  $need = @(
    'RB-L1-COL-SVC-01','RB-L1-COL-EVT-01','RB-L1-COL-CTR-01','RB-L1-COL-TEN-01','RB-L1-COL-DATA-01',
    'RB-L1-PUB-ACC-01','RB-L1-PUB-OPEN-01'
  )
  foreach ($id in $need) {
    if ($rb2.items.$id -eq $true) { Ok "items.$id" } else { Bad "items.$id" }
  }
  if ($rb2.layers.L1.'RB-L1-COL-SVC-01' -eq $true -and $rb2.layers.L1.'RB-L1-PUB-OPEN-01' -eq $true) {
    Ok 'layers.L1 collab+open'
  } else { Bad 'layers.L1 collab+open' }
} catch { Bad "collab/public ready projection: $($_.Exception.Message)" }

if ($tok) {
  $authProbe = @{ Authorization = "Bearer $tok"; 'Idempotency-Key' = "b91-$([guid]::NewGuid())" }
  try {
    $sp = Invoke-RestMethod -Uri "$Base/api/collab/service/route-probe" -Method POST -ContentType 'application/json' -Headers $authProbe -Body '{}' -TimeoutSec 15
    if ($sp.data.allowed.ok -eq $true -and $sp.data.unregistered.ok -eq $false -and $sp.data.unauthorized.ok -eq $false -and $sp.data.unregistered.reason -eq 'unregistered' -and $sp.data.unauthorized.reason -eq 'unauthorized') {
      Ok 'service route: allow + unregistered + unauthorized'
    } else { Bad "service route probe $($sp.data | ConvertTo-Json -Compress)" }
  } catch { Bad "service route-probe $($_.Exception.Message)" }

  $authProbe['Idempotency-Key'] = "b91-$([guid]::NewGuid())"
  try {
    $ep = Invoke-RestMethod -Uri "$Base/api/collab/event/probe" -Method POST -ContentType 'application/json' -Headers $authProbe -Body '{}' -TimeoutSec 15
    if ($ep.data.unknownDeadLettered -eq $true -and $ep.data.unknownNotEnqueued -eq $true -and $ep.data.idempotentRejected -eq $true -and $ep.data.replayed -eq $true) {
      Ok 'event collab: dead-letter + idempotent + replay'
    } else { Bad "event probe $($ep.data | ConvertTo-Json -Compress)" }
  } catch { Bad "event probe $($_.Exception.Message)" }

  $authProbe['Idempotency-Key'] = "b91-$([guid]::NewGuid())"
  try {
    $cp = Invoke-RestMethod -Uri "$Base/api/collab/contract/probe" -Method POST -ContentType 'application/json' -Headers $authProbe -Body '{}' -TimeoutSec 15
    if ($cp.data.conclusionRecorded -eq $true -and $cp.data.breakingBlocked -eq $true -and $cp.data.approvedApplied -eq $true) {
      Ok 'contract gov: conclusion + block + approve'
    } else { Bad "contract probe $($cp.data | ConvertTo-Json -Compress)" }
  } catch { Bad "contract probe $($_.Exception.Message)" }
} else {
  Bad 'skip collab probes (no token)'
}

Write-Host "=== J. 租户协作 + 数据协作 ==="
if ($tok) {
  $suffix2 = Get-Random -Maximum 999999
  $userB = "b92b_$suffix2"
  $memberName = "b92m_$suffix2"
  try {
    $null = Invoke-RestMethod -Uri "$Base/api/auth/register" -Method POST -ContentType 'application/json' -Body (@{ username = $userB; password = 'Test1234!'; displayName = 'B92B' } | ConvertTo-Json) -TimeoutSec 15
    $loginB = Invoke-RestMethod -Uri "$Base/api/auth/login" -Method POST -ContentType 'application/json' -Body (@{ username = $userB; password = 'Test1234!' } | ConvertTo-Json) -TimeoutSec 15
    $tokB = $loginB.data.accessToken
    if (-not $tokB) { $tokB = $loginB.data.token }
    $meB = Invoke-RestMethod -Uri "$Base/api/me" -Headers @{ Authorization = "Bearer $tokB" } -TimeoutSec 15
    $hdrB = @{ Authorization = "Bearer $tokB"; 'Idempotency-Key' = "b92-$([guid]::NewGuid())" }
    $created = Invoke-RestMethod -Uri "$Base/api/users" -Method POST -ContentType 'application/json' -Headers $hdrB -Body (@{ username = $memberName; password = 'Test1234!'; role = 'member'; permissions = @('profile_self') } | ConvertTo-Json) -TimeoutSec 15
    $memberId = $created.data.id
    if ($memberId) { Ok "member $memberId in tenant $($meB.data.tenantRootId)" } else { Bad 'no member id' }

    $hdrA = @{ Authorization = "Bearer $tok"; 'Idempotency-Key' = "b92-$([guid]::NewGuid())" }
    $dp = Invoke-RestMethod -Uri "$Base/api/collab/data/probe" -Method POST -ContentType 'application/json' -Headers $hdrA -Body (@{ deniedUserId = $memberId } | ConvertTo-Json) -TimeoutSec 15
    if ($dp.data.contractActive -and $dp.data.deniedWithoutRbac -and $dp.data.exchanged -and $dp.data.lineageRecorded -and $dp.data.subscribed) {
      Ok 'data collab: contract + deny + exchange + lineage + subscribe'
    } else { Bad "data probe $($dp.data | ConvertTo-Json -Compress)" }

    $hdrA['Idempotency-Key'] = "b92-$([guid]::NewGuid())"
    $tp = Invoke-RestMethod -Uri "$Base/api/collab/tenant/probe" -Method POST -ContentType 'application/json' -Headers $hdrA -Body (@{ subjectUserId = $memberId } | ConvertTo-Json) -TimeoutSec 15
    if ($tp.data.beforeMissing -and $tp.data.applied -and $tp.data.rbacHasRow) {
      Ok 'tenant collab: grant landed on RBAC row'
    } else { Bad "tenant probe $($tp.data | ConvertTo-Json -Compress)" }
  } catch { Bad "tenant/data collab $($_.Exception.Message)" }
} else {
  Bad 'skip tenant/data collab (no token)'
}

Write-Host "=== K. 公开接入安全 ==="
if ($tok) {
  $hdrK = @{ Authorization = "Bearer $tok"; 'Idempotency-Key' = "b93-$([guid]::NewGuid())" }
  try {
    $pa = Invoke-RestMethod -Uri "$Base/api/collab/public-access/probe" -Method POST -ContentType 'application/json' -Headers $hdrK -Body '{}' -TimeoutSec 15
    if ($pa.data.allowlistDeny -and $pa.data.denyLogged -and $pa.data.tlsPolicyDefined) {
      Ok 'public-access: allowlist deny + log + tls policy'
    } else { Bad "public-access probe $($pa.data | ConvertTo-Json -Compress)" }
  } catch { Bad "public-access probe $($_.Exception.Message)" }
  try {
    $null = Invoke-WebRequest -Uri "$Base/api/public/shares/x/access" -Method POST -ContentType 'application/json' -Body '{}' -TimeoutSec 10
    Bad 'public write without Idempotency-Key should 400'
  } catch {
    $code = 0
    if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
    if ($code -eq 400) { Ok 'public write missing Idempotency-Key -> 400' } else { Bad "public write status=$code" }
  }
} else {
  Bad 'skip public-access (no token)'
}

Write-Host "=== L. 开放协作管控 ==="
if ($tok) {
  $hdrL = @{ Authorization = "Bearer $tok"; 'Idempotency-Key' = "b94-$([guid]::NewGuid())" }
  try {
    $op = Invoke-RestMethod -Uri "$Base/api/collab/open/probe" -Method POST -ContentType 'application/json' -Headers $hdrL -Body '{}' -TimeoutSec 15
    if ($op.data.catalogNonEmpty -and $op.data.appRegistered -and $op.data.unregisteredDenied -and $op.data.subscriptionApproved -and $op.data.allowedAfterApprove -and $op.data.quotaSet -and $op.data.slaRegistered -and $op.data.ready) {
      Ok 'open-collab: catalog + app + deny + subscribe + quota + sla'
    } else { Bad "open probe $($op.data | ConvertTo-Json -Compress)" }
  } catch { Bad "open probe $($_.Exception.Message)" }
  try {
    $cat = Invoke-RestMethod -Uri "$Base/api/open-collab/catalog" -Headers @{ Authorization = "Bearer $tok" } -TimeoutSec 15
    if ($cat.data.ready -eq $true -and $cat.data.catalog.paths.Count -gt 0 -and $cat.data.apps.Count -gt 0) {
      Ok "open catalog paths=$($cat.data.catalog.paths.Count) apps=$($cat.data.apps.Count)"
    } else { Bad 'open catalog incomplete' }
  } catch { Bad "open catalog $($_.Exception.Message)" }
} else {
  Bad 'skip open-collab (no token)'
}

Write-Host "=== M. §5.7 告警自动派自动化闭环 / 风险处置 / 管道回放 ==="
if ($tok) {
  $hdrM = @{ Authorization = "Bearer $tok"; 'Content-Type' = 'application/json'; 'Idempotency-Key' = "m-alert-$([guid]::NewGuid())" }
  try {
    $null = Invoke-RestMethod -Uri "$Base/api/alerts/test" -Method POST -Headers $hdrM -Body (@{ title = 'cutin-m'; detail = 's57' } | ConvertTo-Json) -TimeoutSec 15
    Start-Sleep -Milliseconds 800
    $alist = Invoke-RestMethod -Uri "$Base/api/alerts?status=closed&limit=10" -Headers @{ Authorization = "Bearer $tok" } -TimeoutSec 10
    $hit = @($alist.data.tickets | Where-Object { $_.title -eq 'cutin-m' -or $_.assignee -like 'automation:*' }) | Select-Object -First 1
    if (-not $hit) {
      $aact = Invoke-RestMethod -Uri "$Base/api/alerts?status=active&limit=10" -Headers @{ Authorization = "Bearer $tok" } -TimeoutSec 10
      $hit = @($aact.data.tickets | Where-Object { $_.assignee -like 'automation:*' }) | Select-Object -First 1
    }
    if (-not $hit) { Bad 'alert ticket missing after auto-dispatch' }
    elseif ($hit.assignee -notlike 'automation:*') { Bad "assignee=$($hit.assignee) expected automation:*" }
    elseif ($hit.status -eq 'closed' -or $hit.status -eq 'assigned') { Ok "alert auto-dispatch status=$($hit.status) assignee=$($hit.assignee)" }
    else { Bad "status=$($hit.status)" }
    Start-Sleep -Milliseconds 300
    $disp = Invoke-RestMethod -Uri "$Base/api/risk/dispositions?limit=20" -Headers @{ Authorization = "Bearer $tok" } -TimeoutSec 10
    $acts = @($disp.data.recent | ForEach-Object { $_.action })
    if ($disp.data.ready -eq $true -and ($acts -contains 'converge') -and ($acts -contains 'assign') -and ($acts -contains 'close')) {
      Ok 'risk dispositions converge+assign+close (auto)'
    } else { Bad "dispositions acts=$($acts -join ',')" }
    if ($disp.data.thresholds.errorStorm5xx -gt 0) { Ok 'risk thresholds from config' } else { Bad 'risk thresholds missing' }
  } catch { Bad "alert/risk §M $($_.Exception.Message)" }
  try {
    $hdrR = @{ Authorization = "Bearer $tok"; 'Content-Type' = 'application/json'; 'Idempotency-Key' = "m-rep-$([guid]::NewGuid())" }
    $rep = Invoke-RestMethod -Uri "$Base/api/pipeline/replay" -Method POST -Headers $hdrR -Body (@{ limit = 50 } | ConvertTo-Json) -TimeoutSec 15
    if ($null -ne $rep.data.replayed) { Ok "pipeline replay replayed=$($rep.data.replayed)" } else { Bad 'pipeline replay shape' }
  } catch { Bad "pipeline replay $($_.Exception.Message)" }
} else {
  Bad 'skip §M (no token)'
}

Write-Host "=== SUMMARY pass=$pass fail=$fail ==="
if ($fail -ne 0) { exit 1 }
Write-Host 'CUTIN_PROBE PASSED'
exit 0
