# CYP-memo 项目设置文档

## 项目概述

CYP-memo 是一个基于 Vue 3 + TypeScript 的现代化备忘录管理系统，采用 Monorepo 架构。

## 项目结构

```
cyp-memo/
├── packages/
│   ├── shared/              # 共享库
│   │   ├── src/
│   │   │   ├── config/     # 配置文件（版本信息）
│   │   │   ├── database/   # 数据库访问层 (DAO)
│   │   │   ├── managers/   # 管理器类
│   │   │   ├── storage/    # 存储适配器
│   │   │   ├── types/      # TypeScript 类型定义
│   │   │   ├── utils/      # 工具函数
│   │   │   └── workers/    # Web Workers
│   │   ├── tests/          # 测试文件
│   │   └── package.json
│   ├── app/                # 用户端应用
│   │   ├── src/
│   │   │   ├── assets/     # 静态资源
│   │   │   ├── components/ # Vue 组件
│   │   │   ├── composables/# 组合式函数
│   │   │   ├── router/     # 路由配置
│   │   │   ├── stores/     # Pinia 状态管理
│   │   │   ├── views/      # 页面视图
│   │   │   ├── App.vue     # 根组件
│   │   │   └── main.ts     # 应用入口
│   │   ├── tests/          # 测试文件
│   │   ├── index.html      # HTML 模板
│   │   ├── vite.config.ts  # Vite 配置
│   │   └── package.json
│   ├── admin/              # 管理端应用
│   │   ├── src/            # 结构同 app
│   │   ├── tests/
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   └── package.json
│   ├── server/             # API 服务器
│   │   ├── src/
│   │   │   ├── index.ts    # 服务器入口
│   │   │   └── sqlite-database.ts
│   │   ├── data/           # 数据库文件
│   │   └── package.json
│   └── desktop/            # 桌面客户端 (Electron)
│       ├── src/
│       │   ├── main/       # 主进程代码
│       │   ├── preload/    # Preload 脚本
│       │   ├── renderer/   # 渲染进程代码
│       │   └── shared/     # 共享类型和常量
│       ├── resources/      # 应用资源（图标等）
│       ├── scripts/        # 构建脚本
│       └── package.json
├── scripts/
│   ├── dev.js              # 开发环境启动脚本
│   ├── build.js            # 生产构建脚本
│   └── release.js          # 版本发布脚本
├── docs/                   # 文档目录
├── .version/               # 版本历史
├── .gitignore
├── LICENSE                 # MIT 许可证
├── README.md               # 项目说明
├── 文档.md                 # 完整中文文档
├── package.json            # 根 package.json
└── pnpm-workspace.yaml     # pnpm workspace 配置
```

## 技术栈

### 核心框架
- **Vue 3.4.3** - 渐进式 JavaScript 框架
- **TypeScript 5.3.3** - 类型安全的 JavaScript 超集
- **Vite 5.0.10** - 下一代前端构建工具
- **Electron 28.1.0** - 跨平台桌面应用框架

### UI 和样式
- **Element Plus 2.5.1** - Vue 3 组件库（中文友好）
- **@element-plus/icons-vue** - Element Plus 图标库

### 状态管理和路由
- **Pinia 2.1.7** - Vue 3 官方状态管理库
- **Vue Router 4.2.5** - Vue 官方路由管理器

### 编辑器
- **TipTap 2.1.13** - 基于 ProseMirror 的富文本编辑器
- **lowlight 3.1.0** - 代码高亮库

### 数据存储
- **SQLite** - 服务器端数据库
- **better-sqlite3** - 高性能 SQLite 绑定
- **bcryptjs 2.4.3** - 密码加密库

### 桌面端
- **Electron 28.1.0** - 跨平台桌面应用框架
- **electron-builder 24.9.1** - Electron 应用打包工具
- **electron-updater 6.1.7** - 自动更新支持
- **keytar 7.9.0** - 系统安全凭证存储

### 测试
- **Vitest 1.1.0** - 基于 Vite 的单元测试框架
- **@vue/test-utils 2.4.3** - Vue 组件测试工具
- **jsdom 23.0.1** - JavaScript DOM 实现
- **fast-check 3.15.0** - 属性测试库

### 代码质量
- **ESLint 8.56.0** - JavaScript/TypeScript 代码检查
- **Prettier 3.1.1** - 代码格式化工具
- **@typescript-eslint** - TypeScript ESLint 插件

## 已配置功能

### 1. Monorepo 架构
- 使用 pnpm workspaces 管理多包项目
- 共享库可被两个应用引用
- 统一的依赖管理

### 2. 开发环境
- 用户端应用运行在 http://localhost:5173
- 管理端应用运行在 http://localhost:5174
- API 服务器运行在 http://localhost:5170
- 桌面端应用通过 Electron 运行
- 支持热模块替换（HMR）

### 3. 构建配置
- 生产环境优化
- 代码分割
- Source map 生成
- 分别构建两个应用

### 4. 代码规范
- ESLint 配置（TypeScript + Vue）
- Prettier 配置
- 最大行数限制（500 行）
- 统一的代码风格

### 5. 测试框架
- Vitest 单元测试
- Vue 组件测试支持
- fast-check 属性测试支持
- 测试覆盖率报告

### 6. 版本管理
- 语义化版本号（1.0.0）
- 统一的版本信息文件
- 版权信息管理

### 7. TypeScript 配置
- 严格模式
- 路径别名（@ 和 @shared）
- DOM 类型支持
- 模块解析优化

## 可用命令

### 开发
```bash
# 同时启动用户端和管理员端
pnpm dev

# 只启动用户端
pnpm --filter @cyp-memo/app dev

# 只启动管理员端
pnpm --filter @cyp-memo/admin dev
```

### 构建
```bash
# 构建所有应用
pnpm build

# 只构建用户端
pnpm --filter @cyp-memo/app build

# 只构建管理员端
pnpm --filter @cyp-memo/admin build

# 构建桌面端
pnpm --filter @cyp-memo/desktop build:all

# 构建桌面端（仅 Windows）
pnpm --filter @cyp-memo/desktop build:win

# 构建桌面端（仅 macOS）
pnpm --filter @cyp-memo/desktop build:mac

# 构建桌面端（仅 Linux）
pnpm --filter @cyp-memo/desktop build:linux
```

### 测试
```bash
# 运行所有测试
pnpm test

# 运行特定包的测试
pnpm --filter @cyp-memo/shared test
pnpm --filter @cyp-memo/app test
pnpm --filter @cyp-memo/admin test

# 监听模式
pnpm --filter @cyp-memo/shared test:watch
```

### 代码质量
```bash
# 运行 ESLint
pnpm lint

# 运行 Prettier
pnpm format
```

## 环境要求

- Node.js >= 18.0.0
- pnpm >= 8.0.0

## 下一步

项目已完成所有核心功能，可以进行以下操作：

1. **部署** - 使用 Docker 或传统方式部署
2. **定制** - 根据需求修改功能
3. **扩展** - 添加新的功能模块
4. **优化** - 性能调优和安全加固

## 许可证

MIT License - Copyright (c) 2026 CYP

## 作者

- **姓名**: CYP
- **邮箱**: nasDSSCYP@outlook.com
