#!/bin/sh
# CYP-memo Docker 容器入口脚本
# 处理数据目录权限问题，支持多种 NAS 和系统环境
# Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 数据目录
DATA_DIR="${DATA_DIR:-/app/data}"

log_info "CYP-memo 容器启动中..."
log_info "数据目录: ${DATA_DIR}"

# 确保数据目录存在
if [ ! -d "${DATA_DIR}" ]; then
    log_info "创建数据目录: ${DATA_DIR}"
    mkdir -p "${DATA_DIR}" 2>/dev/null || true
fi

# 检查数据目录权限
check_permissions() {
    # 尝试写入测试文件
    TEST_FILE="${DATA_DIR}/.write-test-$$"
    if touch "${TEST_FILE}" 2>/dev/null; then
        rm -f "${TEST_FILE}" 2>/dev/null || true
        return 0
    fi
    return 1
}

# 尝试修复权限（仅在以 root 运行时）
fix_permissions() {
    if [ "$(id -u)" = "0" ]; then
        log_info "以 root 用户运行，尝试修复数据目录权限..."
        
        # 获取目标 UID/GID（默认 1001:1001）
        TARGET_UID="${PUID:-1001}"
        TARGET_GID="${PGID:-1001}"
        
        log_info "目标用户: UID=${TARGET_UID}, GID=${TARGET_GID}"
        
        # 修改数据目录所有权
        chown -R "${TARGET_UID}:${TARGET_GID}" "${DATA_DIR}" 2>/dev/null || {
            log_warn "无法修改数据目录所有权，尝试修改权限..."
            chmod -R 777 "${DATA_DIR}" 2>/dev/null || true
        }
        
        # 切换到目标用户运行
        if command -v su-exec >/dev/null 2>&1; then
            log_info "使用 su-exec 切换到用户 ${TARGET_UID}:${TARGET_GID}"
            exec su-exec "${TARGET_UID}:${TARGET_GID}" "$@"
        elif command -v gosu >/dev/null 2>&1; then
            log_info "使用 gosu 切换到用户 ${TARGET_UID}:${TARGET_GID}"
            exec gosu "${TARGET_UID}:${TARGET_GID}" "$@"
        else
            log_warn "未找到 su-exec 或 gosu，以 root 用户继续运行"
        fi
    fi
}

# 主逻辑
if check_permissions; then
    log_info "数据目录权限检查通过"
else
    log_warn "数据目录权限检查失败，尝试修复..."
    fix_permissions "$@"
    
    # 再次检查
    if ! check_permissions; then
        log_error "数据目录不可写: ${DATA_DIR}"
        log_error ""
        log_error "请检查以下几点："
        log_error "1. 确保宿主机目录存在且有正确权限"
        log_error "2. 使用 PUID 和 PGID 环境变量指定用户 ID"
        log_error "3. 或者在宿主机上执行: chmod 777 <数据目录>"
        log_error ""
        log_error "示例："
        log_error "  docker run -e PUID=1000 -e PGID=1000 -v /path/to/data:/app/data ..."
        log_error ""
        log_error "飞牛 NAS 用户请参考："
        log_error "  1. 在 NAS 上创建数据目录"
        log_error "  2. 设置目录权限为 777 或指定正确的 UID/GID"
        log_error ""
        exit 1
    fi
fi

# 创建必要的子目录
mkdir -p "${DATA_DIR}/uploads" 2>/dev/null || true

log_info "启动应用程序..."

# 执行传入的命令
exec "$@"
