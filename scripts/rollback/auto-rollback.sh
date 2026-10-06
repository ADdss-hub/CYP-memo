#!/usr/bin/env bash
# CYP-memo: 基于监控指标的自动回滚脚本（Linux/macOS 版本）
# 策略文档：docs/auto-rollback-policy.md
# 默认 dry-run 安全模式，须显式 CYP_AUTO_ROLLBACK_ENABLED=true + CYP_AUTO_ROLLBACK_DRY_RUN=false 才真实执行
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="$ROOT/logs"
mkdir -p "$LOG_DIR"

TRACE_ID="$(date +%s%N | md5sum | head -c 32 2>/dev/null || echo $$-$(date +%s))"
START_TS=$(date +%s%3N)

# ---------- 参数解析 ----------
DRY_RUN=true
RESET_COOLDOWN=false
CHECK_COOLDOWN_ONLY=false
SHOW_HELP=false

for arg in "$@"; do
  case "$arg" in
    --dry-run|-dry-run) DRY_RUN=true ;;
    --execute|-execute) DRY_RUN=false ;;
    --reset-cooldown|-reset-cooldown) RESET_COOLDOWN=true ;;
    --cooldown|-cooldown) CHECK_COOLDOWN_ONLY=true ;;
    --help|-help|-h) SHOW_HELP=true ;;
    *) ;;
  esac
done

if [ "$SHOW_HELP" = true ]; then
  cat <<'EOF'
CYP-memo auto-rollback — 基于监控指标的自动回滚

用法:
  scripts/rollback/auto-rollback.sh [选项]

选项:
  --dry-run        仅检测不执行（默认安全模式）
  --execute        真实执行回滚（需同时启用 CYP_AUTO_ROLLBACK_ENABLED=true）
  --cooldown       仅检查冷却状态并退出
  --reset-cooldown 重置冷却状态
  --help           显示帮助

