#!/bin/bash
#
# CYP-memo 镜像推送脚本
# 支持 Docker Hub 和私有仓库
#
# 用法: ./scripts/push-image.sh [选项]
#   选项:
#     --registry      指定私有仓库地址
#     --username      Docker 用户名
#     --password      Docker 密码 (不推荐，建议使用环境变量)
#     --version       指定要推送的版本 (默认: 当前版本)
#     --latest-only   仅推送 latest 标签
#     --skip-latest   跳过 latest 标签
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
USERNAME=""
PASSWORD=""
PUSH_VERSION=""
LATEST_ONLY=false
SKIP_LATEST=false

# 获取脚本所在目录的父目录（项目根目录）
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# 切换到项目根目录
cd "$PROJECT_ROOT"

show_help() {
    echo "CYP-memo 镜像推送脚本"
    echo ""
    echo "用法: $0 [选项]"
    echo ""
    echo "选项:"
    echo "  --registry <url>    指定私有仓库地址 (例如: registry.example.com)"
    echo "  --username <name>   Docker 用户名"
    echo "  --password <pwd>    Docker 密码 (不推荐，建议使用环境变量)"
    echo "  --version <ver>     指定要推送的版本 (默认: 当前版本)"
    echo "  --latest-only       仅推送 latest 标签"
    echo "  --skip-latest       跳过 latest 标签"
    echo "  --help, -h          显示帮助信息"
    echo ""
    echo "环境变量:"
    echo "  DOCKER_USERNAME     Docker 用户名"
    echo "  DOCKER_PASSWORD     Docker 密码"
    echo "  DOCKER_REGISTRY     私有仓库地址"
    echo ""
    echo "示例:"
    echo "  $0                                    # 推送到 Docker Hub"
    echo "  $0 --registry registry.cn-hangzhou.aliyuncs.com"
    echo "  $0 --username myuser                  # 指定用户名"
    echo "  $0 --version 1.7.9                    # 推送指定版本"
    echo "  $0 --latest-only                      # 仅推送 latest"
    echo ""
    echo "私有仓库示例:"
    echo "  # 阿里云容器镜像服务"
    echo "  $0 --registry registry.cn-hangzhou.aliyuncs.com/namespace"
    echo ""
    echo "  # Harbor"
    echo "  $0 --registry harbor.example.com/project"
    echo ""
    echo "  # AWS ECR"
    echo "  $0 --registry 123456789.dkr.ecr.us-east-1.amazonaws.com"
    echo ""
}

# 解析参数
while [[ $# -gt 0 ]]; do
    case $1 in
        --registry)
            REGISTRY="$2"
            shift 2
            ;;
        --username)
            USERNAME="$2"
            shift 2
            ;;
        --password)
            PASSWORD="$2"
            shift 2
            ;;
        --version)
            PUSH_VERSION="$2"
            shift 2
            ;;
        --latest-only)
            LATEST_ONLY=true
            shift
            ;;
        --skip-latest)
            SKIP_LATEST=true
            shift
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

# 从环境变量读取配置
USERNAME="${USERNAME:-$DOCKER_USERNAME}"
PASSWORD="${PASSWORD:-$DOCKER_PASSWORD}"
REGISTRY="${REGISTRY:-$DOCKER_REGISTRY}"

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

VERSION="${PUSH_VERSION:-$(get_version)}"

# 构建完整镜像名称
get_full_image_name() {
    local tag="$1"
    if [ -n "$REGISTRY" ]; then
        echo "${REGISTRY}/${IMAGE_NAME}:${tag}"
    else
        echo "${IMAGE_NAME}:${tag}"
    fi
}

