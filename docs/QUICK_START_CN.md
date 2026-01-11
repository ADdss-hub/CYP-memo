# 🚀 快速开始（中国用户）

本指南专为中国大陆用户优化，包含镜像加速配置。

## 📋 前置要求

- Node.js 18+ 
- PNPM 8+
- Git

## ⚡ 一键配置镜像（推荐）

### Linux / macOS

```bash
# 克隆项目
git clone https://github.com/ADdss-hub/CYP-memo.git
cd CYP-memo

# 运行镜像配置脚本
bash scripts/setup-mirrors.sh

# 安装依赖
pnpm install
```

### Windows

```powershell
# 克隆项目
git clone https://github.com/ADdss-hub/CYP-memo.git
cd CYP-memo

# 运行镜像配置脚本
.\scripts\setup-mirrors.ps1

# 安装依赖
pnpm install
```

## 🔧 手动配置镜像

如果自动脚本失败，可以手动配置：

```bash
# 配置 NPM 镜像
npm config set registry https://registry.npmmirror.com
pnpm config set registry https://registry.npmmirror.com

# 配置 Electron 镜像
npm config set electron_mirror https://npmmirror.com/mirrors/electron/
npm config set electron_builder_binaries_mirror https://npmmirror.com/mirrors/electron-builder-binaries/
```

## 🏃 启动开发环境

```bash
# 启动所有服务（推荐）
pnpm dev

# 或分别启动
pnpm dev:server  # 启动后端服务
pnpm dev         # 启动前端开发服务器
```

访问：
- 用户端: http://localhost:5173
- 管理端: http://localhost:5174
- API: http://localhost:5170

## 📦 构建生产版本

```bash
# 构建所有应用
pnpm build

# 构建桌面客户端
cd packages/desktop
pnpm build:win    # Windows
pnpm build:mac    # macOS
pnpm build:linux  # Linux
```

## 🐳 Docker 部署

```bash
# 使用国内镜像构建
docker build -f docker/Dockerfile -t cyp-memo .

# 运行容器
docker run -d \
  -p 5170:5170 \
  -v ./data:/app/data \
  --name cyp-memo \
  cyp-memo
```

或使用 docker-compose：

```bash
cd docker
docker-compose up -d
```

## 📚 更多文档

- [完整安装指南](./PROJECT_SETUP.md)
- [开发指南](./DEVELOPMENT.md)
- [镜像配置详解](./CHINA_MIRROR_CONFIG.md)
- [快速参考卡片](./MIRROR_QUICK_REF.md)

## ❓ 常见问题

### 1. 依赖安装很慢？

确保已配置国内镜像：
```bash
npm config get registry
# 应该显示: https://registry.npmmirror.com
```

### 2. Electron 下载失败？

```bash
# 设置 Electron 镜像
npm config set electron_mirror https://npmmirror.com/mirrors/electron/

# 清除缓存重试
pnpm store prune
pnpm install
```

### 3. Docker 拉取镜像慢？

配置 Docker 镜像加速，参考 [镜像配置文档](./CHINA_MIRROR_CONFIG.md)。

### 4. GitHub 访问慢？

考虑使用 Gitee 镜像或配置 Git 代理：
```bash
git config --global http.proxy http://127.0.0.1:7890
```

## 🆘 获取帮助

- 查看 [Issues](https://github.com/ADdss-hub/CYP-memo/issues)
- 阅读 [完整文档](./PROJECT_SETUP.md)
- 联系作者: nasDSSCYP@outlook.com

---

💡 **提示**: 项目已预配置 `.npmrc` 文件，克隆后即可使用国内镜像。
