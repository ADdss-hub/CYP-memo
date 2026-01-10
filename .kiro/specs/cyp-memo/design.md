# 设计文档 - CYP-memo 容器备忘录系统

## 概述

CYP-memo 是一款基于浏览器的现代化备忘录管理系统，采用渐进式 Web 应用（PWA）架构。系统包含两个独立的网页应用：

1. **用户端应用（cyp-memo-app）**：供普通用户使用，提供备忘录管理、标签、分享等功能
2. **系统管理员端应用（cyp-memo-admin）**：供系统管理员使用，用于管理用户、数据库等系统操作

两个应用共享数据库访问层和核心业务逻辑，确保数据一致性和代码复用。

### 核心特性

- **双重认证机制**：支持账号密码和个人令牌两种登录方式
- **富文本编辑**：基于 Markdown 的富文本编辑器，支持实时预览
- **文件管理**：支持最大 10GB 的文件上传和管理
- **权限系统**：主账号和子账号的分级权限管理
- **系统管理**：独立的管理员端用于系统级操作
- **高性能**：使用多种优化技术确保极速响应
- **中文优先**：完整的中文界面和本地化支持

### 技术栈

- **前端框架**：Vue 3 + TypeScript
- **UI 组件库**：Element Plus（中文友好）
- **编辑器**：TipTap（基于 ProseMirror）
- **状态管理**：Pinia
- **路由**：Vue Router
- **数据存储**：IndexedDB（Dexie.js）
- **构建工具**：Vite
- **代码质量**：ESLint + Prettier
- **测试框架**：Vitest + Testing Library
- **项目管理**：Monorepo（pnpm workspaces）

## 架构设计

### 整体架构

系统采用 Monorepo 架构，包含两个独立的单页应用（SPA）和一个共享库。

```
┌─────────────────────────────────────────────────────────┐
│                   用户端应用 (App)                        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │ 登录界面 │ │ 备忘录   │ │ 统计界面 │ │ 设置界面 │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘  │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│                管理员端应用 (Admin)                       │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │ 管理员   │ │ 用户管理 │ │ 数据库   │ │ 系统监控 │  │
│  │ 登录     │ │          │ │ 管理     │ │          │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘  │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│                   共享业务逻辑层                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │ 认证管理 │ │ 备忘录   │ │ 文件管理 │ │ 权限管理 │  │
│  │   器     │ │  管理器  │ │   器     │ │   器     │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘  │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│                   共享数据访问层                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │ 用户数据 │ │ 备忘录   │ │ 文件数据 │ │ 日志数据 │  │
│  │  访问    │ │ 数据访问 │ │  访问    │ │  访问    │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘  │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│                   IndexedDB 存储层                        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │  users   │ │  memos   │ │  files   │ │   logs   │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘  │
└─────────────────────────────────────────────────────────┘
```

### 目录结构

```
cyp-memo/
├── packages/
│   ├── shared/              # 共享库
│   │   ├── src/
│   │   │   ├── database/   # 数据库访问层
│   │   │   │   ├── db.ts
│   │   │   │   ├── UserDAO.ts
│   │   │   │   ├── MemoDAO.ts
│   │   │   │   ├── FileDAO.ts
│   │   │   │   └── LogDAO.ts
│   │   │   ├── managers/   # 管理器类
│   │   │   │   ├── AuthManager.ts
│   │   │   │   ├── MemoManager.ts
│   │   │   │   ├── FileManager.ts
│   │   │   │   ├── LogManager.ts
│   │   │   │   ├── PermissionManager.ts
│   │   │   │   └── WelcomeManager.ts
│   │   │   ├── utils/      # 工具函数
│   │   │   │   ├── crypto.ts
│   │   │   │   ├── validation.ts
│   │   │   │   ├── format.ts
│   │   │   │   └── performance.ts
│   │   │   ├── types/      # 类型定义
│   │   │   └── config/     # 配置文件
│   │   ├── tests/          # 共享库测试
│   │   └── package.json
│   ├── app/                # 用户端应用
│   │   ├── src/
│   │   │   ├── assets/     # 静态资源
│   │   │   ├── components/ # 组件
│   │   │   ├── views/      # 页面视图
│   │   │   ├── stores/     # Pinia 状态
│   │   │   ├── router/     # 路由配置
│   │   │   ├── App.vue
│   │   │   └── main.ts
│   │   ├── public/
│   │   ├── tests/
│   │   ├── vite.config.ts
│   │   └── package.json
│   └── admin/              # 管理员端应用
│       ├── src/
│       │   ├── assets/
│       │   ├── components/
│       │   ├── views/      # 管理员页面
│       │   │   ├── login/
│       │   │   ├── users/
│       │   │   ├── database/
│       │   │   └── monitor/
│       │   ├── stores/
│       │   ├── router/
│       │   ├── App.vue
│       │   └── main.ts
│       ├── public/
│       ├── tests/
│       ├── vite.config.ts
│       └── package.json
├── docs/                   # 文档
├── scripts/                # 构建和启动脚本
│   ├── dev.sh             # 开发环境启动脚本
│   └── build.sh           # 构建脚本
├── pnpm-workspace.yaml    # pnpm workspace 配置
├── package.json           # 根 package.json
├── README.md
└── LICENSE
```