环境变量:
  CYP_AUTO_ROLLBACK_ENABLED       总开关 (默认 false)
  CYP_AUTO_ROLLBACK_DRY_RUN       dry-run 模式 (默认 true)
  CYP_AUTO_ROLLBACK_COOLDOWN_SEC  冷却期秒数 (默认 1800)
  CYP_AUTO_ROLLBACK_MAX_CONSECUTIVE  连续回滚上限 (默认 2)
  CYP_AUTO_ROLLBACK_PROM_URL      Prometheus API 地址 (默认 http://localhost:9090)
  CYP_AUTO_ROLLBACK_METRICS_FILE  本地指标文件路径（无 Prometheus 时使用）
  CYP_AUTO_ROLLBACK_LOG_FILE      日志文件路径 (默认 logs/auto-rollback.jsonl)

策略文档: docs/auto-rollback-policy.md
EOF
  exit 0
fi

# ---------- 配置 ----------
LOG_FILE="${CYP_AUTO_ROLLBACK_LOG_FILE:-$LOG_DIR/auto-rollback.jsonl}"
COOLDOWN_FILE="$LOG_DIR/auto-rollback-cooldown.json"
ENABLED="${CYP_AUTO_ROLLBACK_ENABLED:-false}"
COOLDOWN_SEC="${CYP_AUTO_ROLLBACK_COOLDOWN_SEC:-1800}"
MAX_CONSECUTIVE="${CYP_AUTO_ROLLBACK_MAX_CONSECUTIVE:-2}"
PROM_URL="${CYP_AUTO_ROLLBACK_PROM_URL:-http://localhost:9090}"
METRICS_FILE="${CYP_AUTO_ROLLBACK_METRICS_FILE:-}"

# 命令行 --execute 覆盖环境变量
if [ "$DRY_RUN" = true ] && [ "${CYP_AUTO_ROLLBACK_DRY_RUN:-true}" = "false" ]; then
  DRY_RUN=false
fi

# ---------- 工具函数 ----------
write_jsonl() {
  local level="${1:-info}"
  local action="${2:-evaluate}"
  local result="${3:-pass}"
  local extra="${4:-}"
  local now
  now="$(date -u +%Y-%m-%dT%H:%M:%S.%NZ 2>/dev/null || date -u +%Y-%m-%dT%H:%M:%SZ)"
  local duration_ms=$(( $(date +%s%3N) - START_TS ))
  cat >>"$LOG_FILE" <<JSON
{"ts":"$now","level":"$level","step_no":1,"case_id":"auto-rollback","scenario":"auto_rollback_check","endpoint":"ops","action":"$action","target":"metrics","value":null,"expected":null,"actual":null,"duration_ms":$duration_ms,"url":null,"screenshot":null,"trace_id":"$TRACE_ID","span_id":"$(date +%s%N | md5sum | head -c 16 2>/dev/null || echo 'auto-rollback')","parent_span_id":null,"user_role":null,"result":"$result","error":null$extra}
JSON
}

get_cooldown_state() {
  if [ ! -f "$COOLDOWN_FILE" ]; then
    echo '{"last_rollback_ts":null,"rollback_count_window":0,"escalated":false,"cooldown_seconds":'$COOLDOWN_SEC'}'
    return
  fi
  cat "$COOLDOWN_FILE" 2>/dev/null || echo '{"last_rollback_ts":null,"rollback_count_window":0,"escalated":false,"cooldown_seconds":'$COOLDOWN_SEC'}'
}

save_cooldown_state() {
  echo "$1" > "$COOLDOWN_FILE"
}

is_cooldown_active() {
  local state="$1"
  local last_ts
  last_ts="$(echo "$state" | grep -o '"last_rollback_ts":"[^"]*"' | cut -d'"' -f4 || true)"
  if [ -z "$last_ts" ] || [ "$last_ts" = "null" ]; then
    echo "false"
    return
  fi
  # 用 python 或 date 计算时间差
  local last_epoch now_epoch elapsed
  if command -v python3 >/dev/null 2>&1; then
    last_epoch=$(python3 -c "import dateutil.parser,sys; print(int(dateutil.parser.parse('$last_ts').timestamp()))" 2>/dev/null || echo 0)
  else
    last_epoch=$(date -d "$last_ts" +%s 2>/dev/null || echo 0)
  fi
  now_epoch=$(date +%s)
  elapsed=$(( now_epoch - last_epoch ))
  local cd_sec
  cd_sec="$(echo "$state" | grep -o '"cooldown_seconds":[0-9]*' | cut -d: -f2 || echo $COOLDOWN_SEC)"
  if [ "$elapsed" -lt "$cd_sec" ]; then
    echo "true"
  else
    echo "false"
  fi
}

reset_cooldown() {
  local state='{"last_rollback_ts":null,"rollback_count_window":0,"escalated":false,"cooldown_seconds":'$COOLDOWN_SEC'}'
  save_cooldown_state "$state"
  echo "$state"
}

if [ "$RESET_COOLDOWN" = true ]; then
  reset_cooldown >/dev/null
  echo "OK   cooldown state reset."
  write_jsonl "info" "reset" "pass" ',"action_taken":"cooldown_reset"'
  exit 0
fi

if [ "$CHECK_COOLDOWN_ONLY" = true ]; then
  state=$(get_cooldown_state)
  active=$(is_cooldown_active "$state")
  last_ts="$(echo "$state" | grep -o '"last_rollback_ts":"[^"]*"' | cut -d'"' -f4 || echo 'null')"
  count="$(echo "$state" | grep -o '"rollback_count_window":[0-9]*' | cut -d: -f2 || echo 0)"
  escalated="$(echo "$state" | grep -o '"escalated":[a-z]*' | cut -d: -f2 || echo false)"
  echo "Cooldown active   : $active"
  echo "Last rollback     : $last_ts"
  echo "Window count      : $count / $MAX_CONSECUTIVE"
  echo "Escalated         : $escalated"
  if [ "$active" = true ]; then exit 1; else exit 0; fi
fi

# ---------- 打印头部 ----------
echo '== CYP-memo auto-rollback =='
echo "Enabled     : $ENABLED"
echo "Dry-run     : $DRY_RUN"
echo "Prom URL    : $PROM_URL"
echo "Metrics file: ${METRICS_FILE:-(none)}"
echo "Cooldown    : ${COOLDOWN_SEC}s"
echo "Max consecutive: $MAX_CONSECUTIVE"

if [ "$ENABLED" != "true" ]; then
  echo ''
  echo 'INFO: auto-rollback is DISABLED (set CYP_AUTO_ROLLBACK_ENABLED=true to enable).'
  echo '      Running in detect-only mode (policy evaluation only, no actions).'
fi

# ---------- 冷却期检查 ----------
COOLDOWN_STATE=$(get_cooldown_state)
IN_COOLDOWN=$(is_cooldown_active "$COOLDOWN_STATE")
ESCALATED="$(echo "$COOLDOWN_STATE" | grep -o '"escalated":[a-z]*' | cut -d: -f2 || echo false)"

if [ "$IN_COOLDOWN" = true ]; then
  echo ''
  echo 'INFO: in cooldown period — no automatic rollback will be triggered.'
  echo "      state: count=$(echo "$COOLDOWN_STATE" | grep -o '"rollback_count_window":[0-9]*' | cut -d: -f2 || echo 0) escalated=$ESCALATED"
fi

if [ "$ESCALATED" = "true" ]; then
  echo ''
  echo 'WARN: escalated — manual intervention required. Use --reset-cooldown to clear.'
fi

# ---------- 指标采集 ----------
prom_query() {
  local query="$1"
  local encoded
  if command -v python3 >/dev/null 2>&1; then
    encoded=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$query" 2>/dev/null || echo "$query")
  else
    encoded=$(echo "$query" | sed 's/ /%20/g; s/"/%22/g; s/{/%7B/g; s/}/%7D/g; s/\[/%5B/g; s/\]/%5D/g' 2>/dev/null || echo "$query")
  fi
  local url="$PROM_URL/api/v1/query?query=$encoded"
  local resp
  resp=$(curl -sS --max-time 5 "$url" 2>/dev/null || true)
  if [ -z "$resp" ]; then echo ""; return; fi
  # 提取 value
  local val
  val=$(echo "$resp" | grep -o '"value":\[[^]]*\]' | grep -o ',"[^"]*"$' | tr -d '",' || true)
  if [ -z "$val" ]; then echo ""; return; fi
  echo "$val"
}

metric_from_file() {
  local name="$1"
  if [ -z "$METRICS_FILE" ] || [ ! -f "$METRICS_FILE" ]; then echo ""; return; fi
  local val
  val=$(grep "^$name " "$METRICS_FILE" 2>/dev/null | awk '{print $2}' || true)
  echo "$val"
}

get_metric() {
  local prom_q="$1"
  local local_name="$2"
  local val=""
  if [ -n "$METRICS_FILE" ] && [ -f "$METRICS_FILE" ]; then
    val=$(metric_from_file "$local_name")
    if [ -n "$val" ]; then echo "$val"; return; fi
  fi
  val=$(prom_query "$prom_q")
  echo "$val"
}

echo ''
echo '-- Collecting metrics --'

# C1: 错误率
ERROR_RATE=$(get_metric 'rate(http_requests_total{code=~"5.."}[5m]) / clamp_min(rate(http_requests_total[5m]), 1e-9)' 'api_error_rate_5m')
echo "Error rate (5m)   : ${ERROR_RATE:-0} $(if [ -z "$ERROR_RATE" ]; then echo '(no data, assumed 0)'; fi)"

# C2: P95 响应时间
P95_LATENCY=$(get_metric 'histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))' 'http_request_duration_p95_seconds')
echo "P95 latency (5m)  : ${P95_LATENCY:-0}s $(if [ -z "$P95_LATENCY" ]; then echo '(no data, assumed 0)'; fi)"

# C3: 可用性
AVAILABILITY=$(get_metric 'rate(http_requests_total{code=~"2.."}[5m]) / clamp_min(rate(http_requests_total[5m]), 1e-9)' 'api_availability_5m')
echo "Availability (5m) : ${AVAILABILITY:-1} $(if [ -z "$AVAILABILITY" ]; then echo '(no data, assumed 100%)'; fi)"

# C4: 健康检查
HEALTH_FAIL_COUNT=0
HEALTH_URL='https://127.0.0.1:5170/api/health'
READY_URL='https://127.0.0.1:5170/healthz/ready'
health_ok=false
ready_ok=false
if curl -kfsS --max-time 3 "$HEALTH_URL" >/dev/null 2>&1; then health_ok=true; fi
if curl -kfsS --max-time 3 "$READY_URL" >/dev/null 2>&1; then ready_ok=true; fi
if [ "$health_ok" = false ]; then HEALTH_FAIL_COUNT=$((HEALTH_FAIL_COUNT + 1)); fi
if [ "$ready_ok" = false ]; then HEALTH_FAIL_COUNT=$((HEALTH_FAIL_COUNT + 1)); fi
echo "Health check      : health=$health_ok ready=$ready_ok (fail_count=$HEALTH_FAIL_COUNT)"

# C5: 内存使用率
MEM_USAGE=$(get_metric '(1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes) * 100' 'memory_usage_percent')
if [ -z "$MEM_USAGE" ]; then
  PROC_RSS=$(get_metric 'process_resident_memory_bytes{job="cyp-memo"}' 'process_resident_memory_bytes')
  if [ -n "$PROC_RSS" ]; then
    MEM_USAGE=$(awk -v rss="$PROC_RSS" 'BEGIN { printf "%.2f", (rss / 1073741824) * 100 }')
  fi
fi
echo "Memory usage      : ${MEM_USAGE:-0}% $(if [ -z "$MEM_USAGE" ]; then echo '(no data, assumed 0%)'; fi)"

# ---------- 策略判定 ----------
echo ''
echo '-- Policy evaluation --'

HIGHEST_LEVEL="none"
TRIGGER_SUMMARY=""
TRIGGER_COUNT=0

set_highest() {
  local level="$1"
  case "$HIGHEST_LEVEL" in
    none) HIGHEST_LEVEL="$level" ;;
    L1) [ "$level" = "L2" ] || [ "$level" = "L3" ] && HIGHEST_LEVEL="$level" ;;
    L2) [ "$level" = "L3" ] && HIGHEST_LEVEL="$level" ;;
    L3) ;;
  esac
}

