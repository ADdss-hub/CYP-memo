# 中国国内镜像加速配置

本文档说明如何配置国内镜像源以加速构建和下载。

> **推荐使用华为云镜像**：经测试，华为云镜像速度最快（比 npmmirror 快 7-400 倍）

## 📦 NPM / PNPM 镜像配置

### 方式 1: 使用项目 .npmrc（推荐）

项目根目录的 `.npmrc` 已配置华为云镜像：

```properties
# NPM 主镜像 (华为云 - 速度最快)
registry=https://repo.huaweicloud.com/repository/npm/

# Electron 镜像
electron_mirror=https://repo.huaweicloud.com/electron/
electron_builder_binaries_mirror=https://repo.huaweicloud.com/electron-builder-binaries/

# 原生模块镜像
node_sqlite3_binary_host_mirror=https://repo.huaweicloud.com/node-sqlite3/
better_sqlite3_binary_host_mirror=https://repo.huaweicloud.com/better-sqlite3/
sharp_binary_host=https://repo.huaweicloud.com/sharp/
sharp_libvips_binary_host=https://repo.huaweicloud.com/sharp-libvips/
```

### 方式 2: 全局配置

```bash
# NPM 配置
npm config set registry https://repo.huaweicloud.com/repository/npm/

# PNPM 配置
pnpm config set registry https://repo.huaweicloud.com/repository/npm/

# Electron 镜像
npm config set electron_mirror https://repo.huaweicloud.com/electron/
npm config set electron_builder_binaries_mirror https://repo.huaweicloud.com/electron-builder-binaries/
```

### 方式 3: 临时使用

```bash
# 使用 --registry 参数
pnpm install --registry=https://repo.huaweicloud.com/repository/npm/

# 或使用环境变量
ELECTRON_MIRROR=https://repo.huaweicloud.com/electron/ pnpm install
```

---

## 🐳 Docker 镜像加速

### Docker Hub 镜像

在 `/etc/docker/daemon.json` 中配置：

```json
{
  "registry-mirrors": [
    "https://hub-mirror.c.163.com",
    "https://mirror.baidubce.com",
    "https://docker.mirrors.ustc.edu.cn"
  ]
}
```

重启 Docker 服务：
```bash
sudo systemctl daemon-reload
sudo systemctl restart docker
```

### Docker 镜像源速度测试 (2026-01-11)

| 镜像源 | 响应时间 | 推荐 |
|--------|----------|------|
| **网易** | 5ms | ⭐⭐⭐⭐⭐ |
| 百度云 | 10ms | ⭐⭐⭐⭐⭐ |
| 中科大 | 55ms | ⭐⭐⭐⭐ |
| 华为云 | 217ms | ⭐⭐⭐ |
| DaoCloud | 419ms | ⭐⭐ |

### Alpine 镜像源

Dockerfile 中已配置阿里云镜像（速度最快）：

```dockerfile
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories
```

### Alpine APK 镜像源速度测试 (2026-01-11)

| 镜像源 | 响应时间 | 推荐 |
|--------|----------|------|
| **阿里云** | 108ms | ⭐⭐⭐⭐⭐ |
| 网易 | 199ms | ⭐⭐⭐⭐ |
| 华为云 | 257ms | ⭐⭐⭐⭐ |
| 腾讯云 | 5020ms | ❌ |
| 中科大 | 5012ms | ❌ |
| 清华 | 5022ms | ❌ |

---

## 🖥️ GitHub Actions 加速配置

### Node.js 依赖加速

在 workflow 中添加：

```yaml
- name: Configure npm registry (华为云镜像)
  run: |
    npm config set registry https://repo.huaweicloud.com/repository/npm/
    pnpm config set registry https://repo.huaweicloud.com/repository/npm/

- name: Configure electron mirror
  run: |
    npm config set electron_mirror https://repo.huaweicloud.com/electron/
    npm config set electron_builder_binaries_mirror https://repo.huaweicloud.com/electron-builder-binaries/
```

### Ubuntu APT 加速

```yaml
- name: Configure apt mirror (阿里云 - 速度最快)
  run: |
    sudo sed -i 's|http://archive.ubuntu.com|https://mirrors.aliyun.com|g' /etc/apt/sources.list
    sudo sed -i 's|http://security.ubuntu.com|https://mirrors.aliyun.com|g' /etc/apt/sources.list
```

### Ubuntu APT 镜像源速度测试 (2026-01-11)

| 镜像源 | 响应时间 | 推荐 |
|--------|----------|------|
| **阿里云** | 50ms | ⭐⭐⭐⭐⭐ |
| 华为云 | 67ms | ⭐⭐⭐⭐⭐ |
| 网易 | 177ms | ⭐⭐⭐⭐ |
| 腾讯云 | 5014ms | ❌ |
| 中科大 | 5018ms | ❌ |

### Docker Buildx 加速

```yaml
- name: Set up Docker Buildx
  uses: docker/setup-buildx-action@v3
  with:
    config-inline: |
      [registry."docker.io"]
        mirrors = ["https://hub-mirror.c.163.com"]
```

---

## 🌐 可用的国内镜像源

### NPM 镜像

