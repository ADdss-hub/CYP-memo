# @cyp-memo/desktop

CYP-memo 桌面客户端，基于 Electron 构建的跨平台桌面应用。

## 功能特性

- 🖥️ 跨平台支持 (Windows, macOS, Linux)
- 📌 系统托盘常驻
- ⌨️ 全局快捷键
- 📴 离线模式支持
- 🔔 系统通知
- 🔄 自动更新
- 🔒 安全凭证存储

## 本机联调（生产配置基准）

```bash
# 安装依赖
pnpm install

# 本机联调（HMR 工具链；APP_ENV 仍为 prod）
pnpm local

# 构建
pnpm build

# 打包
pnpm build:electron

# 测试
pnpm test
```

## 项目结构

```
packages/desktop/
├── src/
│   ├── main/           # 主进程代码
│   ├── preload/        # Preload 脚本
│   ├── renderer/       # 渲染进程代码
│   └── shared/         # 共享类型和常量
├── resources/          # 应用资源（图标等）
├── scripts/            # 构建脚本
└── tests/              # 测试文件
```

## 构建输出

- Windows: NSIS 安装程序 (.exe)
- macOS: DMG 安装包 (.dmg)
- Linux: AppImage 和 deb 包
