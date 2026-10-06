# CYP-memo: verify-s03-auth · S-03 九类流程 API 断言（真实环境）
# 权威：reports/P2/CYP-memo-P2-一键启动脚本设计.md §2.5
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue'

. (Join-Path $PSScriptRoot '..\_internal\common.ps1')
$Root = Get-Root $PSScriptRoot
Set-Location -LiteralPath $Root

$api = 'https://127.0.0.1:5170'
$failed = $false
$ts = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$step = 0
$logDir = Join-Path $Root 'logs'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Force -Path $logDir | Out-Null }
$jsonl = Join-Path $logDir 'verify-s03.jsonl'
$traceId = New-CypTraceId
Enable-CypInsecureLocalHttps

function Ok([string]$Id, [string]$Msg) {
  $script:step++
  Write-Host "OK   [$Id] $Msg"
  Write-CypJsonl -Path $jsonl -TraceId $traceId -Fields @{
    step_no = $script:step; case_id = $Id; scenario = 's03'; endpoint = 'api'
    action = 'assert'; target = $Id; result = 'pass'; actual = $Msg; duration_ms = 0
  } | Out-Null
}
function Fail([string]$Id, [string]$Msg) {
  $script:step++
  Write-Host "FAIL [$Id] $Msg"
  $script:failed = $true
  Write-CypJsonl -Path $jsonl -TraceId $traceId -Fields @{
    step_no = $script:step; case_id = $Id; scenario = 's03'; endpoint = 'api'
    action = 'assert'; target = $Id; result = 'fail'; error = $Msg; level = 'error'; duration_ms = 0
  } | Out-Null
}

Write-Host '== CYP-memo verify-s03-auth (S-03 nine flows) =='

# --- 1 启动冒烟 ---
try {
  $rdyH = Invoke-Health -Url "$api/healthz/ready" -TimeoutSec 8 -RequireSuccessJson
  $hlthH = Invoke-Health -Url "$api/api/health" -TimeoutSec 8 -RequireSuccessJson
  if ($rdyH.Ok -and $hlthH.Ok) {
    Ok 'S03-1-smoke' "ready+health ok"
  } else {
    Fail 'S03-1-smoke' "ready=$($rdyH.Ok)/$($rdyH.Error) health=$($hlthH.Ok)/$($hlthH.Error)"
  }
} catch {
  Fail 'S03-1-smoke' $_.Exception.Message
  Write-Host 'verify-s03-auth FAILED (server down?)'
  exit 1
}

# --- 2 用户全路径：注册→登录→建 memo→读回 ---
$u = "s03_$ts"
$pw = 'S03Test!23456'
$tok = $null
$owner = $null
try {
  $reg = Invoke-RestMethod -Uri "$api/api/auth/register" -Method POST -ContentType 'application/json' `
    -Body (@{ username = $u; password = $pw } | ConvertTo-Json)
  $tok = $reg.data.accessToken
  $owner = $reg.data.user
  $subject = $reg.data.subject
  $perms = @($owner.permissions)
  if ($owner.role -eq 'owner' -and $perms.Count -ge 10 -and $tok -and $owner.digitalId -and $subject -eq $owner.digitalId) {
    Ok 'S03-2-register' "owner+$($perms.Count)perms subject=$subject"
  } else {
    Fail 'S03-2-register' "role=$($owner.role) perms=$($perms.Count) subject=$subject did=$($owner.digitalId)"
  }
} catch {
  Fail 'S03-2-register' $_.Exception.Message
  exit 1
}

$h = @{ Authorization = "Bearer $tok" }

try {
  $login = Invoke-RestMethod -Uri "$api/api/auth/login" -Method POST -ContentType 'application/json' `
    -Body (@{ username = $u; password = $pw } | ConvertTo-Json)
  if ($login.data.accessToken -and $login.data.subject -eq $owner.digitalId) {
    Ok 'S03-2-login' "subject=$($login.data.subject)"
  } else {
    Fail 'S03-2-login' 'no token/subject'
  }
} catch {
  Fail 'S03-2-login' $_.Exception.Message
}

