#!/bin/bash
#
# CYP-memo 镜像构建和标签脚本
# 读取版本号，构建镜像，打版本标签和 latest 标签
#
# 用法: ./scripts/build-image.sh [选项]
#   选项:
#     --no-cache      不使用缓存构建
#     --push          构建后推送到仓库
#     --registry      指定私有仓库地址
#     --help, -h      显示帮助信息
#

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 默认配置
IMAGE_NAME="cyp-memo"
REGISTRY=""
NO_CACHE=false
PUSH_AFTER_BUILD=false

# 获取脚本所在目录的父目录（项目根目录）
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# 切换到项目根目录
cd "$PROJECT_ROOT"

show_help() {
    echo "CYP-memo 镜像构建和标签脚本"
    echo ""
    echo "用法: $0 [选项]"
    echo ""
    echo "选项:"
    echo "  --no-cache          不使用缓存构建"
    echo "  --push              构建后推送到仓库"
    echo "  --registry <url>    指定私有仓库地址 (例如: registry.example.com)"
    echo "  --help, -h          显示帮助信息"
    echo ""
    echo "示例:"
    echo "  $0                              # 构建镜像"
    echo "  $0 --no-cache                   # 不使用缓存构建"
    echo "  $0 --push                       # 构建并推送到 Docker Hub"
    echo "  $0 --registry registry.cn-hangzhou.aliyuncs.com --push"
    echo ""
    echo "环境变量:"
    echo "  DOCKER_USERNAME     Docker Hub 用户名 (推送时需要)"
    echo "  DOCKER_PASSWORD     Docker Hub 密码 (推送时需要)"
    echo ""
}

# 解析参数
while [[ $# -gt 0 ]]; do
    case $1 in
        --no-cache)
            NO_CACHE=true
            shift
            ;;
        --push)
            PUSH_AFTER_BUILD=true
            shift
            ;;
        --registry)
            REGISTRY="$2"
            shift 2
            ;;
        --help|-h)
            show_help
            exit 0
            ;;
        *)
            echo -e "${RED}错误: 未知选项 $1${NC}"
            show_help
            exit 1
            ;;
    esac
done

# 获取版本信息
get_version() {
    if [ -f "VERSION" ]; then
        cat VERSION | tr -d '[:space:]'
    elif [ -f "package.json" ]; then
        grep -o '"version": *"[^"]*"' package.json | head -1 | cut -d'"' -f4
    else
        echo "unknown"
    fi
}

VERSION=$(get_version)
BUILD_DATE=$(date -Iseconds)
GIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")

# 构建完整镜像名称
get_full_image_name() {
    local tag="$1"
    if [ -n "$REGISTRY" ]; then
        echo "${REGISTRY}/${IMAGE_NAME}:${tag}"
    else
        echo "${IMAGE_NAME}:${tag}"
    fi
}

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  CYP-memo 镜像构建脚本${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "版本: ${YELLOW}$VERSION${NC}"
echo -e "构建时间: ${YELLOW}$BUILD_DATE${NC}"
echo -e "Git 提交: ${YELLOW}$GIT_COMMIT${NC}"
if [ -n "$REGISTRY" ]; then
    echo -e "仓库地址: ${YELLOW}$REGISTRY${NC}"
fi
echo ""

# 检查 Docker 是否可用
check_docker() {
    echo -e "${BLUE}[检查] Docker 环境...${NC}"
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}错误: Docker 未安装或不在 PATH 中${NC}"
        exit 1
    fi
    
    if ! docker info &> /dev/null; then
        echo -e "${RED}错误: Docker 服务未运行${NC}"
        exit 1
    fi
    
    echo -e "  Docker: ${GREEN}可用${NC}"
}

