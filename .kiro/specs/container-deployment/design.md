# Design Document

## Overview

本设计文档描述 CYP-memo 容器化部署系统的技术架构和实现方案。系统采用 Docker 多阶段构建，支持生产和开发两种部署模式，提供完善的配置管理、数据持久化、健康监控和安全加固能力。

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Docker Host                               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              CYP-memo Container                      │    │
│  │  ┌─────────────────────────────────────────────┐    │    │
│  │  │           Node.js Runtime                    │    │    │
│  │  │  ┌───────────────────────────────────────┐  │    │    │
│  │  │  │         Express Server                 │  │    │    │
│  │  │  │  ┌─────────┐  ┌─────────┐  ┌───────┐ │  │    │    │
│  │  │  │  │ API     │  │ Static  │  │Health │ │  │    │    │
│  │  │  │  │ Routes  │  │ Files   │  │Check  │ │  │    │    │
│  │  │  │  └─────────┘  └─────────┘  └───────┘ │  │    │    │
│  │  │  └───────────────────────────────────────┘  │    │    │
│  │  └─────────────────────────────────────────────┘    │    │
│  │                        │                             │    │
│  │  ┌─────────────────────┴─────────────────────┐      │    │
│  │  │              /app/data (Volume)            │      │    │
│  │  │  ┌──────────────┐  ┌──────────────────┐   │      │    │
│  │  │  │ database.db  │  │ uploads/         │   │      │    │
│  │  │  └──────────────┘  └──────────────────┘   │      │    │
│  │  └───────────────────────────────────────────┘      │    │
│  └─────────────────────────────────────────────────────┘    │
│                           │                                  │
│                     Port 5170                                │
└───────────────────────────┼──────────────────────────────────┘
                            │
                      External Access
```

## Components and Interfaces

### 1. Dockerfile (多阶段构建)

```dockerfile
# 阶段 1: Builder - 安装依赖和构建
FROM node:18-alpine AS builder
  - 安装 pnpm
  - 复制 package.json 文件 (利用缓存)
  - 安装全部依赖
  - 复制源代码
  - 执行构建

# 阶段 2: Production - 最小化运行时镜像
FROM node:18-alpine AS production
  - 创建非 root 用户
  - 复制构建产物
  - 仅安装生产依赖
  - 配置健康检查
  - 设置入口点
```

### 2. Docker Compose 配置

**生产模式 (docker-compose.yml)**:
- 单容器部署
- 数据卷挂载
- 自动重启策略
- 健康检查配置

**开发模式 (docker-compose.dev.yml)**:
- 源码挂载
- 热重载支持
- 调试端口暴露
- 开发工具集成

### 3. 环境配置系统

| 环境变量 | 默认值 | 说明 |
|---------|--------|------|
| NODE_ENV | production | 运行环境 |
| PORT | 5170 | 服务端口 |
| DATA_DIR | /app/data | 数据目录 |
| LOG_LEVEL | info | 日志级别 |
| TZ | Asia/Shanghai | 时区 |

### 4. 健康检查接口

```
GET /api/health
Response: { success: true, data: { status: 'ok', version: '1.7.9', uptime: 12345 } }
```

### 5. 部署脚本

| 脚本 | 功能 |
|------|------|
| deploy.sh | 一键部署 (构建+启动) |
| backup.sh | 数据备份 |
| restore.sh | 数据恢复 |

## Data Models

### 容器配置模型

```typescript
interface ContainerConfig {
  // 基础配置
  port: number           // 服务端口
  dataDir: string        // 数据目录
  logLevel: 'debug' | 'info' | 'warn' | 'error'
  
  // 运行时信息
  nodeEnv: 'development' | 'production'
  version: string        // 应用版本
  startTime: Date        // 启动时间
}
```

### 健康状态模型

```typescript
interface HealthStatus {
  status: 'ok' | 'degraded' | 'unhealthy'
  version: string
  uptime: number         // 秒
  database: boolean      // 数据库连接状态
  diskSpace: {
    used: number         // 已用空间 (bytes)
    available: number    // 可用空间 (bytes)
  }
}
```

### 镜像元数据模型

```typescript
interface ImageMetadata {
  name: string           // cyp-memo
  version: string        // 1.7.9
  buildDate: string      // ISO 日期
  gitCommit: string      // Git 提交哈希
  nodeVersion: string    // Node.js 版本
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: 环境变量配置一致性

*For any* 有效的环境变量配置（端口号、数据目录路径），容器启动后通过 API 或配置接口读取的值应与传入的环境变量值完全一致。

**Validates: Requirements 2.1, 2.2**

### Property 2: 数据持久化完整性 (Round-Trip)

*For any* 写入数据卷的数据（数据库记录或文件），在容器重启后读取该数据，应与写入前的数据完全一致。这是一个 round-trip 属性：write → restart → read 应返回原始数据。

**Validates: Requirements 3.1, 3.2**

### Property 3: 版本标签一致性

*For any* 构建的 Docker 镜像，镜像的版本标签（LABEL）应与应用内部的版本号（package.json version）完全一致。

**Validates: Requirements 6.5**

## Error Handling

| 错误场景 | 处理策略 |
|---------|---------|
| 数据目录不存在 | 自动创建目录 |
| 数据库初始化失败 | 输出错误日志，退出容器 |
| 端口被占用 | 输出错误信息，退出容器 |
| 健康检查超时 | 标记为不健康，触发重启 |
| 磁盘空间不足 | 输出警告日志，拒绝写入 |
| 权限不足 | 输出错误信息，退出容器 |

## Testing Strategy

### 单元测试

- 环境变量解析逻辑测试
- 配置默认值测试
- 健康检查响应格式测试

### 集成测试

- 容器构建测试 (验证镜像可正常构建)
- 容器启动测试 (验证服务可正常启动)
- 数据持久化测试 (验证数据卷挂载正常)
- 健康检查测试 (验证健康检查端点正常)

### 属性测试

使用 fast-check 进行属性测试：
- 环境变量配置一致性测试
- 数据持久化完整性测试

### 测试框架

- **单元测试**: Vitest
- **属性测试**: fast-check
- **容器测试**: Docker CLI + Shell 脚本
