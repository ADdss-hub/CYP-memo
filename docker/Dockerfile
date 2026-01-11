# CYP-memo Docker 镜像
# 多阶段构建，优化镜像体积和构建速度
# 基于 Alpine 镜像以最小化体积

# ============================================
# 阶段 1: Builder - 安装依赖和构建
# ============================================
FROM node:18-alpine AS builder

# 构建参数 - 版本信息
ARG VERSION=1.7.9
ARG BUILD_DATE
ARG GIT_COMMIT

# 配置 Alpine 镜像源（国内加速）
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories

# 配置 npm 镜像源并安装 pnpm
RUN npm config set registry https://registry.npmmirror.com && \
    npm install -g pnpm && \
    pnpm config set registry https://registry.npmmirror.com

WORKDIR /app

# 优化层缓存：先复制依赖文件
# 只有依赖变化时才重新安装
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/app/package.json ./packages/app/
COPY packages/admin/package.json ./packages/admin/
COPY packages/server/package.json ./packages/server/

# 安装全部依赖（包括开发依赖用于构建）
RUN pnpm install --frozen-lockfile

# 复制源代码（在依赖安装后，利用缓存）
COPY . .

# 执行构建
RUN pnpm build

# ============================================
# 阶段 2: Production - 最小化运行时镜像
# ============================================
FROM node:18-alpine AS production

# 构建参数 - 版本信息
ARG VERSION=1.7.9
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

# 配置 Alpine 镜像源（国内加速）
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories

# 配置 npm 镜像源并安装 pnpm
RUN npm config set registry https://registry.npmmirror.com && \
    npm install -g pnpm && \
    pnpm config set registry https://registry.npmmirror.com

# 创建非 root 用户
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

# 安装生产依赖（排除开发依赖）
WORKDIR /app/packages/server
RUN pnpm install --prod --frozen-lockfile

# 创建数据目录并设置权限
RUN mkdir -p /app/data && \
    chown -R nodejs:nodejs /app/data && \
    chown -R nodejs:nodejs /app/packages

# 切换到非 root 用户
USER nodejs

# 设置工作目录
WORKDIR /app/packages/server

# 环境变量
ENV NODE_ENV=production \
    PORT=5170 \
    DATA_DIR=/app/data

# 暴露端口
EXPOSE 5170

# 数据卷
VOLUME ["/app/data"]

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5170/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# 启动服务
CMD ["node", "dist/index.js"]
