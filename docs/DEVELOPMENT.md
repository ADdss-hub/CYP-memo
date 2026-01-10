# CYP-memo 开发文档

## 项目架构

CYP-memo 采用 Monorepo 架构，使用 pnpm workspaces 管理多个包。

### 包结构

```
cyp-memo/
├── packages/
│   ├── shared/          # 共享库
│   │   ├── config/     # 配置（版本信息）
│   │   ├── database/   # 数据库访问层 (DAO)
│   │   ├── managers/   # 业务逻辑管理器
│   │   ├── storage/    # 存储适配器
│   │   ├── types/      # TypeScript 类型定义
│   │   ├── utils/      # 工具函数
│   │   └── workers/    # Web Workers
│   ├── app/            # 用户端应用
│   ├── admin/          # 管理端应用
│   └── server/         # API 服务器
```

### 技术栈

- **前端框架**: Vue 3 (Composition API)
- **类型系统**: TypeScript
- **UI 组件库**: Element Plus
- **富文本编辑器**: TipTap (基于 ProseMirror)
- **状态管理**: Pinia
- **路由**: Vue Router
- **后端框架**: Express.js
- **数据库**: SQLite
- **构建工具**: Vite
- **测试框架**: Vitest + fast-check (属性测试)
- **代码规范**: ESLint + Prettier

## 开发环境设置

### 环境要求

- Node.js >= 18.0.0
- pnpm >= 8.0.0

### 安装依赖

```bash
# 安装所有依赖
pnpm install
```

### 开发模式

```bash
# 同时启动用户端和管理员端
pnpm dev

# 单独启动用户端
cd packages/app
pnpm dev

# 单独启动管理员端
cd packages/admin
pnpm dev
```

访问地址：
- 用户端: http://localhost:5173
- 管理端: http://localhost:5174
- API 服务器: http://localhost:5170

### 构建

```bash
# 构建所有包
pnpm build

# 单独构建
cd packages/app
pnpm build
```

构建输出：
- 用户端: `packages/app/dist`
- 管理端: `packages/admin/dist`
- 服务器端: `packages/server/dist`

## 测试

### 运行测试

```bash
# 运行所有测试
pnpm test

# 运行特定包的测试
cd packages/shared
pnpm test

# 监听模式
pnpm test:watch
```

### 测试策略

项目采用双重测试策略：

1. **单元测试**: 测试具体示例、边界情况和错误条件
2. **属性测试**: 使用 fast-check 验证通用属性在所有输入下都成立

每个属性测试至少运行 100 次迭代以确保覆盖率。

### 测试文件命名

- 单元测试: `*.test.ts`
- 属性测试: `*.property.test.ts`

## 代码规范

### ESLint

```bash
# 检查代码
pnpm lint

# 自动修复
pnpm lint --fix
```

### Prettier

```bash
# 格式化代码
pnpm format
```

### 代码组织规则

1. 单个文件不超过 500 行
2. 每个功能模块独立目录
3. 使用 TypeScript 严格模式
4. 所有源文件包含版权声明

## 数据库设计

### SQLite 数据库

服务器端使用 SQLite 数据库存储所有数据：

- **users**: 用户信息
- **memos**: 备忘录数据
- **files**: 文件元数据
- **fileBlobs**: 文件二进制数据
- **logs**: 系统日志
- **shares**: 分享链接
- **admins**: 管理员账号

### 数据访问层 (DAO)

所有数据库操作通过 DAO 层进行：

- `UserDAO`: 用户数据访问
- `MemoDAO`: 备忘录数据访问
- `FileDAO`: 文件数据访问
- `LogDAO`: 日志数据访问
- `AdminDAO`: 管理员数据访问

## 业务逻辑层

### 管理器 (Managers)

核心业务逻辑封装在管理器类中：