## 组件和接口设计

### 核心管理器

#### 1. AuthManager（认证管理器）

负责用户认证、会话管理和令牌生成。

```typescript
interface AuthManager {
  // 账号密码登录
  loginWithPassword(username: string, password: string): Promise<User>
  
  // 个人令牌登录
  loginWithToken(token: string): Promise<User>
  
  // 注册账号密码用户
  registerWithPassword(username: string, password: string, securityQuestion: SecurityQuestion): Promise<User>
  
  // 注册个人令牌用户
  registerWithToken(): Promise<{ user: User; token: string }>
  
  // 注销
  logout(): Promise<void>
  
  // 自动登录
  autoLogin(): Promise<User | null>
  
  // 密码找回
  resetPassword(username: string, securityAnswer: string, newPassword: string): Promise<void>
  
  // 生成个人令牌
  generateToken(): string
  
  // 验证令牌
  validateToken(token: string): boolean
}
```

#### 2. MemoManager（备忘录管理器）

负责备忘录的 CRUD 操作和搜索。

```typescript
interface MemoManager {
  // 创建备忘录
  createMemo(content: string, tags: string[]): Promise<Memo>
  
  // 更新备忘录
  updateMemo(id: string, content: string, tags: string[]): Promise<Memo>
  
  // 删除备忘录
  deleteMemo(id: string): Promise<void>
  
  // 获取备忘录
  getMemo(id: string): Promise<Memo>
  
  // 获取所有备忘录
  getAllMemos(): Promise<Memo[]>
  
  // 搜索备忘录
  searchMemos(query: string, tags?: string[]): Promise<Memo[]>
  
  // 获取备忘录历史
  getMemoHistory(id: string): Promise<MemoHistory[]>
  
  // 自动保存草稿
  saveDraft(content: string): Promise<void>
  
  // 获取草稿
  getDraft(): Promise<string | null>
}
```

#### 3. FileManager（文件管理器）

负责文件上传、存储和管理。

```typescript
interface FileManager {
  // 上传文件
  uploadFile(file: File): Promise<FileMetadata>
  
  // 删除文件
  deleteFile(fileId: string): Promise<void>
  
  // 获取文件
  getFile(fileId: string): Promise<Blob>
  
  // 获取文件元数据
  getFileMetadata(fileId: string): Promise<FileMetadata>
  
  // 获取所有文件
  getAllFiles(): Promise<FileMetadata[]>
  
  // 批量删除文件
  deleteFiles(fileIds: string[]): Promise<void>
  
  // 获取存储使用情况
  getStorageUsage(): Promise<StorageInfo>
  
  // 压缩图片
  compressImage(file: File): Promise<Blob>
}
```

#### 4. PermissionManager（权限管理器）

负责用户权限验证和管理。

```typescript
interface PermissionManager {
  // 检查权限
  hasPermission(userId: string, permission: Permission): boolean
  
  // 设置权限
  setPermissions(userId: string, permissions: Permission[]): Promise<void>
  
  // 获取用户权限
  getUserPermissions(userId: string): Promise<Permission[]>
  
  // 检查是否为主账号
  isMainAccount(userId: string): boolean
  
  // 检查是否为子账号
  isSubAccount(userId: string): boolean
}
```

