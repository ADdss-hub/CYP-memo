#!/usr/bin/env bash
# CYP-memo 脱敏唯一入口（Linux/macOS）· 规范 2.8 / AP-13 / LC07
#
# 用途：对日志/配置/产物做"内容替换"式真脱敏，禁止用 grep -v 假脱敏。
# 设计：shell 负责参数解析与路径转换（MSYS -> Windows 原生路径交给 node），
#       真正的替换由嵌入的 node 程序完成（与 scripts/gate/issue-gate-token.sh 同范式）。
#
# 级别（START_LOCAL_REDACT_LEVEL 或 --level，默认 strict）：
#   strict : 全部模式（键值密钥 + 手机号 + 邮箱 + 身份证 + 银行卡）
#   normal : 键值密钥 + 手机号 + 邮箱（保守，避免误伤普通长数字）
#   off    : 完全不脱敏（直接复制，退出 0）
#
# 退出码：
#   0  成功且内容发生了替换（确有敏感信息被脱敏）
#   3  成功但无变化（文件已干净 / 未检出敏感信息）—— 规范语义"无变化但已脱敏"
#   2  参数非法（如非法级别值）
#   4  脱敏失败，必须阻断上报（规范 LC07）
#
# 遥测：START_LOCAL_NO_TELEMETRY=1 时，不写 logs/redact-audit.jsonl 审计行。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

# Git Bash 的 $PWD 是 MSYS 风格 /d/kf/...；凡交给 node 读取文件，必须先转 Windows 原生路径。
winpath() {
  local p="$1"
  [[ -z "$p" ]] && { printf ''; return 0; }
  if command -v cygpath >/dev/null 2>&1; then cygpath -w "$p"; else printf '%s' "$p"; fi
}

LEVEL="${START_LOCAL_REDACT_LEVEL:-strict}"
IN_FILE=""
OUT_FILE=""
IN_PLACE=""
SCAN_DIR=""
MODE="file"

usage() {
  cat <<'USAGE'
用法：
  redact.sh --in <file> --out <file> [--level strict|normal|off]
  redact.sh --in-place <file>            [--level strict|normal|off]
  redact.sh --scan <dir>                 [--level strict|normal|off]
  redact.sh --help

环境变量：
  START_LOCAL_REDACT_LEVEL  strict|normal|off（默认 strict，非法值报错退出 2）
  START_LOCAL_NO_TELEMETRY  1 时禁止写脱敏审计行
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --in)        IN_FILE="$2"; shift 2;;
    --out)       OUT_FILE="$2"; shift 2;;
    --in-place)  IN_PLACE="$2"; shift 2;;
    --scan)      SCAN_DIR="$2"; shift 2;;
    --level)     LEVEL="$2"; shift 2;;
    --help|-h)   usage; exit 0;;
    *) echo "FAIL: unknown arg: $1" >&2; usage; exit 2;;
  esac
done

# 非法级别校验（规范 2.8-落地-2）
case "$LEVEL" in
  strict|normal|off) ;;
  *) echo "FAIL: illegal level '$LEVEL' (allowed: strict|normal|off)" >&2; exit 2;;
esac

if [[ -n "$IN_PLACE" ]]; then
  MODE="file"; IN_FILE="$IN_PLACE"; OUT_FILE="$IN_PLACE"
elif [[ -n "$SCAN_DIR" ]]; then
  MODE="scan"
elif [[ -n "$IN_FILE" && -n "$OUT_FILE" ]]; then
  MODE="file"
else
  echo "FAIL: require --in/--out, --in-place, or --scan" >&2; usage; exit 2
fi

# 遥测开关
if [[ "${START_LOCAL_NO_TELEMETRY:-0}" == "1" ]]; then
  AUDIT="0"
else
  AUDIT="1"
fi

# 路径转换（交给 node 前必须 cygpath -w）；REPO_ROOT 也需转，否则审计行写错位置
WIN_ROOT="$(winpath "$ROOT")"
IN_WIN="$(winpath "$IN_FILE")"
OUT_WIN="$(winpath "$OUT_FILE")"
SCAN_WIN="$(winpath "$SCAN_DIR")"

