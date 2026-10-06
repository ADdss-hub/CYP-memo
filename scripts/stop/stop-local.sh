#!/usr/bin/env bash
set -euo pipefail
# 10170 = 后端 API 服务（仅环回）
# 13175 = MCP 旁路；产品壳 5174 已废止
# 12000 = KMS 密钥保险箱独立服务（基础设施服务段）
for port in 5170 5173 10170 13175 12000; do
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