add_trigger() {
  local name="$1"
  local level="$2"
  if [ "$TRIGGER_COUNT" -gt 0 ]; then TRIGGER_SUMMARY="$TRIGGER_SUMMARY;"; fi
  TRIGGER_SUMMARY="$TRIGGER_SUMMARY${name}:${level}"
  TRIGGER_COUNT=$((TRIGGER_COUNT + 1))
}

# C1: 错误率
if [ -n "$ERROR_RATE" ]; then
  if awk -v v="$ERROR_RATE" 'BEGIN { exit !(v > 0.20) }'; then
    set_highest "L3"; add_trigger "error_rate" "L3"
    echo "  C1 error_rate: L3 (>20%) — $ERROR_RATE"
  elif awk -v v="$ERROR_RATE" 'BEGIN { exit !(v > 0.10) }'; then
    set_highest "L2"; add_trigger "error_rate" "L2"
    echo "  C1 error_rate: L2 (>10%) — $ERROR_RATE"
  elif awk -v v="$ERROR_RATE" 'BEGIN { exit !(v > 0.05) }'; then
    set_highest "L1"; add_trigger "error_rate" "L1"
    echo "  C1 error_rate: L1 (>5%) — $ERROR_RATE"
  else
    echo "  C1 error_rate: OK — $ERROR_RATE"
  fi