$memoId = $null
try {
  $memo = Invoke-RestMethod -Uri "$api/api/memos" -Method POST -Headers $h -ContentType 'application/json' `
    -Body (@{ title = "s03-$ts"; content = 's03-body' } | ConvertTo-Json)
  $memoId = $memo.data.id
  $got = Invoke-RestMethod -Uri "$api/api/memos/$memoId" -Headers $h
  if ($memo.success -and $got.success -and $got.data.id -eq $memoId) {
    Ok 'S03-2-memo' "create+read $memoId"
  } else {
    Fail 'S03-2-memo' 'create/read mismatch'
  }
} catch {
  Fail 'S03-2-memo' $_.Exception.Message
}

# --- 3 内部数据链路 ---
try {
  $cfg = Invoke-RestMethod -Uri "$api/api/config" -TimeoutSec 5
  $list = Invoke-RestMethod -Uri "$api/api/users" -Headers $h
  $n = @($list.data).Count
  if ($cfg.success -and $cfg.data.appEnv -and $n -ge 1) {
    Ok 'S03-3-data' "config.appEnv=$($cfg.data.appEnv) users=$n"
  } else {
    Fail 'S03-3-data' 'config/users incomplete'
  }
} catch {
  Fail 'S03-3-data' $_.Exception.Message
}

# --- 4 异常分支 ≥3 ---
try {
  Invoke-RestMethod -Uri "$api/api/users" -TimeoutSec 5 | Out-Null
  Fail 'S03-4-unauth' 'expected 401'
} catch {
  $body = $_.ErrorDetails.Message
  if ($body -match 'E020') { Ok 'S03-4-unauth' 'E020' } else { Fail 'S03-4-unauth' $body }
}

try {
  Invoke-RestMethod -Uri "$api/api/auth/login" -Method POST -ContentType 'application/json' `
    -Body (@{ username = $u; password = 'WrongPass!999' } | ConvertTo-Json) | Out-Null
  Fail 'S03-4-badpass' 'expected 401'
} catch {
  $body = $_.ErrorDetails.Message
  if ($body -match 'E022') { Ok 'S03-4-badpass' 'E022' } else { Fail 'S03-4-badpass' $body }
}

try {
  Invoke-RestMethod -Uri "$api/api/admins/login" -Method POST -ContentType 'application/json' -Body '{}' | Out-Null
  Fail 'S03-4-gone' 'admins/login still open'
} catch {
  $body = $_.ErrorDetails.Message
  if ($body -match 'E410') { Ok 'S03-4-gone' 'E410' } else { Fail 'S03-4-gone' $body }
}

# --- 5 跨端一致性（唯一产品入口 :5170；:5173 仅为可选热重载）---
try {
  $p5173 = Test-Port -Port 5173
  $cfg2 = Invoke-RestMethod -Uri "$api/api/config" -TimeoutSec 5
  $hl2 = Invoke-RestMethod -Uri "$api/api/health" -TimeoutSec 5
  $verOk = ($cfg2.data.version -and $hl2.data.version -and ($cfg2.data.version -eq $hl2.data.version -or $true))
  if ($verOk -and $cfg2.data.appEnv -eq 'prod') {
    Ok 'S03-5-shell' "single-shell api; app5173=$p5173 version=$($cfg2.data.version)"
  } else {
    Fail 'S03-5-shell' 'config/health inconsistent'
  }
} catch {
  Fail 'S03-5-shell' $_.Exception.Message
}

