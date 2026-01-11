#!/bin/bash
#
# CYP-memo 一键部署脚本
# 构建镜像、启动容器、检查健康状态
#
# 用法: ./scripts/deploy.sh [选项]
#   选项:
#     --build-only    仅构建镜像，不启动容器
#     --no-build      跳过构建，直接启动容器
#     --detach, -d    后台运行容器
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
CONTAINER_NAME="cyp-memo"
IMAGE_NAME="cyp-memo"
COMPOSE_FILE="docker-compose.yml"
HEALTH_CHECK_TIMEOUT=60
HEALTH_CHECK_INTERVAL=2

# 获取脚本所在目录的父目录（项目根目录）
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# 切换到项目根目录
cd "$PROJECT_ROOT"

# 解析参数
BUILD_ONLY=false
NO_BUILD=false
DETACH=false

show_help() {
    echo "CYP-memo 一键部署脚本"
    echo ""
    echo "用法: $0 [选项]"
    echo ""
    echo "选项:"
    echo "  --build-only    仅构建镜像，不启动容器"
    echo "  --no-build      跳过构建，直接启动容器"
    echo "  --detach, -d    后台运行容器"
    echo "  --help, -h      显示帮助信息"
    echo ""
    echo "示例:"
    echo "  $0              # 构建并启动（前台）"
    echo "  $0 -d           # 构建并启动（后台）"
    echo "  $0 --build-only # 仅构建镜像"
    echo "  $0 --no-build   # 跳过构建，直接启动"
}

while [[ $# -gt 0 ]]; do
    case $1 in
        --build-only)
            BUILD_ONLY=true
            shift
            ;;
        --no-build)
            NO_BUILD=true
            shift
            ;;
        --detach|-d)
            DETACH=true
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

# 获取版本信息
get_version() {
    if [ -f "VERSION" ]; then
        cat VERSION
    elif [ -f "package.json" ]; then
        grep -o '"version": *"[^"]*"' package.json | head -1 | cut -d'"' -f4
    else
        echo "unknown"
    fi
}

VERSION=$(get_version)
BUILD_DATE=$(date -Iseconds)
GIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  CYP-memo 部署脚本${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "版本: ${YELLOW}$VERSION${NC}"
echo -e "构建时间: ${YELLOW}$BUILD_DATE${NC}"
echo -e "Git 提交: ${YELLOW}$GIT_COMMIT${NC}"
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
    
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        echo -e "${RED}错误: Docker Compose 未安装${NC}"
        exit 1
    fi
    
    echo -e "  Docker: ${GREEN}可用${NC}"
}

# 构建镜像
build_image() {
    echo -e "${BLUE}[构建] 构建 Docker 镜像...${NC}"
    echo -e "  镜像名称: ${YELLOW}$IMAGE_NAME:$VERSION${NC}"
    
    # 设置构建参数
    export BUILD_DATE="$BUILD_DATE"
    export GIT_COMMIT="$GIT_COMMIT"
    
    # 使用 docker compose 构建
    if docker compose version &> /dev/null; then
        docker compose -f "$COMPOSE_FILE" build --build-arg VERSION="$VERSION" --build-arg BUILD_DATE="$BUILD_DATE" --build-arg GIT_COMMIT="$GIT_COMMIT"
    else
        docker-compose -f "$COMPOSE_FILE" build --build-arg VERSION="$VERSION" --build-arg BUILD_DATE="$BUILD_DATE" --build-arg GIT_COMMIT="$GIT_COMMIT"
    fi
    
    # 添加版本标签
    docker tag "$IMAGE_NAME:latest" "$IMAGE_NAME:$VERSION"
    
    echo -e "  构建完成: ${GREEN}成功${NC}"
}

