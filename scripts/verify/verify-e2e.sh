#!/usr/bin/env bash
# CYP-memo verify-e2e · R5 轻量 bash 版（与 verify-e2e.ps1 输出能力对等）
# 规范 2.3.1-2 (19/20 字段 JSON Lines) · 2.3.2 (9 类场景) · 2.6.4.2 (--tag 精准重跑) · 7.4 R15 (kill-switch)
#
# 行为：
#   - 每条断言实时追加写一行 JSONL 到 logs/verify-e2e-YYYYMMDD-HHMMSS.jsonl（flush，非最后统一 dump）
#   - 终端仍打印 OK/FAIL 人类可读输出（终端+文件双写）
#   - 保留 4 项异常断言 E020/E021/E022/E410 与探针 /api/health /healthz/ready /health/live
#   - --tag <tag> 只跑该 tag 用例（不传则全量）；输出 ran/skipped 计数
#   - CYP_KILL_SWITCH=on 进入"观察模式"：断言只记录不阻断，并打印显式告警
#     （这是防止自动化回路失控的手动熔断保护，不是绕过门禁的手段）
set -uo pipefail

# ---------- 参数 / 环境 ----------
TAG=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --tag) TAG="${2:-}"; shift 2;;
    --tag=*) TAG="${1#--tag=}"; shift;;
    *) echo "unknown arg: $1" >&2; exit 2;;
  esac
done

