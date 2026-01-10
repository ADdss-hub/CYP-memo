# CYP-memo 容器备忘录系统

一款现代化的容器备忘录管理系统，提供完整的中文界面和丰富的功能。

## 作者信息

- **作者**: CYP
- **邮箱**: nasDSSCYP@outlook.com

---

## 项目简介

CYP-memo 是一款基于浏览器的现代化备忘录管理系统，采用前后端分离架构：

- **用户端应用** - 供普通用户使用，提供备忘录管理、标签、分享等功能
- **管理端应用** - 供系统管理员使用，用于管理用户、数据库等系统操作
- **API 服务器** - 提供 RESTful API，使用 SQLite 数据库存储

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
│   └── server/          # API 服务器
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

```bash
# 构建并启动
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

### 传统部署

```bash
# 构建
pnpm build

# 启动服务器
cd packages/server
pnpm start
```

### PM2 部署

```bash
pm2 start packages/server/dist/index.js --name cyp-memo
pm2 startup
pm2 save
```

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
