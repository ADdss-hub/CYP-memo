#!/bin/bash
#
# CYP-memo 数据恢复脚本
# 从备份恢复 SQLite 数据库和上传文件
#
# 用法: ./scripts/restore.sh <备份文件.tar.gz> [--force]
#

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 默认配置
DEFAULT_DATA_DIR="packages/server/data"
CONTAINER_NAME="cyp-memo"
CONTAINER_DATA_DIR="/app/data"

# 获取脚本所在目录的父目录（项目根目录）
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# 切换到项目根目录
cd "$PROJECT_ROOT"

# 解析参数
BACKUP_FILE="$1"
FORCE_RESTORE="$2"

# 显示用法
show_usage() {
    echo "用法: $0 <备份文件.tar.gz> [--force]"
    echo ""
    echo "参数:"
    echo "  备份文件.tar.gz  要恢复的备份文件路径"
    echo "  --force          跳过确认提示，强制恢复"
    echo ""
    echo "示例:"
    echo "  $0 backups/cyp-memo-backup-20240101_120000.tar.gz"
    echo "  $0 backups/cyp-memo-backup-20240101_120000.tar.gz --force"
}

# 检查参数
if [ -z "$BACKUP_FILE" ]; then
    echo -e "${RED}错误: 请指定备份文件${NC}"
    echo ""
    show_usage
    exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
    echo -e "${RED}错误: 备份文件不存在: $BACKUP_FILE${NC}"
    exit 1
