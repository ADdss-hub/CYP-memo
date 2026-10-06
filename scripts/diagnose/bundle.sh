#!/usr/bin/env bash
# CYP-memo support-bundle 入口（Linux/macOS）· 规范第六章 6.1-6.3
# 与 scripts/diagnose/support-bundle.ps1 功能对齐：采集 10 类必含内容、
# 统一真实脱敏、生成 MANIFEST、落盘 support-bundles/{sha}/、保留最近 30 个。
set -euo pipefail
shopt -s nullglob

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
export WIN_ROOT
if command -v cygpath >/dev/null 2>&1; then
  WIN_ROOT="$(cygpath -w "$ROOT")"
else
  WIN_ROOT="$ROOT"
fi

# ── 参数解析 ──
REASON="manual"
JSONL_PATH=""
TIMEOUT_SEC=60
while [[ $# -gt 0 ]]; do
  case "$1" in
    --reason)      REASON="$2"; shift 2;;
    --jsonl)       JSONL_PATH="$2"; shift 2;;
    --timeout-sec) TIMEOUT_SEC="$2"; shift 2;;
    -h|--help) echo "usage: bundle.sh --reason <原因> [--jsonl <路径>] [--timeout-sec <秒>]"; exit 0;;
    *) echo "unknown arg: $1" >&2; exit 2;;
  esac
done

# ── 工具函数 ──
sha256_of_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    node -e 'const c=require("crypto"),fs=require("fs");const h=c.createHash("sha256");h.update(fs.readFileSync(process.argv[1]));console.log(h.digest("hex"))' "$(cygpath -w "$1")"
  fi
}

# 真实脱敏：基于 key 与模式把敏感值替换为 ***（禁止 grep -v 假脱敏 · AP-13）。
# 一次性遍历整棵 stage 树，仅处理文本文件，避免逐文件启动 node。
redact_tree() {
  local dir="$1"
  local wd
  wd="$(cygpath -w "$dir")"
  REDDIR="$wd" node - <<'NODE'
    const fs = require('fs'), path = require('path');
    const root = process.env.REDDIR;
    const TXT = /\.(log|txt|json|jsonl|md|csv|env|yaml|yml)$/i;
    function walk(d) {
      let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; }
      for (const e of ents) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) { if (e.name === 'node_modules') continue; walk(p); }
        else if (TXT.test(e.name)) {
          let t; try { t = fs.readFileSync(p, 'utf8'); } catch (_) { continue; }
          const o = t;
          // 1) key := value / "key": "value" → 脱敏值
          t = t.replace(
            /(password|passwd|pwd|secret[_-]?key|secret|token|apikey|api[_-]?key|authorization|access[_-]?key|client[_-]?secret|private[_-]?key|refresh[_-]?token|access[_-]?token)\b(\s*[:=]\s*)("?)([^\s"',}\n]*)\3/gi,
            (m, k, sep, q) => k + sep + q + '***' + q
          );
          // 2) 模式脱敏：邮箱 / 手机号 / 身份证 / 银行卡
          t = t.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '***'); // 邮箱
          t = t.replace(/\b1[3-9]\d{9}\b/g, '***');                                // 手机号
          t = t.replace(/\b\d{17}[\dXx]\b/g, '***');                               // 身份证
          t = t.replace(/\b\d{16,19}\b/g, '***');                                  // 银行卡(粗略)
          if (t !== o) fs.writeFileSync(p, t);
        }
      }
    }
    walk(root);
NODE
}

LOG_SRC="$ROOT/logs"
START_EPOCH=$(date +%s)
COMMIT="$(git rev-parse --short HEAD 2>/dev/null || echo nogit)"
OUT_ROOT="$ROOT/support-bundles/$COMMIT"
mkdir -p "$OUT_ROOT" "$OUT_ROOT/_archive"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
ARCHIVE_NAME="support-bundle-${COMMIT}-${TS}.tar.gz"
ARCHIVE_PATH="$OUT_ROOT/$ARCHIVE_NAME"

STAGE="$(mktemp -d 2>/dev/null || echo "$ROOT/.bundle-stage.$$")"
mkdir -p "$STAGE"
trap 'rm -rf "$STAGE"' EXIT

