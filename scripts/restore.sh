#!/bin/bash
#
# CYP-memo 数据恢复脚本（非容器 · DATA_DIR 本地）
# 用法: ./scripts/restore.sh <备份文件.tar.gz> [--force] [DATA_DIR]
#
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

DEFAULT_DATA_DIR="packages/server/data"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

BACKUP_FILE="$1"
FORCE_RESTORE="$2"
DATA_DIR="${3:-${DATA_DIR:-$DEFAULT_DATA_DIR}}"

if [ -z "$BACKUP_FILE" ]; then
  echo "用法: $0 <备份文件.tar.gz> [--force] [DATA_DIR]"
  exit 1
fi
if [ ! -f "$BACKUP_FILE" ]; then
  echo -e "${RED}错误: 备份文件不存在: $BACKUP_FILE${NC}"
  exit 1
fi

echo -e "${GREEN}CYP-memo 数据恢复 → $DATA_DIR${NC}"

TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT
tar -xzf "$BACKUP_FILE" -C "$TEMP_DIR"
BACKUP_DIR=$(ls -d "$TEMP_DIR"/*/ 2>/dev/null | head -1)
[ -z "$BACKUP_DIR" ] && BACKUP_DIR="$TEMP_DIR"

RESTORE_DB=false
RESTORE_UPLOADS=false
[ -f "$BACKUP_DIR/database.sqlite" ] && RESTORE_DB=true
[ -d "$BACKUP_DIR/uploads" ] && RESTORE_UPLOADS=true

if [ "$RESTORE_DB" = false ] && [ "$RESTORE_UPLOADS" = false ]; then
  echo -e "${RED}错误: 备份中无可恢复数据${NC}"
  exit 1
fi

if [ "$FORCE_RESTORE" != "--force" ]; then
  echo -e "${YELLOW}警告: 将覆盖 $DATA_DIR 现有数据${NC}"
  read -p "确定继续? (y/N): " confirm
  if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
    echo "已取消"
    exit 0
  fi
fi

mkdir -p "$DATA_DIR"
if [ "$RESTORE_DB" = true ]; then
  cp "$BACKUP_DIR/database.sqlite" "$DATA_DIR/database.sqlite"
  echo "  数据库已恢复"
fi
if [ "$RESTORE_UPLOADS" = true ]; then
  rm -rf "$DATA_DIR/uploads"
  cp -r "$BACKUP_DIR/uploads" "$DATA_DIR/uploads"
  echo "  uploads 已恢复"
fi
if [ -d "$BACKUP_DIR/governance" ]; then
  rm -rf "$DATA_DIR/governance"
  cp -r "$BACKUP_DIR/governance" "$DATA_DIR/governance"
fi

echo -e "${GREEN}恢复完成。请重启 Node 服务后跑 verify-five-centers。${NC}"
