# 🌐 国内镜像配置总结

## ✅ 已完成的配置

### 1. 项目配置文件

| 文件 | 说明 | 状态 |
|------|------|------|
| `.npmrc` | NPM/PNPM 镜像配置 | ✅ 已配置 |
| `.github/workflows/release.yml` | CI/CD 镜像配置 | ✅ 已优化 |
| `docker/Dockerfile` | Docker 构建镜像配置 | ✅ 已优化 |

### 2. 文档

| 文件 | 说明 |
|------|------|
| `docs/CHINA_MIRROR_CONFIG.md` | 详细的镜像配置文档 |
| `docs/QUICK_START_CN.md` | 中国用户快速开始指南 |
| `docs/MIRROR_QUICK_REF.md` | 快速参考卡片 |
| `FIXES_APPLIED.md` | 构建问题修复总结 |

### 3. 配置脚本

| 文件 | 平台 | 说明 |
|------|------|------|
| `scripts/setup-mirrors.sh` | Linux/macOS | 一键配置脚本 |
| `scripts/setup-mirrors.ps1` | Windows | 一键配置脚本 |

---

## 🚀 配置的镜像源

### NPM 生态

```properties
# 主镜像
registry=https://registry.npmmirror.com

# Electron
electron_mirror=https://npmmirror.com/mirrors/electron/
electron_builder_binaries_mirror=https://npmmirror.com/mirrors/electron-builder-binaries/

# 原生模块
better_sqlite3_binary_host_mirror=https://npmmirror.com/mirrors/better-sqlite3/
sharp_binary_host=https://npmmirror.com/mirrors/sharp/
sharp_libvips_binary_host=https://npmmirror.com/mirrors/sharp-libvips/
node_sqlite3_binary_host_mirror=https://npmmirror.com/mirrors/sqlite3/
```

### GitHub Actions

所有构建任务都配置了：
- ✅ NPM 镜像 (registry.npmmirror.com)
- ✅ Electron 镜像 (npmmirror.com/mirrors/electron/)
- ✅ Ubuntu APT 镜像 (mirrors.aliyun.com)
- ✅ Docker 镜像 (docker.mirrors.ustc.edu.cn)

### Docker

- ✅ Alpine APK: mirrors.aliyun.com
- ✅ NPM: registry.npmmirror.com
- ✅ 构建优化: --ignore-scripts
- ✅ 超时时间: 120 分钟

---

## 📊 预期性能提升

| 操作 | 官方源 | 国内镜像 | 提升 |
|------|--------|----------|------|
| pnpm install | ~5 分钟 | ~1 分钟 | **5x** |
| Electron 下载 | ~10 分钟 | ~30 秒 | **20x** |
| Docker pull | ~3 分钟 | ~30 秒 | **6x** |
| apt-get update | ~2 分钟 | ~20 秒 | **6x** |
| 总构建时间 | ~30 分钟 | ~10 分钟 | **3x** |

---

## 🎯 使用方法

### 新用户（推荐）

```bash
# 1. 克隆项目
git clone https://github.com/ADdss-hub/CYP-memo.git
cd CYP-memo

# 2. 运行配置脚本
bash scripts/setup-mirrors.sh  # Linux/macOS
# 或
.\scripts\setup-mirrors.ps1    # Windows

# 3. 安装依赖
pnpm install

# 4. 开始开发
pnpm dev
```

### 已有项目

项目已包含 `.npmrc` 配置文件，直接使用即可：

```bash
# 拉取最新代码
git pull

# 安装依赖（自动使用国内镜像）
pnpm install
```

---

## 🔍 验证配置

```bash
# 检查 NPM 配置
npm config get registry
# 应输出: https://registry.npmmirror.com

# 检查 PNPM 配置
pnpm config get registry
# 应输出: https://registry.npmmirror.com

# 检查 Electron 镜像
npm config get electron_mirror
# 应输出: https://npmmirror.com/mirrors/electron/

# 测试下载速度
time pnpm install electron
```

---

## 🌍 适用场景

### ✅ 推荐使用国内镜像

- 🇨🇳 在中国大陆开发
- 🏢 企业内网环境
- 🚀 需要快速构建
- 📦 频繁安装依赖

### ⚠️ 可能不需要

- 🌏 在海外服务器构建
- 🔒 需要最新版本（镜像有延迟）
- 🏛️ 政府/金融等特殊行业（可能有内网镜像）

---

## 🔄 切换回官方源

如果需要切换回官方源：

```bash
# 删除镜像配置
npm config delete registry
pnpm config delete registry
npm config delete electron_mirror

# 或设置为官方源
npm config set registry https://registry.npmjs.org
pnpm config set registry https://registry.npmjs.org
```

---

## 📝 注意事项

1. **镜像同步延迟**: 国内镜像通常有几小时的同步延迟
2. **CI/CD 环境**: GitHub Actions 在国外，但配置镜像仍能加速部分下载
3. **企业网络**: 某些企业可能限制外部镜像，需配置内网镜像
4. **定期检查**: 镜像源可能变更，建议定期检查可用性

---

## 🆘 故障排查

### 问题 1: 镜像源无法访问

```bash
# 测试连通性
curl -I https://registry.npmmirror.com

# 切换备用镜像
npm config set registry https://mirrors.cloud.tencent.com/npm/
```

### 问题 2: 某些包下载失败

```bash
# 临时使用官方源
npm install <package> --registry=https://registry.npmjs.org

# 清除缓存
pnpm store prune
```

### 问题 3: Electron 下载失败

```bash
# 手动设置镜像
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

发现更好的镜像源或配置方法？欢迎提交 PR！

---

**最后更新**: 2026-01-11  
**维护者**: CYP <nasDSSCYP@outlook.com>
