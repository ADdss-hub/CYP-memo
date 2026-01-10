# 路由配置说明

## 概述

CYP-memo 用户端应用的路由配置，包含完整的认证守卫、权限检查和懒加载支持。

## 路由结构

### 认证相关路由
- `/login` - 登录页面（访客专用）
- `/register` - 注册页面（访客专用）
- `/reset-password` - 密码找回页面（访客专用）

### 主应用路由
- `/` - 首页（重定向到 `/memos`）
- `/memos` - 备忘录列表
- `/memos/new` - 新建备忘录
- `/memos/:id` - 备忘录详情
- `/memos/:id/edit` - 编辑备忘录

### 功能路由
- `/welcome` - 欢迎引导页面
- `/statistics` - 数据统计（需要权限）
- `/attachments` - 附件管理（需要权限）
- `/shares` - 分享管理
- `/share/:id` - 查看分享（公开访问）
- `/accounts` - 账号管理（需要权限）
- `/settings` - 系统设置（需要权限）

### 错误页面
- `/:pathMatch(.*)` - 404 页面

## 路由守卫

### 认证守卫
- `requiresAuth: true` - 需要登录才能访问
- `requiresGuest: true` - 只有未登录用户才能访问

### 权限守卫
- `requiredPermissions: Permission[]` - 需要特定权限才能访问

可用权限：
- `Permission.MEMO_MANAGE` - 备忘录管理
- `Permission.STATISTICS_VIEW` - 数据统计查看
- `Permission.ATTACHMENT_MANAGE` - 附件管理
- `Permission.SETTINGS_MANAGE` - 系统设置管理
- `Permission.ACCOUNT_MANAGE` - 账号管理

### 首次使用引导
首次登录的用户会自动重定向到欢迎页面，完成引导后才能访问其他页面。

## 懒加载

所有路由组件都使用动态导入实现懒加载，优化初始加载性能：

```typescript
component: () => import('../views/memo/MemoListView.vue')
```

## 页面标题

每个路由都可以设置 `meta.title`，会自动更新浏览器标题为 `{title} - CYP-memo`。

## 自动登录

路由守卫会在首次访问时尝试自动登录（从本地存储恢复会话）。

## 权限不足处理

当用户访问没有权限的页面时，会重定向到备忘录列表页面，并在 URL 中添加 `error=permission_denied` 参数。

## 滚动行为

每次路由切换后，页面会自动滚动到顶部。
