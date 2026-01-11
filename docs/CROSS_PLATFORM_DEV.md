# 跨平台开发环境指南

本文档说明在不同操作系统和环境下运行 CYP-memo 开发模式可能遇到的问题及解决方案。

## 支持的平台

- Windows 10/11
- macOS (Intel/Apple Silicon)
- Linux (Ubuntu, Debian, CentOS, Arch 等)
- WSL2 (Windows Subsystem for Linux)
- Docker

## 快速启动

### Windows
```batch
dev.bat
# 或
pnpm dev:all
```

### Linux/macOS
```bash
chmod +x dev.sh
./dev.sh
# 或
pnpm dev:all
```

### Docker
```bash
docker-compose -f docker/docker-compose.dev.yml up
```

## 常见问题

### 1. Windows 特定问题

#### 1.1 PowerShell 执行策略
```powershell
# 如果遇到脚本执行被阻止
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

#### 1.2 端口被占用
```powershell
# 查找占用端口的进程
netstat -ano | findstr :5170
# 终止进程
taskkill /PID <进程ID> /F
```

#### 1.3 原生模块编译失败
需要安装 Visual Studio Build Tools:
```powershell
npm install -g windows-build-tools
# 或安装 Visual Studio 2022 并选择 "C++ 桌面开发" 工作负载
```

### 2. macOS 特定问题

#### 2.1 Xcode Command Line Tools
```bash
xcode-select --install
```

#### 2.2 Apple Silicon (M1/M2/M3) 兼容性
某些原生模块可能需要 Rosetta 2:
```bash
softwareupdate --install-rosetta
```

#### 2.3 权限问题
```bash
# 如果遇到权限错误
sudo chown -R $(whoami) ~/.npm
sudo chown -R $(whoami) ~/.pnpm-store
```

### 3. Linux 特定问题

#### 3.1 缺少构建工具
```bash
# Ubuntu/Debian
sudo apt-get install build-essential python3

# CentOS/RHEL
sudo yum groupinstall "Development Tools"

# Arch Linux
sudo pacman -S base-devel
```

#### 3.2 文件监听限制
```bash
# 增加 inotify 监听数量
echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

### 4. WSL2 特定问题

#### 4.1 从 Windows 访问 WSL2 服务
需要将 Vite 服务器绑定到 0.0.0.0:
```bash
export VITE_HOST=0.0.0.0
pnpm dev:all
```

#### 4.2 热更新 (HMR) 不工作
在 `vite.config.ts` 中启用轮询模式:
```typescript
server: {
  watch: {
    usePolling: true,
    interval: 1000,
  },
}
```

#### 4.3 文件系统性能
将项目放在 WSL2 文件系统中（`/home/user/`）而不是 Windows 挂载目录（`/mnt/c/`）。

### 5. Docker 特定问题

#### 5.1 容器内无法访问
确保端口映射正确:
```yaml
ports:
  - "5170:5170"
  - "5173:5173"
  - "5174:5174"
```

#### 5.2 热更新不工作
在 Docker 挂载卷中，需要启用轮询:
```bash
export VITE_HOST=0.0.0.0
```

#### 5.3 权限问题
使用 PUID/PGID 环境变量:
```yaml
environment:
  - PUID=1000
  - PGID=1000
```

## 环境变量配置

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `NODE_ENV` | 运行环境 | `development` |
| `PORT` | 服务器端口 | `5170` |
| `DATA_DIR` | 数据存储目录 | 平台相关 |
| `VITE_HOST` | Vite 服务器主机 | `localhost` |
| `LOG_LEVEL` | 日志级别 | `info` |

### 数据目录默认位置

| 平台 | 开发环境默认路径 |
|------|------------------|
| Windows | `./packages/server/data` 或 `%LOCALAPPDATA%/cyp-memo/data` |
| macOS | `./packages/server/data` 或 `~/Library/Application Support/cyp-memo/data` |
| Linux | `./packages/server/data` 或 `~/.local/share/cyp-memo/data` |
| Docker | `/app/data` |

## 原生模块依赖

### better-sqlite3
- 需要 C++ 编译器
- Windows: Visual Studio Build Tools
- macOS: Xcode Command Line Tools
- Linux: build-essential

### keytar (桌面端)
- Windows: 自动工作
- macOS: 需要 Keychain 访问权限
- Linux: 需要 libsecret (`sudo apt-get install libsecret-1-dev`)

### sharp (桌面端)
- 自动下载预编译二进制
- 如果失败，需要安装 libvips

## 镜像配置（中国用户）

运行镜像配置脚本:

### Windows
```powershell
.\scripts\setup-mirrors.ps1
```

### Linux/macOS
```bash
chmod +x scripts/setup-mirrors.sh
./scripts/setup-mirrors.sh
```

## 调试技巧

### 1. 查看详细日志
```bash
LOG_LEVEL=debug pnpm dev:server
```

### 2. 检查端口占用
```bash
# Linux/macOS
lsof -i :5170

# Windows
netstat -ano | findstr :5170
```

### 3. 清理缓存
```bash
# 清理 node_modules
rm -rf node_modules packages/*/node_modules
pnpm install

# 清理 Vite 缓存
rm -rf packages/app/node_modules/.vite
rm -rf packages/admin/node_modules/.vite
```

## 获取帮助

如果遇到其他问题，请：
1. 查看 [GitHub Issues](https://github.com/ADdss-hub/CYP-memo/issues)
2. 提交新 Issue 并附上：
   - 操作系统版本
   - Node.js 版本 (`node -v`)
   - pnpm 版本 (`pnpm -v`)
   - 完整错误日志
