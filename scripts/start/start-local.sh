#!/usr/bin/env bash
# CYP-memo start-local · CI02 生产唯一基准（APP_ENV=prod）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

export APP_ENV=prod
export NODE_ENV=production
echo "CI02: APP_ENV=prod NODE_ENV=production (production-only baseline)"

if ! command -v node >/dev/null 2>&1; then echo "Node.js not found"; exit 1; fi
if ! command -v pnpm >/dev/null 2>&1; then echo "pnpm not found"; exit 1; fi
if [[ ! -d node_modules ]]; then
  echo "node_modules missing. Run: pnpm install"
  exit 1
fi
mkdir -p logs
TIMEOUT="${CYP_START_TIMEOUT:-120}"
pnpm local:all >logs/local-all.out.log 2>logs/local-all.err.log &
echo $! >logs/local-all.pid
echo "Started PID $(cat logs/local-all.pid)"
deadline=$((SECONDS + TIMEOUT))
while (( SECONDS < deadline )); do
  if curl -fsS "http://localhost:5170/healthz/ready" | grep -q '"success":true\|"success": true' \
    && curl -fsS "http://localhost:5170/api/health" | grep -q '"success":true\|"success": true'; then
    if curl -fsS -o /dev/null "http://localhost:5173/"; then
      echo "Ready."
      echo "  App      : http://localhost:5173"
      echo "  API      : http://localhost:5170"
      echo "  Ready    : http://localhost:5170/healthz/ready"
      echo "  Tenant   : http://localhost:5173/tenant"
      exit 0
    fi
  fi
  sleep 2
done
echo "FAIL: services not ready in time"
exit 1
