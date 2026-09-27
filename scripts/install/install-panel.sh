#!/usr/bin/env bash
# CYP-memo · 服务器面板安装（宝塔 / 1Panel / aaPanel）
# 用法: bash scripts/install/install-panel.sh <APP_ROOT> [DATA_DIR]
set -euo pipefail

APP_ROOT="${1:-}"
DATA_DIR="${2:-}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

if [[ -z "$APP_ROOT" ]]; then
  echo "用法: $0 <APP_ROOT> [DATA_DIR]"
  exit 2
fi

APP_ROOT="$(cd "$APP_ROOT" && pwd)"
if [[ -z "$DATA_DIR" ]]; then
  DATA_DIR="${APP_ROOT}/data"
fi
mkdir -p "$DATA_DIR" "$DATA_DIR/logs" "$DATA_DIR/governance" "$DATA_DIR/logs/runtime"

export APP_ENV=prod
export NODE_ENV=production
export DATA_DIR
export PORT="${PORT:-5170}"

ENV_FILE="${APP_ROOT}/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  if [[ -f "${REPO_ROOT}/.env.example" ]]; then
    cp "${REPO_ROOT}/.env.example" "$ENV_FILE"
  else
    cat > "$ENV_FILE" <<EOF
APP_ENV=prod
NODE_ENV=production
PORT=5170
DATA_DIR=${DATA_DIR}
LOG_LEVEL=info
TZ=Asia/Shanghai
EOF
  fi
fi

# 确保 DATA_DIR 写入 .env
if ! grep -q '^DATA_DIR=' "$ENV_FILE" 2>/dev/null; then
  echo "DATA_DIR=${DATA_DIR}" >> "$ENV_FILE"
fi

SERVER_DIR="${APP_ROOT}/packages/server"
if [[ ! -d "$SERVER_DIR" ]]; then
  SERVER_DIR="$APP_ROOT"
fi

cd "$SERVER_DIR"
# 依赖已从构建机复制进包，这里只核对并写配置
node "${REPO_ROOT}/scripts/install/ensure-prod-deps.mjs" "$APP_ROOT"

# 启动（后台）；面板亦可自行托管本进程
if [[ -f dist/index.js ]]; then
  nohup env APP_ENV=prod NODE_ENV=production DATA_DIR="$DATA_DIR" PORT="$PORT" \
    node --conditions=cyp-node dist/index.js \
    >"${DATA_DIR}/logs/runtime/panel-stdout.log" 2>&1 &
  echo $! >"${DATA_DIR}/cyp-memo.pid"
  echo "[install-panel] started pid=$(cat "${DATA_DIR}/cyp-memo.pid")"
else
  echo "[install-panel] 未找到 dist/index.js，请先 pnpm build 或使用 Release server 包"
  exit 1
fi

sleep 3
bash "${REPO_ROOT}/scripts/verify/verify-five-centers.sh" "http://127.0.0.1:${PORT}" "$DATA_DIR"
echo "[install-panel] 反代模板: deploy/panel/nginx-cyp-memo.conf.example"