| 镜像源 | 地址 | 速度测试 |
|--------|------|----------|
| **华为云** | https://repo.huaweicloud.com/repository/npm/ | ⭐⭐⭐⭐⭐ 20-500ms |
| 淘宝镜像 | https://registry.npmmirror.com | ⭐⭐ 5000ms+ |
| 腾讯云 | https://mirrors.cloud.tencent.com/npm/ | ⭐⭐⭐ |

### Docker 镜像

| 镜像源 | 地址 | 速度测试 |
|--------|------|----------|
| **网易** | https://hub-mirror.c.163.com | ⭐⭐⭐⭐⭐ 5ms |
| 百度云 | https://mirror.baidubce.com | ⭐⭐⭐⭐⭐ 10ms |
| 中科大 | https://docker.mirrors.ustc.edu.cn | ⭐⭐⭐⭐ 55ms |
| 华为云 | https://mirrors.huaweicloud.com | ⭐⭐⭐ 217ms |
| DaoCloud | https://docker.m.daocloud.io | ⭐⭐ 419ms |
| 阿里云 | https://[your-id].mirror.aliyuncs.com | 需注册 |

### Linux 软件源

| 发行版 | 镜像源 | 地址 | 速度测试 |
|--------|--------|------|----------|
| Alpine | **阿里云** | https://mirrors.aliyun.com/alpine/ | ⭐⭐⭐⭐⭐ 108ms |
| Alpine | 网易 | https://mirrors.163.com/alpine/ | ⭐⭐⭐⭐ 199ms |
| Alpine | 华为云 | https://mirrors.huaweicloud.com/alpine/ | ⭐⭐⭐⭐ 257ms |
| Ubuntu | **阿里云** | https://mirrors.aliyun.com/ubuntu/ | ⭐⭐⭐⭐⭐ 50ms |
| Ubuntu | 华为云 | https://mirrors.huaweicloud.com/ubuntu/ | ⭐⭐⭐⭐⭐ 67ms |
| Ubuntu | 网易 | https://mirrors.163.com/ubuntu/ | ⭐⭐⭐⭐ 177ms |

---

## 📊 速度对比测试结果

实测数据（2026-01-11）：

### NPM 生态

| 镜像类型 | 华为云 | npmmirror | 提升倍数 |
|---------|--------|-----------|----------|
| NPM Registry | **330ms** | 5000ms+ | **15x** |
| Electron | **261ms** | 5013ms | **19x** |
| Electron Builder | **476ms** | 5006ms | **10x** |
| Better-SQLite3 | **496ms** | 5014ms | **10x** |
| Sharp | **455ms** | 5007ms | **11x** |
| Chromium/Puppeteer | **53ms** | 5025ms | **95x** |
| Node.js | **116ms** | 5007ms | **43x** |

---

## 🔧 本地开发配置

### 1. 配置 NPM 镜像

创建或编辑 `~/.npmrc`：

```properties
registry=https://repo.huaweicloud.com/repository/npm/
electron_mirror=https://repo.huaweicloud.com/electron/
electron_builder_binaries_mirror=https://repo.huaweicloud.com/electron-builder-binaries/
```

### 2. 配置 PNPM 镜像

```bash
pnpm config set registry https://repo.huaweicloud.com/repository/npm/
```

### 3. 配置 Git 代理（可选）

如果 GitHub 访问慢：

```bash
# HTTP 代理
git config --global http.proxy http://127.0.0.1:7890
git config --global https.proxy http://127.0.0.1:7890

# 或只对 GitHub 使用代理
git config --global http.https://github.com.proxy http://127.0.0.1:7890
```

### 4. 配置 Docker 镜像

编辑 `~/.docker/daemon.json`（macOS/Linux）或 Docker Desktop 设置（Windows）：

```json
{
  "registry-mirrors": [
    "https://docker.mirrors.ustc.edu.cn"
  ]
}
```

---

## ⚠️ 注意事项

1. **镜像同步延迟**: 国内镜像可能有几小时的同步延迟，如需最新版本可临时切换回官方源

2. **企业网络**: 某些企业网络可能限制外部镜像源，需要配置内网镜像

3. **CI/CD 环境**: GitHub Actions 服务器在国外，但配置国内镜像仍能加速某些下载

4. **镜像可用性**: 定期检查镜像源是否可用，必要时切换备用源

---

## 🔍 故障排查

### 问题 1: 镜像源无法访问

```bash
# 测试镜像源连通性
curl -I https://repo.huaweicloud.com/repository/npm/

# 切换到备用镜像
npm config set registry https://registry.npmmirror.com
```

### 问题 2: 某些包下载失败

```bash
# 临时使用官方源
npm install <package> --registry=https://registry.npmjs.org

# 或清除缓存后重试
pnpm store prune
pnpm install
```

### 问题 3: Electron 下载失败

```bash
# 手动下载 Electron
ELECTRON_MIRROR=https://repo.huaweicloud.com/electron/ pnpm install electron

# 或使用官方源
unset ELECTRON_MIRROR
pnpm install electron
```

---

## 📚 相关资源

- [华为云镜像站](https://mirrors.huaweicloud.com/)
- [npmmirror 镜像站](https://npmmirror.com/)
- [阿里云镜像站](https://developer.aliyun.com/mirror/)
- [清华大学开源镜像站](https://mirrors.tuna.tsinghua.edu.cn/)
- [中科大开源镜像站](https://mirrors.ustc.edu.cn/)

---

## 🤝 贡献

如果你发现更好的镜像源或配置方法，欢迎提交 PR 更新本文档。