#### 5. LogManager（日志管理器）

负责日志记录和管理。

```typescript
interface LogManager {
  // 记录日志
  log(level: LogLevel, message: string, context?: any): void
  
  // 记录错误
  error(error: Error, context?: any): void
  
  // 获取日志
  getLogs(filter?: LogFilter): Promise<LogEntry[]>
  
  // 清理日志
  cleanLogs(olderThan: Date): Promise<void>
  
  // 导出日志
  exportLogs(): Promise<Blob>
  
  // 自动清理旧日志（12小时以上）
  autoCleanOldLogs(): Promise<void>
  
  // 启动自动清理定时任务
  startAutoCleanTask(): void
}
```

#### 6. WelcomeManager（欢迎引导管理器）

负责首次使用欢迎界面和功能引导。

```typescript
interface WelcomeManager {
  // 检查是否首次使用
  isFirstTime(): boolean
  
  // 标记欢迎流程已完成
  markWelcomeCompleted(): void
  
  // 获取引导步骤
  getGuideSteps(): GuideStep[]
  
  // 重置引导状态
  resetGuide(): void
}

interface GuideStep {
  id: string
  title: string
  description: string
  target?: string  // 目标元素选择器
  position?: 'top' | 'bottom' | 'left' | 'right'
}
```

### 数据模型

#### User（用户）

```typescript
interface User {
  id: string
  username: string
  passwordHash?: string  // 账号密码用户才有
  token?: string         // 个人令牌用户才有
  securityQuestion?: SecurityQuestion  // 账号密码用户才有
  rememberPassword: boolean  // 是否记住密码
  isMainAccount: boolean
  parentUserId?: string  // 子账号的父账号 ID
  permissions: Permission[]
  createdAt: Date
  lastLoginAt: Date
}

interface SecurityQuestion {
  question: string
  answerHash: string
}

enum Permission {
  MEMO_MANAGE = 'memo_manage',
  STATISTICS_VIEW = 'statistics_view',
  ATTACHMENT_MANAGE = 'attachment_manage',
  SETTINGS_MANAGE = 'settings_manage',
  ACCOUNT_MANAGE = 'account_manage'
}

interface AppSettings {
  isFirstTime: boolean  // 是否首次使用
  welcomeCompleted: boolean  // 欢迎引导是否完成
  theme: 'light' | 'dark'
  fontSize: 'small' | 'medium' | 'large'
  language: string
  autoCleanLogs: boolean  // 是否自动清理日志
  logRetentionHours: number  // 日志保留时长（小时）
}
```

#### Memo（备忘录）

```typescript
interface Memo {
  id: string
  userId: string
  title: string
  content: string
  tags: string[]
  attachments: string[]  // 文件 ID 数组
  createdAt: Date
  updatedAt: Date
  deletedAt?: Date
}

interface MemoHistory {
  id: string
  memoId: string
  content: string
  timestamp: Date
}
```

#### FileMetadata（文件元数据）

```typescript
interface FileMetadata {
  id: string
  userId: string
  filename: string
  size: number
  type: string
  memoId?: string
  uploadedAt: Date
}
```

#### ShareLink（分享链接）

```typescript
interface ShareLink {
  id: string
  memoId: string
  userId: string
  password?: string
  expiresAt?: Date
  accessCount: number
  createdAt: Date
}
```

### API 接口设计

由于是纯前端应用，所有"API"实际上是管理器类的方法调用。但为了保持一致性，我们定义统一的响应格式：

```typescript
interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
  }
}
```

## 数据模型

### IndexedDB 数据库结构

使用 Dexie.js 定义数据库结构：

```typescript
class CYPMemoDB extends Dexie {
  users!: Table<User>
  memos!: Table<Memo>
  files!: Table<FileMetadata>
  fileBlobs!: Table<{ id: string; blob: Blob }>
  logs!: Table<LogEntry>
  shares!: Table<ShareLink>
  settings!: Table<{ key: string; value: any }>

  constructor() {
    super('CYPMemoDB')
    this.version(1).stores({
      users: 'id, username, token, parentUserId',
      memos: 'id, userId, *tags, createdAt, updatedAt, deletedAt',
      files: 'id, userId, memoId, uploadedAt',
      fileBlobs: 'id',
      logs: 'id, level, timestamp',
      shares: 'id, memoId, userId, expiresAt',
      settings: 'key'
    })
  }
}
```