else
  echo "  C1 error_rate: SKIP (no data)"
fi

# C2: P95 响应时间
if [ -n "$P95_LATENCY" ]; then
  if awk -v v="$P95_LATENCY" 'BEGIN { exit !(v > 10) }'; then
    set_highest "L3"; add_trigger "p95_latency" "L3"
    echo "  C2 p95_latency: L3 (>10s) — ${P95_LATENCY}s"
  elif awk -v v="$P95_LATENCY" 'BEGIN { exit !(v > 5) }'; then
    set_highest "L2"; add_trigger "p95_latency" "L2"
    echo "  C2 p95_latency: L2 (>5s) — ${P95_LATENCY}s"
  elif awk -v v="$P95_LATENCY" 'BEGIN { exit !(v > 3) }'; then
    set_highest "L1"; add_trigger "p95_latency" "L1"
    echo "  C2 p95_latency: L1 (>3s) — ${P95_LATENCY}s"
  else
    echo "  C2 p95_latency: OK — ${P95_LATENCY}s"
  fi
else
  echo "  C2 p95_latency: SKIP (no data)"
fi

# C3: 可用性
if [ -n "$AVAILABILITY" ]; then
  if awk -v v="$AVAILABILITY" 'BEGIN { exit !(v < 0.90) }'; then
    set_highest "L3"; add_trigger "availability" "L3"
    echo "  C3 availability: L3 (<90%) — $AVAILABILITY"
  elif awk -v v="$AVAILABILITY" 'BEGIN { exit !(v < 0.95) }'; then
    set_highest "L2"; add_trigger "availability" "L2"
    echo "  C3 availability: L2 (<95%) — $AVAILABILITY"
  elif awk -v v="$AVAILABILITY" 'BEGIN { exit !(v < 0.99) }'; then
    set_highest "L1"; add_trigger "availability" "L1"
    echo "  C3 availability: L1 (<99%) — $AVAILABILITY"
  else
    echo "  C3 availability: OK — $AVAILABILITY"
  fi
