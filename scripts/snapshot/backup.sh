#!/bin/bash
#
# CYP-memo 数据备份脚本（本机 DATA_DIR）
# 用法: ./scripts/snapshot/backup.sh [备份目录] [DATA_DIR]
#
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

DEFAULT_DATA_DIR="packages/server/data"
DEFAULT_BACKUP_DIR="backups"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_ROOT"

BACKUP_DIR="${1:-$DEFAULT_BACKUP_DIR}"
DATA_DIR="${2:-${DATA_DIR:-$DEFAULT_DATA_DIR}}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_NAME="cyp-memo-backup-${TIMESTAMP}"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  CYP-memo 数据备份（本地 DATA_DIR）${NC}"
echo -e "${GREEN}========================================${NC}"

if [ ! -d "$DATA_DIR" ]; then
  echo -e "${RED}错误: 数据目录不存在: $DATA_DIR${NC}"
  exit 1
fi

mkdir -p "$BACKUP_DIR"
BACKUP_PATH="$BACKUP_DIR/$BACKUP_NAME"
mkdir -p "$BACKUP_PATH"

echo -e "${YELLOW}数据源: $DATA_DIR${NC}"
echo -e "${YELLOW}备份到: $BACKUP_PATH${NC}"

if [ -f "$DATA_DIR/database.sqlite" ]; then
  cp "$DATA_DIR/database.sqlite" "$BACKUP_PATH/database.sqlite"
  echo "  数据库已备份"
else
  echo -e "${YELLOW}警告: 无 database.sqlite${NC}"
fi

if [ -d "$DATA_DIR/uploads" ]; then
  cp -r "$DATA_DIR/uploads" "$BACKUP_PATH/uploads"
  echo "  uploads 已备份"
else
  mkdir -p "$BACKUP_PATH/uploads"
fi

# 可选：日志与管控快照
if [ -d "$DATA_DIR/logs" ]; then
  cp -r "$DATA_DIR/logs" "$BACKUP_PATH/logs" 2>/dev/null || true
fi
if [ -d "$DATA_DIR/governance" ]; then
  cp -r "$DATA_DIR/governance" "$BACKUP_PATH/governance" 2>/dev/null || true
fi

cat > "$BACKUP_PATH/backup-info.json" << EOF
{
  "timestamp": "$TIMESTAMP",
  "date": "$(date -Iseconds 2>/dev/null || date)",
  "version": "$(cat VERSION 2>/dev/null || echo 'unknown')",
  "source": "local",
  "dataDir": "$DATA_DIR"
}
EOF

cd "$BACKUP_DIR"
tar -czf "${BACKUP_NAME}.tar.gz" "$BACKUP_NAME"
rm -rf "$BACKUP_NAME"
BACKUP_FILE="$(pwd)/${BACKUP_NAME}.tar.gz"
BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)

node "$PROJECT_ROOT/scripts/_internal/write-sha256.mjs" "$BACKUP_FILE"
echo -e "${GREEN}备份完成: ${YELLOW}$BACKUP_FILE${NC} ($BACKUP_SIZE)"
echo -e "校验: ${YELLOW}node scripts/verify/verify-artifact-sha256.mjs $BACKUP_FILE${NC}"
echo -e "恢复: ${YELLOW}./scripts/snapshot/restore.sh $BACKUP_FILE${NC}"
