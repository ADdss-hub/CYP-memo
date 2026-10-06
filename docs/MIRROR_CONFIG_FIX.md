# 镜像配置修复说明

## 🐛 问题描述

GitHub Actions 构建失败，错误信息：

```
npm error `electron_mirror` is not a valid npm option
npm error `electron_builder_binaries_mirror` is not a valid npm option
```

## 🔍 根本原因

在 `.github/workflows/release.yml` 和镜像配置脚本中，错误地使用了：

```bash
npm config set electron_mirror https://npmmirror.com/mirrors/electron/
npm config set electron_builder_binaries_mirror https://npmmirror.com/mirrors/electron-builder-binaries/
```

**问题**：`electron_mirror` 和 `electron_builder_binaries_mirror` 不是有效的 npm 配置选项。

## ✅ 正确的配置方法

### 方法 1: 使用 .npmrc 文件（项目级别）

在项目根目录的 `.npmrc` 文件中配置（已配置）：

```properties
electron_mirror=https://npmmirror.com/mirrors/electron/
electron_builder_binaries_mirror=https://npmmirror.com/mirrors/electron-builder-binaries/
```

### 方法 2: 使用环境变量（推荐用于 CI/CD）

```bash
# Linux/macOS
export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
export ELECTRON_BUILDER_BINARIES_MIRROR="https://npmmirror.com/mirrors/electron-builder-binaries/"

# Windows PowerShell
$env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
$env:ELECTRON_BUILDER_BINARIES_MIRROR = "https://npmmirror.com/mirrors/electron-builder-binaries/"
```

### 方法 3: 在命令中直接设置

```bash
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ pnpm install
```

## 🔧 已修复的文件

### 1. `.github/workflows/release.yml`

**修复前**：
```yaml
- name: Configure electron mirror (China)
  run: |
    npm config set electron_mirror https://npmmirror.com/mirrors/electron/
    npm config set electron_builder_binaries_mirror https://npmmirror.com/mirrors/electron-builder-binaries/

- name: Install dependencies
  run: pnpm install
```

**修复后**：
```yaml
- name: Install dependencies
  run: pnpm install
  env:
    ELECTRON_MIRROR: https://npmmirror.com/mirrors/electron/
    ELECTRON_BUILDER_BINARIES_MIRROR: https://npmmirror.com/mirrors/electron-builder-binaries/
```

### 2. `scripts/install/setup-mirrors.sh`

**修复前**：
```bash
npm config set electron_mirror https://npmmirror.com/mirrors/electron/
npm config set electron_builder_binaries_mirror https://npmmirror.com/mirrors/electron-builder-binaries/
```

**修复后**：
```bash
# 提示用户添加环境变量到 ~/.bashrc 或 ~/.zshrc
export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
export ELECTRON_BUILDER_BINARIES_MIRROR="https://npmmirror.com/mirrors/electron-builder-binaries/"
```

### 3. `scripts/install/setup-mirrors.ps1`

**修复前**：
```powershell
npm config set electron_mirror https://npmmirror.com/mirrors/electron/
npm config set electron_builder_binaries_mirror https://npmmirror.com/mirrors/electron-builder-binaries/
```

**修复后**：
```powershell
# 设置用户环境变量
[System.Environment]::SetEnvironmentVariable('ELECTRON_MIRROR', 'https://npmmirror.com/mirrors/electron/', 'User')
[System.Environment]::SetEnvironmentVariable('ELECTRON_BUILDER_BINARIES_MIRROR', 'https://npmmirror.com/mirrors/electron-builder-binaries/', 'User')
```

## 📊 影响范围

### 已修复
- ✅ GitHub Actions (Linux 构建)
- ✅ GitHub Actions (macOS 构建)
- ✅ GitHub Actions (Windows 构建)
- ✅ 本机联调脚本 (Linux/macOS)
- ✅ 本机联调脚本 (Windows)

### 无需修改
- ✅ `.npmrc` 文件（已正确配置）
- ✅ 发行包构建（使用 .npmrc）
- ✅ 本机联调（使用 .npmrc）

## 🧪 验证方法

### 本地验证

```bash
# 检查 .npmrc 配置
cat .npmrc | grep electron

# 测试安装
pnpm install

# 测试构建
pnpm build
```

### CI/CD 验证

推送代码后，检查 GitHub Actions 构建日志：

1. 不应再出现 "not a valid npm option" 错误
2. Electron 下载应该使用国内镜像
3. 构建速度应该明显提升

## 📚 相关文档

- [npm 配置文档](https://docs.npmjs.com/cli/v9/using-npm/config)
- [Electron 镜像配置](https://www.electronjs.org/docs/latest/tutorial/installation#mirror)
- [electron-builder 环境变量](https://www.electron.build/configuration/configuration#environment-variables)

## 🎯 最佳实践

1. **项目级别**：使用 `.npmrc` 文件（已配置）
2. **CI/CD**：使用环境变量（已修复）
3. **本机联调**：使用环境变量或依赖 `.npmrc`（已修复）
4. **不要使用**：`npm config set` 设置非标准选项 ❌

## 📝 注意事项

1. `.npmrc` 中的配置对项目内所有 npm/pnpm 命令有效
2. 环境变量优先级高于 `.npmrc`
3. GitHub Actions 中的环境变量只在当前 step 有效，需要在每个需要的 step 中设置
4. Windows 用户设置环境变量后需要重启终端

---

**修复日期**: 2026-01-11  
**修复人**: CYP  
**相关 Issue**: GitHub Actions 构建失败
