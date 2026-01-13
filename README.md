# CYP-memo 容器备忘录系统

一款现代化的容器备忘录管理系统，提供完整的中文界面和丰富的功能。

## 作者信息

- **作者**: CYP
- **邮箱**: nasDSSCYP@outlook.com
- **版本**: 1.9.1

---

## 项目简介

CYP-memo 是一款基于浏览器的现代化备忘录管理系统，采用前后端分离架构：

- **用户端应用** - 供普通用户使用，提供备忘录管理、标签、分享等功能
- **管理端应用** - 供系统管理员使用，用于管理用户、数据库等系统操作
- **API 服务器** - 提供 RESTful API，使用 SQLite 数据库存储
- **桌面客户端** - 基于 Electron 的跨平台桌面应用，支持 Windows/macOS/Linux

---

## 核心特性

| 功能 | 说明 |
|------|------|
| 双重认证 | 账号密码 + 个人令牌，注册时自动生成 |
| 富文本编辑 | 基于 TipTap，支持 Markdown |
| 文件管理 | 支持附件上传，最大 10GB |
| 权限管理 | 分级权限，主账号/子账号体系 |
| 备忘录共享 | 主账号与子账号数据共享 |
| 分享功能 | 生成分享链接，支持密码和过期时间 |
| 数据统计 | 备忘录统计分析 |
| 深色主题 | 支持浅色/深色主题切换 |
| 高性能 | SQLite 数据库，性能提升 10-100 倍 |
| 桌面客户端 | 支持 Windows/macOS/Linux 三大平台 |
| 自动更新 | 全端支持版本检测和自动更新 |
| 离线支持 | 桌面端支持离线模式和数据同步 |

---

## 技术栈

| 类别 | 技术 |
|------|------|
| 前端框架 | Vue 3 + TypeScript |
| UI 组件库 | Element Plus |
| 富文本编辑器 | TipTap |
| 状态管理 | Pinia |
| 路由 | Vue Router |
| 后端 | Express.js |
| 数据库 | SQLite |
| 桌面端 | Electron |
| 构建工具 | Vite |
| 测试框架 | Vitest + fast-check |
| 包管理 | pnpm (Monorepo) |

---

## 快速开始

### 环境要求

- Node.js >= 18.0.0
- pnpm >= 8.0.0

### 安装运行

```bash
# 克隆项目
git clone <repository-url>
cd cyp-memo

# 安装依赖
pnpm install

# 启动开发服务
pnpm dev

# 或使用 Windows 批处理
dev.bat
```

### 访问地址

| 服务 | 地址 |
|------|------|
| 用户端 | http://localhost:5173 |
| 管理端 | http://localhost:5174 |
| API 服务器 | http://localhost:5170 |

### 默认管理员

```
用户名: admin
密码: admin123
```

> ⚠️ 首次登录后请立即修改密码！

---

## 项目结构

```
cyp-memo/
├── packages/
│   ├── shared/          # 共享库
│   │   ├── config/      # 配置（版本信息）
│   │   ├── database/    # 数据访问层 (DAO)
│   │   ├── managers/    # 业务逻辑管理器
│   │   ├── storage/     # 存储适配器
│   │   ├── types/       # TypeScript 类型定义
│   │   ├── utils/       # 工具函数
│   │   └── workers/     # Web Workers
│   ├── app/             # 用户端应用
│   ├── admin/           # 管理端应用
│   ├── server/          # API 服务器
│   └── desktop/         # 桌面客户端 (Electron)
├── scripts/             # 构建脚本
├── docs/                # 详细文档
└── .version/            # 版本历史
```

---

## 功能模块

### 用户认证

- 账号密码登录/注册
- 个人令牌登录（64位十六进制）
- 注册时自动生成令牌
- 安全问题设置与验证
- 密码/账号找回功能

### 账号体系

- **主账号**: 完整权限，可创建子账号
- **子账号**: 由主账号创建，权限受限
- 主账号可查看所有子账号的备忘录
- 不同主账号之间数据完全隔离

### 备忘录管理

- 创建、编辑、删除备忘录
- 富文本编辑（Markdown 支持）
- 标签分类系统
- 优先级设置（低/中/高）
- 全文搜索和排序
- 显示创建人信息

