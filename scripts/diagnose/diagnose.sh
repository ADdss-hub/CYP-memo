#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
echo "== CYP-memo diagnose =="
echo "Time: $(date -Iseconds 2>/dev/null || date)"
echo "OS  : $(uname -a)"
echo "Root: $ROOT"
command -v node >/dev/null && echo "Node: $(node -v)" || echo "Node: MISSING"
command -v pnpm >/dev/null && echo "pnpm: $(pnpm -v)" || echo "pnpm: MISSING"
echo "node_modules: $([[ -d $ROOT/node_modules ]] && echo yes || echo no)"
# 网关 5170 + API 后端 10170 + MCP 旁路 13175；5173 仅为可选热重载（diagnose 不失败）
for port in 5170 10170 13175; do
  if (echo >/dev/tcp/127.0.0.1/$port) >/dev/null 2>&1; then echo "Port $port: up"; else echo "Port $port: down"; fi
done
curl -k -fsS "https://127.0.0.1:5170/api/health" || echo "health: unreachable"

echo ""
echo "-- Auto-rollback --"
echo "Enabled       : ${CYP_AUTO_ROLLBACK_ENABLED:-false}"
COOLDOWN_FILE="$ROOT/logs/auto-rollback-cooldown.json"
if [ -f "$COOLDOWN_FILE" ]; then
  LAST_TS=$(grep -o '"last_rollback_ts":"[^"]*"' "$COOLDOWN_FILE" | cut -d'"' -f4 2>/dev/null || echo "null")
  COUNT=$(grep -o '"rollback_count_window":[0-9]*' "$COOLDOWN_FILE" | cut -d: -f2 2>/dev/null || echo 0)
  ESCALATED=$(grep -o '"escalated":[a-z]*' "$COOLDOWN_FILE" | cut -d: -f2 2>/dev/null || echo false)
  CD_SEC=$(grep -o '"cooldown_seconds":[0-9]*' "$COOLDOWN_FILE" | cut -d: -f2 2>/dev/null || echo 1800)
  echo "Last rollback : $LAST_TS"
  echo "Window count  : $COUNT"
  echo "Escalated     : $ESCALATED"
  echo "Cooldown sec  : $CD_SEC"
else
  echo "Cooldown state: none (no rollback yet)"
fi
if [ -f "$ROOT/logs/auto-rollback.jsonl" ]; then
  COUNT=$(wc -l < "$ROOT/logs/auto-rollback.jsonl" 2>/dev/null || echo 0)
  echo "Log entries   : $COUNT total"
else
  echo "Log file      : none (no checks run yet)"
fi

echo "diagnose done"