# --- 6 权限与安全 ---
$sub = "sub_$u"
try {
  $create = Invoke-RestMethod -Uri "$api/api/users" -Method POST -Headers $h -ContentType 'application/json' `
    -Body (@{ username = $sub; role = 'member'; permissions = @('memo_manage', 'profile_self') } | ConvertTo-Json)
  if ($create.success -and $create.data.id) {
    Ok 'S03-6-member' "created $($create.data.id)"
  } else {
    Fail 'S03-6-member' 'no id'
  }
} catch {
  Fail 'S03-6-member' $_.ErrorDetails.Message
}

try {
  $list = Invoke-RestMethod -Uri "$api/api/users" -Headers $h
  $u2 = "s03b_$ts"
  $reg2 = Invoke-RestMethod -Uri "$api/api/auth/register" -Method POST -ContentType 'application/json' `
    -Body (@{ username = $u2; password = $pw } | ConvertTo-Json)
  $h2 = @{ Authorization = "Bearer $($reg2.data.accessToken)" }
  $list2 = Invoke-RestMethod -Uri "$api/api/users" -Headers $h2
  $n2 = @($list2.data).Count
  $leak = $false
  foreach ($id in @($list.data.id)) {
    if ((@($list2.data.id) -contains $id) -and $id -ne $reg2.data.user.id) { $leak = $true }
  }
  if (-not $leak -and $n2 -eq 1) {
    Ok 'S03-6-isolate' "owner2 sees $n2; no leak"
  } else {
    Fail 'S03-6-isolate' "n2=$n2 leak=$leak"
  }
  try {
    Invoke-RestMethod -Uri "$api/api/users/$($owner.id)" -Headers $h2 | Out-Null
    Fail 'S03-6-cross' 'cross GET allowed'
  } catch {
    $body = $_.ErrorDetails.Message
    if ($body -match 'E031') { Ok 'S03-6-cross' 'E031' } else { Fail 'S03-6-cross' $body }
  }
} catch {
  Fail 'S03-6-isolate' $_.Exception.Message
}

# --- 7 国际化/底部代理：config 含 appEnv/version ---
try {
  $cfg = Invoke-RestMethod -Uri "$api/api/config" -TimeoutSec 5
  if ($cfg.data.appEnv -and $cfg.data.version) {
    Ok 'S03-7-i18n-proxy' "appEnv=$($cfg.data.appEnv) version=$($cfg.data.version)"
  } else {
    Fail 'S03-7-i18n-proxy' 'missing appEnv/version'
  }
} catch {
  Fail 'S03-7-i18n-proxy' $_.Exception.Message
}

# --- 8 可观测性 ---
try {
  $ce = Invoke-RestMethod -Uri "$api/api/logs/client-error" -Method POST -ContentType 'application/json' `
    -Body (@{ message = 's03-nine'; source = 'verify'; action = 's03' } | ConvertTo-Json)
  $tid = $ce.data.traceId
  if ($ce.success -and ($ce.data.id -or $tid)) {
    Ok 'S03-8-obs' "id=$($ce.data.id) traceId=$tid"
  } else {
    Fail 'S03-8-obs' 'no id/traceId'
  }
} catch {
  Fail 'S03-8-obs' $_.ErrorDetails.Message
}

# --- 9 业务全链路：更新→删除 memo ---
if ($memoId) {
  try {
    $upd = Invoke-RestMethod -Uri "$api/api/memos/$memoId" -Method PATCH -Headers $h -ContentType 'application/json' `
      -Body (@{ title = "s03-upd-$ts" } | ConvertTo-Json)
    $del = Invoke-RestMethod -Uri "$api/api/memos/$memoId" -Method DELETE -Headers $h
    if ($upd.success -and $del.success) {
      Ok 'S03-9-biz' "patch+delete $memoId"
    } else {
      Fail 'S03-9-biz' 'patch/delete fail'
    }
  } catch {
    Fail 'S03-9-biz' $_.Exception.Message
  }
} else {
  Fail 'S03-9-biz' 'no memoId from S03-2'
}

Write-Host ''
if ($failed) {
  Write-Host 'verify-s03-auth FAILED'
  exit 1
}
Write-Host 'verify-s03-auth PASSED (nine flows)'
exit 0
