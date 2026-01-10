# CYP-memo 管理员端应用

## 概述

CYP-memo 管理员端是一个独立的 Web 应用，用于系统管理员管理用户、数据库和监控系统运行状态。

## 功能特性

### 已实现功能

- ✅ **管理员登录界面**
  - 支持账号密码登录
  - 支持个人令牌登录
  - 只允许主账号登录
  - 记住密码功能
  - 自动登录功能
  - 会话管理

- ✅ **管理员认证**
  - 独立的认证状态管理
  - 主账号验证
  - 路由守卫保护
  - 全局错误处理

- ✅ **管理控制台**
  - 欢迎页面
  - 用户信息显示
  - 注销功能

### 待实现功能

- ⏳ 用户管理
- ⏳ 数据库管理
- ⏳ 系统监控
- ⏳ 日志查看

## 技术栈

- **框架**: Vue 3 + TypeScript
- **UI 库**: Element Plus
- **状态管理**: Pinia
- **路由**: Vue Router
- **构建工具**: Vite
- **测试**: Vitest + Vue Testing Library

## 项目结构

```
packages/admin/
├── src/
│   ├── assets/          # 静态资源
│   ├── components/      # 组件
│   ├── stores/          # Pinia 状态管理
│   │   ├── auth.ts     # 管理员认证状态
│   │   └── index.ts    # 状态导出
│   ├── views/          # 页面视图
│   │   ├── AdminLoginView.vue    # 管理员登录页
│   │   ├── DashboardView.vue     # 管理控制台
│   │   └── HomeView.vue          # 首页
│   ├── router/         # 路由配置
│   │   └── index.ts    # 路由定义和守卫
│   ├── App.vue         # 根组件
│   └── main.ts         # 应用入口
├── tests/              # 测试文件
│   ├── setup.ts                  # 测试环境设置
│   ├── auth.store.test.ts        # 认证状态测试
│   └── AdminLoginView.test.ts    # 登录界面测试
├── package.json
├── vite.config.ts
├── vitest.config.ts
└── README.md
```

## 开发指南

### 安装依赖

```bash
pnpm install
```

### 开发模式

```bash
# 只启动管理员端
pnpm --filter @cyp-memo/admin run dev

# 或从根目录启动所有应用
pnpm run dev
```

管理员端默认运行在 `http://localhost:5174`

### 构建

```bash
pnpm --filter @cyp-memo/admin run build
```

### 测试

```bash
# 运行测试
pnpm --filter @cyp-memo/admin run test

# 监听模式
pnpm --filter @cyp-memo/admin run test:watch
```

## 使用说明

### 登录管理员端

1. 访问 `http://localhost:5174/login`
2. 选择登录方式：
   - **账号密码登录**: 输入主账号的用户名和密码
   - **个人令牌登录**: 输入主账号的个人令牌
3. 可选择"记住密码"以便下次自动填充
4. 点击"登录"按钮

**注意**: 只有主账号可以登录管理员端。子账号会被拒绝访问。

### 管理控制台

登录成功后，您将进入管理控制台主页，可以：
- 查看欢迎信息
- 访问各个管理功能（待实现）
- 注销登录

## 安全特性

1. **主账号验证**: 只允许主账号登录管理员端
2. **会话管理**: 独立的管理员会话，与用户端隔离
3. **路由守卫**: 未认证用户自动重定向到登录页
4. **自动登录**: 支持基于本地存储的自动登录
5. **错误处理**: 全局错误捕获和日志记录

## API 文档

### 管理员认证 Store

```typescript
import { useAdminAuthStore } from '@/stores/auth'

const adminAuthStore = useAdminAuthStore()

// 状态
adminAuthStore.currentAdmin    // 当前管理员用户
adminAuthStore.isLoading       // 加载状态
adminAuthStore.error           // 错误信息
adminAuthStore.isAuthenticated // 是否已认证
adminAuthStore.username        // 用户名
adminAuthStore.adminId         // 管理员 ID

// 方法
await adminAuthStore.loginWithPassword(username, password, remember)
await adminAuthStore.loginWithToken(token)
await adminAuthStore.logout()
await adminAuthStore.autoLogin()
adminAuthStore.clearError()
```

## 路由配置

| 路径 | 组件 | 说明 | 需要认证 |
|------|------|------|----------|
| `/login` | AdminLoginView | 管理员登录页 | 否 |
| `/dashboard` | DashboardView | 管理控制台 | 是 |
| `/` | - | 重定向到 `/dashboard` | - |

## 测试覆盖

- ✅ 管理员认证状态管理
- ✅ 登录界面组件
- ✅ 主账号验证
- ✅ 子账号拒绝
- ✅ 自动登录
- ✅ 会话管理

## 贡献指南

1. 遵循现有的代码风格
2. 为新功能添加测试
3. 更新相关文档
4. 提交前运行测试和 lint

## 许可证

Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>

## 联系方式

- 作者: CYP
- 邮箱: nasDSSCYP@outlook.com
