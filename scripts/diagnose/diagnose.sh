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
# 与 diagnose.ps1 一致：5170/5173；5174 已废止
for port in 5170 5173; do
  if (echo >/dev/tcp/127.0.0.1/$port) >/dev/null 2>&1; then echo "Port $port: up"; else echo "Port $port: down"; fi
done
curl -fsS "http://localhost:5170/api/health" || echo "health: unreachable"
echo "diagnose done"