else
  echo "  C3 availability: SKIP (no data)"
fi

# C4: 健康检查
if [ "$HEALTH_FAIL_COUNT" -ge 2 ]; then
  set_highest "L2"; add_trigger "health_check" "L2"
  echo "  C4 health_check: L2 (>=2 fails) — $HEALTH_FAIL_COUNT"
elif [ "$HEALTH_FAIL_COUNT" -ge 1 ]; then
  set_highest "L1"; add_trigger "health_check" "L1"
  echo "  C4 health_check: L1 (>=1 fail) — $HEALTH_FAIL_COUNT"
else
  echo "  C4 health_check: OK — 0 fails"
fi

# C5: 内存使用率
if [ -n "$MEM_USAGE" ]; then
  if awk -v v="$MEM_USAGE" 'BEGIN { exit !(v > 95) }'; then
    set_highest "L2"; add_trigger "memory_usage" "L2"
    echo "  C5 memory_usage: L2 (>95%) — ${MEM_USAGE}%"
  elif awk -v v="$MEM_USAGE" 'BEGIN { exit !(v > 90) }'; then
    set_highest "L2"; add_trigger "memory_usage" "L2"
    echo "  C5 memory_usage: L2 (>90%) — ${MEM_USAGE}%"
  elif awk -v v="$MEM_USAGE" 'BEGIN { exit !(v > 85) }'; then
    set_highest "L1"; add_trigger "memory_usage" "L1"
    echo "  C5 memory_usage: L1 (>85%) — ${MEM_USAGE}%"
  else
    echo "  C5 memory_usage: OK — ${MEM_USAGE}%"
  fi
else
  echo "  C5 memory_usage: SKIP (no data)"
fi

echo ''
echo "Highest rollback level: $HIGHEST_LEVEL"

# ---------- 执行回滚 ----------
ROLLBACK_RESULT="skip"
ROLLBACK_ERROR=""
SNAPSHOT_USED=""
ACTION_TAKEN="none"

if [ "$HIGHEST_LEVEL" = "none" ]; then
  echo 'All metrics within thresholds. No action needed.'
  ROLLBACK_RESULT="pass"
elif [ "$HIGHEST_LEVEL" = "L1" ]; then
  echo 'L1 alert triggered — logging only, no automatic rollback.'
  ROLLBACK_RESULT="alert"
  ACTION_TAKEN="log_alert"
else
  echo ''
  echo "-- Rollback action: $HIGHEST_LEVEL --"

  if [ "$IN_COOLDOWN" = true ] || [ "$ESCALATED" = "true" ]; then
    echo 'SKIP: in cooldown or escalated — no automatic rollback.'
    ROLLBACK_RESULT="cooldown_blocked"
    ACTION_TAKEN="blocked"
  elif [ "$DRY_RUN" = true ]; then
    echo 'DRY-RUN: would execute rollback, but --dry-run is set.'
    echo "         Use --execute and CYP_AUTO_ROLLBACK_ENABLED=true to run for real."
    ROLLBACK_RESULT="dry_run"
    ACTION_TAKEN="dry_run_${HIGHEST_LEVEL}"
  elif [ "$ENABLED" != "true" ]; then
    echo 'SKIP: auto-rollback disabled (CYP_AUTO_ROLLBACK_ENABLED != true).'
    echo '      Set env var to enable real execution.'
    ROLLBACK_RESULT="disabled"
    ACTION_TAKEN="disabled"
  else
    ACTION_TAKEN="$HIGHEST_LEVEL"
    EXEC_START=$(date +%s)

    set +e
    if [ "$HIGHEST_LEVEL" = "L3" ]; then
      echo 'L3 hard rollback: snapshot rollback + service restart'
      ROLLBACK_SCRIPT="$SCRIPT_DIR/rollback-local.sh"
      if [ ! -f "$ROLLBACK_SCRIPT" ]; then
        ROLLBACK_RESULT="fail"
        ROLLBACK_ERROR="rollback script not found: $ROLLBACK_SCRIPT"
      else
        echo "  Running: $ROLLBACK_SCRIPT"
        bash "$ROLLBACK_SCRIPT"
        rc=$?
        if [ $rc -ne 0 ]; then
          ROLLBACK_RESULT="fail"
          ROLLBACK_ERROR="rollback-local.sh exited with code $rc"
        else
          SNAPROOT="${CYP_SNAPSHOT_ROOT:-$ROOT/backups/snapshots}"
          if [ -f "$SNAPROOT/LATEST.txt" ]; then
            SNAPSHOT_USED="$(tr -d '\r\n' < "$SNAPROOT/LATEST.txt")"
          fi
          echo '  Rollback OK. Now restarting service...'
        fi
      fi
    fi

    if [ "$ROLLBACK_RESULT" != "fail" ]; then
      echo '  Restarting service...'
      STOP_SCRIPT="$ROOT/scripts/stop/stop-local.sh"
      START_SCRIPT="$ROOT/scripts/start/start-local.sh"
      if [ -f "$STOP_SCRIPT" ]; then
        bash "$STOP_SCRIPT" || true
      fi
      sleep 3
      if [ -f "$START_SCRIPT" ]; then
        bash "$START_SCRIPT"
        rc=$?
        if [ $rc -ne 0 ]; then
          ROLLBACK_RESULT="fail"
          ROLLBACK_ERROR="start-local.sh exited with code $rc"
        else
          ROLLBACK_RESULT="success"
        fi
      else
        ROLLBACK_RESULT="success"
      fi
    fi
    set -e

    EXEC_END=$(date +%s)
    if [ "$ROLLBACK_RESULT" = "success" ]; then
      echo "  Rollback completed in $((EXEC_END - EXEC_START))s"
    else
      echo "  Rollback FAILED: $ROLLBACK_ERROR"
    fi
  fi