### 文件附件

- 文件上传与下载
- 附件与备忘录关联
- 存储空间统计
- 孤立文件清理

### 分享功能

- 生成分享链接
- 可选密码保护
- 可设置过期时间
- 访问次数统计

### 数据管理

- JSON/Excel/PDF 导入导出
- 导入模板下载
- 数据清理功能

### 系统设置

- 主题切换（浅色/深色）
- 字体大小调整
- 自动清理配置

---

## 部署方式

### Docker 部署（推荐）

#### 使用 Docker Hub 镜像（最简单）

```bash
docker run -d \
  --name cyp-memo \
  -p 5170:5170 \
  -v cyp-memo-data:/app/data \
  --restart unless-stopped \
  cyp97/cyp-memo:latest
```

镜像地址：[cyp97/cyp-memo](https://hub.docker.com/r/cyp97/cyp-memo)

#### 使用 Docker Compose

```bash
# 使用部署脚本（推荐）
./scripts/deploy.sh -d

# 或手动部署
docker compose -f docker/docker-compose.yml up -d
```

#### 部署脚本选项

| 选项 | 说明 |
|------|------|
| `-d, --detach` | 后台运行容器 |
| `--build-only` | 仅构建镜像，不启动容器 |
| `--no-build` | 跳过构建，直接启动容器 |
| `-h, --help` | 显示帮助信息 |

#### 常用命令

```bash
# 查看日志
docker logs -f cyp-memo

# 重启服务
docker compose restart

# 停止服务
docker compose down

# 清理所有资源
./scripts/cleanup.sh -a
```

#### 数据备份与恢复

```bash
# 备份数据
./scripts/backup.sh

# 恢复数据
./scripts/restore.sh backups/cyp-memo-backup-YYYYMMDD_HHMMSS.tar.gz
```

### 环境变量配置

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `NODE_ENV` | production | 运行环境 |
| `PORT` | 5170 | 服务端口 |
| `DATA_DIR` | /app/data | 数据目录路径 |
| `LOG_LEVEL` | info | 日志级别 (debug/info/warn/error) |
| `TZ` | Asia/Shanghai | 时区设置 |

自定义配置示例：

```bash
# 创建 .env 文件
cat > .env << EOF
NODE_ENV=production
PORT=5170
DATA_DIR=/app/data
LOG_LEVEL=info
TZ=Asia/Shanghai
EOF

# 使用自定义配置启动
docker compose --env-file .env up -d
```

### 传统部署

```bash
# 构建
pnpm build

# 启动服务器
cd packages/server
pnpm start
```

### 桌面端部署

桌面客户端支持 Windows、macOS、Linux 三大平台：

```bash
# 进入桌面端目录
cd packages/desktop

# 构建所有平台
pnpm build:all

# 仅构建 Windows
pnpm build:win

# 仅构建 macOS
pnpm build:mac

# 仅构建 Linux
pnpm build:linux
```

构建输出：
- Windows: NSIS 安装程序 (.exe)、便携版 (.exe)
- macOS: DMG 安装包 (.dmg)、ZIP 压缩包
- Linux: AppImage、deb、rpm 包

详细说明见 [桌面端构建指南](packages/desktop/BUILD.md)。

#### Windows 构建产物说明

构建完成后，`packages/desktop/release/<版本号>/` 目录包含以下文件：

| 文件/文件夹 | 说明 |
|------------|------|
| `win-unpacked/` | 64位 Windows 解压版，可直接运行 |
| `win-ia32-unpacked/` | 32位 Windows 解压版，适用于老旧系统 |
| `CYP-memo Setup x.x.x.exe` | 64位安装包，推荐普通用户使用 |
| `CYP-memo-x.x.x-portable.exe` | 便携版，无需安装，可放U盘随身携带 |
| `*.exe.blockmap` | 增量更新块映射文件，用于自动更新 |
| `latest.yml` | 自动更新元数据（版本号、下载地址、SHA512校验和） |
| `builder-debug.yml` | 构建调试日志，排查问题时使用 |
| `builder-effective-config.yaml` | 实际生效的 electron-builder 配置 |

分发建议：
- 普通用户：提供 `Setup.exe` 安装包
- 便携使用：提供 `portable.exe`
- 自动更新服务器：需要 `latest.yml` + `Setup.exe` + `.blockmap` 文件

### PM2 部署

```bash
pm2 start packages/server/dist/index.js --name cyp-memo
pm2 startup
pm2 save
```

---

## 故障排除

### 常见问题

#### 1. 容器启动失败

```bash
# 查看容器日志
docker logs cyp-memo

# 检查容器状态
docker ps -a | grep cyp-memo

# 检查健康状态
docker inspect --format='{{.State.Health.Status}}' cyp-memo
```

#### 2. 端口被占用

```bash
# 检查端口占用
netstat -tlnp | grep 5170

# 修改端口（在 docker-compose.yml 或 .env 中）
# ports:
#   - "8080:5170"  # 改为其他端口
```

#### 3. 数据卷权限问题

```bash
# 检查数据卷
docker volume inspect cyp-memo_cyp-memo-data

# 修复权限（进入容器）
docker exec -u root cyp-memo chown -R nodejs:nodejs /app/data
```

#### 4. 健康检查失败

```bash
# 手动测试健康检查
curl http://localhost:5170/api/health

# 查看详细健康信息
docker inspect --format='{{json .State.Health}}' cyp-memo | jq
```

#### 5. 数据库初始化失败

```bash
# 检查数据目录
docker exec cyp-memo ls -la /app/data

# 重新初始化（会清空数据！）
docker compose down -v
docker compose up -d
```

### 日志级别说明

| 级别 | 说明 |
|------|------|
| debug | 详细调试信息 |
| info | 一般运行信息（默认） |
| warn | 警告信息 |
| error | 错误信息 |

### 获取帮助

如果问题仍未解决：

1. 查看完整日志：`docker logs --tail 100 cyp-memo`
2. 检查系统资源：`docker stats cyp-memo`
3. 提交 Issue 并附上日志信息

---

## 开发命令

```bash
# 开发模式
pnpm dev

# 构建生产版本
pnpm build

# 运行测试
pnpm test

# 代码检查
pnpm lint

# 代码格式化
pnpm format
```

---

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/health | 健康检查 |
| POST | /api/users | 创建用户 |
| GET | /api/users/:id | 获取用户 |
| PATCH | /api/users/:id | 更新用户 |
| DELETE | /api/users/:id | 删除用户 |
| POST | /api/memos | 创建备忘录 |
| GET | /api/memos/:id | 获取备忘录 |
| GET | /api/users/:userId/memos | 获取用户备忘录 |
| PATCH | /api/memos/:id | 更新备忘录 |
| DELETE | /api/memos/:id | 删除备忘录 |
| POST | /api/files | 上传文件 |
| GET | /api/files/:id/blob | 下载文件 |
| POST | /api/shares | 创建分享 |
| GET | /api/shares/:id | 获取分享 |
| DELETE | /api/data/clear | 清空数据库 |

---

## 文档

| 文档 | 说明 |
|------|------|
| [快速开始](docs/QUICK_START.md) | 5 分钟快速部署 |
| [开发文档](docs/DEVELOPMENT.md) | 详细开发指南 |
| [存储架构](docs/STORAGE_ARCHITECTURE.md) | 存储架构说明 |
| [依赖列表](docs/DEPENDENCIES.md) | 开源依赖及许可证 |
| [发布指南](docs/RELEASE.md) | 版本发布流程 |
| [桌面端构建](packages/desktop/BUILD.md) | 桌面客户端构建指南 |
| [项目文档](文档.md) | 完整中文文档 |

---

## 开源依赖

- Vue 3 (MIT)
- Element Plus (MIT)
- TipTap (MIT)
- Pinia (MIT)
- Vue Router (MIT)
- Express.js (MIT)
- SQLite (Public Domain)
- Electron (MIT)
- Vite (MIT)
- TypeScript (Apache-2.0)

---

## 许可证

MIT License

---

## 版权声明

Copyright © 2026 CYP. All rights reserved.

---

**联系方式**: nasDSSCYP@outlook.com
