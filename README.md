# CYP-memo 备忘录系统

一款现代化的备忘录管理系统，提供完整的中文界面和丰富的功能。

## 作者信息

- **作者**: CYP
- **邮箱**: nasDSSCYP@outlook.com
- **版本**: 2.0.0

---

## 项目简介

CYP-memo 是一款基于浏览器的现代化备忘录管理系统，采用前后端分离架构：

- **统一壳（App）** - 备忘录 + Owner 租户运维（`/tenant*`）同一产品壳
- **API 服务器** - 提供 RESTful API，使用 SQLite（sql.js）存储
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

- Node.js >= 20.19.6
- pnpm >= 10（仓库 `packageManager: pnpm@10.11.0`）

### 安装运行

```bash
# 克隆项目
git clone <repository-url>
cd cyp-memo

# 安装依赖
pnpm install

# 启动本机联调（生产配置基准：APP_ENV=prod）
pnpm local

# 或使用 Windows 批处理
local.bat
```

### 本机联调（scripts 一键）

见 [LOCAL_DEV.md](LOCAL_DEV.md)（CI02：本机联调 = 生产配置基准）。Windows:

```bat
scripts\start\start-local.bat
scripts\stop\stop-local.bat
scripts\verify\verify-e2e.bat
```


### 访问地址

| 服务 | 地址 |
|------|------|
| 统一壳（App） | http://localhost:5173 |
| API 服务器 | http://localhost:5170 |
| 租户运维 | http://localhost:5173/tenant |

### 默认 Owner

- 用户名：`admin`（空库首次 bootstrap）
- 口令：通过环境变量 `CYP_BOOTSTRAP_OWNER_PASSWORD` 注入（见 `.env.example`）；**文档不写明文默认口令**
- 首次登录后请立即修改

> ⚠️ 切勿把真实口令提交到版本控制。

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
│   ├── app/             # 统一产品壳（含 /tenant 运维）
│   ├── admin/           # 已退役（勿启动；无 5174）
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

> **已取消容器部署**。权威：[`DEPLOY.md`](DEPLOY.md)（统一运行底座闭集 35）。

| 通道 | 入口 |
|------|------|
| 服务器面板（宝塔/1Panel） | `scripts/install/install-panel.sh` |
| NAS 原生（飞牛/群晖/威联） | `scripts/install/install-nas.sh` · `deploy/nas/README.md` |
| Windows | `scripts/install/install-windows.ps1` |
| Linux / macOS | `scripts/install/install-unix.sh` · `deploy/systemd/cyp-memo.service` |
| 本机联调 | `scripts/start/start-local.*`（见 `LOCAL_DEV.md`） |

验收：`node scripts/verify/verify-runtime-base.mjs` 与 `node scripts/verify/verify-complete-form.mjs`，再加 `GET /healthz/ready`。闭集是 `data.runtimeBase.items` 的 35 个稳定 ID。质量门禁、生产 Mock、一键部署和通知不进闭集。
SSOT：军械库统一运行底座架构 V1.8.3。

### 环境变量（配置管控注入）

> 权威在配置管控；下表为键名说明。禁止以手工拼装代替配置管控生成/注入。

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `APP_ENV` | prod | 生产唯一基准 |
| `NODE_ENV` | production | 与生产一致 |
| `PORT` | 5170 | 服务端口 |
| `DATA_DIR` | （本机默认 server/data） | 数据 / 日志 / 管控 / 调度目录根 |
| `LOG_LEVEL` | info | 日志级别 |
| `TZ` | Asia/Shanghai | 时区 |
| `CYP_BOOTSTRAP_OWNER_PASSWORD` | （空） | 仅空库首次 Owner 种子 |

### 源码构建启动

```bash
pnpm build
cd packages/server && pnpm start
```

### 桌面端

支持 Windows / macOS / Linux（Electron）。构建：`pnpm --filter @cyp-memo/desktop build:win|mac|linux`。详见 Release 产物说明。

### 数据备份与恢复

```bash
./scripts/backup.sh
./scripts/restore.sh backups/cyp-memo-backup-YYYYMMDD_HHMMSS.tar.gz
```

### PM2 部署

```bash
pm2 start packages/server/dist/index.js --name cyp-memo
pm2 startup
pm2 save
```

---

## 故障排除

### 常见问题

#### 1. 进程启动失败

```bash
# 查看 DATA_DIR 下日志
# Windows: packages\server\data\logs\
# 或安装时指定的 DATA_DIR/logs/runtime/

# 就绪探针
curl http://localhost:5170/healthz/ready
powershell -File scripts/verify/verify-five-centers.ps1 -DataDir packages/server/data
```

#### 2. 端口被占用

```bash
# 检查端口占用（Windows）
netstat -ano | findstr :5170
# 修改 .env 中 PORT=
```

#### 3. 数据目录权限

```bash
# 确保运行用户可写 DATA_DIR、logs、governance
# 见 DEPLOY.md 与 deploy/nas/README.md
```

#### 4. 健康检查失败

```bash
curl http://localhost:5170/api/health
curl http://localhost:5170/healthz/ready
```

#### 5. 数据库初始化失败

```bash
# 检查 DATA_DIR 下 database.sqlite 与启动日志
# 勿用容器 volume 方案；回滚用 scripts/rollback 或 restore.sh
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

## 本机联调命令

```bash
# 本机联调（配置仍为 prod；脚本统一为 local）
pnpm local

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
| [部署](DEPLOY.md) | 面板/NAS/Windows/Unix 非容器部署 |
| [本机联调](LOCAL_DEV.md) | 生产配置基准联调 |
| [运维](ops/README.md) | 备份/回滚/探针 |
| [产品版本化](docs/PRODUCT_VERSIONING.md) | 升版与发版纪律 |

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
