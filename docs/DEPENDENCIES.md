# CYP-memo 开源依赖列表

本文档列出了 CYP-memo 项目使用的所有开源依赖及其许可证信息。

## 核心依赖

### 前端框架

| 依赖 | 版本 | 许可证 | 说明 |
|------|------|--------|------|
| [Vue 3](https://vuejs.org/) | ^3.4.3 | MIT | 渐进式 JavaScript 框架 |
| [TypeScript](https://www.typescriptlang.org/) | ^5.3.3 | Apache-2.0 | JavaScript 的超集，添加类型系统 |
| [Vite](https://vitejs.dev/) | ^5.0.10 | MIT | 下一代前端构建工具 |

### 桌面端框架

| 依赖 | 版本 | 许可证 | 说明 |
|------|------|--------|------|
| [Electron](https://www.electronjs.org/) | ^28.1.0 | MIT | 跨平台桌面应用框架 |
| [electron-builder](https://www.electron.build/) | ^24.9.1 | MIT | Electron 应用打包工具 |
| [electron-updater](https://www.electron.build/auto-update) | ^6.1.7 | MIT | Electron 自动更新 |
| [keytar](https://github.com/atom/node-keytar) | ^7.9.0 | MIT | 系统安全凭证存储 |
| [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) | ^9.2.2 | MIT | 高性能 SQLite 绑定 |

### UI 组件库

| 依赖 | 版本 | 许可证 | 说明 |
|------|------|--------|------|
| [Element Plus](https://element-plus.org/) | ^2.5.1 | MIT | Vue 3 组件库 |
| [@element-plus/icons-vue](https://github.com/element-plus/element-plus-icons) | ^2.3.1 | MIT | Element Plus 图标库 |

### 富文本编辑器

| 依赖 | 版本 | 许可证 | 说明 |
|------|------|--------|------|
| [TipTap](https://tiptap.dev/) | ^2.1.13 | MIT | 无头富文本编辑器框架 |
| @tiptap/starter-kit | ^2.1.13 | MIT | TipTap 基础扩展包 |
| @tiptap/extension-underline | ^2.27.2 | MIT | 下划线扩展 |
| @tiptap/extension-link | ^2.1.13 | MIT | 链接扩展 |
| @tiptap/extension-image | ^2.1.13 | MIT | 图片扩展 |
| @tiptap/extension-placeholder | ^2.1.13 | MIT | 占位符扩展 |
| @tiptap/extension-code-block-lowlight | ^2.1.13 | MIT | 代码高亮扩展 |
| @tiptap/vue-3 | ^2.1.13 | MIT | TipTap Vue 3 集成 |
| [lowlight](https://github.com/wooorm/lowlight) | ^3.1.0 | MIT | 代码语法高亮库 |

### 状态管理和路由

| 依赖 | 版本 | 许可证 | 说明 |
|------|------|--------|------|
| [Pinia](https://pinia.vuejs.org/) | ^2.1.7 | MIT | Vue 状态管理库 |
| [Vue Router](https://router.vuejs.org/) | ^4.2.5 | MIT | Vue 官方路由库 |

### 数据存储

| 依赖 | 版本 | 许可证 | 说明 |
|------|------|--------|------|
| [Dexie.js](https://dexie.org/) | ^3.2.4 | Apache-2.0 | IndexedDB 封装库 |

### 加密和安全

| 依赖 | 版本 | 许可证 | 说明 |
|------|------|--------|------|
| [bcryptjs](https://github.com/dcodeIO/bcrypt.js) | ^2.4.3 | MIT | 密码哈希库 |

### 图表库

| 依赖 | 版本 | 许可证 | 说明 |
|------|------|--------|------|
| [Chart.js](https://www.chartjs.org/) | ^4.5.1 | MIT | JavaScript 图表库 |
| [vue-chartjs](https://vue-chartjs.org/) | ^5.3.3 | MIT | Chart.js 的 Vue 封装 |

## 开发依赖

### 测试框架

| 依赖 | 版本 | 许可证 | 说明 |
|------|------|--------|------|
| [Vitest](https://vitest.dev/) | ^1.1.0 | MIT | Vite 原生测试框架 |
| [@vue/test-utils](https://test-utils.vuejs.org/) | ^2.4.3 | MIT | Vue 组件测试工具 |
| [jsdom](https://github.com/jsdom/jsdom) | ^23.0.1 | MIT | JavaScript DOM 实现 |
| [fast-check](https://github.com/dubzzz/fast-check) | ^3.15.0 | MIT | 属性测试库 |
| [fake-indexeddb](https://github.com/dumbmatter/fakeIndexedDB) | ^6.2.5 | Apache-2.0 | IndexedDB 模拟库（测试用） |

### 代码质量工具

| 依赖 | 版本 | 许可证 | 说明 |
|------|------|--------|------|
| [ESLint](https://eslint.org/) | ^8.56.0 | MIT | JavaScript 代码检查工具 |
| [Prettier](https://prettier.io/) | ^3.1.1 | MIT | 代码格式化工具 |
| [@typescript-eslint/eslint-plugin](https://typescript-eslint.io/) | ^6.15.0 | MIT | TypeScript ESLint 插件 |
| [@typescript-eslint/parser](https://typescript-eslint.io/) | ^6.15.0 | BSD-2-Clause | TypeScript ESLint 解析器 |
| [eslint-plugin-vue](https://eslint.vuejs.org/) | ^9.19.2 | MIT | Vue ESLint 插件 |

### 构建工具

| 依赖 | 版本 | 许可证 | 说明 |
|------|------|--------|------|
| [@vitejs/plugin-vue](https://github.com/vitejs/vite-plugin-vue) | ^5.0.2 | MIT | Vite Vue 插件 |
| [vue-tsc](https://github.com/vuejs/language-tools) | ^1.8.27 | MIT | Vue TypeScript 编译器 |
| [concurrently](https://github.com/open-cli-tools/concurrently) | ^8.2.2 | MIT | 并发运行多个命令 |

### 类型定义

| 依赖 | 版本 | 许可证 | 说明 |
|------|------|--------|------|
| [@types/bcryptjs](https://www.npmjs.com/package/@types/bcryptjs) | ^2.4.6 | MIT | bcryptjs 类型定义 |
| [@types/node](https://www.npmjs.com/package/@types/node) | ^20.10.5 | MIT | Node.js 类型定义 |
| [@vue/tsconfig](https://github.com/vuejs/tsconfig) | ^0.5.1 | MIT | Vue TypeScript 配置 |

## 许可证兼容性

所有依赖的许可证都与 MIT 许可证兼容：

- **MIT License**: 最宽松的开源许可证，允许商业使用、修改、分发
- **Apache-2.0**: 类似 MIT，但提供专利授权保护
- **BSD-2-Clause**: 简化的 BSD 许可证，与 MIT 类似

## 许可证说明

### MIT License

MIT 许可证是最流行的开源许可证之一，特点：

- ✅ 允许商业使用
- ✅ 允许修改
- ✅ 允许分发
- ✅ 允许私有使用
- ⚠️ 需要包含许可证和版权声明
- ⚠️ 不提供责任保证

### Apache License 2.0

Apache 2.0 许可证特点：

- ✅ 允许商业使用
- ✅ 允许修改
- ✅ 允许分发
- ✅ 允许专利使用
- ⚠️ 需要包含许可证和版权声明
- ⚠️ 需要说明修改内容
- ⚠️ 不提供责任保证

### BSD 2-Clause License

BSD 2-Clause 许可证特点：

- ✅ 允许商业使用
- ✅ 允许修改
- ✅ 允许分发
- ⚠️ 需要包含许可证和版权声明
- ⚠️ 不提供责任保证

## 依赖更新

建议定期检查和更新依赖：

```bash
# 检查过期的依赖
pnpm outdated

# 更新依赖
pnpm update

# 更新到最新版本（谨慎使用）
pnpm update --latest
```

## 安全审计

定期运行安全审计：

```bash
# 检查已知的安全漏洞
pnpm audit

# 自动修复安全问题
pnpm audit --fix
```

## 致谢

感谢所有开源项目的贡献者，是你们的无私奉献让这个项目成为可能。

## 许可证合规

本项目遵守所有依赖的许可证要求：

1. 所有依赖的许可证文件都包含在 `node_modules` 中
2. 本项目的 LICENSE 文件使用 MIT 许可证
3. 所有源代码文件都包含版权声明
4. README 文件列出了主要依赖和许可证信息

## 联系方式

如有任何许可证相关问题，请联系：

- **作者**: CYP
- **邮箱**: nasDSSCYP@outlook.com

---

最后更新: 2026-01-11
