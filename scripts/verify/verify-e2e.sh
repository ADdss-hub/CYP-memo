#!/usr/bin/env bash
# CYP-memo verify-e2e · R5 轻量 bash 版（完整 JSONL/bundle 见 verify-e2e.ps1）
set -euo pipefail
fail=0
API="${CYP_API:-http://127.0.0.1:5170}"
TRACE=$(python -c "import uuid; print(uuid.uuid4().hex)" 2>/dev/null || echo "bashverify000000000000000000000")

for port in 5170 5173; do
  if (echo >/dev/tcp/127.0.0.1/$port) >/dev/null 2>&1; then
    echo "OK   port $port listening"
  else
    echo "FAIL port $port not listening"; fail=1
  fi
done

body=$(curl -fsS "$API/api/health" || true)
if echo "$body" | grep -q '"success":\s*true\|"success": true'; then
  echo "OK   GET /api/health success=true"
else
  echo "FAIL /api/health"; echo "$body"; fail=1
fi

ready=$(curl -fsS "$API/healthz/ready" || true)
if echo "$ready" | grep -q '"success":\s*true\|"success": true'; then
  echo "OK   GET /healthz/ready success=true (B18)"
else
  echo "FAIL /healthz/ready"; echo "$ready"; fail=1
fi

# ≥3 异常
u=$(curl -s -H "X-Trace-Id: $TRACE" "$API/api/users" || true)
echo "$u" | grep -q '"code":"E020"\|"code": "E020"' && echo "OK   E020 unauth" || { echo "FAIL E020"; fail=1; }

b=$(curl -s -H "Authorization: Bearer bad" -H "X-Trace-Id: $TRACE" "$API/api/users" || true)
echo "$b" | grep -q '"code":"E021"\|"code": "E021"' && echo "OK   E021 bad token" || { echo "FAIL E021"; fail=1; }

l=$(curl -s -H "Content-Type: application/json" -H "X-Trace-Id: $TRACE" \
  -d '{"username":"__no_such__","password":"x"}' "$API/api/auth/login" || true)
echo "$l" | grep -q '"code":"E022"\|"code": "E022"' && echo "OK   E022 login fail" || { echo "FAIL E022"; fail=1; }

g=$(curl -s -H "Content-Type: application/json" -d '{}' "$API/api/admins/login" || true)
echo "$g" | grep -q '"code":"E410"\|"code": "E410"' && echo "OK   E410 admins gone" || { echo "FAIL E410"; fail=1; }

[[ "$fail" -eq 0 ]] || { echo verify-e2e FAILED; exit 1; }
echo verify-e2e PASSED