# 获取本地镜像名称（用于标签）
get_local_image_name() {
    local tag="$1"
    echo "${IMAGE_NAME}:${tag}"
}

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  CYP-memo 镜像推送脚本${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "版本: ${YELLOW}$VERSION${NC}"
if [ -n "$REGISTRY" ]; then
    echo -e "仓库地址: ${YELLOW}$REGISTRY${NC}"
else
    echo -e "仓库地址: ${YELLOW}Docker Hub${NC}"
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

# 检查本地镜像是否存在
check_local_image() {
    echo -e "${BLUE}[检查] 本地镜像...${NC}"
    
    local local_image=$(get_local_image_name "$VERSION")
    local local_latest=$(get_local_image_name "latest")
    
    if [ "$LATEST_ONLY" = false ]; then
        if ! docker image inspect "$local_image" &> /dev/null; then
            echo -e "${RED}错误: 本地镜像 $local_image 不存在${NC}"
            echo -e "请先运行: ${BLUE}./scripts/build-image.sh${NC}"
            exit 1
        fi
        echo -e "  版本镜像 ($VERSION): ${GREEN}存在${NC}"
    fi
    
    if [ "$SKIP_LATEST" = false ]; then
        if ! docker image inspect "$local_latest" &> /dev/null; then
            echo -e "${RED}错误: 本地镜像 $local_latest 不存在${NC}"
            echo -e "请先运行: ${BLUE}./scripts/build-image.sh${NC}"
            exit 1
        fi
        echo -e "  latest 镜像: ${GREEN}存在${NC}"
    fi
}

# 登录到仓库
docker_login() {
    echo -e "${BLUE}[登录] 登录到 Docker 仓库...${NC}"
    
    local login_server=""
    if [ -n "$REGISTRY" ]; then
        # 提取仓库服务器地址（去掉命名空间部分）
        login_server=$(echo "$REGISTRY" | cut -d'/' -f1)
    fi
    
    # 如果提供了用户名和密码，自动登录
    if [ -n "$USERNAME" ] && [ -n "$PASSWORD" ]; then
        echo -e "  使用提供的凭据登录..."
        if [ -n "$login_server" ]; then
            echo "$PASSWORD" | docker login "$login_server" -u "$USERNAME" --password-stdin
        else
            echo "$PASSWORD" | docker login -u "$USERNAME" --password-stdin
        fi
        
        if [ $? -eq 0 ]; then
            echo -e "  登录: ${GREEN}成功${NC}"
        else
            echo -e "  登录: ${RED}失败${NC}"
            exit 1
        fi
    else
        # 检查是否已登录
        echo -e "  检查登录状态..."
        
        # 尝试检查是否已登录（通过尝试拉取一个不存在的镜像来验证）
        if [ -n "$login_server" ]; then
            if ! docker login "$login_server" --get-login &> /dev/null; then
                echo -e "${YELLOW}警告: 未登录到 $login_server${NC}"
                echo -e "请先运行: ${BLUE}docker login $login_server${NC}"
                echo -e "或设置环境变量: DOCKER_USERNAME 和 DOCKER_PASSWORD"
                exit 1
            fi
        fi
        
        echo -e "  登录状态: ${GREEN}已登录${NC}"
    fi
}

# 标记镜像（为私有仓库添加前缀）
tag_for_registry() {
    if [ -n "$REGISTRY" ]; then
        echo -e "${BLUE}[标签] 为私有仓库添加标签...${NC}"
        
        local local_image=$(get_local_image_name "$VERSION")
        local local_latest=$(get_local_image_name "latest")
        local remote_image=$(get_full_image_name "$VERSION")
        local remote_latest=$(get_full_image_name "latest")
        
        if [ "$LATEST_ONLY" = false ]; then
            echo -e "  标记: $local_image -> $remote_image"
            docker tag "$local_image" "$remote_image"
        fi
        
        if [ "$SKIP_LATEST" = false ]; then
            echo -e "  标记: $local_latest -> $remote_latest"
            docker tag "$local_latest" "$remote_latest"
        fi
        
        echo -e "  标签: ${GREEN}完成${NC}"
    fi
}

# 推送镜像
push_image() {
    echo -e "${BLUE}[推送] 推送镜像到仓库...${NC}"
    
    local remote_image=$(get_full_image_name "$VERSION")
    local remote_latest=$(get_full_image_name "latest")
    
    # 推送版本标签
    if [ "$LATEST_ONLY" = false ]; then
        echo -e "  推送: ${YELLOW}$remote_image${NC}"
        docker push "$remote_image"
        
        if [ $? -eq 0 ]; then
            echo -e "  版本标签 ($VERSION): ${GREEN}推送成功${NC}"
        else
            echo -e "  版本标签 ($VERSION): ${RED}推送失败${NC}"
            exit 1
        fi
    fi
    
    # 推送 latest 标签
    if [ "$SKIP_LATEST" = false ]; then
        echo -e "  推送: ${YELLOW}$remote_latest${NC}"
        docker push "$remote_latest"
        
        if [ $? -eq 0 ]; then
            echo -e "  latest 标签: ${GREEN}推送成功${NC}"
        else
            echo -e "  latest 标签: ${RED}推送失败${NC}"
            exit 1
        fi
    fi
}

# 显示推送结果
show_result() {
    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}  镜像推送完成!${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    
    local remote_image=$(get_full_image_name "$VERSION")
    local remote_latest=$(get_full_image_name "latest")
    
    echo -e "已推送的镜像:"
    if [ "$LATEST_ONLY" = false ]; then
        echo -e "  ${BLUE}$remote_image${NC}"
    fi
    if [ "$SKIP_LATEST" = false ]; then
        echo -e "  ${BLUE}$remote_latest${NC}"
    fi
    echo ""
    echo -e "拉取命令:"
    echo -e "  ${BLUE}docker pull $remote_image${NC}"
    echo ""
}

# 主流程
main() {
    check_docker
    check_local_image
    docker_login
    tag_for_registry
    push_image
    show_result
}

# 执行主流程
main
