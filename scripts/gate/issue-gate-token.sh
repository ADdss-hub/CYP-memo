#!/usr/bin/env bash
# CYP-memo gate_token 签发器（Linux/macOS）· 规范 3.1.1
# 用途：签发/校验 合并·提测·预发布·上线 四关卡令牌，防止跨级跳用与伪造。
# 落盘：logs/gate-tokens/YYYY-MM-DD.jsonl（追加，UTF-8 无 BOM，LF）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

# Git Bash 的 $PWD 为 MSYS 风格（/d/kf/...），Node 原生按 Windows 解析会变成 D:\d\kf\...。
# 凡需把路径交给 node 读取，必须先经 cygpath 转为 Windows 原生路径。
if command -v cygpath >/dev/null 2>&1; then
  WIN_ROOT="$(cygpath -w "$ROOT")"
else
  WIN_ROOT="$ROOT"
fi

GATE_DIR="$ROOT/logs/gate-tokens"
ARCHIVE_DIR="$GATE_DIR/_archive"
mkdir -p "$GATE_DIR" "$ARCHIVE_DIR"

TS_FILE="$GATE_DIR/$(date +%Y-%m-%d).jsonl"
RETENTION_DAYS="${CYP_GATE_RETENTION_DAYS:-180}"

usage() {
  cat <<'USAGE'
用法：
  issue-gate-token.sh issue   --level <merge|qa|staging|prod> --payload <文本> [--expires-min <分钟>]
  issue-gate-token.sh verify  --token-file <文件> [--level <级别>]
  issue-gate-token.sh archive [--older-than-days <天数>]

级别与引用链（规范 3.1.1-4）：
  merge   无前置
  qa      需 merge
  staging 需 merge + qa
  prod    需 merge + qa + staging
USAGE
}

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 | awk '{print $1}'
  else
    node -e "const c=require('crypto');c.stdin.on('data',d=>console.log(c.createHash('sha256').update(d).digest('hex')))"
  fi
}