### 数据关系

```
User (1) ─────< (N) Memo
User (1) ─────< (N) FileMetadata
User (1) ─────< (N) ShareLink
User (1) ─────< (N) User (子账号)
Memo (1) ─────< (N) FileMetadata
Memo (1) ─────< (N) ShareLink
```


## 错误处理

### 全局错误处理机制

系统实现三层错误处理机制：

1. **全局错误捕获**
   - 使用 `window.onerror` 捕获未处理的 JavaScript 错误
   - 使用 `window.onunhandledrejection` 捕获未处理的 Promise 拒绝
   - Vue 的 `errorHandler` 捕获组件错误

2. **业务层错误处理**
   - 所有管理器方法使用 try-catch 包装
   - 统一的错误类型定义
   - 错误日志记录

3. **用户界面错误提示**
   - 友好的中文错误消息
   - 错误提示组件（Toast/Message）
   - 错误恢复建议

### 错误类型定义

```typescript
enum ErrorCode {
  // 认证错误
  AUTH_INVALID_CREDENTIALS = 'AUTH_001',
  AUTH_TOKEN_INVALID = 'AUTH_002',
  AUTH_SESSION_EXPIRED = 'AUTH_003',
  AUTH_PERMISSION_DENIED = 'AUTH_004',
  
  // 数据错误
  DATA_NOT_FOUND = 'DATA_001',
  DATA_VALIDATION_FAILED = 'DATA_002',
  DATA_SAVE_FAILED = 'DATA_003',
  DATA_CONFLICT = 'DATA_004',
  
  // 文件错误
  FILE_TOO_LARGE = 'FILE_001',
  FILE_TYPE_NOT_SUPPORTED = 'FILE_002',
  FILE_UPLOAD_FAILED = 'FILE_003',
  FILE_NOT_FOUND = 'FILE_004',
  
  // 系统错误
  SYSTEM_STORAGE_FULL = 'SYS_001',
  SYSTEM_UNKNOWN_ERROR = 'SYS_002'
}

class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public context?: any
  ) {
    super(message)
    this.name = 'AppError'
  }
}
```

### 错误处理流程

```typescript
// 全局错误处理器
function setupGlobalErrorHandler() {
  // JavaScript 错误
  window.onerror = (message, source, lineno, colno, error) => {
    LogManager.error(error || new Error(message as string), {
      source,
      lineno,
      colno
    })
    showErrorToast('系统发生错误，请刷新页面重试')
    return true
  }
  
  // Promise 拒绝
  window.onunhandledrejection = (event) => {
    LogManager.error(new Error(event.reason), {
      type: 'unhandled_rejection'
    })
    showErrorToast('操作失败，请重试')
    event.preventDefault()
  }
  
  // Vue 错误
  app.config.errorHandler = (err, instance, info) => {
    LogManager.error(err as Error, {
      component: instance?.$options.name,
      info
    })
    showErrorToast('界面渲染错误，请刷新页面')
  }
}
```

## 测试策略

### 测试方法

系统采用双重测试策略：

1. **单元测试**：测试具体示例、边界情况和错误条件
2. **属性测试**：验证通用属性在所有输入下都成立

### 测试框架配置

- **单元测试**：Vitest + Vue Testing Library
- **属性测试**：fast-check（JavaScript 的属性测试库）
- **测试覆盖率**：目标 80% 以上
- **每个属性测试**：最少 100 次迭代

### 测试组织

```
tests/
├── unit/                    # 单元测试
│   ├── managers/           # 管理器测试
│   ├── components/         # 组件测试
│   └── utils/              # 工具函数测试
├── integration/            # 集成测试
│   ├── auth-flow.test.ts  # 认证流程测试
│   └── memo-crud.test.ts  # 备忘录 CRUD 测试
└── properties/             # 属性测试
    ├── auth.property.test.ts
    ├── memo.property.test.ts
    └── file.property.test.ts
```

