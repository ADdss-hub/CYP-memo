#!/usr/bin/env bash
# 打包 Server 发行物（闭集 35 · Server 进程 + app 静态）
# 用法: bash scripts/install/pack-server-release.sh [VERSION] [OUT_DIR]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
VERSION="${1:-$(tr -d ' \r\n' < VERSION)}"
OUT_DIR="${2:-${ROOT}/artifacts}"
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64|amd64) ARCH=amd64 ;;
  aarch64|arm64) ARCH=arm64 ;;
  loongarch64|loong64) ARCH=loong64 ;;
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
# ── 可选产物：app 静态构建目录 ──
# 未构建时仅创建空目录，不阻断打包（属可选，不致命）。
if [ -d packages/app/dist ]; then
  cp -a packages/app/dist "$STAGE/packages/app/dist"
  echo "[ok] 可选: packages/app/dist"
else
  mkdir -p "$STAGE/packages/app/dist"
  echo "[warn] 可选 packages/app/dist 缺失，已留空目录（不致命）"
fi

# ── 必拷文件（缺失或拷贝失败一律 exit 1，绝不静默通过 · 规范 AP-02）──
# 这些是确保发布包完整性的必含物，任何一项缺失/失败都必须暴露，不能 || true 吞错。
must_cp() {
  # $1=源(相对 ROOT)  $2=目标(目录)  $3=展示名
  local src="$ROOT/$1" dst="$2" label="$3"
  if [ ! -e "$src" ]; then
    echo "[FAIL] 必拷文件缺失: $1（$label）" >&2
    exit 1
  fi
  if ! cp -a "$src" "$dst"; then
    echo "[FAIL] 必拷文件拷贝失败: $1 -> $dst（$label）" >&2
    exit 1
  fi
  echo "[ok] 必拷: $1"
}

must_cp scripts/install "$STAGE/scripts/" "安装脚本目录"
must_cp scripts/verify  "$STAGE/scripts/" "验证脚本目录"
must_cp deploy          "$STAGE/"         "部署目录"
must_cp VERSION         "$STAGE/"         "版本文件"
must_cp .env.example    "$STAGE/"         "环境变量样例"
must_cp DEPLOY.md       "$STAGE/"         "部署文档"

# 本机已安装的依赖解成真实文件后打进包。目标机只配置，不重新安装。
node scripts/install/stage-prod-modules.mjs
rm -rf "$STAGE/packages/server/node_modules"
cp -a .server-prod/node_modules "$STAGE/packages/server/node_modules"

TARBALL="${OUT_DIR}/cyp-memo-server-${VERSION}-linux-${ARCH}.tar.gz"
tar -C "$OUT_DIR" -czf "$TARBALL" "cyp-memo-server-${VERSION}-linux-${ARCH}"
node "$ROOT/scripts/_internal/write-sha256.mjs" "$TARBALL"
if [ -n "${CYP_GPG_SIGN_KEY:-}" ]; then
  gpg --batch --yes --local-user "$CYP_GPG_SIGN_KEY" --detach-sign --armor "$TARBALL"
else
  echo "[info] skip gpg (set CYP_GPG_SIGN_KEY to sign; do not invent a sidecar)"
fi
node "$ROOT/scripts/verify/verify-artifact-integrity.mjs" "$TARBALL"
echo "$TARBALL"
