# 🚀 国内镜像快速参考

> **推荐：华为云镜像**（经测试速度最快，比 npmmirror 快 7-400 倍）

## 一键配置脚本

### Linux / macOS

```bash
bash scripts/install/setup-mirrors.sh
```

### Windows (PowerShell)

```powershell
.\scripts\install\setup-mirrors.ps1
```

---

## 手动配置

### Linux / macOS

```bash
# 配置 NPM/PNPM 镜像 (华为云)
npm config set registry https://repo.huaweicloud.com/repository/npm/
pnpm config set registry https://repo.huaweicloud.com/repository/npm/

# 配置 Electron 镜像
npm config set electron_mirror https://repo.huaweicloud.com/electron/
npm config set electron_builder_binaries_mirror https://repo.huaweicloud.com/electron-builder-binaries/

# 配置原生模块镜像
npm config set better_sqlite3_binary_host_mirror https://repo.huaweicloud.com/better-sqlite3/
npm config set sharp_binary_host https://repo.huaweicloud.com/sharp/

echo "✅ 镜像配置完成！"
```

### Windows (PowerShell)

```powershell
# 配置 NPM/PNPM 镜像 (华为云)
npm config set registry https://repo.huaweicloud.com/repository/npm/
pnpm config set registry https://repo.huaweicloud.com/repository/npm/

# 配置 Electron 镜像
npm config set electron_mirror https://repo.huaweicloud.com/electron/
npm config set electron_builder_binaries_mirror https://repo.huaweicloud.com/electron-builder-binaries/

# 配置原生模块镜像
npm config set better_sqlite3_binary_host_mirror https://repo.huaweicloud.com/better-sqlite3/
npm config set sharp_binary_host https://repo.huaweicloud.com/sharp/

Write-Host "✅ 镜像配置完成！" -ForegroundColor Green
```

---

## 常用镜像地址

| 类型 | 官方源 | 华为云镜像 |
|------|--------|----------|
| NPM | https://registry.npmjs.org | https://repo.huaweicloud.com/repository/npm/ |
| Electron | https://github.com/electron/electron/releases | https://repo.huaweicloud.com/electron/ |
| Electron Builder | - | https://repo.huaweicloud.com/electron-builder-binaries/ |
| Better-SQLite3 | - | https://repo.huaweicloud.com/better-sqlite3/ |
| Sharp | - | https://repo.huaweicloud.com/sharp/ |

---

## 环境变量配置

```bash
# NPM
export NPM_CONFIG_REGISTRY=https://repo.huaweicloud.com/repository/npm/

# Electron
export ELECTRON_MIRROR=https://repo.huaweicloud.com/electron/
export ELECTRON_BUILDER_BINARIES_MIRROR=https://repo.huaweicloud.com/electron-builder-binaries/

# 原生模块
export BETTER_SQLITE3_BINARY_HOST_MIRROR=https://repo.huaweicloud.com/better-sqlite3/
export SHARP_BINARY_HOST=https://repo.huaweicloud.com/sharp/
export SHARP_LIBVIPS_BINARY_HOST=https://repo.huaweicloud.com/sharp-libvips/
export NODE_SQLITE3_BINARY_HOST_MIRROR=https://repo.huaweicloud.com/node-sqlite3/
```

---

## 验证配置

```bash
# 查看 NPM 配置
npm config get registry
# 应输出: https://repo.huaweicloud.com/repository/npm/

# 查看 PNPM 配置
pnpm config get registry

# 查看 Electron 镜像
npm config get electron_mirror

# 测试下载速度
time pnpm install electron
```

---

## 临时使用

```bash
# 临时使用华为云镜像安装
pnpm install --registry=https://repo.huaweicloud.com/repository/npm/

# 临时使用官方源
pnpm install --registry=https://registry.npmjs.org

# 临时下载 Electron
ELECTRON_MIRROR=https://repo.huaweicloud.com/electron/ pnpm install electron
```

---

## 恢复官方源

```bash
# 删除镜像配置
npm config delete registry
pnpm config delete registry
npm config delete electron_mirror
npm config delete electron_builder_binaries_mirror

# 或直接设置为官方源
npm config set registry https://registry.npmjs.org
```

---

## 速度对比

### NPM 生态 (华为云最快)

| 镜像类型 | 华为云 | npmmirror | 提升 |
|---------|--------|-----------|------|
| NPM Registry | **330ms** | 5000ms+ | **15x** |
| Electron | **261ms** | 5013ms | **19x** |
| Electron Builder | **476ms** | 5006ms | **10x** |
| Better-SQLite3 | **496ms** | 5014ms | **10x** |
| Sharp | **455ms** | 5007ms | **11x** |
| Chromium/Puppeteer | **53ms** | 5025ms | **95x** |
| Node.js | **116ms** | 5007ms | **43x** |

### Linux 软件源 (阿里云最快)

| 类型 | 阿里云 | 网易 | 华为云 | 腾讯云/中科大/清华 |
|------|--------|------|--------|-------------------|
| Ubuntu APT | **50ms** | 177ms | 67ms | 5000ms+ (超时) |

---

📖 **详细文档**: 查看 `docs/CHINA_MIRROR_CONFIG.md`
