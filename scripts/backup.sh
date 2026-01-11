#!/bin/bash
#
# CYP-memo 数据备份脚本
# 备份 SQLite 数据库和上传文件
#
# 用法: ./scripts/backup.sh [备份目录]
#

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 默认配置
DEFAULT_DATA_DIR="packages/server/data"
DEFAULT_BACKUP_DIR="backups"
CONTAINER_NAME="cyp-memo"
CONTAINER_DATA_DIR="/app/data"

# 获取脚本所在目录的父目录（项目根目录）
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# 切换到项目根目录
cd "$PROJECT_ROOT"

# 解析参数
BACKUP_DIR="${1:-$DEFAULT_BACKUP_DIR}"

# 生成时间戳
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_NAME="cyp-memo-backup-${TIMESTAMP}"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  CYP-memo 数据备份${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# 创建备份目录
mkdir -p "$BACKUP_DIR"
BACKUP_PATH="$BACKUP_DIR/$BACKUP_NAME"
mkdir -p "$BACKUP_PATH"

echo -e "${YELLOW}备份目录: $BACKUP_PATH${NC}"
echo ""

# 检测数据源（容器或本地）
backup_from_container() {
    echo -e "${GREEN}[1/3] 检测到运行中的容器，从容器备份数据...${NC}"
    
    # 备份数据库
    echo -e "${GREEN}[2/3] 备份 SQLite 数据库...${NC}"
    docker cp "$CONTAINER_NAME:$CONTAINER_DATA_DIR/database.sqlite" "$BACKUP_PATH/database.sqlite" 2>/dev/null || {
        echo -e "${YELLOW}警告: 数据库文件不存在或无法访问${NC}"
    }
    
    # 备份上传文件
    echo -e "${GREEN}[3/3] 备份上传文件...${NC}"
    docker cp "$CONTAINER_NAME:$CONTAINER_DATA_DIR/uploads" "$BACKUP_PATH/uploads" 2>/dev/null || {
        echo -e "${YELLOW}警告: uploads 目录不存在或无法访问${NC}"
        mkdir -p "$BACKUP_PATH/uploads"
    }
}

backup_from_local() {
    local data_dir="$1"
    echo -e "${GREEN}[1/3] 从本地目录备份数据: $data_dir${NC}"
    
    # 备份数据库
    echo -e "${GREEN}[2/3] 备份 SQLite 数据库...${NC}"
    if [ -f "$data_dir/database.sqlite" ]; then
        cp "$data_dir/database.sqlite" "$BACKUP_PATH/database.sqlite"
        echo -e "  数据库已备份"
    else
        echo -e "${YELLOW}警告: 数据库文件不存在: $data_dir/database.sqlite${NC}"
    fi
    
    # 备份上传文件
    echo -e "${GREEN}[3/3] 备份上传文件...${NC}"
    if [ -d "$data_dir/uploads" ]; then
        cp -r "$data_dir/uploads" "$BACKUP_PATH/uploads"
        echo -e "  上传文件已备份"
    else
        echo -e "${YELLOW}警告: uploads 目录不存在: $data_dir/uploads${NC}"
        mkdir -p "$BACKUP_PATH/uploads"
    fi
}

# 检测容器是否运行
if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${CONTAINER_NAME}$"; then
    backup_from_container
elif [ -d "$DEFAULT_DATA_DIR" ]; then
    backup_from_local "$DEFAULT_DATA_DIR"
else
    echo -e "${RED}错误: 未找到数据源${NC}"
    echo -e "请确保容器正在运行或本地数据目录存在: $DEFAULT_DATA_DIR"
    exit 1
fi

# 创建备份元数据
echo -e "${GREEN}创建备份元数据...${NC}"
cat > "$BACKUP_PATH/backup-info.json" << EOF
{
    "timestamp": "$TIMESTAMP",
    "date": "$(date -Iseconds)",
    "version": "$(cat VERSION 2>/dev/null || echo 'unknown')",
    "source": "$(docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${CONTAINER_NAME}$" && echo 'container' || echo 'local')"
}
EOF

# 创建压缩包
echo -e "${GREEN}创建压缩包...${NC}"
cd "$BACKUP_DIR"
tar -czf "${BACKUP_NAME}.tar.gz" "$BACKUP_NAME"
rm -rf "$BACKUP_NAME"

# 显示结果
BACKUP_FILE="$BACKUP_DIR/${BACKUP_NAME}.tar.gz"
BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  备份完成!${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e "备份文件: ${YELLOW}$BACKUP_FILE${NC}"
echo -e "文件大小: ${YELLOW}$BACKUP_SIZE${NC}"
echo ""
echo -e "恢复命令: ${YELLOW}./scripts/restore.sh $BACKUP_FILE${NC}"
