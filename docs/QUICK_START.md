# CYP-memo 快速开始指南

## 🚀 5 分钟快速部署

### 前置要求

- Node.js >= 18.0.0
- pnpm >= 8.0.0

### 步骤 1: 克隆项目

```bash
git clone <repository-url>
cd cyp-memo
```

### 步骤 2: 安装依赖

```bash
pnpm install
```

### 步骤 3: 启动服务

```bash
# Windows
dev.bat

# Linux/Mac
pnpm dev
```

### 步骤 4: 访问应用

- 🌐 **用户端**: http://localhost:5173
- 🔧 **管理端**: http://localhost:5174
- 🔌 **API 服务器**: http://localhost:5170

### 步骤 5: 登录

#### 管理员账号（首次登录）

```
用户名: admin
密码: admin123
```

⚠️ **重要**: 首次登录后请立即修改密码！

---

## 📦 生产部署

### Docker 部署（推荐）

#### 1. 构建镜像

```bash
docker build -t cyp-memo .
```

#### 2. 运行容器

```bash
docker run -d \
  --name cyp-memo \
  -p 5170:5170 \
  -v $(pwd)/data:/app/data \
  cyp-memo
```

#### 3. 使用 Docker Compose

```yaml
version: '3.8'
services:
  cyp-memo:
    build: .
    ports:
      - "5170:5170"
    volumes:
      - ./data:/app/data
    environment:
      - NODE_ENV=production
    restart: unless-stopped
```

```bash
docker-compose up -d
```

### 传统部署

#### 1. 构建项目

```bash
pnpm build
```

#### 2. 启动服务器

```bash
cd packages/server
pnpm start
```

#### 3. 配置 Nginx（可选）

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # 前端静态文件
    location / {
        root /path/to/cyp-memo/packages/app/dist;
        try_files $uri $uri/ /index.html;
    }

    # 管理端
    location /admin {
        root /path/to/cyp-memo/packages/admin/dist;
        try_files $uri $uri/ /admin/index.html;
    }

    # API 代理
    location /api {
        proxy_pass http://localhost:5170;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

---

## 🔧 配置选项

### 环境变量

```bash
# 服务器端口
PORT=5170

# 环境模式
NODE_ENV=production

# 数据库路径（可选）
DB_PATH=./data/database.sqlite

# CORS 允许的源（可选）
CORS_ORIGIN=http://localhost:5173,http://localhost:5174
```

### 数据库配置

数据库文件位置：`packages/server/data/database.sqlite`

#### 自动备份

```bash
# 添加到 crontab
0 2 * * * cp /path/to/database.sqlite /path/to/backup/database.sqlite.$(date +\%Y\%m\%d)
```

---

## 📊 数据迁移

### 从旧版本（JSON）迁移

如果你从 v1.6.x 或更早版本升级：

```bash
cd packages/server
pnpm migrate
```

迁移脚本会：
- ✅ 自动读取 `database.json`
- ✅ 创建 SQLite 数据库
- ✅ 迁移所有数据
- ✅ 备份原文件

详细说明: [SQLite 迁移指南](./SQLITE_MIGRATION.md)

---

## 🎯 使用场景

### 个人使用（本地）

```bash
# 直接运行
pnpm dev

# 访问 http://localhost:5173
```

### 家庭 NAS

```bash
# 在 NAS 上安装 Node.js
# 克隆项目到 NAS
# 启动服务
pnpm install
pnpm build
pnpm start

# 局域网访问 http://nas-ip:5170
```

### Docker 容器

```bash
# 使用 Docker Compose
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

### 云服务器

```bash
# 使用 PM2 管理进程
npm install -g pm2

# 启动服务
cd packages/server
pm2 start dist/index.js --name cyp-memo

# 开机自启
pm2 startup
pm2 save
```

### 桌面客户端

从 [GitHub Releases](https://github.com/ADdss-hub/CYP-memo/releases) 下载对应平台的安装包：

- **Windows**: `CYP-memo-x.x.x-setup.exe` 或便携版 `CYP-memo-x.x.x-portable.exe`
- **macOS**: `CYP-memo-x.x.x.dmg`
- **Linux**: `CYP-memo-x.x.x.AppImage` 或 `cyp-memo_x.x.x_amd64.deb`

首次启动时可选择：
- **远程服务器模式**: 连接到已部署的 CYP-memo 服务器
- **内置服务器模式**: 使用本地内置服务器（无需额外部署）

---

## 🔍 故障排除

### 问题 1: 端口被占用

```bash
# Windows
netstat -ano | findstr :5170
taskkill /PID <PID> /F

# Linux/Mac
lsof -i :5170
kill -9 <PID>
```

### 问题 2: 数据库锁定

```bash
# 确保只有一个服务器实例运行
ps aux | grep node

# 重启服务器
```

### 问题 3: 依赖安装失败

```bash
# 清理缓存
pnpm store prune

# 重新安装
rm -rf node_modules pnpm-lock.yaml
pnpm install
```

### 问题 4: 构建失败

```bash
# 检查 Node.js 版本
node -v  # 应该 >= 18.0.0

# 检查 pnpm 版本
pnpm -v  # 应该 >= 8.0.0

# 清理并重新构建
pnpm clean
pnpm install
pnpm build
```

---

## 📚 更多文档

- [开发文档](./DEVELOPMENT.md)
- [SQLite 迁移指南](./SQLITE_MIGRATION.md)
- [存储架构说明](./STORAGE_ARCHITECTURE.md)
- [依赖列表](./DEPENDENCIES.md)
- [发布指南](./RELEASE.md)
- [桌面端构建指南](../packages/desktop/BUILD.md)

---

## 💡 提示

1. **首次使用**: 使用默认管理员账号登录后，立即修改密码
2. **数据备份**: 定期备份 `database.sqlite` 文件
3. **性能优化**: SQLite 数据库会自动优化，无需手动维护
4. **安全建议**: 生产环境请使用 HTTPS 和强密码
5. **日志清理**: 定期清理日志表以节省空间

---

**版本**: v1.8.0  
**作者**: CYP <nasDSSCYP@outlook.com>  
**许可证**: MIT
