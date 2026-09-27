#!/usr/bin/env bash
set -euo pipefail
# 5175 = desktop Vite；产品壳 5174 已废止
for port in 5170 5173 5175; do
  pids=$(lsof -tiTCP:$port -sTCP:LISTEN 2>/dev/null || true)
  if [[ -z "${pids}" ]]; then
    echo "Port $port : no LISTEN process"
    continue
  fi
  for pid in $pids; do
    echo "Port $port : stopping PID $pid"
    kill "$pid" 2>/dev/null || true
  done
done
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
rm -f "$ROOT/logs/local-all.pid"
echo "stop-local done"