### 属性测试标签格式

每个属性测试必须包含标签，格式为：

```typescript
// Feature: cyp-memo, Property 1: 属性描述
test('property test name', async () => {
  await fc.assert(
    fc.asyncProperty(
      // 生成器
      fc.string(),
      // 属性验证
      async (input) => {
        // 测试逻辑
      }
    ),
    { numRuns: 100 }
  )
})
```

### 性能测试

- 用户交互响应时间：< 100ms
- 页面初始加载时间：< 2s
- 大列表渲染：使用虚拟滚动，支持 10000+ 项
- 文件上传：支持 10GB 文件，使用分块上传


## 正确性属性

*属性是一个特征或行为，应该在系统的所有有效执行中都成立——本质上是关于系统应该做什么的形式化陈述。属性作为人类可读规范和机器可验证正确性保证之间的桥梁。*

基于需求文档中的验收标准，我们定义以下可测试的正确性属性：

### 认证和账号管理属性

**属性 1: 密码强度验证**
*对于任何*密码字符串，密码验证函数应该正确识别是否满足强度要求（至少 8 位，包含字母和数字）
**验证需求: 1.3**

**属性 2: 令牌唯一性**
*对于任何*两次令牌生成调用，生成的令牌应该是不同的
**验证需求: 1.4**

**属性 3: 令牌随机性**
*对于任何*生成的令牌，应该具有足够的熵和随机性（通过统计测试验证）
**验证需求: 1.5**

**属性 4: 登录验证正确性**
*对于任何*有效的用户名密码组合，登录验证应该成功；对于任何无效组合，应该失败
**验证需求: 1.7**

**属性 5: 令牌验证正确性**
*对于任何*有效的令牌，验证应该成功；对于任何无效或格式错误的令牌，应该失败
**验证需求: 1.8**

**属性 6: 登录状态持久化**
*对于任何*成功的登录操作，本地存储应该包含认证信息
**验证需求: 1.9**

**属性 7: 自动登录**
*对于任何*在本地存储中有有效认证信息的情况，系统应该能够自动登录
**验证需求: 1.10**

**属性 8: 注销清理**
*对于任何*注销操作，本地存储中的认证信息应该被完全清除
**验证需求: 1.12**

**属性 9: 安全问题验证**
*对于任何*用户和安全问题答案，验证函数应该正确判断答案是否与存储的答案匹配
**验证需求: 2.3**

**属性 10: 密码重置**
*对于任何*安全问题答案正确的情况，密码重置应该成功，且新密码应该生效
**验证需求: 2.4**

**属性 11: 找回尝试日志记录**
*对于任何*账号找回尝试，日志中应该有相应的记录
**验证需求: 2.8**

### 备忘录管理属性

**属性 12: 备忘录创建唯一性**
*对于任何*备忘录内容，创建后应该被分配唯一的标识符，且内容应该被正确保存
**验证需求: 3.1**

**属性 13: 备忘录编辑历史保留**
*对于任何*备忘录编辑操作，编辑后内容应该更新，且修改历史应该被保留
**验证需求: 3.2**

**属性 14: 备忘录删除完整性**
*对于任何*备忘录删除操作，删除后该备忘录应该无法被查询到，且日志中应该有删除记录
**验证需求: 3.3**

**属性 15: 搜索结果匹配性**
*对于任何*搜索条件，返回的所有备忘录都应该匹配该搜索条件
**验证需求: 3.5**

**属性 16: 草稿自动保存**
*对于任何*用户输入操作，草稿应该在指定时间内被自动保存
**验证需求: 3.1.13**

**属性 17: 文件大小限制**
*对于任何*文件，如果大小超过 10GB 应该被拒绝，否则应该被接受
**验证需求: 3.1.20**

**属性 18: 图片上传和预览**
*对于任何*图片文件，上传后应该能在编辑区看到预览
**验证需求: 3.1.21**

**属性 19: 文本文件内容插入**
*对于任何*文本文件，上传后其内容应该被正确读取并插入到编辑器
**验证需求: 3.1.22**

**属性 20: 文件引用保存**
*对于任何*上传的文件，备忘录中应该包含其引用和完整的元数据
**验证需求: 3.1.27**

