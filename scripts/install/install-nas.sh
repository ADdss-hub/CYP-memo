#!/usr/bin/env bash
# CYP-memo · NAS 原生安装（飞牛/群晖/威联）
# 用法: bash scripts/install/install-nas.sh <APP_ROOT> <DATA_DIR>
set -euo pipefail

APP_ROOT="${1:-}"
DATA_DIR="${2:-}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

if [[ -z "$APP_ROOT" || -z "$DATA_DIR" ]]; then
  echo "用法: $0 <APP_ROOT> <DATA_DIR>"
  echo "详见 deploy/nas/README.md"
  exit 2
fi

APP_ROOT="$(cd "$APP_ROOT" && pwd)"
mkdir -p "$DATA_DIR" "$DATA_DIR/logs" "$DATA_DIR/governance" "$DATA_DIR/logs/runtime"

export APP_ENV=prod
export NODE_ENV=production
export DATA_DIR
export PORT="${PORT:-5170}"

cat > "${APP_ROOT}/.env" <<EOF
APP_ENV=prod
NODE_ENV=production
PORT=${PORT}
DATA_DIR=${DATA_DIR}
LOG_LEVEL=info
TZ=Asia/Shanghai
EOF

SERVER_DIR="${APP_ROOT}/packages/server"
[[ -d "$SERVER_DIR" ]] || SERVER_DIR="$APP_ROOT"
cd "$SERVER_DIR"

if [[ ! -f dist/index.js ]]; then
  echo "[install-nas] 缺少 dist/index.js"
  exit 1
fi

# 依赖已从构建机复制进包，这里只核对并写配置
node "${REPO_ROOT}/scripts/install/ensure-prod-deps.mjs" "$APP_ROOT"

nohup env APP_ENV=prod NODE_ENV=production DATA_DIR="$DATA_DIR" PORT="$PORT" \
  node --conditions=cyp-node dist/index.js \
  >"${DATA_DIR}/logs/runtime/nas-stdout.log" 2>&1 &
echo $! >"${DATA_DIR}/cyp-memo.pid"

sleep 3
bash "${REPO_ROOT}/scripts/verify/verify-five-centers.sh" "http://127.0.0.1:${PORT}" "$DATA_DIR"
echo "[install-nas] OK · 开机自启请用 NAS 任务计划"
echo "[install-nas] 文档: deploy/nas/README.md"