KILL_SWITCH="${CYP_KILL_SWITCH:-off}"
API="${CYP_API:-https://127.0.0.1:5170}"
TRACE="$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')"
CURL_OPTS=()
if [[ "$API" == https://* ]]; then CURL_OPTS+=(-k); fi

mkdir -p logs
TS="$(date +%Y%m%d-%H%M%S)"
JSONL="logs/verify-e2e-${TS}.jsonl"

step=0
ran=0
skip=0
fail=0
observed=0

# ---------- 工具 ----------
gen_span() { od -An -N8 -tx1 /dev/urandom | tr -d ' \n'; }

json_escape() {
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  s="${s//$'\r'/}"
  s="${s//$'\n'/\\n}"
  s="${s//$'\t'/\\t}"
  printf '%s' "$s"
}

json_str() {
  if [[ -z "$1" ]]; then printf 'null'; else printf '"%s"' "$(json_escape "$1")"; fi
}

# 实时追加写一行 JSONL（规范 2.3.1-4 / AP-12：逐条 flush）
emit() {
  local level="$1" step_no="$2" case_id="$3" scenario="$4" endpoint="$5" action="$6" target="$7"
  local value="$8" expected="$9" actual="${10}" duration_ms="${11}" url="${12}" user_role="${13}" result="${14}" error="${15}"
  local ts span line
  ts="$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)"
  span="$(gen_span)"
  line=$(printf '{"ts":"%s","level":"%s","step_no":%s,"case_id":"%s","scenario":"%s","endpoint":"%s","action":"%s","target":"%s","value":%s,"expected":%s,"actual":%s,"duration_ms":%s,"url":%s,"screenshot":null,"trace_id":"%s","span_id":"%s","parent_span_id":null,"user_role":%s,"result":"%s","error":%s}' \
    "$ts" "$(json_escape "$level")" "$step_no" "$(json_escape "$case_id")" "$(json_escape "$scenario")" \
    "$(json_escape "$endpoint")" "$(json_escape "$action")" "$(json_escape "$target")" \
    "$(json_str "$value")" "$(json_str "$expected")" "$(json_str "$actual")" "$duration_ms" "$(json_str "$url")" \
    "$TRACE" "$span" "$(json_str "$user_role")" "$result" "$(json_str "$error")")
  printf '%s\n' "$line" >> "$JSONL"
}

# 统一断言入口：tag 过滤 + 终端/文件双写 + kill-switch 语义
assert_case() {
  local tag="$1" case_id="$2" scenario="$3" endpoint="$4" action="$5" target="$6"
  local value="$7" expected="$8" actual="$9" ok="${10}" user_role="${11}" error_msg="${12}" duration_ms="${13}"
  if [[ -n "$TAG" && "$TAG" != "$tag" ]]; then
    skip=$((skip + 1)); return
  fi
  ran=$((ran + 1))
  step=$((step + 1))
  local level result final_error
  if [[ "$ok" -eq 0 ]]; then level="info"; result="pass"; final_error=""; else level="error"; result="fail"; final_error="$error_msg"; fi
  emit "$level" "$step" "$case_id" "$scenario" "$endpoint" "$action" "$target" "$value" "$expected" "$actual" "$duration_ms" "$target" "$user_role" "$result" "$final_error"
  if [[ "$ok" -eq 0 ]]; then
    echo "OK   [$case_id] $target"
  else
    echo "FAIL [$case_id] $target :: $error_msg"
    if [[ "$KILL_SWITCH" == "on" ]]; then
      observed=$((observed + 1))
      echo "      [KILL-SWITCH OBSERVE MODE] recorded, NOT blocking (manual review required)"
    else
      fail=1
    fi
  fi
}

# ---------- 启动横幅 ----------
echo "== CYP-memo verify-e2e (R5 bash) =="
echo "trace_id : $TRACE"
echo "jsonl    : $JSONL"
if [[ -n "$TAG" ]]; then echo "tag      : $TAG (filtered run)"; fi
if [[ "$KILL_SWITCH" == "on" ]]; then
  echo "!! KILL-SWITCH=on : OBSERVE MODE — failures are recorded but DO NOT block."
  echo "   This is a manual circuit-breaker to prevent runaway automation, NOT a gate bypass."
fi
echo ""

# ---------- 用例 ----------

# 9 类场景注册（静态 meta，始终 pass）
assert_case "meta" "S03-matrix" "nine_class_register" "meta" "register" "9-class" \
  "" "matrix" "covered:start+auth+obs; rest->P6" 0 "system" "" 0

# 端口监听
port_up=0
if (echo >/dev/tcp/127.0.0.1/5170) >/dev/null 2>&1; then port_up=1; fi
assert_case "smoke" "S02-port" "happy_ports" "web" "probe" "port:5170" \
  "" "listening" "$([ "$port_up" -eq 1 ] && echo listening || echo down)" "$((1 - port_up))" "anonymous" "port 5170 not listening" 0

# /api/health
t0=$(date +%s%3N)
h=$(curl "${CURL_OPTS[@]}" -fsS "$API/api/health" 2>/dev/null || true)
t1=$(date +%s%3N)
if echo "$h" | grep -q '"success"\s*:\s*true\|"success": true'; then hok=0; hact="success=true"; else hok=1; hact="${h:0:80}"; fi
assert_case "smoke" "S02-health" "happy_health" "api" "get" "/api/health" \
  "" "success=true" "$hact" "$hok" "anonymous" "GET /api/health success!=true" "$((t1 - t0))"

# /healthz/ready
t0=$(date +%s%3N)
r=$(curl "${CURL_OPTS[@]}" -fsS "$API/healthz/ready" 2>/dev/null || true)
t1=$(date +%s%3N)
if echo "$r" | grep -q '"success"\s*:\s*true\|"success": true'; then rok=0; ract="success=true"; else rok=1; ract="${r:0:80}"; fi
assert_case "smoke" "S02-ready" "happy_ready" "api" "get" "/healthz/ready" \
  "" "success=true" "$ract" "$rok" "anonymous" "GET /healthz/ready success!=true" "$((t1 - t0))"

# /health/live
t0=$(date +%s%3N)
l=$(curl "${CURL_OPTS[@]}" -fsS "$API/health/live" 2>/dev/null || true)
t1=$(date +%s%3N)
if echo "$l" | grep -q '"status"\s*:\s*"alive"\|"status": "alive"'; then lok=0; lact="alive"; else lok=1; lact="${l:0:80}"; fi
assert_case "smoke" "S02-live" "happy_live" "api" "get" "/health/live" \
  "" "status=alive" "$lact" "$lok" "anonymous" "GET /health/live status!=alive" "$((t1 - t0))"

# S02-trace-csp：trace 透传 + CSP 安全头（与 .ps1 S02-trace-csp / happy_observability 对等）
# 只做 trace 回传与 CSP 头两项断言；E020 由下方 S02-exc-unauth 单独覆盖，避免重复。
t0=$(date +%s%3N)
trace_hdr=$(curl "${CURL_OPTS[@]}" -s -D - -o /dev/null -H "X-Trace-Id: $TRACE" "$API/api/users" 2>/dev/null || true)
t1=$(date +%s%3N)
if echo "$trace_hdr" | grep -qi "X-Trace-Id:[[:space:]]*$TRACE"; then tr_ok=0; else tr_ok=1; fi
if echo "$trace_hdr" | grep -qi "Content-Security-Policy:"; then csp_ok=0; else csp_ok=1; fi
tc_act="trace=$([ "$tr_ok" -eq 0 ] && echo yes || echo no); csp=$([ "$csp_ok" -eq 0 ] && echo yes || echo no)"
if [[ "$tr_ok" -eq 0 && "$csp_ok" -eq 0 ]]; then tc_ok=0; tc_msg=""; else tc_ok=1; tc_msg=""; if [[ "$tr_ok" -ne 0 ]]; then tc_msg="trace 未透传 (X-Trace-Id 未回传响应头)"; else tc_msg="CSP 头缺失 (响应头无 Content-Security-Policy)"; fi; fi
assert_case "observability" "S02-trace-csp" "happy_observability" "api" "get" "/api/users" \
  "" "X-Trace-Id+CSP" "$tc_act" "$tc_ok" "anonymous" "$tc_msg" "$((t1 - t0))"

# E020 未认证
t0=$(date +%s%3N)
u=$(curl -k -s -H "X-Trace-Id: $TRACE" "$API/api/users" 2>/dev/null || true)
t1=$(date +%s%3N)
if echo "$u" | grep -q '"code"\s*:\s*"E020"\|"code": "E020"'; then e020=0; e020a="E020"; else e020=1; e020a="${u:0:80}"; fi
assert_case "api:unauth" "S02-exc-unauth" "exception_auth" "api" "get" "/api/users" \
  "" "E020" "$e020a" "$e020" "anonymous" "expected E020 (unauthorized)" "$((t1 - t0))"

# E021 坏 token
t0=$(date +%s%3N)
b=$(curl -k -s -H "Authorization: Bearer bad" -H "X-Trace-Id: $TRACE" "$API/api/users" 2>/dev/null || true)
t1=$(date +%s%3N)
if echo "$b" | grep -q '"code"\s*:\s*"E021"\|"code": "E021"'; then e021=0; e021a="E021"; else e021=1; e021a="${b:0:80}"; fi
assert_case "api:badtoken" "S02-exc-bad-token" "exception_auth" "api" "get" "/api/users" \
  "" "E021" "$e021a" "$e021" "user" "expected E021 (bad token)" "$((t1 - t0))"

# E022 登录失败
t0=$(date +%s%3N)
lg=$(curl -k -s -H "Content-Type: application/json" -H "X-Trace-Id: $TRACE" \
  -d '{"username":"__no_such__","password":"x"}' "$API/api/auth/login" 2>/dev/null || true)
t1=$(date +%s%3N)
if echo "$lg" | grep -q '"code"\s*:\s*"E022"\|"code": "E022"'; then e022=0; e022a="E022"; else e022=1; e022a="${lg:0:80}"; fi
assert_case "auth" "S02-exc-login" "exception_login" "api" "post" "/api/auth/login" \
  "" "E022" "$e022a" "$e022" "anonymous" "expected E022 (login fail)" "$((t1 - t0))"

# E410 管理员已移除
# 注意：本机 API 按设计先校验 Idempotency-Key（缺键返回 E040），
# 因此本断言必须携带幂等键，否则会在前置校验层就被拦下、永远到不了 E410 分支。
t0=$(date +%s%3N)
g=$(curl -k -s -H "Content-Type: application/json" -H "Idempotency-Key: cyp-verify-e410" -d '{}' "$API/api/admins/login" 2>/dev/null || true)
t1=$(date +%s%3N)
if echo "$g" | grep -q '"code"\s*:\s*"E410"\|"code": "E410"'; then e410=0; e410a="E410"; else e410=1; e410a="${g:0:80}"; fi
assert_case "abnormal" "S02-exc-admins-gone" "exception_gone" "api" "post" "/api/admins/login" \
  "" "E410" "$e410a" "$e410" "admin_removed" "expected E410 (admins removed)" "$((t1 - t0))"

# ========== S03 业务流程系列 ==========
s03_ok=0
s03_token=""
s03_memo_id=""
s03_username="e2e-test-$TS"
s03_password='TestPass123!'

# S03-register: 用户注册
t0=$(date +%s%3N)
reg_body=$(printf '{"username":"%s","password":"%s"}' "$s03_username" "$s03_password")
reg=$(curl "${CURL_OPTS[@]}" -s -H "Content-Type: application/json" -H "X-Trace-Id: $TRACE" \
  -d "$reg_body" "$API/api/auth/register" 2>/dev/null || true)
t1=$(date +%s%3N)
if echo "$reg" | grep -q '"success"\s*:\s*true\|"success": true'; then reg_success=0; else reg_success=1; fi
if echo "$reg" | grep -q '"accessToken"\s*:\s*"[^"]*"\|"accessToken": "[^"]*"'; then reg_has_token=0; else reg_has_token=1; fi
if echo "$reg" | grep -q '"user"\s*:\s*{\|"user": {'; then reg_has_user=0; else reg_has_user=1; fi
if [[ "$reg_success" -eq 0 && "$reg_has_token" -eq 0 && "$reg_has_user" -eq 0 ]]; then reg_ok=0; else reg_ok=1; fi
if [[ "$reg_ok" -eq 0 ]]; then
  s03_token=$(echo "$reg" | grep -o '"accessToken"\s*:\s*"[^"]*"' | head -1 | sed 's/.*"accessToken"\s*:\s*"\([^"]*\)".*/\1/')
fi
reg_act="success=$([ "$reg_success" -eq 0 ] && echo true || echo false)+token=$([ "$reg_has_token" -eq 0 ] && echo yes || echo no)+user=$([ "$reg_has_user" -eq 0 ] && echo yes || echo no)"
assert_case "business" "S03-register" "business_register" "api" "post" "POST /api/auth/register" \
  "" "success=true with accessToken and user" "$reg_act" "$reg_ok" "anonymous" "registration failed or missing token/user in response" "$((t1 - t0))"
if [[ "$reg_ok" -ne 0 ]]; then s03_ok=1; fi

# S03-login: 用户登录
if [[ "$s03_ok" -eq 0 ]]; then
  t0=$(date +%s%3N)
  login_body=$(printf '{"username":"%s","password":"%s"}' "$s03_username" "$s03_password")
  login_resp=$(curl "${CURL_OPTS[@]}" -s -H "Content-Type: application/json" -H "X-Trace-Id: $TRACE" \
    -d "$login_body" "$API/api/auth/login" 2>/dev/null || true)
  t1=$(date +%s%3N)
  if echo "$login_resp" | grep -q '"success"\s*:\s*true\|"success": true'; then login_success=0; else login_success=1; fi
  if echo "$login_resp" | grep -q '"accessToken"\s*:\s*"[^"]*"\|"accessToken": "[^"]*"'; then login_has_token=0; else login_has_token=1; fi
  if [[ "$login_success" -eq 0 && "$login_has_token" -eq 0 ]]; then login_ok=0; else login_ok=1; fi
  if [[ "$login_ok" -eq 0 ]]; then
    s03_token=$(echo "$login_resp" | grep -o '"accessToken"\s*:\s*"[^"]*"' | head -1 | sed 's/.*"accessToken"\s*:\s*"\([^"]*\)".*/\1/')
  fi
  login_act="success=$([ "$login_success" -eq 0 ] && echo true || echo false)+token=$([ "$login_has_token" -eq 0 ] && echo yes || echo no)"
  assert_case "business" "S03-login" "business_login" "api" "post" "POST /api/auth/login" \
    "" "success=true with accessToken" "$login_act" "$login_ok" "anonymous" "login failed or missing token in response" "$((t1 - t0))"
  if [[ "$login_ok" -ne 0 ]]; then s03_ok=1; fi
else
  skip=$((skip + 1))
fi

# S03-create-memo: 创建备忘
if [[ "$s03_ok" -eq 0 ]]; then
  t0=$(date +%s%3N)
  memo_title="E2E Test Memo $TS"
  memo_content='This is a test memo created by verify-e2e'
  memo_body=$(printf '{"title":"%s","content":"%s","tags":["test","e2e"]}' "$memo_title" "$memo_content")
  memo_create=$(curl "${CURL_OPTS[@]}" -s -H "Content-Type: application/json" \
    -H "Authorization: Bearer $s03_token" -H "X-Trace-Id: $TRACE" \
    -d "$memo_body" "$API/api/memos" 2>/dev/null || true)
  t1=$(date +%s%3N)
  if echo "$memo_create" | grep -q '"success"\s*:\s*true\|"success": true'; then create_success=0; else create_success=1; fi
  if echo "$memo_create" | grep -q '"id"\s*:\s*"[^"]*"\|"id": "[^"]*"'; then create_has_id=0; else create_has_id=1; fi
  if [[ "$create_success" -eq 0 && "$create_has_id" -eq 0 ]]; then create_ok=0; else create_ok=1; fi
  if [[ "$create_ok" -eq 0 ]]; then
    s03_memo_id=$(echo "$memo_create" | grep -o '"id"\s*:\s*"[^"]*"' | head -1 | sed 's/.*"id"\s*:\s*"\([^"]*\)".*/\1/')
  fi
  create_act="success=$([ "$create_success" -eq 0 ] && echo true || echo false)+id=$([ "$create_has_id" -eq 0 ] && echo yes || echo no)"
  assert_case "business" "S03-create-memo" "business_create_memo" "api" "post" "POST /api/memos" \
    "" "success=true with memo id" "$create_act" "$create_ok" "user" "create memo failed or missing id in response" "$((t1 - t0))"
  if [[ "$create_ok" -ne 0 ]]; then s03_ok=1; fi
else
  skip=$((skip + 1))
fi

# S03-list-memos: 查询备忘列表
if [[ "$s03_ok" -eq 0 && -n "$s03_memo_id" ]]; then
  t0=$(date +%s%3N)
  memo_list=$(curl "${CURL_OPTS[@]}" -s -H "Authorization: Bearer $s03_token" -H "X-Trace-Id: $TRACE" \
    "$API/api/memos" 2>/dev/null || true)
  t1=$(date +%s%3N)
  if echo "$memo_list" | grep -q '"success"\s*:\s*true\|"success": true'; then list_success=0; else list_success=1; fi
  if echo "$memo_list" | grep -q "$s03_memo_id"; then list_has_memo=0; else list_has_memo=1; fi
  if [[ "$list_success" -eq 0 && "$list_has_memo" -eq 0 ]]; then list_ok=0; else list_ok=1; fi
  list_act="success=$([ "$list_success" -eq 0 ] && echo true || echo false)+memo_found=$([ "$list_has_memo" -eq 0 ] && echo yes || echo no)"
  assert_case "business" "S03-list-memos" "business_list_memos" "api" "get" "GET /api/memos" \
    "" "success=true and list contains created memo" "$list_act" "$list_ok" "user" "list memos failed or created memo not found in list" "$((t1 - t0))"
  if [[ "$list_ok" -ne 0 ]]; then s03_ok=1; fi
else
  skip=$((skip + 1))
fi

# S03-delete-memo: 删除备忘
if [[ "$s03_ok" -eq 0 && -n "$s03_memo_id" ]]; then
  t0=$(date +%s%3N)
  memo_del=$(curl "${CURL_OPTS[@]}" -s -X DELETE -H "Authorization: Bearer $s03_token" -H "X-Trace-Id: $TRACE" \
    "$API/api/memos/$s03_memo_id" 2>/dev/null || true)
  t1=$(date +%s%3N)
  if echo "$memo_del" | grep -q '"success"\s*:\s*true\|"success": true'; then del_ok=0; del_act="success=true"; else del_ok=1; del_act="success=false"; fi
  assert_case "business" "S03-delete-memo" "business_delete_memo" "api" "delete" "DELETE /api/memos/$s03_memo_id" \
    "" "success=true" "$del_act" "$del_ok" "user" "delete memo failed" "$((t1 - t0))"
  if [[ "$del_ok" -ne 0 ]]; then s03_ok=1; fi
else
  skip=$((skip + 1))
fi

# S03-logout: 用户登出
if [[ "$s03_ok" -eq 0 && -n "$s03_token" ]]; then
  t0=$(date +%s%3N)
  logout_resp=$(curl "${CURL_OPTS[@]}" -s -X POST -H "Content-Type: application/json" \
    -H "Authorization: Bearer $s03_token" -H "X-Trace-Id: $TRACE" \
    -d '{}' "$API/api/auth/logout" 2>/dev/null || true)
  t1=$(date +%s%3N)
  if echo "$logout_resp" | grep -q '"success"\s*:\s*true\|"success": true'; then logout_ok=0; logout_act="success=true"; else logout_ok=1; logout_act="success=false"; fi
  assert_case "business" "S03-logout" "business_logout" "api" "post" "POST /api/auth/logout" \
    "" "success=true" "$logout_act" "$logout_ok" "user" "logout failed" "$((t1 - t0))"
  if [[ "$logout_ok" -ne 0 ]]; then s03_ok=1; fi
else
  skip=$((skip + 1))
fi

# ========== S04 CI03 端口隔离验证系列 ==========

S04_KMS_ENABLED=0
if [[ -n "${KMS_AUTH_TOKEN:-}" ]]; then S04_KMS_ENABLED=1; fi

# 获取端口绑定地址
s04_bind_addrs() {
  local port="$1"
  local addrs=""
  if command -v ss >/dev/null 2>&1; then
    addrs=$(ss -tlnp "sport = :$port" 2>/dev/null | awk 'NR>1 {split($4,a,":"); print a[1]}' | sed 's/\[//;s/\]//' | sort -u | tr '\n' ' ')
  elif command -v netstat >/dev/null 2>&1; then
    addrs=$(netstat -tlnp 2>/dev/null | awk -v p=":$port" '$4 ~ p"$" {split($4,a,":"); print a[1]}' | sed 's/\[//;s/\]//' | sort -u | tr '\n' ' ')
  fi
  echo "${addrs% }"
}

# 获取监听 PID 列表
s04_listen_pids() {
  local port="$1"
  local pids=""
  if command -v ss >/dev/null 2>&1; then
    pids=$(ss -tlnp "sport = :$port" 2>/dev/null | grep -oE 'pid=[0-9]+' | sed 's/pid=//' | sort -u | tr '\n' ' ')
  elif command -v lsof >/dev/null 2>&1; then
    pids=$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null | sort -u | tr '\n' ' ')
  fi
  echo "${pids% }"
}

# S04-01：端口独立性验证
S04_SEEN_PIDS=""
for entry in "5170|产品统一网关" "10170|后端 API 服务" "13175|MCP 旁路服务"; do
  IFS='|' read -r port name <<< "$entry"
  t0=$(date +%s%3N)
  pids=$(s04_listen_pids "$port")
  has_unique=1
  if [[ -n "$pids" ]]; then
    for pid in $pids; do
      if [[ " $S04_SEEN_PIDS " != *" $pid "* ]]; then
        S04_SEEN_PIDS="${S04_SEEN_PIDS} ${pid}"
        has_unique=0
      fi
    done
  fi
  ok=1
  if [[ -n "$pids" && "$has_unique" -eq 0 ]]; then ok=0; fi
  t1=$(date +%s%3N)
  actual="listening, PIDs=${pids:-none}"
  if [[ -z "$pids" ]]; then actual="no listener"; fi
  assert_case "ci03" "S04-01-port-independence" "ci03_port_independence" "meta" "probe" "port:$port ($name)" \
    "" "独立监听器" "$actual" "$ok" "system" "端口 $port 无独立监听器" "$((t1 - t0))"
done
if [[ "$S04_KMS_ENABLED" -eq 1 ]]; then
  t0=$(date +%s%3N)
  pids=$(s04_listen_pids 12000)
  has_unique=1
  if [[ -n "$pids" ]]; then
    for pid in $pids; do
      if [[ " $S04_SEEN_PIDS " != *" $pid "* ]]; then
        S04_SEEN_PIDS="${S04_SEEN_PIDS} ${pid}"
        has_unique=0
      fi
    done
  fi
  ok=1
  if [[ -n "$pids" && "$has_unique" -eq 0 ]]; then ok=0; fi
  t1=$(date +%s%3N)
  actual="listening, PIDs=${pids:-none}"
  if [[ -z "$pids" ]]; then actual="no listener"; fi
  assert_case "ci03" "S04-01-port-independence" "ci03_port_independence" "meta" "probe" "port:12000 (KMS 密钥保险箱)" \
    "" "独立监听器" "$actual" "$ok" "system" "端口 12000 无独立监听器" "$((t1 - t0))"
else
  skip=$((skip + 1))
fi

# S04-02：端口段合规性验证
for entry in "5170|产品统一网关|5000|5999|前端段 5000-5999" \
             "10170|后端 API 服务|10000|10999|后端API段 10000-10999" \
             "13175|MCP 旁路服务|13000|13999|旁路段 13000-13999"; do
  IFS='|' read -r port name seg_min seg_max seg_name <<< "$entry"
  t0=$(date +%s%3N)
  ok=1
  if [[ "$port" -ge "$seg_min" && "$port" -le "$seg_max" ]]; then ok=0; fi
  t1=$(date +%s%3N)
  assert_case "ci03" "S04-02-segment-compliance" "ci03_segment_compliance" "meta" "assert" "port:$port ($name)" \
    "" "$seg_name" "$port ∈ $seg_min-$seg_max" "$ok" "system" "端口 $port 不属于 $seg_name" "$((t1 - t0))"
done
if [[ "$S04_KMS_ENABLED" -eq 1 ]]; then
  t0=$(date +%s%3N)
  ok=0
  t1=$(date +%s%3N)
  assert_case "ci03" "S04-02-segment-compliance" "ci03_segment_compliance" "meta" "assert" "port:12000 (KMS 密钥保险箱)" \
    "" "基础设施段 12000-12999" "12000 ∈ 12000-12999" "$ok" "system" "端口 12000 不属于基础设施段 12000-12999" "$((t1 - t0))"
else
  skip=$((skip + 1))
fi

# S04-03：隔离级别验证
# 网关端口 5170：应对外暴露
t0=$(date +%s%3N)
gw_addrs=$(s04_bind_addrs 5170)
gw_ext_ok=1
if [[ -n "$gw_addrs" ]]; then
  for a in $gw_addrs; do
    case "$a" in
      127.0.0.1|::1|localhost|127.*) ;;
      *) gw_ext_ok=0; break ;;
    esac
  done
