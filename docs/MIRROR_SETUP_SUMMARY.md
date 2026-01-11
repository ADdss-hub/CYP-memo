# 🌐 国内镜像配置总结

> **基于实测数据选择最快镜像源** (2026-01-11)

## ✅ 最优配置方案

| 类型 | 最快镜像 | 响应时间 | 备选 |
|------|---------|----------|------|
| **NPM 生态** |
| NPM Registry | **华为云** | 330ms | cnpm 1603ms |
| Electron | **华为云** | 261ms | npmmirror 超时 |
| Electron Builder | **华为云** | 476ms | npmmirror 超时 |
| Better-SQLite3 | **华为云** | 496ms | npmmirror 超时 |
| Sharp | **华为云** | 455ms | npmmirror 超时 |
| Chromium/Puppeteer | **华为云** | 53ms | npmmirror 超时 |
| Node.js | **华为云** | 116ms | npmmirror 超时 |
| **Docker** |
| Docker Hub | **网易** | 5ms | 百度云 10ms |
| **Linux 软件源** |
| Alpine APK | **阿里云** | 108ms | 网易 199ms |
| Ubuntu APT | **阿里云** | 50ms | 华为云 67ms |

## ✅ 已配置的文件

| 文件 | 镜像源 | 状态 |
|------|--------|------|
| `.npmrc` | 华为云 (NPM/Electron/原生模块) | ✅ |
| `docker/Dockerfile` | 阿里云 (Alpine) + 华为云 (NPM) | ✅ |
| `docker/Dockerfile.dev` | 阿里云 (Alpine) + 华为云 (NPM) | ✅ |
| `.github/workflows/release.yml` | 阿里云 (Ubuntu) + 网易 (Docker) + 华为云 (NPM) | ✅ |
| `scripts/setup-mirrors.sh` | 华为云 | ✅ |
| `scripts/setup-mirrors.ps1` | 华为云 | ✅ |

---

## 📊 完整速度测试结果 (2026-01-11)

### NPM Registry

| 镜像源 | 响应时间 | 推荐 |
|--------|----------|------|
| **华为云** | 330ms | ⭐⭐⭐⭐⭐ |
| cnpm | 1603ms | ⭐⭐⭐ |
| npmmirror (淘宝) | 5026ms | ❌ 超时 |
| 腾讯云 | 5044ms | ❌ 超时 |
| yarn | 5082ms | ❌ 超时 |

### Electron / 原生模块 (华为云)

| 镜像类型 | 华为云 | npmmirror | 提升 |
|---------|--------|-----------|------|
| Electron | **261ms** | 5013ms | **19x** |
| Electron Builder | **476ms** | 5006ms | **10x** |
| Better-SQLite3 | **496ms** | 5014ms | **10x** |
| Sharp | **455ms** | 5007ms | **11x** |
| Chromium/Puppeteer | **53ms** | 5025ms | **95x** |
| Node.js | **116ms** | 5007ms | **43x** |

### Docker Hub

| 镜像源 | 响应时间 | 推荐 |
|--------|----------|------|
| **网易** | 5ms | ⭐⭐⭐⭐⭐ |
| 百度云 | 10ms | ⭐⭐⭐⭐⭐ |
| 中科大 | 55ms | ⭐⭐⭐⭐ |
| 华为云 | 217ms | ⭐⭐⭐ |
| DaoCloud | 419ms | ⭐⭐ |

### Alpine APK

| 镜像源 | 响应时间 | 推荐 |
|--------|----------|------|
| **阿里云** | 108ms | ⭐⭐⭐⭐⭐ |
| 网易 | 199ms | ⭐⭐⭐⭐ |
| 华为云 | 257ms | ⭐⭐⭐⭐ |
| 腾讯云 | 5020ms | ❌ 超时 |
| 中科大 | 5012ms | ❌ 超时 |
| 清华 | 5022ms | ❌ 超时 |

### Ubuntu APT

| 镜像源 | 响应时间 | 推荐 |
|--------|----------|------|
| **阿里云** | 50ms | ⭐⭐⭐⭐⭐ |
| 华为云 | 67ms | ⭐⭐⭐⭐⭐ |
| 网易 | 177ms | ⭐⭐⭐⭐ |
| 腾讯云 | 5014ms | ❌ 超时 |
| 中科大 | 5018ms | ❌ 超时 |

---

## 🚀 配置的镜像源

### NPM 生态 (华为云)

```properties
registry=https://repo.huaweicloud.com/repository/npm/
electron_mirror=https://repo.huaweicloud.com/electron/
electron_builder_binaries_mirror=https://repo.huaweicloud.com/electron-builder-binaries/
better_sqlite3_binary_host_mirror=https://repo.huaweicloud.com/better-sqlite3/
sharp_binary_host=https://repo.huaweicloud.com/sharp/
sharp_libvips_binary_host=https://repo.huaweicloud.com/sharp-libvips/
node_sqlite3_binary_host_mirror=https://repo.huaweicloud.com/node-sqlite3/
puppeteer_download_host=https://repo.huaweicloud.com/chromium-browser-snapshots/
```

### Docker (网易)

```json
{
  "registry-mirrors": [
    "https://hub-mirror.c.163.com",
    "https://mirror.baidubce.com"
  ]
}
```

### Alpine APK (阿里云)

```dockerfile
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories
```

### Ubuntu APT (阿里云)

```bash
sudo sed -i 's|http://archive.ubuntu.com|https://mirrors.aliyun.com|g' /etc/apt/sources.list
```

---

## 🎯 使用方法

```bash
# 克隆项目
git clone https://github.com/ADdss-hub/CYP-memo.git
cd CYP-memo

# 运行配置脚本
bash scripts/setup-mirrors.sh  # Linux/macOS
.\scripts\setup-mirrors.ps1    # Windows

# 安装依赖（自动使用最快镜像）
pnpm install
```

---

## 📚 相关资源

- [华为云镜像站](https://mirrors.huaweicloud.com/)
- [阿里云镜像站](https://developer.aliyun.com/mirror/)
- [网易镜像站](https://mirrors.163.com/)
- [npmmirror 镜像站](https://npmmirror.com/)

---

**最后更新**: 2026-01-11  
**维护者**: CYP <nasDSSCYP@outlook.com>