### 标签管理属性

**属性 21: 标签名称验证**
*对于任何*标签名称，如果为空或超过 20 个字符应该被拒绝，否则应该被接受
**验证需求: 4.2**

**属性 22: 标签筛选正确性**
*对于任何*标签，点击后显示的所有备忘录都应该包含该标签
**验证需求: 4.3**

**属性 23: 未使用标签自动清理**
*对于任何*标签，当删除最后一个使用该标签的备忘录后，该标签应该从标签列表中移除
**验证需求: 4.5**

**属性 24: 标签搜索筛选**
*对于任何*按标签筛选的搜索，返回的所有备忘录都应该包含指定的标签
**验证需求: 4.7**

### 日志和错误处理属性

**属性 25: 操作日志记录**
*对于任何*用户操作，日志中应该有相应的记录，包含操作类型、时间戳和用户标识
**验证需求: 9.2**

**属性 26: 错误日志记录**
*对于任何*系统错误，日志中应该有详细记录，包含错误详情、堆栈跟踪和上下文信息
**验证需求: 9.3**

**属性 27: 日志分类存储**
*对于任何*日志条目，应该按日期被正确分类存储
**验证需求: 9.4**

**属性 28: 日志级别支持**
*对于任何*日志级别（调试、信息、警告、错误），系统应该能够正确记录和区分
**验证需求: 9.5**

**属性 29: 全局错误捕获**
*对于任何*未捕获的错误，全局错误处理机制应该能够捕获并记录
**验证需求: 9.7, 9.8**

**属性 30: 日志自动清理**
*对于任何*超过 12 小时的日志条目，自动清理机制应该将其移除
**验证需求: 10.1.4**

### 认证增强属性

**属性 31: 密码记住功能**
*对于任何*选择记住密码的用户，下次访问时应该能够自动填充密码
**验证需求: 1.10（扩展）**

**属性 32: 首次使用检测**
*对于任何*首次访问应用的用户，系统应该正确识别并显示欢迎界面
**验证需求: 7.1**

**属性 33: 欢迎流程完成标记**
*对于任何*完成欢迎引导的用户，系统应该记录完成状态，后续访问不再显示
**验证需求: 7.3**

### 数据持久化属性

**属性 34: 数据立即持久化**
*对于任何*备忘录创建或修改操作，数据应该立即被持久化到存储
**验证需求: 10.1**

**属性 35: 数据恢复完整性**
*对于任何*系统重启，所有之前保存的备忘录数据应该能够被完全恢复
**验证需求: 10.2**

**属性 36: JSON 序列化往返**
*对于任何*有效的备忘录对象，序列化为 JSON 后再反序列化应该得到等价的对象
**验证需求: 10.3**

### 数据清理属性

**属性 37: 已删除数据清理**
*对于任何*超过保留期限的已删除备忘录，自动清理后应该无法被恢复
**验证需求: 10.1.1**

**属性 38: 未使用附件清理**
*对于任何*未被任何备忘录引用的附件文件，自动清理后应该被移除
**验证需求: 10.1.2**

**属性 39: 清理操作日志记录**
*对于任何*自动清理操作，日志中应该有详细记录
**验证需求: 10.1.9**

### 权限管理属性

**属性 40: 权限验证正确性**
*对于任何*用户和权限，权限检查应该正确返回该用户是否拥有该权限
**验证需求: 19.12, 19.13**

**属性 41: 子账号权限限制**
*对于任何*子账号用户，默认应该只能访问备忘录功能，其他功能应该被限制
**验证需求: 19.12, 19.13**

**属性 42: 权限授予生效**
*对于任何*权限授予操作，授予后用户应该能够访问对应的功能
**验证需求: 19.15**

### 分享功能属性

**属性 43: 分享链接唯一性**
*对于任何*分享链接生成操作，生成的标识符应该是唯一的
**验证需求: 22.4**

**属性 44: 分享链接过期验证**
*对于任何*过期的分享链接，访问时应该显示失效提示
**验证需求: 22.10**

**属性 45: 分享访问日志记录**
*对于任何*分享链接访问，日志中应该有访问记录，包含时间和访问者信息
**验证需求: 22.13**

