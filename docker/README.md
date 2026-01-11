# Docker 配置文件

本目录包含 CYP-memo 的所有 Docker 相关配置文件。

## Docker Hub

镜像已发布到 Docker Hub：[cyp97/cyp-memo](https://hub.docker.com/r/cyp97/cyp-memo)

```bash
# 拉取最新版本
docker pull cyp97/cyp-memo:latest

# 拉取指定版本
docker pull cyp97/cyp-memo:1.7.9
```

## 快速部署

```bash
docker run -d \
  --name cyp-memo \
  -p 5170:5170 \
  -v cyp-memo-data:/app/data \
  --restart unless-stopped \
  cyp97/cyp-memo:latest
```

访问 http://localhost:5170，默认管理员：`admin` / `admin123`

## 文件说明

| 文件 | 说明 |
|------|------|
| `Dockerfile` | 生产环境镜像构建文件（多阶段构建） |
| `Dockerfile.dev` | 开发环境镜像构建文件（支持热重载） |
| `docker-compose.yml` | 生产环境编排配置 |
| `docker-compose.dev.yml` | 开发环境编排配置 |
| `.dockerignore` | Docker 构建忽略文件 |

## 使用方法

### 生产环境

```bash
# 使用 Docker Hub 镜像（推荐）
docker compose -f docker/docker-compose.yml up -d

# 或本地构建
docker compose -f docker/docker-compose.yml up -d --build
```

### 开发环境

```bash
# 在项目根目录执行
docker compose -f docker/docker-compose.dev.yml up -d

# 查看日志
docker logs -f cyp-memo-dev
```

开发环境端口：
- 用户前端：http://localhost:5173
- 管理前端：http://localhost:5174
- API 服务：http://localhost:5170

### 本地构建镜像

```bash
# 生产镜像
docker build -f docker/Dockerfile -t cyp-memo:latest .

# 开发镜像
docker build -f docker/Dockerfile.dev -t cyp-memo:dev .
```

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `NODE_ENV` | production | 运行环境 |
| `PORT` | 5170 | 服务端口 |
| `DATA_DIR` | /app/data | 数据目录 |
| `LOG_LEVEL` | info | 日志级别 |
| `TZ` | Asia/Shanghai | 时区 |

## 数据持久化

数据存储在 `/app/data` 目录，包含：
- SQLite 数据库
- 上传的附件文件

使用 Docker Volume 或绑定挂载确保数据持久化：

```bash
# Docker Volume（推荐）
-v cyp-memo-data:/app/data

# 绑定挂载
-v /path/to/data:/app/data
```
