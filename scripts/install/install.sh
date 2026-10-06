#!/usr/bin/env bash
# CYP-memo · Unix 生产安装统一入口（Linux/macOS · 闭集 35 · Server）
# 用法: bash scripts/install/install.sh <APP_ROOT> [DATA_DIR]
# 实际转调 install-unix.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "${SCRIPT_DIR}/install-unix.sh" "$@"
