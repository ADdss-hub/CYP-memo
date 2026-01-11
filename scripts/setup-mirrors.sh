#!/bin/bash
# CYP-memo 国内镜像一键配置脚本
# 适用于 Linux 和 macOS

set -e

echo "🚀 开始配置国内镜像源..."
echo ""

# 颜色定义
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查命令是否存在
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# 配置 NPM
echo -e "${BLUE}📦 配置 NPM 镜像...${NC}"
if command_exists npm; then
    npm config set registry https://registry.npmmirror.com
    echo -e "${GREEN}✓ NPM 镜像配置完成${NC}"
else
    echo -e "${YELLOW}⚠ NPM 未安装，跳过${NC}"
fi

# 配置 PNPM
echo -e "${BLUE}📦 配置 PNPM 镜像...${NC}"
if command_exists pnpm; then
    pnpm config set registry https://registry.npmmirror.com
    echo -e "${GREEN}✓ PNPM 镜像配置完成${NC}"
else
    echo -e "${YELLOW}⚠ PNPM 未安装，跳过${NC}"
fi

# 配置 Electron
echo -e "${BLUE}⚡ 配置 Electron 镜像...${NC}"
if command_exists npm; then
    npm config set electron_mirror https://npmmirror.com/mirrors/electron/
    npm config set electron_builder_binaries_mirror https://npmmirror.com/mirrors/electron-builder-binaries/
    echo -e "${GREEN}✓ Electron 镜像配置完成${NC}"
fi

# 配置原生模块
echo -e "${BLUE}🔧 配置原生模块镜像...${NC}"
if command_exists npm; then
    npm config set better_sqlite3_binary_host_mirror https://npmmirror.com/mirrors/better-sqlite3/
    npm config set sharp_binary_host https://npmmirror.com/mirrors/sharp/
    npm config set sharp_libvips_binary_host https://npmmirror.com/mirrors/sharp-libvips/
    npm config set node_sqlite3_binary_host_mirror https://npmmirror.com/mirrors/sqlite3/
    echo -e "${GREEN}✓ 原生模块镜像配置完成${NC}"
fi

# 配置 Docker（如果是 Linux）
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    echo -e "${BLUE}🐳 配置 Docker 镜像...${NC}"
    if command_exists docker; then
        DOCKER_CONFIG="/etc/docker/daemon.json"
        if [ -f "$DOCKER_CONFIG" ]; then
            echo -e "${YELLOW}⚠ Docker 配置文件已存在，请手动添加镜像配置${NC}"
            echo "  参考: docs/MIRROR_QUICK_REF.md"
        else
            echo -e "${YELLOW}⚠ 需要 root 权限配置 Docker 镜像${NC}"
            echo "  请手动执行: sudo nano /etc/docker/daemon.json"
            echo "  参考: docs/MIRROR_QUICK_REF.md"
        fi
    else
        echo -e "${YELLOW}⚠ Docker 未安装，跳过${NC}"
    fi
fi

echo ""
echo -e "${GREEN}✅ 镜像配置完成！${NC}"
echo ""
echo "📊 验证配置:"
echo "  npm config get registry"
echo "  pnpm config get registry"
echo ""
echo "📖 详细文档: docs/CHINA_MIRROR_CONFIG.md"
echo "🔍 快速参考: docs/MIRROR_QUICK_REF.md"
