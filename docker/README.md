# Docker 配置文件

本目录包含 CYP-memo 的所有 Docker 相关配置文件。

## Docker Hub

镜像已发布到 Docker Hub：[cyp97/cyp-memo](https://hub.docker.com/r/cyp97/cyp-memo)

```bash
# 拉取最新版本
docker pull cyp97/cyp-memo:latest

# 拉取指定版本
docker pull cyp97/cyp-memo:1.9.2
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
| `docker-compose.yml` | 生产环境编排配置（含 Watchtower 自动更新） |
| `docker-compose.dev.yml` | 开发环境编排配置 |
| `entrypoint.sh` | 容器入口脚本（处理权限和数据清理） |
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
| `PUID` | 1001 | 运行用户 UID |
| `PGID` | 1001 | 运行用户 GID |
| `CLEAN_DATA` | false | 启动时清理所有数据（设为 true 或 1 启用） |

## Watchtower 自动更新

CYP-memo 支持使用 Watchtower 自动检测和更新镜像。docker-compose.yml 已包含 Watchtower 配置。

### 自动更新配置

Watchtower 默认每小时检测一次镜像更新（3600秒），检测到新版本后自动拉取并重启容器。

```yaml
# docker-compose.yml 中的 Watchtower 配置
watchtower:
  image: containrrr/watchtower
  container_name: watchtower
  volumes:
    - /var/run/docker.sock:/var/run/docker.sock
  environment:
    - TZ=Asia/Shanghai
    - WATCHTOWER_POLL_INTERVAL=3600  # 每小时检测一次
    - WATCHTOWER_LABEL_ENABLE=true   # 只更新带标签的容器
    - WATCHTOWER_CLEANUP=true        # 更新后清理旧镜像
  restart: unless-stopped
```

### 单独部署 Watchtower

如果不使用 docker-compose，可以单独部署 Watchtower：

```bash
docker run -d \
  --name watchtower \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -e TZ=Asia/Shanghai \
  -e WATCHTOWER_POLL_INTERVAL=3600 \
  -e WATCHTOWER_CLEANUP=true \
  --restart unless-stopped \
  containrrr/watchtower cyp-memo
```

### 手动触发更新检测

```bash
# 立即检测更新
docker exec watchtower /watchtower --run-once
```

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

## 数据清理

### 启动时清理所有数据

如果需要在启动容器时清理所有数据（数据库、上传文件、配置等），设置 `CLEAN_DATA=true`：

```bash
docker run -d \
  --name cyp-memo \
  -p 5170:5170 \
  -e CLEAN_DATA=true \
  -v cyp-memo-data:/app/data \
  --restart unless-stopped \
  cyp97/cyp-memo:latest
```

**警告**：此操作不可逆，将删除所有用户数据！

### 删除容器时清理数据

删除容器和数据卷：

```bash
# 停止并删除容器
docker stop cyp-memo
docker rm cyp-memo

# 删除数据卷（将删除所有数据）
docker volume rm cyp-memo-data
```

### 通过 API 清理数据

调用清理 API（需要确认码）：

```bash
curl -X DELETE http://localhost:5170/api/cleanup/all \
  -H "Content-Type: application/json" \
  -d '{"confirmCode": "DELETE_ALL_DATA"}'
```

## NAS 部署指南

### 权限问题解决

如果遇到 `数据目录不可写: /app/data` 错误，请按以下方法解决：

#### 方法一：使用 PUID/PGID 环境变量（推荐）

```bash
# 查看 NAS 用户的 UID 和 GID
id username

# 使用对应的 UID/GID 启动容器
docker run -d \
  --name cyp-memo \
  -p 5170:5170 \
  -e PUID=1000 \
  -e PGID=1000 \
  -v /path/to/data:/app/data \
  --restart unless-stopped \
  cyp97/cyp-memo:latest
```

#### 方法二：修改宿主机目录权限

```bash
# 在 NAS 上创建数据目录并设置权限
mkdir -p /path/to/data
chmod 777 /path/to/data
```

### 各 NAS 系统配置

#### 飞牛 NAS (fnOS)

```bash
# 飞牛 NAS 默认用户 UID/GID 通常为 1000
docker run -d \
  --name cyp-memo \
  -p 5170:5170 \
  -e PUID=1000 \
  -e PGID=1000 \
  -e TZ=Asia/Shanghai \
  -v /vol1/docker/cyp-memo:/app/data \
  --restart unless-stopped \
  cyp97/cyp-memo:latest
```

#### 群晖 NAS (Synology)

```bash
# 群晖 NAS 默认用户 UID/GID 通常为 1026
docker run -d \
  --name cyp-memo \
  -p 5170:5170 \
  -e PUID=1026 \
  -e PGID=100 \
  -e TZ=Asia/Shanghai \
  -v /volume1/docker/cyp-memo:/app/data \
  --restart unless-stopped \
  cyp97/cyp-memo:latest
```

#### 威联通 NAS (QNAP)

```bash
# 威联通 NAS 默认用户 UID/GID 通常为 1000
docker run -d \
  --name cyp-memo \
  -p 5170:5170 \
  -e PUID=1000 \
  -e PGID=1000 \
  -e TZ=Asia/Shanghai \
  -v /share/Container/cyp-memo:/app/data \
  --restart unless-stopped \
  cyp97/cyp-memo:latest
```

#### 铁威马 NAS (TerraMaster)

```bash
# 铁威马 NAS 默认用户 UID/GID 通常为 1000
docker run -d \
  --name cyp-memo \
  -p 5170:5170 \
  -e PUID=1000 \
  -e PGID=1000 \
  -e TZ=Asia/Shanghai \
  -v /Volume1/docker/cyp-memo:/app/data \
  --restart unless-stopped \
  cyp97/cyp-memo:latest
```

#### Unraid

```bash
# Unraid 默认使用 nobody 用户，UID/GID 为 99
docker run -d \
  --name cyp-memo \
  -p 5170:5170 \
  -e PUID=99 \
  -e PGID=100 \
  -e TZ=Asia/Shanghai \
  -v /mnt/user/appdata/cyp-memo:/app/data \
  --restart unless-stopped \
  cyp97/cyp-memo:latest
```

### Docker Compose 配置示例

```yaml
version: '3.8'

services:
  cyp-memo:
    image: cyp97/cyp-memo:latest
    container_name: cyp-memo
    ports:
      - "5170:5170"
    environment:
      - NODE_ENV=production
      - PORT=5170
      - DATA_DIR=/app/data
      - TZ=Asia/Shanghai
      - PUID=1000  # 修改为你的用户 UID
      - PGID=1000  # 修改为你的用户 GID
    volumes:
      - /path/to/data:/app/data  # 修改为你的数据目录
    restart: unless-stopped
```

### 常见问题排查

1. **查看容器日志**
   ```bash
   docker logs cyp-memo
   ```

2. **检查数据目录权限**
   ```bash
   ls -la /path/to/data
   ```

3. **查看当前用户 UID/GID**
   ```bash
   id
   ```

4. **进入容器调试**
   ```bash
   docker exec -it cyp-memo sh
   ```

5. **登录后备忘录不显示**

   **问题描述**：在生产环境容器下，重新删除容器后之前的数据库资料还存在（使用绑定挂载或命名卷），重新下载镜像再安装后，点击登录系统后备忘录没有刷新出来，需要点其他界面再返回到主界面才可以刷新出来。

   **原因分析**：这是因为登录成功后路由跳转时，备忘录列表组件的数据加载时机问题。当用户从登录页跳转到备忘录列表页时，组件可能在用户状态完全更新之前就已经挂载，导致数据加载失败。

   **解决方案**：
   - 此问题已在 v1.8.9 及以后版本中修复
   - 登录成功后会自动添加 `refresh` 参数强制刷新数据
   - 备忘录列表组件会监听用户状态变化，用户登录后立即加载数据

   **临时解决方法**（适用于旧版本）：
   - 登录后手动刷新页面（F5 或 Ctrl+R）
   - 点击侧边栏其他菜单再返回备忘录列表
   - 升级到最新版本

   **升级方法**：
   ```bash
   # 停止并删除旧容器
   docker stop cyp-memo
   docker rm cyp-memo
   
   # 拉取最新镜像
   docker pull cyp97/cyp-memo:latest
   
   # 重新启动容器（数据会保留）
   docker run -d \
     --name cyp-memo \
     -p 5170:5170 \
     -v cyp-memo-data:/app/data \
     --restart unless-stopped \
     cyp97/cyp-memo:latest
   ```
