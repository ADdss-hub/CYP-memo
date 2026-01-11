# Docker 配置文件

本目录包含 CYP-memo 的所有 Docker 相关配置文件。

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
# 在项目根目录执行
docker-compose -f docker/docker-compose.yml up -d

# 或进入 docker 目录执行
cd docker
docker-compose up -d
```

### 开发环境

```bash
# 在项目根目录执行
docker-compose -f docker/docker-compose.dev.yml up -d

# 或进入 docker 目录执行
cd docker
docker-compose -f docker-compose.dev.yml up -d
```

### 构建镜像

```bash
# 生产镜像
docker build -f docker/Dockerfile -t cyp-memo:latest .

# 开发镜像
docker build -f docker/Dockerfile.dev -t cyp-memo:dev .
```
