#!/bin/bash
#
# CYP-memo 清理脚本
# 停止容器、删除镜像、清理数据卷
#
# 用法: ./scripts/cleanup.sh [选项]
#   选项:
#     --all, -a       清理所有资源（包括数据卷）
#     --volumes, -v   同时清理数据卷（数据将丢失！）
#     --images, -i    同时删除镜像
#     --force, -f     跳过确认提示
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
VOLUME_NAME="cyp-memo_cyp-memo-data"

# 获取脚本所在目录的父目录（项目根目录）
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# 切换到项目根目录
cd "$PROJECT_ROOT"

# 解析参数
CLEAN_VOLUMES=false
CLEAN_IMAGES=false
FORCE=false

show_help() {
    echo "CYP-memo 清理脚本"
    echo ""
    echo "用法: $0 [选项]"
    echo ""
    echo "选项:"
    echo "  --all, -a       清理所有资源（包括数据卷和镜像）"
    echo "  --volumes, -v   同时清理数据卷（数据将丢失！）"
    echo "  --images, -i    同时删除镜像"
    echo "  --force, -f     跳过确认提示"
    echo "  --help, -h      显示帮助信息"
    echo ""
    echo "示例:"
    echo "  $0              # 仅停止容器"
    echo "  $0 -i           # 停止容器并删除镜像"
    echo "  $0 -v           # 停止容器并清理数据卷"
    echo "  $0 -a           # 清理所有资源"
    echo "  $0 -a -f        # 清理所有资源（无确认）"
}

while [[ $# -gt 0 ]]; do
    case $1 in
        --all|-a)
            CLEAN_VOLUMES=true
            CLEAN_IMAGES=true
            shift
            ;;
        --volumes|-v)
            CLEAN_VOLUMES=true
            shift
            ;;
        --images|-i)
            CLEAN_IMAGES=true
            shift
            ;;
        --force|-f)
            FORCE=true
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

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  CYP-memo 清理脚本${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# 显示将要执行的操作
echo -e "${BLUE}将执行以下操作:${NC}"
echo -e "  - 停止并删除容器"
if [ "$CLEAN_IMAGES" = true ]; then
    echo -e "  - 删除 Docker 镜像"
fi
if [ "$CLEAN_VOLUMES" = true ]; then
    echo -e "  - ${RED}删除数据卷（数据将丢失！）${NC}"
fi
echo ""

# 确认操作
if [ "$FORCE" = false ]; then
    if [ "$CLEAN_VOLUMES" = true ]; then
        echo -e "${RED}警告: 清理数据卷将永久删除所有数据！${NC}"
        echo -e "${YELLOW}建议先运行 ./scripts/backup.sh 备份数据${NC}"
        echo ""
    fi
    read -p "确定要继续吗? (y/N): " confirm
    if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
        echo "已取消清理操作"
        exit 0
    fi
fi

# 检查 Docker 是否可用
check_docker() {
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}错误: Docker 未安装或不在 PATH 中${NC}"
        exit 1
    fi
    
    if ! docker info &> /dev/null; then
        echo -e "${RED}错误: Docker 服务未运行${NC}"
        exit 1
    fi
}

# 停止并删除容器
stop_containers() {
    echo -e "${BLUE}[1/4] 停止容器...${NC}"
    
    local compose_cmd="docker compose"
    if ! docker compose version &> /dev/null; then
        compose_cmd="docker-compose"
    fi
    
    if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        $compose_cmd -f "$COMPOSE_FILE" down 2>/dev/null || docker stop "$CONTAINER_NAME" 2>/dev/null || true
        docker rm "$CONTAINER_NAME" 2>/dev/null || true
        echo -e "  容器已停止并删除"
    else
        echo -e "  无运行中的容器"
    fi
}

# 删除镜像
remove_images() {
    echo -e "${BLUE}[2/4] 删除镜像...${NC}"
    
    if [ "$CLEAN_IMAGES" = false ]; then
        echo -e "  跳过（未指定 --images）"
        return
    fi
    
    # 获取所有相关镜像
    local images=$(docker images --format '{{.Repository}}:{{.Tag}}' | grep "^${IMAGE_NAME}:" || true)
    
    if [ -n "$images" ]; then
        echo "$images" | while read -r image; do
            echo -e "  删除镜像: $image"
            docker rmi "$image" 2>/dev/null || true
        done
        echo -e "  镜像已删除"
    else
        echo -e "  无相关镜像"
    fi
}

# 清理数据卷
remove_volumes() {
    echo -e "${BLUE}[3/4] 清理数据卷...${NC}"
    
    if [ "$CLEAN_VOLUMES" = false ]; then
        echo -e "  跳过（未指定 --volumes）"
        return
    fi
    
    # 删除 compose 创建的卷
    if docker volume ls --format '{{.Name}}' | grep -q "^${VOLUME_NAME}$"; then
        docker volume rm "$VOLUME_NAME" 2>/dev/null || true
        echo -e "  数据卷 $VOLUME_NAME 已删除"
    else
        echo -e "  无相关数据卷"
    fi
    
    # 清理悬空卷（可选）
    local dangling=$(docker volume ls -qf dangling=true 2>/dev/null | wc -l)
    if [ "$dangling" -gt 0 ]; then
        echo -e "  发现 $dangling 个悬空卷"
        read -p "  是否清理悬空卷? (y/N): " clean_dangling
        if [ "$clean_dangling" = "y" ] || [ "$clean_dangling" = "Y" ]; then
            docker volume prune -f
            echo -e "  悬空卷已清理"
        fi
    fi
}

# 清理网络
remove_networks() {
    echo -e "${BLUE}[4/4] 清理网络...${NC}"
    
    local network_name="cyp-memo_cyp-memo-network"
    
    if docker network ls --format '{{.Name}}' | grep -q "^${network_name}$"; then
        docker network rm "$network_name" 2>/dev/null || true
        echo -e "  网络 $network_name 已删除"
    else
        echo -e "  无相关网络"
    fi
}

# 显示清理结果
show_result() {
    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}  清理完成!${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    
    # 显示剩余资源
    echo -e "${BLUE}剩余资源:${NC}"
    
    # 检查容器
    if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        echo -e "  容器: ${YELLOW}存在${NC}"
    else
        echo -e "  容器: ${GREEN}已清理${NC}"
    fi
    
    # 检查镜像
    local image_count=$(docker images --format '{{.Repository}}' | grep "^${IMAGE_NAME}$" | wc -l)
    if [ "$image_count" -gt 0 ]; then
        echo -e "  镜像: ${YELLOW}$image_count 个${NC}"
    else
        echo -e "  镜像: ${GREEN}已清理${NC}"
    fi
    
    # 检查数据卷
    if docker volume ls --format '{{.Name}}' | grep -q "^${VOLUME_NAME}$"; then
        echo -e "  数据卷: ${YELLOW}存在${NC}"
    else
        echo -e "  数据卷: ${GREEN}已清理${NC}"
    fi
    
    echo ""
    echo -e "重新部署: ${BLUE}./scripts/deploy.sh${NC}"
}

# 主流程
main() {
    check_docker
    stop_containers
    remove_images
    remove_volumes
    remove_networks
    show_result
}

# 执行主流程
main
