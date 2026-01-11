# 中国国内镜像加速配置

本文档说明如何配置国内镜像源以加速构建和下载。

## 📦 NPM / PNPM 镜像配置

### 方式 1: 使用项目 .npmrc（推荐）

项目根目录的 `.npmrc` 已配置国内镜像：

```properties
# NPM 主镜像
registry=https://registry.npmmirror.com

# Electron 镜像
electron_mirror=https://npmmirror.com/mirrors/electron/
electron_builder_binaries_mirror=https://npmmirror.com/mirrors/electron-builder-binaries/

# 原生模块镜像
node_sqlite3_binary_host_mirror=https://npmmirror.com/mirrors/sqlite3/
better_sqlite3_binary_host_mirror=https://npmmirror.com/mirrors/better-sqlite3/
sharp_binary_host=https://npmmirror.com/mirrors/sharp/
sharp_libvips_binary_host=https://npmmirror.com/mirrors/sharp-libvips/
```

### 方式 2: 全局配置

```bash
# NPM 配置
npm config set registry https://registry.npmmirror.com

# PNPM 配置
pnpm config set registry https://registry.npmmirror.com

# Electron 镜像
npm config set electron_mirror https://npmmirror.com/mirrors/electron/
npm config set electron_builder_binaries_mirror https://npmmirror.com/mirrors/electron-builder-binaries/
```

### 方式 3: 临时使用

```bash
# 使用 --registry 参数
pnpm install --registry=https://registry.npmmirror.com

# 或使用环境变量
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ pnpm install
```

---

## 🐳 Docker 镜像加速

### Docker Hub 镜像

在 `/etc/docker/daemon.json` 中配置：

```json
{
  "registry-mirrors": [
    "https://docker.mirrors.ustc.edu.cn",
    "https://hub-mirror.c.163.com",
    "https://mirror.baidubce.com"
  ]
}
```

重启 Docker 服务：
```bash
sudo systemctl daemon-reload
sudo systemctl restart docker
```

### Alpine 镜像源

Dockerfile 中已配置阿里云镜像：

```dockerfile
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories
```

---

## 🖥️ GitHub Actions 加速配置

### Node.js 依赖加速

在 workflow 中添加：

```yaml
- name: Configure npm registry (China mirror)
  run: |
    npm config set registry https://registry.npmmirror.com
    pnpm config set registry https://registry.npmmirror.com

- name: Configure electron mirror (China)
  run: |
    npm config set electron_mirror https://npmmirror.com/mirrors/electron/
    npm config set electron_builder_binaries_mirror https://npmmirror.com/mirrors/electron-builder-binaries/
```

### Ubuntu APT 加速

```yaml
- name: Configure apt mirror (China)
  run: |
    sudo sed -i 's|http://archive.ubuntu.com|https://mirrors.aliyun.com|g' /etc/apt/sources.list
    sudo sed -i 's|http://security.ubuntu.com|https://mirrors.aliyun.com|g' /etc/apt/sources.list
```

### Docker Buildx 加速

```yaml
- name: Set up Docker Buildx
  uses: docker/setup-buildx-action@v3
  with:
    config-inline: |
      [registry."docker.io"]
        mirrors = ["https://docker.mirrors.ustc.edu.cn"]
```

---

## 🌐 可用的国内镜像源

### NPM 镜像

| 镜像源 | 地址 | 说明 |
|--------|------|------|
| 淘宝镜像 | https://registry.npmmirror.com | 推荐，更新快 |
| 腾讯云 | https://mirrors.cloud.tencent.com/npm/ | 稳定 |
| 华为云 | https://mirrors.huaweicloud.com/repository/npm/ | 企业级 |

### Docker 镜像

| 镜像源 | 地址 | 说明 |
|--------|------|------|
| 中科大 | https://docker.mirrors.ustc.edu.cn | 推荐，速度快 |
| 网易 | https://hub-mirror.c.163.com | 稳定 |
| 百度云 | https://mirror.baidubce.com | 可靠 |
| 阿里云 | https://[your-id].mirror.aliyuncs.com | 需注册 |

### Linux 软件源

| 发行版 | 镜像源 | 地址 |
|--------|--------|------|
| Ubuntu | 阿里云 | https://mirrors.aliyun.com/ubuntu/ |
| Ubuntu | 清华 | https://mirrors.tuna.tsinghua.edu.cn/ubuntu/ |
| Alpine | 阿里云 | https://mirrors.aliyun.com/alpine/ |
| Alpine | 清华 | https://mirrors.tuna.tsinghua.edu.cn/alpine/ |

---

## 🔧 本地开发配置

### 1. 配置 NPM 镜像

创建或编辑 `~/.npmrc`：

```properties
registry=https://registry.npmmirror.com
electron_mirror=https://npmmirror.com/mirrors/electron/
electron_builder_binaries_mirror=https://npmmirror.com/mirrors/electron-builder-binaries/
```

### 2. 配置 PNPM 镜像

```bash
pnpm config set registry https://registry.npmmirror.com
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

## 📊 速度对比

使用国内镜像前后的速度对比（参考值）：

| 操作 | 官方源 | 国内镜像 | 提升 |
|------|--------|----------|------|
| pnpm install | ~5 分钟 | ~1 分钟 | 5x |
| Electron 下载 | ~10 分钟 | ~30 秒 | 20x |
| Docker pull | ~3 分钟 | ~30 秒 | 6x |
| apt-get update | ~2 分钟 | ~20 秒 | 6x |

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
curl -I https://registry.npmmirror.com

# 切换到备用镜像
npm config set registry https://mirrors.cloud.tencent.com/npm/
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
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ pnpm install electron

# 或使用官方源
unset ELECTRON_MIRROR
pnpm install electron
```

---

## 📚 相关资源

- [npmmirror 镜像站](https://npmmirror.com/)
- [阿里云镜像站](https://developer.aliyun.com/mirror/)
- [清华大学开源镜像站](https://mirrors.tuna.tsinghua.edu.cn/)
- [中科大开源镜像站](https://mirrors.ustc.edu.cn/)

---

## 🤝 贡献

如果你发现更好的镜像源或配置方法，欢迎提交 PR 更新本文档。