# 构建镜像
build_image() {
    echo -e "${BLUE}[构建] 构建 Docker 镜像...${NC}"
    
    local full_image_name=$(get_full_image_name "$VERSION")
    local latest_image_name=$(get_full_image_name "latest")
    
    echo -e "  镜像名称: ${YELLOW}$full_image_name${NC}"
    
    # 构建参数
    local build_args=(
        --build-arg "VERSION=$VERSION"
        --build-arg "BUILD_DATE=$BUILD_DATE"
        --build-arg "GIT_COMMIT=$GIT_COMMIT"
        -t "$full_image_name"
        -t "$latest_image_name"
    )
    
    # 添加无缓存选项
    if [ "$NO_CACHE" = true ]; then
        build_args+=(--no-cache)
        echo -e "  缓存: ${YELLOW}禁用${NC}"
    fi
    
    # 执行构建
    echo -e "${BLUE}[构建] 开始构建...${NC}"
    docker build "${build_args[@]}" .
    
    if [ $? -eq 0 ]; then
        echo -e "  构建完成: ${GREEN}成功${NC}"
    else
        echo -e "  构建完成: ${RED}失败${NC}"
        exit 1
    fi
}

# 验证镜像标签
verify_tags() {
    echo -e "${BLUE}[验证] 检查镜像标签...${NC}"
    
    local full_image_name=$(get_full_image_name "$VERSION")
    local latest_image_name=$(get_full_image_name "latest")
    
    # 检查版本标签
    if docker image inspect "$full_image_name" &> /dev/null; then
        echo -e "  版本标签 ($VERSION): ${GREEN}存在${NC}"
    else
        echo -e "  版本标签 ($VERSION): ${RED}不存在${NC}"
        exit 1
    fi
    
    # 检查 latest 标签
    if docker image inspect "$latest_image_name" &> /dev/null; then
        echo -e "  latest 标签: ${GREEN}存在${NC}"
    else
        echo -e "  latest 标签: ${RED}不存在${NC}"
        exit 1
    fi
    
    # 验证镜像元数据中的版本信息
    local image_version=$(docker inspect --format='{{index .Config.Labels "org.opencontainers.image.version"}}' "$full_image_name" 2>/dev/null)
    if [ "$image_version" = "$VERSION" ]; then
        echo -e "  镜像版本标签: ${GREEN}$image_version (一致)${NC}"
    else
        echo -e "  镜像版本标签: ${YELLOW}$image_version (期望: $VERSION)${NC}"
    fi
}

# 显示镜像信息
show_image_info() {
    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}  镜像构建完成!${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    
    local full_image_name=$(get_full_image_name "$VERSION")
    local latest_image_name=$(get_full_image_name "latest")
    
    # 获取镜像大小
    local image_size=$(docker image inspect "$full_image_name" --format='{{.Size}}' 2>/dev/null)
    if [ -n "$image_size" ]; then
        # 转换为 MB
        local size_mb=$((image_size / 1024 / 1024))
        echo -e "镜像大小: ${YELLOW}${size_mb} MB${NC}"
    fi
    
    echo ""
    echo -e "已创建的镜像标签:"
    echo -e "  ${BLUE}$full_image_name${NC}"
    echo -e "  ${BLUE}$latest_image_name${NC}"
    echo ""
    echo -e "运行命令:"
    echo -e "  ${BLUE}docker run -d -p 5170:5170 -v cyp-memo-data:/app/data $full_image_name${NC}"
    echo ""
    
    if [ "$PUSH_AFTER_BUILD" = true ]; then
        echo -e "推送命令:"
        echo -e "  ${BLUE}./scripts/push-image.sh${NC}"
    fi
}

# 推送镜像（如果指定了 --push）
push_image() {
    if [ "$PUSH_AFTER_BUILD" = true ]; then
        echo -e "${BLUE}[推送] 推送镜像到仓库...${NC}"
        
        # 调用推送脚本
        if [ -f "$SCRIPT_DIR/push-image.sh" ]; then
            if [ -n "$REGISTRY" ]; then
                "$SCRIPT_DIR/push-image.sh" --registry "$REGISTRY"
            else
                "$SCRIPT_DIR/push-image.sh"
            fi
        else
            echo -e "${YELLOW}警告: push-image.sh 脚本不存在，跳过推送${NC}"
        fi
    fi
}

# 主流程
main() {
    check_docker
    build_image
    verify_tags
    show_image_info
    push_image
}

# 执行主流程
main
