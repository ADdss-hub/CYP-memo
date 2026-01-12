# CYP-memo Docker 镜像
# 多阶段构建，优化镜像体积和构建速度
# 基于 Alpine 镜像以最小化体积
# 支持飞牛 NAS、群晖、威联通等多种 NAS 系统
# Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>

# ============================================
# 阶段 1: Builder - 安装依赖和构建
# ============================================
FROM node:20-alpine AS builder

# 构建参数 - 版本信息
ARG VERSION=1.8.7
ARG BUILD_DATE
ARG GIT_COMMIT

# 配置 Alpine 镜像源（阿里云 - 速度最快 108ms）
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories

# 配置 npm 镜像源并安装 pnpm (华为云 - 速度最快)
RUN npm config set registry https://repo.huaweicloud.com/repository/npm/ && \
    npm install -g pnpm && \
    pnpm config set registry https://repo.huaweicloud.com/repository/npm/

WORKDIR /app

# 优化层缓存：先复制依赖文件
# 只有依赖变化时才重新安装
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/app/package.json ./packages/app/
COPY packages/admin/package.json ./packages/admin/
COPY packages/server/package.json ./packages/server/

# 安装全部依赖（包括开发依赖用于构建）
# 使用 --ignore-scripts 跳过不必要的构建脚本以加速
# 增加网络超时和并发数以加速 ARM64 构建
RUN pnpm config set network-timeout 60000 && \
    pnpm config set fetch-retries 5 && \
    pnpm config set fetch-retry-mintimeout 20000 && \
    pnpm install --frozen-lockfile --ignore-scripts

# 复制源代码（在依赖安装后，利用缓存）
COPY . .

# 执行构建
# 设置 Node.js 内存限制和优化选项以加速构建
# --max-old-space-size=4096: 增加 V8 堆内存到 4GB
# UV_THREADPOOL_SIZE=16: 增加 libuv 线程池大小，加速 I/O 操作
ENV NODE_OPTIONS="--max-old-space-size=4096" \
    UV_THREADPOOL_SIZE=16
RUN pnpm build

# ============================================
# 阶段 2: Production - 最小化运行时镜像
# ============================================
FROM node:20-alpine AS production

# 构建参数 - 版本信息
ARG VERSION=1.8.7
ARG BUILD_DATE
ARG GIT_COMMIT

# 镜像元数据标签
LABEL org.opencontainers.image.title="CYP-memo" \
      org.opencontainers.image.description="CYP-memo 容器备忘录系统" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.revision="${GIT_COMMIT}" \
      org.opencontainers.image.vendor="CYP" \
      org.opencontainers.image.authors="nasDSSCYP@outlook.com" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.source="https://github.com/cyp-memo/cyp-memo"

# 配置 Alpine 镜像源（阿里云 - 速度最快 108ms）
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories

# 安装必要工具：
# - su-exec: 用于权限切换
# - bash: 提供完整的 bash shell（用于终端连接）
# - curl: 用于健康检查和调试
# 配置 npm 镜像源并安装 pnpm (华为云 - 速度最快)
RUN apk add --no-cache su-exec bash curl && \
    npm config set registry https://repo.huaweicloud.com/repository/npm/ && \
    npm install -g pnpm && \
    pnpm config set registry https://repo.huaweicloud.com/repository/npm/

# 创建默认用户组和用户（可通过 PUID/PGID 环境变量覆盖）
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs

WORKDIR /app

# 复制构建产物（仅复制必要文件）
COPY --from=builder /app/packages/server/dist ./packages/server/dist
COPY --from=builder /app/packages/server/package.json ./packages/server/
COPY --from=builder /app/packages/app/dist ./packages/app/dist
COPY --from=builder /app/packages/admin/dist ./packages/admin/dist

# 复制 pnpm 配置文件（用于安装生产依赖）
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-workspace.yaml ./
COPY --from=builder /app/pnpm-lock.yaml ./
COPY --from=builder /app/packages/shared/package.json ./packages/shared/

# 复制入口脚本
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# 安装生产依赖（排除开发依赖）
WORKDIR /app/packages/server
RUN pnpm install --prod --frozen-lockfile

# 创建数据目录并设置宽松权限（允许任意用户写入）
RUN mkdir -p /app/data && \
    chmod 777 /app/data && \
    chown -R nodejs:nodejs /app/packages

# 设置工作目录
WORKDIR /app/packages/server

# 环境变量
# PUID/PGID: 用于指定运行用户的 UID/GID，适配不同 NAS 系统
ENV NODE_ENV=production \
    PORT=5170 \
    DATA_DIR=/app/data \
    PUID=1001 \
    PGID=1001

# 暴露端口
EXPOSE 5170

# 数据卷
VOLUME ["/app/data"]

# 健康检查 - 使用 curl 更可靠
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:5170/api/health || exit 1

# 使用入口脚本处理权限问题
ENTRYPOINT ["/entrypoint.sh"]

# 启动服务
CMD ["node", "dist/index.js"]
