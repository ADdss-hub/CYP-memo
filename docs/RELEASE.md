# 发布指南

本文档说明如何发布 CYP-memo 新版本。

## 一键发布

使用发布脚本自动完成所有操作：

```bash
# 补丁版本 (1.7.10 -> 1.7.11)
pnpm release:patch

# 次版本 (1.7.10 -> 1.8.0)
pnpm release:minor

# 主版本 (1.7.10 -> 2.0.0)
pnpm release:major

# 指定版本
pnpm release 2.0.0
```

## 发布流程

脚本会自动执行以下操作：

1. **更新版本号** - 同步更新所有文件：
   - `VERSION`
   - `package.json`（根目录和所有子包）
   - `packages/shared/src/config/version.ts`
   - `.version/changelog.json`

2. **Git 操作**
   - 提交更改：`git commit -m "release: vX.Y.Z"`
   - 创建 tag：`git tag vX.Y.Z`
   - 推送代码和 tag

3. **自动构建发布**（GitHub Actions）
   - 构建 Web 用户端和管理端
   - 构建桌面端（Windows/macOS/Linux）
   - 推送 Docker 镜像
   - 创建 GitHub Release

## 选项

```bash
# 只更新版本号，不推送到远程
pnpm release patch --no-push

# 只更新版本号，不创建 tag
pnpm release patch --no-tag
```

## 手动发布

如果需要手动发布：

```bash
# 1. 更新版本号（手动修改所有文件）
# 2. 提交更改
git add .
git commit -m "release: v1.8.0"

# 3. 创建并推送 tag
git tag v1.8.0
git push origin main
git push origin v1.8.0
```

## 查看发布状态

- GitHub Actions: https://github.com/ADdss-hub/CYP-memo/actions
- Releases: https://github.com/ADdss-hub/CYP-memo/releases

## 镜像仓库

Docker 镜像会自动推送到多个仓库：

| 仓库 | 地址 | 说明 |
|---|---|---|
| GitHub Container Registry | `ghcr.io/addss-hub/cyp-memo` | 默认推送 |
| Docker Hub | `cyp97/cyp-memo` | 需配置 DOCKER_USERNAME/PASSWORD |
| 阿里云 | `registry.cn-hangzhou.aliyuncs.com/cyp-memo/cyp-memo` | 需配置 ALIYUN_USERNAME/PASSWORD |

## 自动更新

发布后，各端会自动检测新版本：

| 端 | 更新方式 |
|---|---|
| 桌面端 | 自动检测 GitHub Releases，下载安装包并提示安装 |
| Web 用户端 | 每 5 分钟检测服务器版本，发现新版本提示刷新页面 |
| Web 管理端 | 每 5 分钟检测服务器版本，发现新版本提示刷新页面 |
| Docker | 自动检测 GitHub Releases，显示更新步骤和命令 |

Docker 用户会在页面顶部看到更新提示，点击"查看更新方法"可以看到详细的更新命令，支持一键复制。

### Docker 自动更新（Watchtower）

如果希望 Docker 容器自动更新，可以使用 [Watchtower](https://containrrr.dev/watchtower/)：

```bash
# 启动 Watchtower，每 24 小时检查一次更新
docker run -d --name watchtower \
  -v /var/run/docker.sock:/var/run/docker.sock \
  containrrr/watchtower cyp-memo --interval 86400
```

Watchtower 会自动：
1. 检测 cyp-memo 镜像是否有新版本
2. 拉取最新镜像
3. 停止旧容器，启动新容器（保留原有配置）

更多配置选项请参考 [Watchtower 文档](https://containrrr.dev/watchtower/arguments/)。

### Docker 手动更新

```bash
# 1. 拉取最新镜像（选择您使用的镜像源）
docker pull cyp97/cyp-memo:latest          # Docker Hub
docker pull ghcr.io/addss-hub/cyp-memo:latest  # GHCR

# 2. 重启容器
docker-compose up -d   # 使用 docker-compose
# 或
docker restart cyp-memo  # 单容器
```

## 相关文件

- `scripts/release.js` - 发布脚本
- `.github/workflows/release.yml` - GitHub Actions 工作流
- `packages/desktop/src/main/UpdateManager.ts` - 桌面端自动更新管理器
- `packages/desktop/src/renderer/components/UpdateNotification.vue` - 桌面端更新通知组件
- `packages/app/src/components/UpdateNotification.vue` - Web 用户端更新通知组件
- `packages/admin/src/components/UpdateNotification.vue` - Web 管理端更新通知组件
- `packages/shared/src/services/VersionChecker.ts` - 版本检测服务
- `packages/server/src/index.ts` - 服务器端版本 API (`/api/version/latest`)