# ---- 嵌入 node 脱敏内核（内容替换，非删行）----
run_redact() {
  REPO_ROOT="$WIN_ROOT" MODE="$MODE" LEVEL="$LEVEL" AUDIT="$AUDIT" \
  SCAN="$SCAN_WIN" node - "$IN_WIN" "$OUT_WIN" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');

const mode = process.env.MODE;
const level = (process.env.LEVEL || 'strict').toLowerCase();
const enabled = level === 'off' ? null
  : level === 'normal' ? ['secret','phone','email']
  : ['secret','phone','email','id','bank'];

const isText = (s) => !s.includes('\u0000');

// 键值型密钥：password/passwd/pwd/token/secret/apikey/api_key/authorization/jwt 的值
function redactSecrets(t) {
  // 引号包裹的值
  t = t.replace(/(password|passwd|pwd|token|secret|apikey|api_key|authorization|jwt)(["'\s]*[:=]["'\s]*)(["'])(?:\\.|[^"'])*\3/gi,
    (m, k, sep, q) => k + sep + q + '***' + q);
  // 非引号的值（持续到空白/逗号/分号/引号/括号）
  t = t.replace(/(password|passwd|pwd|token|secret|apikey|api_key|authorization|jwt)(["'\s]*[:=]["'\s]*)([^\s"',;}{]+)/gi,
    (m, k, sep) => k + sep + '***');
  return t;
}
const redactPhone = (t) => t.replace(/(?<![0-9a-fA-F])(1[3-9]\d{9})(?![0-9a-fA-F])/g, '***');
const redactEmail = (t) => t.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '***');
const redactId    = (t) => t.replace(/(?<![0-9a-fA-F])(\d{17}[\dXx])(?![0-9a-fA-F])/g, '***');
// 银行卡：16-19 位数字串（不以十六进制字母/数字相邻），且需通过 Luhn 校验，避免误伤 UUID/计数器/小数
const redactBank  = (t) => t.replace(/(?<![0-9a-fA-F.])(\d{16,19})(?![0-9a-fA-F.])/g, (m) => {
  let sum = 0, alt = false;
  for (let i = m.length - 1; i >= 0; i--) { let d = +m[i]; if (alt) { d *= 2; if (d > 9) d -= 9; } sum += d; alt = !alt; }
  return (sum % 10 === 0) ? '***' : m;
});

function redact(t) {
  if (!enabled) return t;
  if (enabled.includes('secret')) t = redactSecrets(t);
  if (enabled.includes('phone'))  t = redactPhone(t);
  if (enabled.includes('email'))  t = redactEmail(t);
  if (enabled.includes('id'))     t = redactId(t);
  if (enabled.includes('bank'))   t = redactBank(t);
  return t;
}

function audit(row) {
  if (process.env.AUDIT !== '1') return;
  const p = path.join(process.env.REPO_ROOT || process.cwd(), 'logs', 'redact-audit.jsonl');
  try { fs.appendFileSync(p, JSON.stringify(row) + '\n'); } catch {}
}

if (mode === 'scan') {
  const dir = process.env.SCAN;
  let total = 0, changed = 0, failed = 0;
  const walk = (d) => {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); }
    catch { failed++; return; }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        if (e.name === '.git' || e.name === 'node_modules') continue;
        walk(p);
      } else if (e.isFile()) {
        let txt;
        try { txt = fs.readFileSync(p, 'utf8'); } catch { failed++; continue; }
        if (!isText(txt)) continue;
        const out = redact(txt);
        if (out !== txt) {
          try { fs.writeFileSync(p, out); changed++; total++; }
          catch { failed++; }
        } else total++;
      }
    }
  };
  walk(dir);
  audit({ ts: new Date().toISOString(), event: 'redact_scan', level, dir, total, changed, failed });
  process.stdout.write(`scan: files=${total} redacted=${changed} failed=${failed}\n`);
  process.exit(failed > 0 ? 4 : 0);
} else {
  const infile = process.argv[2];
  const outfile = process.argv[3];
  let txt;
  try { txt = fs.readFileSync(infile, 'utf8'); }
  catch (e) { process.stderr.write('read fail: ' + e.message + '\n'); process.exit(4); }
  if (!isText(txt)) { process.stderr.write('binary file skipped: ' + infile + '\n'); process.exit(4); }
  const out = redact(txt);
  try { fs.writeFileSync(outfile, out); }
  catch (e) { process.stderr.write('write fail: ' + e.message + '\n'); process.exit(4); }
  audit({ ts: new Date().toISOString(), event: 'redact_file', level, in: infile, out: outfile, changed: out !== txt });
  if (level === 'off') process.exit(0);
  process.exit(out !== txt ? 0 : 3);
}
NODE
  return $?
}

set +e
run_redact; RC=$?
set -e
exit $RC