fi
t1=$(date +%s%3N)
assert_case "ci03" "S04-03-isolation-level" "ci03_isolation_level" "meta" "assert" "port:5170 (产品统一网关 · L3)" \
  "" "0.0.0.0 / 对外暴露" "bind=${gw_addrs:-none}" "$gw_ext_ok" "system" "网关端口 5170 未对外暴露（应绑定 0.0.0.0）" "$((t1 - t0))"

# 后端端口：应仅环回
for entry in "10170|后端 API 服务|L2" "13175|MCP 旁路服务|L4"; do
  IFS='|' read -r port name layer <<< "$entry"
  t0=$(date +%s%3N)
  addrs=$(s04_bind_addrs "$port")
  lb_ok=0
  non_lb=""
  if [[ -z "$addrs" ]]; then
    lb_ok=1
  else
    for a in $addrs; do
      case "$a" in
        127.0.0.1|::1|localhost|127.*) ;;
        *) lb_ok=1; non_lb="${non_lb}${a} " ;;
      esac
    done
  fi
  t1=$(date +%s%3N)
  assert_case "ci03" "S04-03-isolation-level" "ci03_isolation_level" "meta" "assert" "port:$port ($name · $layer)" \
    "" "127.0.0.1 / 仅环回" "bind=${addrs:-none}" "$lb_ok" "system" "后端端口 $port 绑定了非环回地址: ${non_lb% }" "$((t1 - t0))"