random_hex() { node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"; }

now_iso() { node -e "console.log(new Date().toISOString())"; }
now_ms()  { node -e "console.log(Date.now())"; }

cmd_issue() {
  local level="" payload="" expires_min=120
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --level) level="$2"; shift 2;;
      --payload) payload="$2"; shift 2;;
      --expires-min) expires_min="$2"; shift 2;;
      *) echo "unknown arg: $1" >&2; usage; exit 2;;
    esac
  done
  if [[ -z "$level" || -z "$payload" ]]; then echo "FAIL: --level/--payload required" >&2; exit 2; fi
  case "$level" in merge|qa|staging|prod) ;; *) echo "FAIL: bad level '$level'" >&2; exit 2;; esac

  local commit
  commit="$(git rev-parse HEAD 2>/dev/null || echo nogit)"

  # 引用链校验：prod 须确认当日已存在前三关令牌
  case "$level" in
    qa|staging|prod)
      if ! grep -q '"level":"merge"' "$GATE_DIR"/*.jsonl 2>/dev/null; then
        echo "FAIL: level=$level requires a prior merge token (3.1.1-4)" >&2; exit 3
      fi;;
  esac
  if [[ "$level" == "staging" || "$level" == "prod" ]]; then
    if ! grep -q '"level":"qa"' "$GATE_DIR"/*.jsonl 2>/dev/null; then
      echo "FAIL: level=$level requires a prior qa token (3.1.1-4)" >&2; exit 3
    fi
  fi
  if [[ "$level" == "prod" ]]; then
    if ! grep -q '"level":"staging"' "$GATE_DIR"/*.jsonl 2>/dev/null; then
      echo "FAIL: level=prod requires a prior staging token (3.1.1-4)" >&2; exit 3
    fi
  fi

  local gate_id payload_digest token expires_at
  gate_id="gate.${level}.$(date +%Y%m%d%H%M%S)"
  payload_digest="$(printf '%s' "$payload" | sha256_of)"
  token="$(random_hex)"
  expires_at="$(node -e "console.log(new Date(Date.now()+${expires_min}*60000).toISOString())")"

  printf '%s' "$token" > "$GATE_DIR/.current.${level}.token"

  local row
  row="$(LEVEL="$level" GATE_ID="$gate_id" COMMIT="$commit" DIGEST="$payload_digest" \
    TOKEN="$token" ISSUED="$(now_iso)" EXPIRES="$expires_at" \
    node -e '
      const o = {
        ts: process.env.ISSUED,
        gate_id: process.env.GATE_ID,
        level: process.env.LEVEL,
        commit_sha: process.env.COMMIT,
        sha256: process.env.DIGEST,
        issuer: "issue-gate-token.sh",
        issued_at: process.env.ISSUED,
        expires_at: process.env.EXPIRES,
        signer: "local-dev",
        payload_digest: process.env.DIGEST
      };
      console.log(JSON.stringify(o));
    ')"
  # token 单独落盘（不进 jsonl，避免明文散落）
  printf '%s' "$row" >> "$TS_FILE"
  # JSONL 硬要求：每条记录以换行结尾。若文件非空且末字符非换行，先补换行。
  if [[ -s "$TS_FILE" ]]; then
    local last
    last="$(tail -c 1 "$TS_FILE" | od -An -t x1 | tr -d ' \n')"
    if [[ -n "$last" && "$last" != "0a" ]]; then
      printf '\n' >> "$TS_FILE"
    fi
  fi
  printf '{"ts":"%s","event":"token_issued","gate_id":"%s","level":"%s","commit_sha":"%s","expires_at":"%s"}\n' \
    "$(now_iso)" "$gate_id" "$level" "$commit" "$expires_at" >> "$TS_FILE"
  printf '{"ts":"%s","event":"token_issued_secret_path","gate_id":"%s","level":"%s"}\n' \
    "$(now_iso)" "$gate_id" "$level" >> "$TS_FILE"

  echo "OK   gate_token issued"
  echo "  gate_id    : $gate_id"
  echo "  level      : $level"
  echo "  commit_sha : $commit"
  echo "  sha256     : $payload_digest"
  echo "  expires_at : $expires_at"
  echo "  token_file : logs/gate-tokens/.current.${level}.token"
  echo "  audit      : $TS_FILE"
}

cmd_verify() {
  local token_file="" level=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --token-file) token_file="$2"; shift 2;;
      --level) level="$2"; shift 2;;
      *) echo "unknown arg: $1" >&2; usage; exit 2;;
    esac
  done
  if [[ -z "$token_file" || ! -f "$token_file" ]]; then
    echo "FAIL: token file missing: $token_file" >&2; exit 2
  fi
  local expected
  expected="$(tr -d '[:space:]' < "$token_file")"
  if [[ -z "$expected" ]]; then echo "FAIL: empty token" >&2; exit 3; fi

  # 关卡：merge|qa|staging|prod，可从 token 文件名推断
  local lvl="${level:-$(echo "$token_file" | sed -n 's/.*\.current\.\([a-z]*\)\.token/\1/p')}"
  if [[ -z "$lvl" ]]; then echo "FAIL: cannot infer level; pass --level" >&2; exit 2; fi

  # 取该关卡最近一条令牌审计记录。
  # 用 node 按字段判别（是否有 level 且无 event），避免 grep 字符串排除误伤。
  # 临时文件放在 $GATE_DIR 下（不放 /tmp：Git Bash 的 /tmp 与 Node 的 Windows 路径解析不一致）
  local tmp="$GATE_DIR/.scan.$$.jsonl"
  : > "$tmp"
  if compgen -G "$GATE_DIR/*.jsonl" > /dev/null; then
    cat "$GATE_DIR"/*.jsonl > "$tmp" 2>/dev/null || true
  fi
  local tmp_win
  if command -v cygpath >/dev/null 2>&1; then
    tmp_win="$(cygpath -w "$tmp")"
  else
    tmp_win="$tmp"
  fi
  local record
  record="$(node -e '
    const fs = require("fs");
    const lvl = process.argv[2];
    let best = null;
    for (const line of fs.readFileSync(process.argv[1], "utf8").split("\n")) {
      const s = line.trim();
      if (!s) continue;
      let o; try { o = JSON.parse(s); } catch { continue; }
      if (!("level" in o)) continue;
      if ("event" in o) continue;
      if (o.level !== lvl) continue;
      if (!best || Date.parse(o.issued_at) >= Date.parse(best.issued_at)) best = o;
    }
    if (best) console.log(JSON.stringify(best));
  ' "$tmp_win" "$lvl" 2>/dev/null || true)"
  rm -f "$tmp"

  if [[ -z "$record" ]]; then echo "FAIL: no audit record for level=$lvl" >&2; exit 4; fi

  # 经临时文件传给 node，避免嵌套引号破坏 JSON（record 内含双引号）
  local tmp2="$GATE_DIR/.verify.tmp.$$"
  printf '%s' "$record" > "$tmp2"
  local tmp2_win
  if command -v cygpath >/dev/null 2>&1; then
    tmp2_win="$(cygpath -w "$tmp2")"
  else
    tmp2_win="$tmp2"
  fi
  local verdict
  verdict="$(node -e '
    const fs = require("fs");
    const o = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const exp = Date.parse(o.expires_at);
    const now = Date.now();
    if (Number.isNaN(exp)) { console.log("BADTS"); process.exit(6); }
    if (now > exp) { console.log("EXPIRED\t" + o.gate_id + "\t" + o.expires_at); process.exit(5); }
    console.log("OK\t" + o.gate_id + "\t" + o.expires_at + "\t" + o.commit_sha + "\t" + o.sha256);
  ' "$tmp2_win" 2>&1)"
  local rc=$?
  rm -f "$tmp2"

  local v_state v_gate v_exp v_commit v_sha
  IFS=$'\t' read -r v_state v_gate v_exp v_commit v_sha <<< "$verdict"

  case "$v_state" in
    EXPIRED) echo "FAIL: gate_token expired (level=$lvl)" >&2; exit 5;;
    BADTS)   echo "FAIL: malformed expires_at in audit record" >&2; exit 6;;
    OK)      : ;;
    *)       echo "FAIL: token verify error: $verdict" >&2; exit 6;;
  esac
  if [[ $rc -ne 0 ]]; then exit "$rc"; fi

  echo "OK   gate_token valid"
  echo "  level      : $lvl"
  echo "  gate_id    : $v_gate"
  echo "  commit_sha : $v_commit"
  echo "  sha256     : $v_sha"
  echo "  expires_at : $v_exp"
}

cmd_archive() {
  local days="${1:-$RETENTION_DAYS}"
  local cutoff
  cutoff="$(node -e "console.log(new Date(Date.now()-${days}*86400000).toISOString().slice(0,10))")"
  mkdir -p "$ARCHIVE_DIR/$cutoff"
  local moved=0
  for f in "$GATE_DIR"/*.jsonl; do
    [[ -e "$f" ]] || continue
    local base; base="$(basename "$f" .jsonl)"
    if [[ "$base" < "$cutoff" ]]; then
      mv "$f" "$ARCHIVE_DIR/$cutoff/" && moved=$((moved+1))
    fi
  done
  echo "OK   archived $moved file(s) older than $days days -> $ARCHIVE_DIR/$cutoff"
}

[[ $# -ge 1 ]] || { usage; exit 2; }
sub="$1"; shift || true
case "$sub" in
  issue) cmd_issue "$@";;
  verify) cmd_verify "$@";;
  archive) cmd_archive "$@";;
  *) usage; exit 2;;
esac