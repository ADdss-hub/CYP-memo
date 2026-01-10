# SQLite 安装指南

## Windows 系统

### 方法 1: 使用预编译版本（推荐）

```bash
# 安装 Windows 构建工具
npm install --global windows-build-tools

# 或者安装 Visual Studio Build Tools
# 下载: https://visualstudio.microsoft.com/downloads/
# 选择: "使用 C++ 的桌面开发"

# 然后安装依赖
cd packages/server
pnpm install
```

### 方法 2: 使用 sql.js（纯 JS，无需编译）

如果无法编译 better-sqlite3，可以使用 sql.js：

```bash
# 修改 package.json
# 将 "better-sqlite3" 替换为 "sql.js"

pnpm remove better-sqlite3
pnpm add sql.js
```

然后修改代码使用 sql.js（性能略低但无需编译）。

### 方法 3: 使用 Docker（最简单）

```bash
# 直接使用 Docker，无需本地编译
docker-compose up -d
```

---

## Linux 系统

```bash
# Ubuntu/Debian
sudo apt-get install build-essential python3

# CentOS/RHEL
sudo yum install gcc-c++ make python3

# 然后安装依赖
cd packages/server
pnpm install
```

---

## macOS 系统

```bash
# 安装 Xcode Command Line Tools
xcode-select --install

# 然后安装依赖
cd packages/server
pnpm install
```

---

## 验证安装

```bash
cd packages/server
node test-sqlite.js
```

如果看到 "✅ 所有测试通过！"，说明安装成功。

---

## 常见问题

### Q: 编译失败怎么办？

A: 尝试以下方法：

1. **清理缓存**
   ```bash
   pnpm store prune
   rm -rf node_modules
   pnpm install
   ```

2. **使用 Docker**（推荐）
   ```bash
   docker-compose up -d
   ```

3. **使用 sql.js**（纯 JS 实现）
   - 无需编译
   - 性能略低（仍比 JSON 快 10-50 倍）
   - 完全兼容

### Q: Windows 上编译很慢？

A: 这是正常的，better-sqlite3 需要编译 C++ 代码。建议：
- 使用 Docker 部署
- 或者等待编译完成（首次约 5-10 分钟）

### Q: 可以不用 SQLite 吗？

A: 可以继续使用 JSON 存储，但：
- 性能低 10-100 倍
- 不支持并发
- 数据可能丢失

不推荐在生产环境使用 JSON。

---

## 推荐方案

### 开发环境
- **Windows**: 使用 Docker
- **Linux/Mac**: 直接编译

### 生产环境
- **所有平台**: 使用 Docker（最简单、最可靠）

---

**提示**: 如果遇到问题，请查看 [快速开始指南](./QUICK_START.md) 或提交 Issue。