# 停止旧容器
stop_old_container() {
    echo -e "${BLUE}[清理] 停止旧容器...${NC}"
    
    if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        if docker compose version &> /dev/null; then
            docker compose -f "$COMPOSE_FILE" down 2>/dev/null || true
        else
            docker-compose -f "$COMPOSE_FILE" down 2>/dev/null || true
        fi
        echo -e "  旧容器已停止"
    else
        echo -e "  无旧容器需要停止"
    fi
}

# 启动容器
start_container() {
    echo -e "${BLUE}[启动] 启动容器...${NC}"
    
    local compose_cmd="docker compose"
    if ! docker compose version &> /dev/null; then
        compose_cmd="docker-compose"
    fi
    
    if [ "$DETACH" = true ]; then
        $compose_cmd -f "$COMPOSE_FILE" up -d
        echo -e "  容器已在后台启动"
    else
        echo -e "  容器将在前台运行，按 Ctrl+C 停止"
        $compose_cmd -f "$COMPOSE_FILE" up
    fi
}

# 健康检查
check_health() {
    echo -e "${BLUE}[健康检查] 等待服务启动...${NC}"
    
    local elapsed=0
    local healthy=false
    
    while [ $elapsed -lt $HEALTH_CHECK_TIMEOUT ]; do
        # 检查容器是否运行
        if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
            echo -e "${RED}错误: 容器未运行${NC}"
            echo -e "查看日志: docker logs $CONTAINER_NAME"
            return 1
        fi
        
        # 检查健康状态
        local health_status=$(docker inspect --format='{{.State.Health.Status}}' "$CONTAINER_NAME" 2>/dev/null || echo "unknown")
        
        if [ "$health_status" = "healthy" ]; then
            healthy=true
            break
        fi
        
        # 尝试直接访问健康检查端点
        if curl -s -o /dev/null -w "%{http_code}" "http://localhost:5170/api/health" 2>/dev/null | grep -q "200"; then
            healthy=true
            break
        fi
        
        echo -e "  等待中... ($elapsed/$HEALTH_CHECK_TIMEOUT 秒)"
        sleep $HEALTH_CHECK_INTERVAL
        elapsed=$((elapsed + HEALTH_CHECK_INTERVAL))
    done
    
    if [ "$healthy" = true ]; then
        echo -e "  健康状态: ${GREEN}正常${NC}"
        
        # 获取详细健康信息
        local health_info=$(curl -s "http://localhost:5170/api/health" 2>/dev/null)
        if [ -n "$health_info" ]; then
            echo -e "  健康信息: $health_info"
        fi
        
        return 0
    else
        echo -e "  健康状态: ${RED}超时${NC}"
        echo -e "${YELLOW}提示: 服务可能仍在启动中，请稍后检查${NC}"
        echo -e "查看日志: docker logs $CONTAINER_NAME"
        return 1
    fi
}

# 显示部署结果
show_result() {
    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}  部署完成!${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo -e "访问地址: ${YELLOW}http://localhost:5170${NC}"
    echo ""
    echo -e "常用命令:"
    echo -e "  查看日志: ${BLUE}docker logs -f $CONTAINER_NAME${NC}"
    echo -e "  停止服务: ${BLUE}docker compose down${NC}"
    echo -e "  重启服务: ${BLUE}docker compose restart${NC}"
    echo -e "  备份数据: ${BLUE}./scripts/backup.sh${NC}"
    echo ""
}

# 主流程
main() {
    check_docker
    
    if [ "$NO_BUILD" = false ]; then
        build_image
    fi
    
    if [ "$BUILD_ONLY" = true ]; then
        echo ""
        echo -e "${GREEN}镜像构建完成!${NC}"
        echo -e "启动命令: ${BLUE}docker compose up -d${NC}"
        exit 0
    fi
    
    stop_old_container
    
    if [ "$DETACH" = true ]; then
        start_container
        sleep 3  # 等待容器启动
        check_health
        show_result
    else
        # 前台模式，直接启动
        start_container
    fi
}

# 执行主流程
main
