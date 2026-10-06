#!/usr/bin/env bash
# CYP-memo 研发效能度量四件套（Linux/macOS）· 规范 2.7
#
# 这是一个"度量记录器"，不实际启动服务 / 重跑用例（避免副作用与端口占用）。
# 四个业务子命令（start/rerun/locate/fix-check）都包装统一的 record 接口：
#   start     记 cold_start 度量（优先读 logs/start-time.json 的 cold_start_ms）
#   rerun     按 tag 精准重跑 verify 用例（记录 stage=rerun，file=tag）
#   locate    失败定位（记录 stage=locate，file=错误信息）
#   fix-check 修复校验（记录 stage=fix_check，result=pass|fail）
#   record    底层记账接口（--stage/--duration-ms/--file/--result/--tag）
#   report    生成周报（--since 7d），对照 2.7 阈值
#
# 每次调用向 logs/devloop-metrics.jsonl 追加一行（每行独立可 JSON.parse）。
# result=fail 时额外追加 logs/devloop-failures.jsonl。
#
# 阈值（规范 2.7）：冷启动≤120s / 热重载≤5s / 精准重跑≤30s / 失败定位≤60s /
#                   单次修复闭环≤5min / verify失败率≤10% / Devloop完成率≥80%
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

COMMIT="$(git rev-parse HEAD 2>/dev/null || echo nogit)"
LOG_DIR="$ROOT/logs"
METRICS="$LOG_DIR/devloop-metrics.jsonl"
FAILS="$LOG_DIR/devloop-failures.jsonl"

emit_metric() {
  # 入参来自环境变量：STAGE FILE RESULT DUR
  local rc=0
  COMMIT="$COMMIT" STAGE="$STAGE" FILE="$FILE" RESULT="$RESULT" DUR="$DUR" \
  ACTOR="${ACTOR:-${USER:-ci}}" \
  node - "$COMMIT" <<'NODE' || rc=$?
const fs = require('node:fs');
const path = require('path');
const root = process.cwd();
const ts = new Date().toISOString();
const commit = process.env.COMMIT;
const trace = require('crypto').randomBytes(8).toString('hex');
const row = {
  ts,
  commit_sha: commit,
  file: process.env.FILE || '',
  stage: process.env.STAGE,
  duration_ms: Number(process.env.DUR) || 0,
  result: process.env.RESULT || 'ok',
  actor: process.env.ACTOR || 'ci',
  trace_id: trace
};
fs.mkdirSync(path.join(root, 'logs'), { recursive: true });
fs.appendFileSync(path.join(root, 'logs', 'devloop-metrics.jsonl'), JSON.stringify(row) + '\n');
if ((process.env.RESULT || 'ok') === 'fail') {
  fs.appendFileSync(path.join(root, 'logs', 'devloop-failures.jsonl'), JSON.stringify({ ...row, event: 'failure' }) + '\n');
}
process.stdout.write('recorded: ' + JSON.stringify(row) + '\n');
NODE
  return $rc
}

cmd_start() {
  local dur=0
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --duration-ms) dur="$2"; shift 2;;
      *) shift;;
    esac
  done
  if [[ "$dur" == "0" && -f "$LOG_DIR/start-time.json" ]]; then
    dur="$(node -e "const p=process.cwd()+'/logs/start-time.json';try{console.log(require(p).cold_start_ms||0)}catch(e){console.log(0)}")"
  fi
  STAGE="cold_start" FILE="start-time.json" RESULT="ok" DUR="$dur"
  emit_metric
}

cmd_rerun() {
  local tag="" dur=0
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --tag) tag="$2"; shift 2;;
      --duration-ms) dur="$2"; shift 2;;
      *) shift;;
    esac
  done
  [[ -n "$tag" ]] || { echo "FAIL: rerun requires --tag" >&2; exit 2; }
  STAGE="rerun" FILE="$tag" RESULT="ok" DUR="$dur"
  emit_metric
}

cmd_locate() {
  local msg="" dur=0
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --duration-ms) dur="$2"; shift 2;;
      *) msg="$msg $1"; shift;;
    esac
  done
  msg="$(echo "$msg" | xargs)"
  [[ -n "$msg" ]] || { echo "FAIL: locate requires an error message" >&2; exit 2; }
  STAGE="locate" FILE="${msg:0:200}" RESULT="found" DUR="$dur"
  emit_metric
}

