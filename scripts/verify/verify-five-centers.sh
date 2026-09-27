#!/usr/bin/env bash
# CYP-memo closed-set probe (35 stable IDs)
set -euo pipefail
BASE_URL="${1:-http://127.0.0.1:5170}"
DATA_DIR="${2:-}"
FAIL=0
echo "[runtime-base] base=$BASE_URL"
ready="$(curl -sf "${BASE_URL}/healthz/ready" || true)"
if echo "$ready" | grep -q '"success":true\|"success": true'; then echo "[OK] init ready"; else echo "[FAIL] init ready"; FAIL=1; fi
set +e
echo "$ready" | node --input-type=module -e "
let s='';
process.stdin.on('data', d => { s += d });
process.stdin.on('end', () => {
  const ids = [
    'RB-L0-INFRA-CFG-01','RB-L0-INFRA-INIT-01','RB-L0-INFRA-LOG-01','RB-L0-INFRA-CACHE-01','RB-L0-INFRA-MQ-01','RB-L0-INFRA-DB-01',
    'RB-L0-COORD-CMP-01','RB-L0-COORD-PLT-01',
    'RB-L1-MGMT-CONF-01','RB-L1-MGMT-RISK-01','RB-L1-MGMT-TRACE-01','RB-L1-MGMT-BOOT-01','RB-L1-MGMT-CODE-01','RB-L1-MGMT-FESEC-01','RB-L1-MGMT-IAM-01','RB-L1-MGMT-KMS-01','RB-L1-MGMT-RBAC-01','RB-L1-MGMT-PERF-01',
    'RB-L1-HOST-TELEM-01','RB-L1-HOST-RULE-01','RB-L1-HOST-SCHED-01','RB-L1-HOST-ACCT-01','RB-L1-HOST-REL-01','RB-L1-HOST-BIZ-01','RB-L1-HOST-ALERT-01','RB-L1-HOST-TRACEAN-01','RB-L1-HOST-AUDIT-01','RB-L1-HOST-RESIL-01',
    'RB-L1-COL-SVC-01','RB-L1-COL-EVT-01','RB-L1-COL-CTR-01','RB-L1-COL-TEN-01','RB-L1-COL-DATA-01',
    'RB-L1-PUB-ACC-01','RB-L1-PUB-OPEN-01'
  ];
  let fail = 0;
  let j;
  try { j = JSON.parse(s); } catch { console.log('[FAIL] ready json'); process.exit(1); }
  const d = j.data || {};
  const rb = d.runtimeBase || {};
  if (d.twelveCenters) { console.log('[FAIL] twelveCenters still present'); fail = 1; } else console.log('[OK] twelveCenters absent');
  if (d.modules) { console.log('[FAIL] parallel modules list'); fail = 1; } else console.log('[OK] no parallel modules list');
  if (rb['质量门禁']) { console.log('[FAIL] quality gate still in runtimeBase'); fail = 1; } else console.log('[OK] quality gate absent');
  const items = rb.items || {};
  for (const id of ids) {
    if (items[id] === true) console.log('[OK] ' + id);
    else { console.log('[FAIL] ' + id); fail = 1; }
  }
  if (rb.completeForm === true) console.log('[OK] runtimeBase.completeForm');
  else { console.log('[FAIL] runtimeBase.completeForm'); fail = 1; }
  process.exit(fail);
});
"
if [[ $? -ne 0 ]]; then FAIL=1; fi
set -e
env_body="$(curl -sf "${BASE_URL}/api/health" || true)"
if echo "$env_body" | grep -q 'success'; then echo "[OK] /api/health"; else echo "[FAIL] /api/health"; FAIL=1; fi
if [[ -n "$DATA_DIR" ]]; then
  for sub in logs governance schedule registry uploads alerts kms audit tracing release contracts pipeline env-isolation chaos elasticity notify mq; do
    if [[ -d "${DATA_DIR}/${sub}" ]] || { [[ "$sub" == "governance" ]] && mkdir -p "${DATA_DIR}/${sub}"; }; then
      echo "[OK] dir $sub"
    else
      echo "[FAIL] missing ${DATA_DIR}/${sub}"; FAIL=1
    fi
  done
else
  echo "[SKIP] filesystem dirs"
fi
if [[ "$FAIL" -ne 0 ]]; then echo "[runtime-base] FAILED"; exit 1; fi
echo "[runtime-base] PASSED"; exit 0