done
# KMS 可选
if [[ "$S04_KMS_ENABLED" -eq 1 ]]; then
  t0=$(date +%s%3N)
  addrs=$(s04_bind_addrs 12000)
  lb_ok=0
  non_lb=""
  if [[ -z "$addrs" ]]; then
    lb_ok=1
  else
    for a in $addrs; do
      case "$a" in
        127.0.0.1|::1|localhost|127.*) ;;
        *) lb_ok=1; non_lb="${non_lb}${a} " ;;
      esac
    done
  fi
  t1=$(date +%s%3N)
  assert_case "ci03" "S04-03-isolation-level" "ci03_isolation_level" "meta" "assert" "port:12000 (KMS 密钥保险箱 · L1)" \
    "" "127.0.0.1 / 仅环回" "bind=${addrs:-none}" "$lb_ok" "system" "KMS 端口 12000 绑定了非环回地址: ${non_lb% }" "$((t1 - t0))"
else
  skip=$((skip + 1))
fi

# S04-04：跨端口直接访问阻断验证
# 获取本机非环回 IP
EXT_IP=""
if command -v hostname >/dev/null 2>&1; then
  EXT_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
fi
if [[ -z "$EXT_IP" ]] && command -v ip >/dev/null 2>&1; then
  EXT_IP=$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src"){print $(i+1); exit}}')
