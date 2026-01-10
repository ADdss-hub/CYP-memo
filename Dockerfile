# CYP-memo Docker 镜像
# 单容器部署，包含前端和后端

FROM node:18-alpine AS builder

# 安装 pnpm
RUN npm install -g pnpm

WORKDIR /app

# 复制依赖文件
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/app/package.json ./packages/app/
COPY packages/admin/package.json ./packages/admin/
COPY packages/server/package.json ./packages/server/

# 安装依赖
RUN pnpm install --frozen-lockfile

# 复制源代码
COPY . .

# 构建项目
RUN pnpm build

# 生产镜像
FROM node:18-alpine

# 安装 pnpm
RUN npm install -g pnpm

WORKDIR /app

# 复制构建产物
COPY --from=builder /app/packages/server/dist ./packages/server/dist
COPY --from=builder /app/packages/server/package.json ./packages/server/
COPY --from=builder /app/packages/app/dist ./packages/app/dist
COPY --from=builder /app/packages/admin/dist ./packages/admin/dist

# 安装生产依赖
WORKDIR /app/packages/server
RUN pnpm install --prod --frozen-lockfile

# 创建数据目录
RUN mkdir -p /app/data

# 暴露端口
EXPOSE 5170

# 数据卷
VOLUME ["/app/data"]

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5170/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# 启动服务
CMD ["node", "dist/index.js"]