echo "== CYP-memo support-bundle (Linux/macOS) =="
echo "commit=$COMMIT ts=$TS reason=$REASON"

# ── META.txt（元数据）──
cat > "$STAGE/META.txt" <<EOF
reason=$REASON
ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
commit=$COMMIT
root=$WIN_ROOT
bundle=$ARCHIVE_NAME
EOF

# ── 4) 环境信息 env.json ──
node -e '
  const os = require("os"), net = require("net");
  const o = {
    os: process.platform + " " + process.arch,
    node: process.version,
    cwd: process.env.WIN_ROOT || process.cwd(),
    hostname: os.hostname(),
    cpus: os.cpus().length,
    totalmem_mb: Math.round(os.totalmem() / 1048576),
    uptime_s: Math.round(os.uptime())
  };
  const probe = (port) => new Promise((r) => {
    const s = net.connect(port, "127.0.0.1");
    let ok = false;
    s.on("connect", () => { ok = true; s.destroy(); r(true); });
    s.on("error", () => r(false));
    s.setTimeout(800, () => { s.destroy(); r(ok); });
  });
  (async () => {
    o.ports = { "5170": await probe(5170), "5173": await probe(5173), "13175": await probe(13175) };
    process.stdout.write(JSON.stringify(o, null, 2) + "\n");
  })();
' > "$STAGE/env.json"

# ── 5a) 资源快照 resource-snapshot.json ──
node -e '
  const os = require("os"), m = process.memoryUsage();
  const o = {
    generated_utc: new Date().toISOString(),
    mem_total_mb: Math.round(os.totalmem() / 1048576),
    mem_free_mb: Math.round(os.freemem() / 1048576),
    load_avg: (typeof os.loadavg === "function") ? os.loadavg() : null,
    node_rss_mb: Math.round(m.rss / 1048576)
  };
  process.stdout.write(JSON.stringify(o, null, 2) + "\n");
' > "$STAGE/resource-snapshot.json"
DISK_JSON="$(df -Pk "$ROOT" 2>/dev/null | awk 'NR==2{printf "{\"avail_mb\":%d,\"used_mb\":%d}",int($4/1024),int($3/1024)}')"
DISK_JSON="${DISK_JSON:-null}"
DISK_JSON="$DISK_JSON" node -e '
  const fs = require("fs");
  const o = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  try { o.disk = JSON.parse(process.env.DISK_JSON); } catch (e) { o.disk = null; }
  fs.writeFileSync(process.argv[1], JSON.stringify(o, null, 2) + "\n");
' "$(cygpath -w "$STAGE/resource-snapshot.json")"

# ── 5b) 服务健康 health-snapshot.json ──
HEALTH="null"; READY="null"
if command -v curl >/dev/null 2>&1; then
  H="$(curl -k -fsS --max-time 3 https://127.0.0.1:5170/api/health 2>/dev/null | tr -d '\n\r' || true)"
  R="$(curl -k -fsS --max-time 3 https://127.0.0.1:5170/healthz/ready 2>/dev/null | tr -d '\n\r' || true)"
  [[ -n "$H" ]] && HEALTH="$H"
  [[ -n "$R" ]] && READY="$R"