fi

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  CYP-memo 数据恢复${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "备份文件: ${YELLOW}$BACKUP_FILE${NC}"
echo ""

# 创建临时目录
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

# 解压备份
echo -e "${GREEN}[1/5] 解压备份文件...${NC}"
tar -xzf "$BACKUP_FILE" -C "$TEMP_DIR"

# 找到解压后的目录
BACKUP_DIR=$(ls -d "$TEMP_DIR"/*/ 2>/dev/null | head -1)
if [ -z "$BACKUP_DIR" ]; then
    # 如果没有子目录，直接使用临时目录
    BACKUP_DIR="$TEMP_DIR"
fi

# 显示备份信息
echo -e "${GREEN}[2/5] 验证备份内容...${NC}"
if [ -f "$BACKUP_DIR/backup-info.json" ]; then
    echo -e "备份信息:"
    cat "$BACKUP_DIR/backup-info.json"
    echo ""
fi

# 验证备份完整性
RESTORE_DB=false
RESTORE_UPLOADS=false

if [ -f "$BACKUP_DIR/database.sqlite" ]; then
    DB_SIZE=$(du -h "$BACKUP_DIR/database.sqlite" | cut -f1)
    echo -e "  数据库文件: ${GREEN}存在${NC} ($DB_SIZE)"
    RESTORE_DB=true
else
    echo -e "  数据库文件: ${YELLOW}不存在${NC}"
fi

if [ -d "$BACKUP_DIR/uploads" ]; then
    UPLOAD_COUNT=$(find "$BACKUP_DIR/uploads" -type f 2>/dev/null | wc -l)
    echo -e "  上传文件: ${GREEN}存在${NC} ($UPLOAD_COUNT 个文件)"
    RESTORE_UPLOADS=true
else
    echo -e "  上传文件: ${YELLOW}不存在${NC}"
fi

if [ "$RESTORE_DB" = false ] && [ "$RESTORE_UPLOADS" = false ]; then
    echo -e "${RED}错误: 备份文件中没有可恢复的数据${NC}"
    exit 1
fi

echo ""

# 确认恢复
if [ "$FORCE_RESTORE" != "--force" ]; then
    echo -e "${YELLOW}警告: 恢复操作将覆盖现有数据!${NC}"
    read -p "确定要继续吗? (y/N): " confirm
    if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
        echo "已取消恢复操作"
        exit 0
    fi
fi

# 恢复函数
restore_to_container() {
    echo -e "${GREEN}[3/5] 检测到运行中的容器，恢复数据到容器...${NC}"
    
    # 停止容器以确保数据一致性
    echo -e "${YELLOW}暂停容器以确保数据一致性...${NC}"
    docker stop "$CONTAINER_NAME" 2>/dev/null || true
    
    # 恢复数据库
    if [ "$RESTORE_DB" = true ]; then
        echo -e "${GREEN}[4/5] 恢复数据库...${NC}"
        docker cp "$BACKUP_DIR/database.sqlite" "$CONTAINER_NAME:$CONTAINER_DATA_DIR/database.sqlite"
        echo -e "  数据库已恢复"
    fi
    
    # 恢复上传文件
    if [ "$RESTORE_UPLOADS" = true ]; then
        echo -e "${GREEN}[5/5] 恢复上传文件...${NC}"
        # 先删除容器内的 uploads 目录
        docker exec "$CONTAINER_NAME" rm -rf "$CONTAINER_DATA_DIR/uploads" 2>/dev/null || true
        docker cp "$BACKUP_DIR/uploads" "$CONTAINER_NAME:$CONTAINER_DATA_DIR/uploads"
        echo -e "  上传文件已恢复"
    fi
    
    # 重启容器
    echo -e "${YELLOW}重启容器...${NC}"
    docker start "$CONTAINER_NAME"
    
    # 等待容器启动
    echo -e "等待服务启动..."
    sleep 3
    
    # 验证健康状态
    if docker exec "$CONTAINER_NAME" node -e "require('http').get('http://localhost:5170/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})" 2>/dev/null; then
        echo -e "${GREEN}服务已正常启动${NC}"
    else
        echo -e "${YELLOW}警告: 服务可能未完全启动，请检查容器日志${NC}"
    fi
}

restore_to_local() {
    local data_dir="$1"
    echo -e "${GREEN}[3/5] 恢复数据到本地目录: $data_dir${NC}"
    
    # 创建数据目录
    mkdir -p "$data_dir"
    
    # 恢复数据库
    if [ "$RESTORE_DB" = true ]; then
        echo -e "${GREEN}[4/5] 恢复数据库...${NC}"
        cp "$BACKUP_DIR/database.sqlite" "$data_dir/database.sqlite"
        echo -e "  数据库已恢复"
    fi
    
    # 恢复上传文件
    if [ "$RESTORE_UPLOADS" = true ]; then
        echo -e "${GREEN}[5/5] 恢复上传文件...${NC}"
        rm -rf "$data_dir/uploads"
        cp -r "$BACKUP_DIR/uploads" "$data_dir/uploads"
        echo -e "  上传文件已恢复"
    fi
}

# 检测恢复目标
if docker ps -a --format '{{.Names}}' 2>/dev/null | grep -q "^${CONTAINER_NAME}$"; then
    restore_to_container
else
    restore_to_local "$DEFAULT_DATA_DIR"
fi

# 验证恢复结果
echo ""
echo -e "${GREEN}[验证] 检查恢复结果...${NC}"

verify_success=true

if [ "$RESTORE_DB" = true ]; then
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${CONTAINER_NAME}$"; then
        if docker exec "$CONTAINER_NAME" test -f "$CONTAINER_DATA_DIR/database.sqlite" 2>/dev/null; then
            echo -e "  数据库: ${GREEN}验证通过${NC}"
        else
            echo -e "  数据库: ${RED}验证失败${NC}"
            verify_success=false
        fi
    else
        if [ -f "$DEFAULT_DATA_DIR/database.sqlite" ]; then
            echo -e "  数据库: ${GREEN}验证通过${NC}"
        else
            echo -e "  数据库: ${RED}验证失败${NC}"
            verify_success=false
        fi
    fi
fi

if [ "$RESTORE_UPLOADS" = true ]; then
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${CONTAINER_NAME}$"; then
        if docker exec "$CONTAINER_NAME" test -d "$CONTAINER_DATA_DIR/uploads" 2>/dev/null; then
            echo -e "  上传文件: ${GREEN}验证通过${NC}"
        else
            echo -e "  上传文件: ${RED}验证失败${NC}"
            verify_success=false
        fi
    else
        if [ -d "$DEFAULT_DATA_DIR/uploads" ]; then
            echo -e "  上传文件: ${GREEN}验证通过${NC}"
        else
            echo -e "  上传文件: ${RED}验证失败${NC}"
            verify_success=false
        fi
    fi
fi

echo ""
if [ "$verify_success" = true ]; then
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}  恢复完成!${NC}"
    echo -e "${GREEN}========================================${NC}"
else
    echo -e "${YELLOW}========================================${NC}"
    echo -e "${YELLOW}  恢复完成，但部分验证失败${NC}"
    echo -e "${YELLOW}  请手动检查数据完整性${NC}"
    echo -e "${YELLOW}========================================${NC}"
    exit 1
fi
