#!/usr/bin/env bash
# 打包非容器 server 发行物（闭集 35 · Server 进程 + app 静态）
# 用法: bash scripts/pack-server-release.sh [VERSION] [OUT_DIR]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
VERSION="${1:-$(tr -d ' \r\n' < VERSION)}"
OUT_DIR="${2:-${ROOT}/artifacts}"
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64|amd64) ARCH=amd64 ;;
  aarch64|arm64) ARCH=arm64 ;;
esac

mkdir -p "$OUT_DIR"
STAGE="${OUT_DIR}/cyp-memo-server-${VERSION}-linux-${ARCH}"
rm -rf "$STAGE"
mkdir -p "$STAGE/packages/server" "$STAGE/packages/app" "$STAGE/scripts" "$STAGE/deploy"

cp -a packages/server/dist "$STAGE/packages/server/"
cp packages/server/package.json "$STAGE/packages/server/"
mkdir -p "$STAGE/packages/shared"
cp packages/shared/package.json "$STAGE/packages/shared/"
cp -a packages/shared/dist "$STAGE/packages/shared/"
cp -a packages/app/dist "$STAGE/packages/app/" 2>/dev/null || mkdir -p "$STAGE/packages/app/dist"
cp -a scripts/install "$STAGE/scripts/" 2>/dev/null || true
cp -a scripts/verify "$STAGE/scripts/" 2>/dev/null || true
cp -a deploy "$STAGE/" 2>/dev/null || true
cp VERSION "$STAGE/" 2>/dev/null || true
cp .env.example "$STAGE/" 2>/dev/null || true
cp DEPLOY.md "$STAGE/" 2>/dev/null || true

# 本机已安装的依赖解成真实文件后打进包。目标机只配置，不重新安装。
node scripts/install/stage-prod-modules.mjs
rm -rf "$STAGE/packages/server/node_modules"
cp -a .server-prod/node_modules "$STAGE/packages/server/node_modules"

TARBALL="${OUT_DIR}/cyp-memo-server-${VERSION}-linux-${ARCH}.tar.gz"
tar -C "$OUT_DIR" -czf "$TARBALL" "cyp-memo-server-${VERSION}-linux-${ARCH}"
echo "$TARBALL"
