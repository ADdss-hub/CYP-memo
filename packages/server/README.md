# CYP-memo 服务器端

高性能 REST API 服务器，使用 SQLite 数据库。

## 特性

- ✅ **SQLite 数据库**: 高性能、零配置
- ✅ **事务支持**: 保证数据一致性
- ✅ **并发安全**: WAL 模式支持并发读写
- ✅ **自动索引**: 优化查询性能
- ✅ **外键约束**: 自动级联删除

## 快速开始

### 安装依赖

```bash
pnpm install
```

### 开发模式

```bash
pnpm dev
```

服务器将运行在 `http://localhost:5170`

### 生产构建

```bash
pnpm build
pnpm start
```

## 数据迁移

如果你从旧版本（JSON 存储）升级，运行迁移脚本：

```bash
pnpm migrate
```

详细说明请查看 [SQLite 迁移指南](../../docs/SQLITE_MIGRATION.md)

## API 端点

### 健康检查

```
GET /api/health
```

### 用户管理

```
GET    /api/users              # 获取所有用户
GET    /api/users/:id          # 获取用户
POST   /api/users              # 创建用户
PATCH  /api/users/:id          # 更新用户
DELETE /api/users/:id          # 删除用户
```

### 备忘录管理

```
GET    /api/users/:userId/memos    # 获取用户备忘录
GET    /api/memos/:id              # 获取备忘录
POST   /api/memos                  # 创建备忘录
PATCH  /api/memos/:id              # 更新备忘录
DELETE /api/memos/:id              # 删除备忘录
```

### 数据管理

```
GET    /api/data/statistics    # 获取统计信息
GET    /api/data/export        # 导出所有数据
POST   /api/data/import        # 导入数据
DELETE /api/data/clear         # 清空数据库
```

## 数据库

### 位置

```
packages/server/data/database.sqlite
```

### 查看数据

```bash
sqlite3 data/database.sqlite
```

```sql
-- 查看所有表
.tables

-- 查询用户
SELECT * FROM users;

-- 查询备忘录
SELECT * FROM memos LIMIT 10;

-- 统计信息
SELECT COUNT(*) FROM users;
SELECT COUNT(*) FROM memos WHERE deletedAt IS NULL;
```

### 备份

```bash
# 复制文件
cp data/database.sqlite backup/database.sqlite.$(date +%Y%m%d)

# 或使用 SQLite 命令
sqlite3 data/database.sqlite ".backup backup/database.sqlite"
```

## 性能优化

### WAL 模式

系统自动启用 WAL（Write-Ahead Logging）模式：

- 支持并发读写
- 性能提升 2-3 倍
- 更好的崩溃恢复

### 索引

自动创建索引以优化查询：

- 用户名、令牌查询
- 备忘录按用户、时间查询
- 文件、分享关联查询

### 事务

批量操作使用事务：

```typescript
const transaction = db.transaction(() => {
  for (const item of items) {
    insertStmt.run(item)
  }
})
transaction() // 原子执行
```

## 环境变量

```bash
PORT=5170                    # 服务器端口
NODE_ENV=production          # 环境模式
DB_PATH=./data/database.sqlite  # 数据库路径（可选）
```

## 故障排除

### 数据库锁定

如果遇到 "database is locked" 错误：

1. 确保只有一个服务器实例运行
2. 检查是否有其他程序打开数据库
3. 重启服务器

### 数据库损坏

```bash
# 检查完整性
sqlite3 data/database.sqlite "PRAGMA integrity_check;"

# 恢复备份
cp backup/database.sqlite data/database.sqlite
```

### 性能问题

```bash
# 清理日志
sqlite3 data/database.sqlite "DELETE FROM logs WHERE createdAt < datetime('now', '-30 days');"

# 回收空间
sqlite3 data/database.sqlite "VACUUM;"

# 更新统计
sqlite3 data/database.sqlite "ANALYZE;"
```

## 技术栈

- **Node.js**: 运行时
- **Express**: Web 框架
- **SQLite**: 数据库
- **better-sqlite3**: SQLite 驱动
- **TypeScript**: 类型安全
- **bcryptjs**: 密码加密

## 许可证

MIT License

Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