fi

for entry in "10170|后端 API 服务" "13175|MCP 旁路服务"; do
  IFS='|' read -r port name <<< "$entry"
  t0=$(date +%s%3N)
  blocked=0
  if [[ -n "$EXT_IP" ]]; then
    if (echo >/dev/tcp/"$EXT_IP"/"$port") 2>/dev/null; then
      blocked=1
    fi
  fi
  t1=$(date +%s%3N)
  if [[ "$blocked" -eq 0 ]]; then
    actual="从 ${EXT_IP:-unknown} 不可达 (连接拒绝)"
  else
    actual="从 ${EXT_IP:-unknown} 可达 (未阻断!)"
  fi
  assert_case "ci03" "S04-04-cross-port-block" "ci03_cross_port_block" "meta" "probe" "port:$port ($name)" \
    "" "外部访问被阻断" "$actual" "$blocked" "system" "后端端口 $port 从外部地址 $EXT_IP 可直接访问，违反隔离要求" "$((t1 - t0))"
done
if [[ "$S04_KMS_ENABLED" -eq 1 ]]; then
  t0=$(date +%s%3N)
  blocked=0
  if [[ -n "$EXT_IP" ]]; then
    if (echo >/dev/tcp/"$EXT_IP"/12000) 2>/dev/null; then
      blocked=1
    fi
  fi
  t1=$(date +%s%3N)
  if [[ "$blocked" -eq 0 ]]; then
    actual="从 ${EXT_IP:-unknown} 不可达 (连接拒绝)"
  else
    actual="从 ${EXT_IP:-unknown} 可达 (未阻断!)"
  fi
  assert_case "ci03" "S04-04-cross-port-block" "ci03_cross_port_block" "meta" "probe" "port:12000 (KMS 密钥保险箱)" \
    "" "外部访问被阻断" "$actual" "$blocked" "system" "KMS 端口 12000 从外部地址 $EXT_IP 可直接访问，违反隔离要求" "$((t1 - t0))"
