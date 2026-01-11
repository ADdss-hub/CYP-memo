# 🚀 国内镜像快速参考

## 一键配置脚本

### Linux / macOS

```bash
#!/bin/bash
# 配置 NPM 镜像
npm config set registry https://registry.npmmirror.com
pnpm config set registry https://registry.npmmirror.com

# 配置 Electron 镜像
npm config set electron_mirror https://npmmirror.com/mirrors/electron/
npm config set electron_builder_binaries_mirror https://npmmirror.com/mirrors/electron-builder-binaries/

# 配置原生模块镜像
npm config set better_sqlite3_binary_host_mirror https://npmmirror.com/mirrors/better-sqlite3/
npm config set sharp_binary_host https://npmmirror.com/mirrors/sharp/

echo "✅ 镜像配置完成！"
```

### Windows (PowerShell)

```powershell
# 配置 NPM 镜像
npm config set registry https://registry.npmmirror.com
pnpm config set registry https://registry.npmmirror.com

# 配置 Electron 镜像
npm config set electron_mirror https://npmmirror.com/mirrors/electron/
npm config set electron_builder_binaries_mirror https://npmmirror.com/mirrors/electron-builder-binaries/

# 配置原生模块镜像
npm config set better_sqlite3_binary_host_mirror https://npmmirror.com/mirrors/better-sqlite3/
npm config set sharp_binary_host https://npmmirror.com/mirrors/sharp/

Write-Host "✅ 镜像配置完成！" -ForegroundColor Green
```

---

## 常用镜像地址

| 类型 | 官方源 | 国内镜像 |
|------|--------|----------|
| NPM | https://registry.npmjs.org | https://registry.npmmirror.com |
| Electron | https://github.com/electron/electron/releases | https://npmmirror.com/mirrors/electron/ |
| Docker Hub | https://registry-1.docker.io | https://docker.mirrors.ustc.edu.cn |
| Alpine APK | http://dl-cdn.alpinelinux.org | https://mirrors.aliyun.com/alpine/ |
| Ubuntu APT | http://archive.ubuntu.com | https://mirrors.aliyun.com/ubuntu/ |

---

## 环境变量配置

```bash
# NPM
export NPM_CONFIG_REGISTRY=https://registry.npmmirror.com

# Electron
export ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
export ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/

# 原生模块
export BETTER_SQLITE3_BINARY_HOST_MIRROR=https://npmmirror.com/mirrors/better-sqlite3/
export SHARP_BINARY_HOST=https://npmmirror.com/mirrors/sharp/
```

---

## Docker 镜像配置

### daemon.json

```json
{
  "registry-mirrors": [
    "https://docker.mirrors.ustc.edu.cn",
    "https://hub-mirror.c.163.com"
  ]
}
```

### 位置
- Linux: `/etc/docker/daemon.json`
- macOS: `~/.docker/daemon.json`
- Windows: Docker Desktop 设置 → Docker Engine

---

## 验证配置

```bash
# 查看 NPM 配置
npm config get registry

# 查看 PNPM 配置
pnpm config get registry

# 测试下载速度
time pnpm install electron

# 查看 Docker 镜像
docker info | grep -A 5 "Registry Mirrors"
```

---

## 临时使用

```bash
# 临时使用国内镜像安装
pnpm install --registry=https://registry.npmmirror.com

# 临时使用官方源
pnpm install --registry=https://registry.npmjs.org

# 临时下载 Electron
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ pnpm install electron
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

📖 **详细文档**: 查看 `docs/CHINA_MIRROR_CONFIG.md`
