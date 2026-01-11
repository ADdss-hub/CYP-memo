# CYP-memo 桌面客户端构建指南

本文档介绍如何构建 CYP-memo 桌面客户端的各平台安装包。

## 前置要求

### 通用要求

- Node.js 18+
- pnpm 8+
- Git

### Windows 构建要求

- Windows 10/11
- Visual Studio Build Tools（用于编译原生模块）

### macOS 构建要求

- macOS 10.15+
- Xcode Command Line Tools
- Apple 开发者账号（用于代码签名和公证）

### Linux 构建要求

- Ubuntu 20.04+ 或其他主流发行版
- 必要的构建工具：`build-essential`、`libsecret-1-dev`

## 快速开始

```bash
# 安装依赖
pnpm install

# 构建所有平台（在当前平台上）
pnpm build:all

# 仅构建 Windows
pnpm build:win

# 仅构建 macOS
pnpm build:mac

# 仅构建 Linux
pnpm build:linux

# 构建便携版（Windows）
pnpm build:portable

# 打包但不创建安装程序（用于测试）
pnpm pack
```

## 图标准备

在构建之前，需要准备应用图标：

1. 创建一个 1024x1024 的 PNG 源图片
2. 将其保存为 `resources/icon-source.png`
3. 运行图标生成脚本：

```bash
pnpm generate-icons
```

4. 手动创建以下文件（或使用在线工具转换）：
   - `resources/icon.ico` - Windows 图标
   - `resources/icon.icns` - macOS 图标

推荐的在线转换工具：
- https://icoconvert.com/
- https://cloudconvert.com/

## 代码签名配置

### Windows 代码签名

设置以下环境变量：

```bash
# 证书文件路径（.pfx 或 .p12）
CSC_LINK=/path/to/certificate.pfx

# 证书密码
CSC_KEY_PASSWORD=your-password

# 或者使用 Windows 证书存储
WIN_CSC_LINK=your-certificate-thumbprint
```

### macOS 代码签名和公证

1. 在 Apple Developer 网站创建开发者证书
2. 将证书导入到 macOS 钥匙串
3. 设置以下环境变量：

```bash
# Apple 开发者账号
APPLE_ID=your-apple-id@example.com

# 应用专用密码（在 appleid.apple.com 生成）
APPLE_ID_PASSWORD=xxxx-xxxx-xxxx-xxxx

# 团队 ID
APPLE_TEAM_ID=XXXXXXXXXX

# 启用 CI 模式以触发公证
CI=true
```

生成应用专用密码：
1. 访问 https://appleid.apple.com/account/manage
2. 在"安全"部分选择"生成应用专用密码"

## 发布到 GitHub Releases

### 手动发布

```bash
# 发布正式版本
pnpm release

# 发布草稿版本
pnpm release:draft
```

### 自动发布（CI/CD）

设置 GitHub Actions 密钥：

```yaml
# .github/workflows/release.yml
env:
  GH_TOKEN: ${{ secrets.GH_TOKEN }}
  CSC_LINK: ${{ secrets.WIN_CSC_LINK }}
  CSC_KEY_PASSWORD: ${{ secrets.WIN_CSC_KEY_PASSWORD }}
  APPLE_ID: ${{ secrets.APPLE_ID }}
  APPLE_ID_PASSWORD: ${{ secrets.APPLE_ID_PASSWORD }}
  APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
```

## 构建输出

构建完成后，安装包将输出到 `release/{version}/` 目录：

```
release/
└── 1.7.10/
    ├── CYP-memo-1.7.10-setup.exe          # Windows NSIS 安装程序
    ├── CYP-memo-1.7.10-portable.exe       # Windows 便携版
    ├── CYP-memo-1.7.10.dmg                # macOS DMG
    ├── CYP-memo-1.7.10-mac.zip            # macOS ZIP
    ├── CYP-memo-1.7.10.AppImage           # Linux AppImage
    ├── cyp-memo_1.7.10_amd64.deb          # Debian/Ubuntu 包
    ├── cyp-memo-1.7.10.x86_64.rpm         # Fedora/RHEL 包
    ├── CYP-memo-1.7.10.tar.gz             # Linux 压缩包
    └── latest.yml                          # 自动更新元数据
```

## 自动更新配置

应用使用 GitHub Releases 作为更新服务器。发布新版本时：

1. 更新 `package.json` 中的版本号
2. 创建并推送 Git 标签：
   ```bash
   git tag v1.8.0
   git push origin v1.8.0
   ```
3. GitHub Actions 会自动构建并发布到 Releases
4. electron-updater 会自动生成 `latest.yml`、`latest-mac.yml`、`latest-linux.yml` 文件
5. 用户的应用会自动检测并下载更新

### 更新文件说明

| 文件 | 平台 | 说明 |
|------|------|------|
| `latest.yml` | Windows | Windows 更新元数据 |
| `latest-mac.yml` | macOS | macOS 更新元数据 |
| `latest-linux.yml` | Linux | Linux 更新元数据 |
| `*.blockmap` | 所有 | 增量更新差异文件 |

### 自定义更新服务器

如果需要使用自托管的更新服务器，修改 `electron-builder.config.js`：

```javascript
publish: {
  provider: 'generic',
  url: 'https://your-update-server.com/releases/',
}
```

或者在运行时通过 `update-config.ts` 配置：

```typescript
import { setCustomUpdateServer } from './update-config'

// 设置自定义更新服务器
setCustomUpdateServer('https://your-update-server.com/releases/')
```

### 更新服务器要求

自托管更新服务器需要：

1. 支持 HTTPS
2. 提供以下文件：
   - `latest.yml` / `latest-mac.yml` / `latest-linux.yml`
   - 安装包文件（.exe, .dmg, .AppImage 等）
   - 可选：`.blockmap` 文件（用于增量更新）

3. 正确设置 CORS 头（如果跨域访问）

### 增量更新

electron-updater 支持增量更新，只下载变化的部分：

1. 构建时会自动生成 `.blockmap` 文件
2. 更新时会比较 blockmap 并只下载差异
3. 可显著减少更新下载大小

要启用增量更新，确保 `electron-builder.config.js` 中：

```javascript
generateUpdatesFilesForAllChannels: true
```

## 故障排除

### Windows 构建失败

1. 确保安装了 Visual Studio Build Tools
2. 运行 `npm config set msvs_version 2022`
3. 清理并重新安装依赖：`rm -rf node_modules && pnpm install`

### macOS 公证失败

1. 检查 Apple ID 和应用专用密码是否正确
2. 确保证书未过期
3. 查看详细日志：`DEBUG=electron-notarize* pnpm build:mac`

### Linux 构建失败

1. 安装必要的依赖：
   ```bash
   sudo apt-get install build-essential libsecret-1-dev
   ```
2. 如果 keytar 编译失败，尝试：
   ```bash
   sudo apt-get install libsecret-1-dev
   ```

### 原生模块问题

如果 better-sqlite3 或 keytar 出现问题：

```bash
# 重新编译原生模块
pnpm rebuild

# 或者针对 Electron 重新编译
./node_modules/.bin/electron-rebuild
```

## 相关文档

- [electron-builder 文档](https://www.electron.build/)
- [electron-updater 文档](https://www.electron.build/auto-update)
- [Apple 公证文档](https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution)