else
  skip=$((skip + 1))
fi

# S04-05：各服务独立健康检查
for entry in "5170|产品统一网关|https://127.0.0.1:5170/healthz/ready|success" \
             "10170|后端 API 服务|https://127.0.0.1:10170/healthz/ready|success" \
             "13175|MCP 旁路服务|https://127.0.0.1:13175/healthz|ok"; do
  IFS='|' read -r port name url htype <<< "$entry"
  t0=$(date +%s%3N)
  if [[ "$url" == https://* ]]; then
    resp=$(curl "${CURL_OPTS[@]}" -fsS --max-time 5 "$url" 2>/dev/null || true)
  else
    resp=$(curl -fsS --max-time 5 "$url" 2>/dev/null || true)
  fi
  h_ok=1
  if [[ -n "$resp" ]]; then
    case "$htype" in
      success)
        if echo "$resp" | grep -q '"success"\s*:\s*true\|"success": true'; then h_ok=0; fi
        ;;
      ok)
        if echo "$resp" | grep -q '"ok"\s*:\s*true\|"ok": true'; then h_ok=0; fi
        ;;
    esac
  fi
  t1=$(date +%s%3N)
  actual=$([ "$h_ok" -eq 0 ] && echo "200 OK" || echo "health check failed")
  assert_case "ci03" "S04-05-independent-health" "ci03_independent_health" "meta" "get" "port:$port ($name)" \
    "" "健康检查 200" "$actual" "$h_ok" "system" "$name 端口 $port 健康检查失败" "$((t1 - t0))"
