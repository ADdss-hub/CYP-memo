# CYP-memo 存储架构说明

## 概述

CYP-memo 采用**服务器端集中存储**架构，所有数据统一存储在服务器端 SQLite 数据库，浏览器端不再使用 IndexedDB 本地存储。

## 存储模式

### 1. 远程存储（Remote Storage）- 生产环境 ✅

**状态**: 已启用（默认且唯一模式）

**实现**: `RemoteStorageAdapter`

**数据存储位置**: 服务器端 `database.sqlite` 文件

**特点**:
- 所有数据存储在服务器端 SQLite 数据库
- 通过 REST API 访问数据
- 支持多用户、多设备同步
- 数据持久化、安全可靠
- 支持事务和并发访问
- 管理端清除数据库后，用户端数据同步清除

**配置**:
```typescript
// packages/app/src/main.ts
// packages/admin/src/main.ts
await storageManager.initialize({
  mode: 'remote',
  apiUrl: 'http://localhost:5170/api'
})
```

### 2. 本地存储（Local Storage）- 已废弃 ⚠️

**状态**: 已废弃，仅用于开发和测试

**实现**: `LocalStorageAdapter`

**数据存储位置**: 浏览器 IndexedDB

**问题**:
- 数据仅存储在浏览器本地
- 无法跨设备同步
- 管理端清除数据库后，用户端数据仍然存在
- 不适合生产环境

## 数据访问层架构

```
┌─────────────────────────────────────────────────────────┐
│                    应用层 (App/Admin)                    │
│                  Vue Components & Stores                 │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│                    管理器层 (Managers)                   │
│  AuthManager, MemoManager, DataManager, ShareManager... │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│                    DAO 层 (Data Access)                  │
│      UserDAO, MemoDAO, FileDAO, LogDAO, AdminDAO...     │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│                 存储适配器 (Storage Adapter)              │
│              RemoteStorageAdapter (生产环境)             │
│              LocalStorageAdapter (已废弃)                │
└────────────────────┬────────────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        │                         │
┌───────▼────────┐      ┌────────▼────────┐
│  服务器端 API   │      │  浏览器 IndexedDB│
│ (端口 5170)    │      │    (已废弃)      │
│ SQLite 数据库  │      │                  │
└────────────────┘      └──────────────────┘
```

## 已修复的文件

### DAO 层（数据访问对象）

所有 DAO 已改为通过 `getStorage()` 访问数据：

- ✅ `packages/shared/src/database/UserDAO.ts` - 用户数据访问
- ✅ `packages/shared/src/database/MemoDAO.ts` - 备忘录数据访问
- ✅ `packages/shared/src/database/FileDAO.ts` - 文件数据访问
- ✅ `packages/shared/src/database/LogDAO.ts` - 日志数据访问
- ✅ `packages/shared/src/database/AdminDAO.ts` - 管理员数据访问

### 管理器层（业务逻辑）

所有管理器已改为通过存储适配器访问数据：

- ✅ `packages/shared/src/managers/DataManager.ts` - 数据管理
- ✅ `packages/shared/src/managers/ShareManager.ts` - 分享管理
- ✅ `packages/shared/src/managers/WelcomeManager.ts` - 欢迎引导
- ✅ `packages/shared/src/managers/InitManager.ts` - 系统初始化
- ✅ `packages/shared/src/managers/CleanupManager.ts` - 自动清理

### 应用入口

- ✅ `packages/app/src/main.ts` - 用户端（强制使用远程 API）
- ✅ `packages/admin/src/main.ts` - 管理端（强制使用远程 API）

## 服务器端 API

### 端口配置

- **服务器端**: `http://localhost:5170`
- **用户端**: `http://localhost:5173`
- **管理端**: `http://localhost:5174`

### API 端点

所有数据操作通过以下 API 端点：

- `GET /api/health` - 健康检查
- `POST /api/users` - 创建用户
- `GET /api/users/:id` - 获取用户
- `PATCH /api/users/:id` - 更新用户
- `DELETE /api/users/:id` - 删除用户
- `POST /api/memos` - 创建备忘录
- `GET /api/memos/:id` - 获取备忘录
- `GET /api/users/:userId/memos` - 获取用户备忘录列表
- `PATCH /api/memos/:id` - 更新备忘录
- `DELETE /api/memos/:id` - 删除备忘录
- `DELETE /api/data/clear` - 清除所有数据（管理端）
- ... 更多 API 端点

## 数据清除流程

### 管理端清除数据库

1. 管理员在管理端点击"清除数据库"
2. 调用 `DELETE /api/data/clear` API
3. 服务器端清除 SQLite 数据库中的所有数据
4. 用户端下次访问时，数据已被清除

### 与旧架构的区别

**旧架构（问题）**:
- 管理端清除本地 IndexedDB
- 用户数据存储在服务器端
- 备忘录、文件等数据存储在浏览器本地 IndexedDB
- 结果：清除数据库后，用户仍可登录，备忘录仍然存在

**新架构（已修复）**:
- 所有数据统一存储在服务器端 SQLite 数据库
- 管理端清除服务器端数据
- 用户端通过 API 访问服务器端数据
- 结果：清除数据库后，所有数据都被清除

## 开发和测试

### 启动服务

```bash
# 启动服务器端（必须）
cd packages/server
pnpm dev

# 启动用户端
cd packages/app
pnpm dev

# 启动管理端
cd packages/admin
pnpm dev
```

### 测试数据清除

1. 创建用户并登录
2. 创建一些备忘录
3. 在管理端清除数据库
4. 刷新用户端，验证数据已被清除

## 注意事项

1. **必须启动服务器**: 应用无法在没有服务器的情况下运行
2. **不再回退到本地模式**: 如果服务器连接失败，应用会显示错误提示
3. **IndexedDB 已废弃**: `db.ts` 和 `LocalStorageAdapter` 仅用于测试
4. **数据持久化**: 所有数据存储在 `packages/server/data/database.sqlite`

## 版本历史

- **v1.8.0** (2026-01-11): 新增 Electron 桌面客户端，支持 Windows/macOS/Linux
- **v1.7.11** (2026-01-11): 全端版本更新检测，自动更新支持
- **v1.7.0** (2026-01-10): 升级到 SQLite 数据库，性能提升 10-100 倍
- **v1.6.1** (2026-01-10): 完成存储架构迁移，所有数据改为服务器端存储
- **v1.6.0** 及之前: 混合存储（用户在服务器端，其他在浏览器本地）