cmd_fix_check() {
  local result="pass" dur=0
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --result) result="$2"; shift 2;;
      --duration-ms) dur="$2"; shift 2;;
      *) shift;;
    esac
  done
  STAGE="fix_check" FILE="" RESULT="$result" DUR="$dur"
  emit_metric
}

cmd_record() {
  local stage="" file="" result="ok" dur=0 tag=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --stage) stage="$2"; shift 2;;
      --file) file="$2"; shift 2;;
      --result) result="$2"; shift 2;;
      --duration-ms) dur="$2"; shift 2;;
      --tag) tag="$2"; shift 2;;
      *) shift;;
    esac
  done
  [[ -n "$stage" ]] || { echo "FAIL: record requires --stage" >&2; exit 2; }
  [[ -n "$file" && -z "$tag" ]] || file="${tag:-$file}"
  STAGE="$stage" FILE="$file" RESULT="$result" DUR="$dur"
  emit_metric
}

cmd_report() {
  local since="7d"
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --since) since="$2"; shift 2;;
      *) shift;;
    esac
  done
  ROOT="$ROOT" SINCE="$since" node - <<'NODE'
const fs = require('node:fs');
const path = require('path');
const root = process.cwd();
const since = process.env.SINCE || '7d';
const m = /^(\d+)([dhw])$/.exec(since);
if (!m) { console.error('illegal --since: ' + since + ' (e.g. 7d)'); process.exit(2); }
const unit = { d: 86400000, w: 604800000, h: 3600000 }[m[2]];
const cutoff = Date.now() - Number(m[1]) * unit;
const f = path.join(root, 'logs', 'devloop-metrics.jsonl');
let rows = [];
if (fs.existsSync(f)) {
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const s = line.trim(); if (!s) continue;
    let o; try { o = JSON.parse(s); } catch { continue; }
    if (Date.parse(o.ts) >= cutoff) rows.push(o);
  }
}
const stages = {};
for (const r of rows) { (stages[r.stage] ||= { n: 0, dur: 0, fail: 0 }); stages[r.stage].n++; stages[r.stage].dur += r.duration_ms; if (r.result === 'fail') stages[r.stage].fail++; }
const thr = {
  cold_start: 120000, hot_reload: 5000, rerun: 30000, locate: 60000,
  fix_check: 300000, verify_fail_rate: 0.10, devloop_done_rate: 0.80
};
console.log(`Devloop 周报 (since=${since}, 窗口内事件=${rows.length})`);
console.log('stage'.padEnd(12), 'count'.padStart(6), 'avg_ms'.padStart(10), 'fail'.padStart(5), '阈值');
const order = ['cold_start','hot_reload','rerun','locate','fix_check'];
const seen = new Set();
for (const st of order) {
  const s = stages[st]; if (!s) { seen.add(st); continue; }
  const avg = Math.round(s.dur / s.n);
  const t = thr[st];
  const ok = avg <= t;
  console.log(st.padEnd(12), String(s.n).padStart(6), String(avg).padStart(10), String(s.fail).padStart(5), `${t}ms ${ok ? 'OK' : 'OVER'}`);
  seen.add(st);
}
console.log('verify失败率 :', rows.length ? (rows.filter(r=>r.result==='fail').length/rows.length*100).toFixed(1)+'%' : 'n/a', '(阈值 <=10%)');
console.log('Devloop完成率:', rows.length ? ((rows.filter(r=>r.result!=='fail').length)/rows.length*100).toFixed(1)+'%' : 'n/a', '(阈值 >=80%)');
NODE
}

[[ $# -ge 1 ]] || { echo "usage: devloop.sh {start|rerun|locate|fix-check|record|report}" >&2; exit 2; }
sub="$1"; shift || true
case "$sub" in
  start) cmd_start "$@";;
  rerun) cmd_rerun "$@";;
  locate) cmd_locate "$@";;
  fix-check) cmd_fix_check "$@";;
  record) cmd_record "$@";;
  report) cmd_report "$@";;
  *) echo "usage: devloop.sh {start|rerun|locate|fix-check|record|report}" >&2; exit 2;;
esac