done
if [[ "$S04_KMS_ENABLED" -eq 1 ]]; then
  t0=$(date +%s%3N)
  resp=$(curl -fsS --max-time 5 "http://127.0.0.1:12000/kms/v1/health" 2>/dev/null || true)
  h_ok=1
  if echo "$resp" | grep -q '"status"\s*:\s*"ok"\|"status": "ok"'; then h_ok=0; fi
  t1=$(date +%s%3N)
  actual=$([ "$h_ok" -eq 0 ] && echo "200 OK" || echo "health check failed")
  assert_case "ci03" "S04-05-independent-health" "ci03_independent_health" "meta" "get" "port:12000 (KMS 密钥保险箱)" \
    "" "健康检查 200" "$actual" "$h_ok" "system" "KMS 端口 12000 健康检查失败" "$((t1 - t0))"
else
  skip=$((skip + 1))
fi

# S04-06：通信授权链路验证
# 链路 1：网关 → API
t0=$(date +%s%3N)
gw_api=$(curl "${CURL_OPTS[@]}" -fsS "$API/api/health" 2>/dev/null || true)
if echo "$gw_api" | grep -q '"success"\s*:\s*true\|"success": true'; then link1_ok=0; else link1_ok=1; fi
t1=$(date +%s%3N)
link1_act=$([ "$link1_ok" -eq 0 ] && echo "200 OK" || echo "proxy failed")
assert_case "ci03" "S04-06-auth-link" "ci03_auth_link" "api" "get" "网关 → API (/api/health)" \
  "" "代理连通 · 200" "$link1_act" "$link1_ok" "system" "网关 → API 授权链路不通：/api/health 代理失败" "$((t1 - t0))"