- `AuthManager`: 认证和会话管理
- `MemoManager`: 备忘录 CRUD 和搜索
- `FileManager`: 文件上传和管理
- `LogManager`: 日志记录和管理
- `PermissionManager`: 权限验证
- `WelcomeManager`: 欢迎引导
- `DataManager`: 数据持久化
- `CleanupManager`: 自动清理
- `ShareManager`: 分享功能
- `InitManager`: 系统初始化
- `AdminAuthManager`: 管理员认证

### 管理器使用示例

```typescript
import { authManager, memoManager } from '@cyp-memo/shared'

// 登录
const user = await authManager.loginWithPassword('username', 'password')

// 创建备忘录
const memo = await memoManager.createMemo('内容', ['标签1', '标签2'])

// 搜索备忘录
const results = await memoManager.searchMemos('关键词')
```

## 组件开发

### Vue 组件规范

1. 使用 Composition API (`<script setup>`)
2. TypeScript 类型定义
3. 响应式设计（支持移动端）
4. 深色主题支持

### 组件示例

```vue
<!--
  组件描述
  Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
-->
<template>
  <div class="my-component">
    <!-- 模板内容 -->
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

// 组件逻辑
const count = ref(0)
</script>

<style scoped>
.my-component {
  /* 样式 */
}

/* 深色主题支持 */
@media (prefers-color-scheme: dark) {
  .my-component {
    /* 深色主题样式 */
  }
}
</style>
```

## 性能优化

项目实现了多种性能优化技术：

1. **代码分割**: 路由懒加载
2. **虚拟滚动**: 大列表优化
3. **图片懒加载**: 延迟加载图片
4. **防抖节流**: 高频操作优化
5. **Web Workers**: 计算密集型任务
6. **缓存机制**: 减少重复计算
7. **预加载**: 提前加载可能需要的资源

## 调试

### 浏览器开发工具

1. **Vue DevTools**: 调试 Vue 组件和状态
2. **IndexedDB 查看器**: 查看本地数据库
3. **Network 面板**: 监控资源加载
4. **Console**: 查看日志输出

### 日志系统

系统内置完善的日志记录：

```typescript
import { logManager } from '@cyp-memo/shared'

// 记录日志
logManager.log('info', '操作成功')
logManager.error(new Error('错误信息'))

// 查看日志
const logs = await logManager.getLogs()
```

## 部署

### 生产构建

```bash
pnpm build
```

### Docker 部署（推荐）

```bash
docker-compose up -d
```

### 传统部署

构建后的文件可以部署到任何静态文件服务器：

- Nginx
- Apache
- Vercel
- Netlify

API 服务器需要单独运行：

```bash
cd packages/server
pnpm start
```

### PM2 部署

```bash
pm2 start packages/server/dist/index.js --name cyp-memo
pm2 startup
pm2 save
```

## 贡献指南

### 提交规范

使用语义化提交信息：

- `feat`: 新功能
- `fix`: 修复 bug
- `docs`: 文档更新
- `style`: 代码格式调整
- `refactor`: 代码重构
- `test`: 测试相关
- `chore`: 构建/工具相关

示例：
```
feat: 添加备忘录分享功能
fix: 修复文件上传失败的问题
docs: 更新开发文档
```

### 开发流程

1. Fork 项目
2. 创建功能分支
3. 编写代码和测试
4. 运行测试和代码检查
5. 提交 Pull Request

## 常见问题

### Q: 如何清除本地数据？

A: 打开浏览器开发工具 → Application → IndexedDB → 删除 CYPMemoDB

### Q: 如何重置欢迎引导？

A: 在设置页面点击"重置引导"按钮

### Q: 如何查看系统日志？

A: 管理员端 → 系统监控 → 日志查看

### Q: 如何备份数据？

A: 设置页面 → 数据导出

## 联系方式

- **作者**: CYP
- **邮箱**: nasDSSCYP@outlook.com

## 许可证

MIT License - 详见 LICENSE 文件