fi
cat > "$STAGE/health-snapshot.json" <<EOF
{
  "api_health": $HEALTH,
  "ready": $READY,
  "captured_utc": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

# ── 1/2/3) 完整流程日志 / 失败现场 / 三层状态日志 → logs/ ──
mkdir -p "$STAGE/logs"
if [[ -d "$LOG_SRC" ]]; then
  # 完整流程日志：local-all / dev-all 主日志（>10MB 截断尾部，控体积）
  for f in local-all.out.log local-all.err.log dev-all.out.log dev-all.err.log; do
    if [[ -f "$LOG_SRC/$f" ]]; then
      sz=$(stat -c%s "$LOG_SRC/$f" 2>/dev/null || echo 0)
      if [[ "$sz" -gt 10485760 ]]; then
        tail -c 10485760 "$LOG_SRC/$f" > "$STAGE/logs/$f"
      else
        cp -a "$LOG_SRC/$f" "$STAGE/logs/$f"
      fi
    fi
  done
  # 三层状态日志：gate 日志（P0-P7 / doc / encoding）+ 启动/运维状态 jsonl
  # 单条 cp 批量拷贝（避免 Git Bash 下逐文件 spawn 拖慢，且不静默必含内容）
  cp -a "$LOG_SRC"/*-gate-*.log "$STAGE/logs/" 2>/dev/null || true
  for j in start-local-*.jsonl ops-diagnose.jsonl ops-stop.jsonl; do
    [[ -f "$LOG_SRC/$j" ]] && cp -a "$LOG_SRC/$j" "$STAGE/logs/"
  done
  # 失败现场：从 err 日志归集 error/fail/exception 行（此为归集，非脱敏）
  if [[ -f "$STAGE/logs/local-all.err.log" ]]; then
    grep -iE 'error|fail|exception|stack|fatal' "$STAGE/logs/local-all.err.log" 2>/dev/null | tail -n 200 > "$STAGE/logs/failure-scene.txt" || true
  fi
fi

# ── 6) 启动度量 startup/ ──
mkdir -p "$STAGE/startup"
if [[ -f "$LOG_SRC/start-time.json" ]]; then
  cp -a "$LOG_SRC/start-time.json" "$STAGE/startup/start-time.json"
fi
start_files=("$LOG_SRC"/start-local-*.jsonl)
if [[ ${#start_files[@]} -gt 0 ]]; then
  latest="$(ls -t "${start_files[@]}" | head -n1)"
  cp -a "$latest" "$STAGE/startup/start-local-latest.jsonl"
fi

# ── 7) 验证度量 verification/ ──
mkdir -p "$STAGE/verification"
v_files=("$LOG_SRC"/verify-e2e-*.jsonl)
if [[ ${#v_files[@]} -gt 0 ]]; then
  latest_v="$(ls -t "${v_files[@]}" | head -n1)"
  cp -a "$latest_v" "$STAGE/verification/verify-e2e-latest.jsonl"
fi
[[ -f "$LOG_SRC/verify-s03.jsonl" ]] && cp -a "$LOG_SRC/verify-s03.jsonl" "$STAGE/verification/verify-s03.jsonl"

# ── 8) 热重载统计 hot-reload/ ──
mkdir -p "$STAGE/hot-reload"
WIN_ROOT="$WIN_ROOT" node -e '
  const fs = require("fs"), path = require("path");
  const root = process.env.WIN_ROOT;
  const src = path.join(root, "logs");
  let hmr = 0, reload = 0, update = 0;
  try {
    for (const f of fs.readdirSync(src)) {
      if (!/local-all\.(out|err)\.log$/.test(f)) continue;
      const txt = fs.readFileSync(path.join(src, f), "utf8");
      hmr += (txt.match(/hmr|hot-update|hot module/i) || []).length;
      reload += (txt.match(/reload|重新加载|热重载/i) || []).length;
      update += (txt.match(/\[vite\].*update|full reload/i) || []).length;
    }
  } catch (e) {}
  const o = {
    generated_utc: new Date().toISOString(),
    hmr_mentions: hmr, reload_mentions: reload, vite_update_mentions: update,
    note: "keyword mentions in local-all logs; 0 means no HMR traffic captured"
  };
  fs.writeFileSync(path.join(process.argv[1], "stats.json"), JSON.stringify(o, null, 2) + "\n");
' "$(cygpath -w "$STAGE/hot-reload")"

# ── 9) gate_token 审计 gate-tokens/ ──
mkdir -p "$STAGE/gate-tokens"
if [[ -d "$LOG_SRC/gate-tokens" ]]; then
  # 仅拷审计 *.jsonl（含 sha256/commit，非明文令牌）；明文 .current.*.token 不进包
  gj=("$LOG_SRC"/gate-tokens/*.jsonl)
  for g in "${gj[@]}"; do cp -a "$g" "$STAGE/gate-tokens/"; done
  {
    echo "以下明文 gate 令牌文件已被排除（安全脱敏，不进支持包）："
    find "$LOG_SRC/gate-tokens" -maxdepth 1 -type f -name '.current.*.token' 2>/dev/null | while read -r t; do echo "  - $(basename "$t")"; done
  } > "$STAGE/gate-tokens/REDACTED-SECRETS.txt"
fi

# ── 10) 自检结果 self-check/ ──
mkdir -p "$STAGE/self-check"
WIN_ROOT="$WIN_ROOT" node -e '
  const fs = require("fs"), cp = require("child_process"), path = require("path");
  const root = process.env.WIN_ROOT;
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok: !!ok, detail: detail || "" });
  add("node_present", !!process.version, process.version);
  add("package_json", fs.existsSync(path.join(root, "package.json")));
  add("server_dist", fs.existsSync(path.join(root, "packages", "server", "dist")));
  add("app_dist", fs.existsSync(path.join(root, "packages", "app", "dist")));
  add("logs_dir", fs.existsSync(path.join(root, "logs")));
  add("gate_tokens_dir", fs.existsSync(path.join(root, "logs", "gate-tokens")));
  let git = "nogit"; try { git = cp.execSync("git rev-parse --short HEAD", { cwd: root }).toString().trim(); } catch (e) {}
  add("git_commit", git !== "nogit", git);
  const ok = checks.every((c) => c.ok);
  const o = { generated_utc: new Date().toISOString(), overall: ok ? "pass" : "fail", checks };
  fs.writeFileSync(path.join(process.argv[1], "self-check.json"), JSON.stringify(o, null, 2) + "\n");
' "$(cygpath -w "$STAGE/self-check")"

# 可选 jsonl（调用方提供的额外现场记录）
if [[ -n "$JSONL_PATH" && -f "$JSONL_PATH" ]]; then
  cp -a "$JSONL_PATH" "$STAGE/$(basename "$JSONL_PATH")"
fi

# ── 统一真实脱敏（整棵 stage 树，一次性）──
redact_tree "$STAGE"

# ── MANIFEST.json（6 字段元数据）──
cat > "$STAGE/MANIFEST.json" <<EOF
{
  "bundle": {
    "name": "$ARCHIVE_NAME",
    "commit": "$COMMIT",
    "reason": "$REASON",
    "generated_utc": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "tool": "scripts/diagnose/bundle.sh"
  },
  "contents": [
    "META.txt",
    "env.json (环境信息)",
    "resource-snapshot.json + health-snapshot.json (资源快照/健康)",
    "logs/ (完整流程日志/失败现场/三层状态日志)",
    "startup/ (启动度量)",
    "verification/ (验证度量)",
    "hot-reload/ (热重载统计)",
    "gate-tokens/ (gate_token 审计)",
    "self-check/ (自检结果)"
  ],
  "environment": { "file": "env.json", "note": "OS/Node/端口探测" },
  "redaction": {
    "applied": true,
    "rules": ["key-based: password/token/secret/apikey/authorization/...", "email", "cn-mobile", "cn-idcard", "bank-card"],
    "method": "real substitution to *** (no grep -v)",
    "excluded_secrets": "gate-tokens/.current.*.token 明文令牌不进包"
  },
  "gate_token": { "dir": "gate-tokens/", "includes": "audit *.jsonl (sha256/commit, 非明文令牌)", "excluded": "REDACTED-SECRETS.txt" },
  "self_check": { "file": "self-check/self-check.json", "overall": "see file" }
}
EOF

# ── MANIFEST.sha256（每个文件的 sha256）──
: > "$STAGE/MANIFEST.sha256"
( cd "$STAGE" && find . -type f -print | sort | while read -r f; do
    rel="${f#./}"
    printf '%s  %s\n' "$(sha256_of_file "$f")" "$rel" >> "$STAGE/MANIFEST.sha256"
  done )

# ── 打包 ──
tar -C "$STAGE" -czf "$ARCHIVE_PATH" .

# ── 保留最近 30 个，超期移 _archive/ ──
i=0
for f in "$OUT_ROOT"/support-bundle-*.tar.gz; do
  i=$((i + 1))
  if [[ $i -gt 30 ]]; then
    mv "$f" "$OUT_ROOT/_archive/" && echo "[archive] $(basename "$f")"
  fi
done

END_EPOCH=$(date +%s)
ELAPSED=$((END_EPOCH - START_EPOCH))
if [[ $ELAPSED -gt $TIMEOUT_SEC ]]; then
  echo "WARN: support-bundle took ${ELAPSED}s (> ${TIMEOUT_SEC}s budget)"
else
  echo "OK   support-bundle in ${ELAPSED}s: $ARCHIVE_PATH"
fi
echo "$ARCHIVE_PATH"