# 链路 2：网关 → MCP
t0=$(date +%s%3N)
gw_mcp=$(curl "${CURL_OPTS[@]}" -fsS "$API/mcp/healthz" 2>/dev/null || true)
if echo "$gw_mcp" | grep -q '"ok"\s*:\s*true\|"ok": true'; then link2_ok=0; else link2_ok=1; fi
t1=$(date +%s%3N)
link2_act=$([ "$link2_ok" -eq 0 ] && echo "ok=true" || echo "proxy failed")
assert_case "ci03" "S04-06-auth-link" "ci03_auth_link" "api" "get" "网关 → MCP (/mcp/healthz)" \
  "" "代理连通 · ok=true" "$link2_act" "$link2_ok" "system" "网关 → MCP 授权链路不通：/mcp/healthz 代理失败" "$((t1 - t0))"

# 链路 3：API → KMS（可选）
if [[ "$S04_KMS_ENABLED" -eq 1 ]]; then
  t0=$(date +%s%3N)
  api_h=$(curl "${CURL_OPTS[@]}" -fsS "$API/api/health" 2>/dev/null || true)
  kms_direct=$(curl -fsS "http://127.0.0.1:12000/kms/v1/health" 2>/dev/null || true)
  api_ok=1
  if echo "$api_h" | grep -q '"success"\s*:\s*true\|"success": true'; then api_ok=0; fi
  kms_ok=1
  if echo "$kms_direct" | grep -q '"status"\s*:\s*"ok"\|"status": "ok"'; then kms_ok=0; fi
  link3_ok=1
  if [[ "$api_ok" -eq 0 && "$kms_ok" -eq 0 ]]; then link3_ok=0; fi
  t1=$(date +%s%3N)
  assert_case "ci03" "S04-06-auth-link" "ci03_auth_link" "api" "get" "API → KMS (KMS 健康 + API 健康)" \
    "" "授权链路连通" "api_health=$([[ $api_ok -eq 0 ]] && echo true || echo false) kms_health=$([[ $kms_ok -eq 0 ]] && echo true || echo false)" \
    "$link3_ok" "system" "API → KMS 授权链路验证失败" "$((t1 - t0))"
else
  skip=$((skip + 1))
fi

# ---------- 汇总 ----------
echo ""
echo "verify-e2e ran=$ran skipped=$skip (jsonl: $JSONL)"
if [[ "$KILL_SWITCH" == "on" ]]; then
  if [[ "$observed" -gt 0 ]]; then
    echo "KILL-SWITCH OBSERVE MODE: $observed failure(s) observed but NOT blocking. Manual review required."
    echo "  This is a safety guard against runaway automation, NOT a way to bypass the gate."
  fi
  echo "verify-e2e finished (observe mode)"
  exit 0
fi
if [[ "$fail" -ne 0 ]]; then echo "verify-e2e FAILED"; exit 1; fi
echo "verify-e2e PASSED"