fi

# ---------- 更新冷却状态 ----------
if [ "$ROLLBACK_RESULT" = "success" ] && [ "$IN_COOLDOWN" = "false" ]; then
  if [ "$HIGHEST_LEVEL" = "L2" ] || [ "$HIGHEST_LEVEL" = "L3" ]; then
    now_iso="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    current_count=$(echo "$COOLDOWN_STATE" | grep -o '"rollback_count_window":[0-9]*' | cut -d: -f2 || echo 0)
    new_count=$((current_count + 1))
    new_escalated="false"
    if [ "$new_count" -ge "$MAX_CONSECUTIVE" ]; then
      new_escalated="true"
      echo ''
      echo "WARN: reached $MAX_CONSECUTIVE consecutive rollbacks — escalated to manual intervention."
    fi
    new_state=$(cat <<JSON
{"last_rollback_ts":"$now_iso","rollback_count_window":$new_count,"escalated":$new_escalated,"cooldown_seconds":$COOLDOWN_SEC}
JSON
)
    save_cooldown_state "$new_state"
  fi
fi

# ---------- 写日志 ----------
echo ''
echo "Result: $ROLLBACK_RESULT (level=$HIGHEST_LEVEL, action=$ACTION_TAKEN)"
echo "Log   : $LOG_FILE"

EXTRA=","
EXTRA="${EXTRA}\"rollback_level\":\"$HIGHEST_LEVEL\""
EXTRA="${EXTRA},\"triggers\":\"$TRIGGER_SUMMARY\""
EXTRA="${EXTRA},\"dry_run\":$DRY_RUN"
EXTRA="${EXTRA},\"cooldown_active\":$IN_COOLDOWN"
EXTRA="${EXTRA},\"escalated\":$ESCALATED"
EXTRA="${EXTRA},\"error_rate\":${ERROR_RATE:-null}"
EXTRA="${EXTRA},\"p95_latency_sec\":${P95_LATENCY:-null}"
EXTRA="${EXTRA},\"availability\":${AVAILABILITY:-null}"
EXTRA="${EXTRA},\"health_fail_count\":$HEALTH_FAIL_COUNT"
EXTRA="${EXTRA},\"memory_usage_pct\":${MEM_USAGE:-null}"
EXTRA="${EXTRA},\"action_taken\":\"$ACTION_TAKEN\""
if [ -n "$SNAPSHOT_USED" ]; then
  EXTRA="${EXTRA},\"snapshot_used\":\"$SNAPSHOT_USED\""
fi
if [ -n "$ROLLBACK_ERROR" ]; then
  # escape quotes for JSON
  escaped_err=$(echo "$ROLLBACK_ERROR" | sed 's/"/\\"/g')
  EXTRA="${EXTRA},\"error\":\"$escaped_err\""
fi

write_jsonl "warn" "evaluate" "$ROLLBACK_RESULT" "$EXTRA"

# 退出码
if [ "$ROLLBACK_RESULT" = "fail" ]; then exit 1; fi
if [ "$IN_COOLDOWN" = true ] && [ "$HIGHEST_LEVEL" != "none" ]; then exit 2; fi
exit 0
