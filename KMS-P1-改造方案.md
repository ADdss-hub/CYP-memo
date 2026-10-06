# KMS 密钥保险箱 P1 级改造总结
## 独立端口 + 加密通信机制设计与实现

> 版本：P1 v1.0  
> 日期：2026-10-05  
> 架构师：CYP Security Team  
> 项目：CYP-memo

---

## 一、现有 KMS 组件功能与接口清单

### 1.1 组件定位

KMS（Key Management Service）密钥保险箱是 runtime-base L1 管理层的核心安全组件，当前为嵌入式架构（与主服务同进程），位于：

```
packages/server/src/runtime-base/l1/mgmt/kms/ready.ts
```

**红线原则**：不存业务配置；不做限流；明文不落盘。  
**稳定 ID**：`RB-L1-MGMT-KMS-01`

### 1.2 核心功能分类

| 类别 | 功能说明 | 关键特性 |
|------|---------|---------|
| **密钥加密存储** | 明文仅内存加密，落盘仅密文 | AES-256-GCM |
| **密钥解密读取** | 由 {cipher: key-id} 解出明文，仅驻留调用方内存 | 不缓存明文 |
| **密钥轮换** | 用新明文重封同一 key-id，保留旧版可回滚 | 审计追踪 |
| **密钥回滚** | 回到上一版密文，无旧版则拒绝 | 不降级明文 |
| **主密钥管理** | 优先 CYP_KMS_MASTER_KEY，否则机器码派生 | scrypt 派生 |
| **Vault 持久化** | JSON 文件存储，仅密文条目 | vault.json |
| **SPIFFE 信任锚** | 工作负载身份信任根托管 | runtimebase.local |
| **工作负载证书** | 证书签发、轮换、分发、撤销 | 24h TTL |
| **完备性校验** | k1~k7 七项安全红线校验 | 100% 通过原则 |

### 1.3 导出接口清单（共 20+ 项）

#### 类型定义

```typescript
interface CipherRef { cipher: string }
interface KmsState { ready, vaultPath, secretCount, lastPutAt, lastRotateAt }
interface KmsRotateAudit { at, actor, oldRefId, newRefId }
interface WorkloadTrustAnchor { trustDomain, fingerprint, path, createdAt }
interface WorkloadCert { fingerprint, notBefore, notAfter, status }
```

#### 核心密钥管理函数

| 函数 | 签名 | 说明 |
|------|------|------|
| `putSecret` | `(plain: string, opts?: { id?: string }) => CipherRef` | 加密并存储密钥 |
| `resolveCipherRef` | `(ref: CipherRef \| string) => string` | 解密密钥引用 |
| `resolveSecret` | `(ref: CipherRef \| string) => string` | 同上（别名） |
| `rotateSecret` | `(ref, newPlain, opts?: { newId? }) => CipherRef` | 密钥轮换 |
| `rollbackSecret` | `(ref: CipherRef \| string) => CipherRef` | 密钥回滚 |
| `getKmsState` | `() => KmsState` | 获取状态 |
| `isKmsReady` | `() => boolean` | 是否就绪 |

#### 生命周期函数

| 函数 | 说明 |
|------|------|
| `initKms({ dataDir, masterKey? })` | 初始化 KMS 服务 |
| `resetKms()` | 重置 KMS 状态 |

#### SPIFFE / 工作负载证书

| 函数 | 说明 |
|------|------|
| `ensureWorkloadTrustAnchor(dataDir)` | 确保信任锚存在 |
| `getWorkloadTrustAnchor()` | 获取信任锚 |
| `isWorkloadTrustAnchorReady()` | 信任锚是否就绪 |
| `issueWorkloadCert(now?)` | 签发工作负载证书 |
| `shouldRotateWorkloadCert(now?)` | 是否需要轮换 |
| `rotateExpiredWorkloadCert(now?)` | 轮换到期证书 |
| `beginTrustAnchorDistribution(now?)` | 开始分发阶段 |
| `switchTrustAnchorSigning(fp, confirmed?)` | 切换签名证书 |
| `bothCertsValid(now?)` | 双证书是否同时有效 |
| `revokePreviousTrustAnchor()` | 撤销旧证书 |
| `forceReconnectEstablished()` | 禁止强制重连 |

#### 工具与校验

| 函数 | 说明 |
|------|------|
| `toRefUri(cipherId, provider?)` | 转换为 ref URI |
| `parseRefUri(ref)` | 解析 ref URI |
| `kmsPerfection()` | k1~k7 完备性校验 |
| `ready_rb_l1_mgmt_kms_01()` | 就绪校验（稳定 ID 标准） |

### 1.4 外部引用点（共 5 处）

| 文件 | 导入内容 | 用途 |
|------|---------|------|
| `bootstrap.ts` | `initKms, resetKms, getKmsState, isKmsReady` | Phase0 初始化 |
| `index.ts` | `getKmsState` | API 状态展示 |
| `l0/coord/cmp/ready.ts` | `ready_rb_l1_mgmt_kms_01` | 组件就绪探针 |
| `l0/coord/plt/ready.ts` | 工作负载证书相关函数 | 平台协调（SPIFFE） |
| `l1/col/svc/ready.ts` | `isWorkloadTrustAnchorReady, getWorkloadTrustAnchor` | 服务注册信任锚 |

---

## 二、独立服务 API 设计

### 2.1 服务基本信息

| 项目 | 值 | 说明 |
|------|-----|------|
| 监听地址 | `127.0.0.1` | 仅环回，不对外暴露 |
| 监听端口 | `12000` | 基础设施服务段 12000-12999 |
| 协议 | HTTP/1.1 | 内网环回 + East-West Token 认证 |
| 基准路径 | `/kms/v1/` | 版本化 API |
| 认证方式 | Bearer Token（East-West） | 恒定时间比较，防时序攻击 |

### 2.2 API 端点清单

| 方法 | 路径 | 对应原函数 | 认证 | 说明 |
|------|------|-----------|------|------|
| `GET` | `/kms/v1/health` | - | 免认证 | 健康检查（启动脚本用） |
| `GET` | `/kms/v1/ready` | `isKmsReady` + `ready_rb_l1_mgmt_kms_01` | 免认证 | 就绪检查 |
| `POST` | `/kms/v1/encrypt` | `putSecret` | 需要 | 加密并存储密钥 |
| `POST` | `/kms/v1/decrypt` | `resolveCipherRef` | 需要 | 解密密钥引用 |
| `POST` | `/kms/v1/rotate` | `rotateSecret` | 需要 | 密钥轮换 |
| `POST` | `/kms/v1/rollback` | `rollbackSecret` | 需要 | 密钥回滚 |
| `GET` | `/kms/v1/state` | `getKmsState` | 需要 | 获取 KMS 状态 |
| `GET` | `/kms/v1/perfection` | `kmsPerfection` | 需要 | 完备性校验 |
| `GET` | `/kms/v1/trust-anchor` | `getWorkloadTrustAnchor` | 需要 | 信任锚信息 |

### 2.3 请求/响应示例

#### 加密请求
```http
POST /kms/v1/encrypt HTTP/1.1
Host: 127.0.0.1:12000
Authorization: Bearer <KMS_AUTH_TOKEN>
Content-Type: application/json

{
  "plain": "my-secret-password",
  "id": "db-password"
}
```

#### 加密响应
```json
{
  "success": true,
  "data": {
    "cipher": "ref://local/db-password"
  },
  "timestamp": "2026-10-05T08:00:00.000Z"
}
```

#### 解密请求
```http
POST /kms/v1/decrypt HTTP/1.1
Host: 127.0.0.1:12000
Authorization: Bearer <KMS_AUTH_TOKEN>
Content-Type: application/json

{
  "ref": { "cipher": "ref://local/db-password" }
}
```

#### 解密响应
```json
{
  "success": true,
  "data": "my-secret-password",
  "timestamp": "2026-10-05T08:00:00.000Z"
}
```

### 2.4 错误码

| HTTP 状态码 | 错误码 | 说明 |
|------------|--------|------|
| 401 | `UNAUTHORIZED` | East-West Token 认证失败 |
| 400 | `BAD_REQUEST` | 请求参数错误 |
| 404 | `NOT_FOUND` | 端点不存在 |
| 404 | `SECRET_NOT_FOUND` | 密钥 ID 不存在 |
| 409 | `ROLLBACK_BLOCKED` | 无可回滚版本 |
| 400 | `INVALID_SEALED_BLOB` | 密文格式损坏 |
| 503 | `KMS_NOT_READY` | KMS 服务未就绪 |
| 500 | `INTERNAL_ERROR` | 内部错误 |

---

## 三、修改/新增文件清单

### 3.1 新增文件（3 个）

| 文件路径 | 说明 | 代码量 |
|---------|------|--------|
| `packages/server/src/runtime-base/l1/mgmt/kms/server.ts` | KMS 独立 HTTP 服务端 | ~250 行 |
| `packages/server/src/runtime-base/l1/mgmt/kms/client.ts` | KMS 客户端 SDK（双模式） | ~400 行 |
| `packages/server/src/kms-service.ts` | KMS 独立服务入口 | ~80 行 |

### 3.2 修改文件（10 个）

#### 源代码（3 个）
| 文件 | 修改内容 |
|------|---------|
| `packages/server/src/bootstrap.ts` | KMS 导入路径从 `ready.js` 改为 `client.js` |
| `packages/server/src/index.ts` | KMS 导入路径从 `ready.js` 改为 `client.js` |
| `packages/server/src/runtime-base/l0/coord/cmp/ready.ts` | KMS 就绪导入路径改为 `client.js` |

> 注：`l0/coord/plt/ready.ts` 和 `l1/col/svc/ready.ts` 仍直接导入 `ready.js`，因使用的是 SPIFFE 工作负载证书和信任锚功能，属于身份管理范畴，与核心加密解耦，保留嵌入式模式。

#### 配置文件（2 个）
| 文件 | 修改内容 |
|------|---------|
| `.env` | 新增 KMS_PORT、KMS_AUTH_TOKEN、CYP_KMS_REMOTE、CYP_KMS_MASTER_KEY |
| `.env.example` | 同上（配置模板同步更新） |

#### Package 配置（2 个）
| 文件 | 修改内容 |
|------|---------|
| `packages/server/package.json` | 新增 `kms`、`kms:local` 脚本 |
| `package.json`（根） | 新增 `local:kms` 脚本 |

#### 启动/停止脚本（4 个）
| 文件 | 修改内容 |
|------|---------|
| `scripts/start/run-local-all.mjs` | 条件启动 KMS 独立服务 |
| `scripts/start/start-local.ps1` | 端口预检 +12000、KMS 健康检查 |
| `scripts/start/start-local.sh` | 端口预检 +12000、KMS 健康检查 |
| `scripts/stop/stop-local.ps1` | 停止端口 +12000 |
| `scripts/stop/stop-local.sh` | 停止端口 +12000 |
| `scripts/_internal/common.ps1` | 注入键列表新增 KMS 相关变量 |

---

## 四、加密通信机制说明

### 4.1 安全模型

```
┌─────────────────────────────────────────────────────────────┐
│                     主服务进程 (:5170)                       │
│  ┌───────────────────┐    ┌──────────────────────────────┐  │
│  │  业务代码          │    │  KMS Client SDK              │  │
│  │  (putSecret 等)   │───▶│  - 同步接口（嵌入式兼容）     │  │
│  └───────────────────┘    │  - 异步接口（远程模式）       │  │
│                            │  - 连接池 / 重试 / 超时        │  │
│                            └──────────────┬───────────────┘  │
│                                           │                  │
└───────────────────────────────────────────┼──────────────────┘
                                            │ HTTP/1.1
                                            │ Bearer Token
                                            │ 127.0.0.1:12000
                                            ▼
┌─────────────────────────────────────────────────────────────┐
│                 KMS 独立服务进程 (:12000)                     │
│  ┌───────────────────┐    ┌──────────────────────────────┐  │
│  │  East-West Auth   │───▶│  KMS Core (ready.ts)         │  │
│  │  中间件            │    │  - AES-256-GCM 加密/解密      │  │
│  └───────────────────┘    │  - Vault 持久化               │  │
│                            │  - 密钥轮换/回滚               │  │
│                            └──────────────────────────────┘  │
│                                                               │
│  仅监听 127.0.0.1 · 不对外暴露                                │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 East-West Token 认证机制

#### 设计原则
- **零信任**：即使是本机环回通信也必须认证，不信任网络位置
- **最小权限**：仅持有有效 Token 的服务方可调用 KMS
- **恒定时间比较**：防止时序攻击（timing attack）
- **共享密钥模式**：P1 阶段使用对称共享密钥，可平滑升级至 mTLS

#### 认证流程
```
1. 主服务（Client）发起请求 → 携带 Authorization: Bearer <KMS_AUTH_TOKEN>
2. KMS 服务（Server）接收请求 → 提取 Token
3. 恒定时间比较 Token → 与 KMS_AUTH_TOKEN 环境变量比对
4. 匹配 → 放行；不匹配 → 401 UNAUTHORIZED
```

#### 安全特性
- **恒定时间比较**：使用 XOR 逐字节比较，避免时序泄漏
- **最小请求体限制**：1MB 上限，防止放大攻击
- **安全头**：`X-Content-Type-Options: nosniff`、`Cache-Control: no-store`
- **免认证端点**：仅 `/health` 和 `/ready`（供启动脚本探测）

### 4.3 客户端可靠性保障

| 特性 | 说明 | 默认值 |
|------|------|--------|
| **连接池** | HTTP Keep-Alive 复用连接，减少握手开销 | maxSockets=10, maxFree=5 |
| **请求超时** | 单次请求最大等待时间 | 5000ms |
| **自动重试** | 网络错误/超时/5xx 自动重试 | 最多 2 次 |
| **指数退避** | 重试间隔指数增长 | 200ms → 400ms |
| **双模式** | 自动检测远程/嵌入式模式 | 自动（KMS_AUTH_TOKEN 配置则远程） |

### 4.4 数据加密保障

- **静态加密**：Vault 文件仅存密文（AES-256-GCM），明文永不落盘
- **传输保护**：环回网络 + Token 认证，防止本地进程嗅探/篡改
- **主密钥保护**：进程内 master key，优先显式注入，否则机器码派生
- **GCM 认证标签**：每条密文附带 128 位认证标签，保证完整性

---

## 五、分阶段实施建议

### 5.1 P1（已完成）：基础独立化

**目标**：KMS 服务独立端口 + 加密通信基础能力

- [x] KMS 独立 HTTP 服务（127.0.0.1:12000）
- [x] East-West Token 认证（共享密钥模式）
- [x] 客户端 SDK（双模式兼容：嵌入式 + 远程）
- [x] 核心 API：encrypt/decrypt/rotate/rollback/state
- [x] 健康检查与就绪探针
- [x] 启动/停止脚本集成
- [x] 配置项更新

### 5.2 P2：增强安全与性能

**目标**：升级认证机制 + 完善审计与监控

| 任务 | 说明 | 优先级 |
|------|------|--------|
| **mTLS 升级** | 用 SPIFFE 工作负载证书替代共享 Token，实现双向 TLS | 高 |
| **请求审计** | KMS 服务端记录每次加密/解密/轮换操作审计日志 | 高 |
| **速率限制** | 按调用方 IP/Token 限流，防止暴力破解 | 中 |
| **内存加密** | 敏感内存页加锁（mlock），防止 swap 泄漏 | 中 |
| **Prometheus 指标** | 暴露 KMS 操作 metrics（请求量、延迟、错误率） | 低 |

### 5.3 P3：高级特性

**目标**：企业级 KMS 能力

| 任务 | 说明 | 优先级 |
|------|------|--------|
| **HSM 集成** | 对接硬件安全模块（如 PKCS#11），主密钥不出 HSM | 高 |
| **密钥版本管理** | 多版本密钥并存，支持按版本解密 | 中 |
| **信封加密** | DEK + KEK 二级密钥体系，降低主密钥暴露面 | 中 |
| **自动轮换策略** | 配置化的密钥自动轮换策略（按时间/次数） | 中 |
| **多租户隔离** | 按租户/命名空间隔离密钥存储 | 低 |

### 5.4 迁移路径

```
阶段 0：嵌入式模式（当前默认）
  ↓ 配置 KMS_AUTH_TOKEN
阶段 1：双轨运行（KMS 独立服务启动，主服务仍用嵌入式）
  ↓ 验证稳定后设置 CYP_KMS_REMOTE=1
阶段 2：完全远程模式（主服务通过 HTTP 调用 KMS）
  ↓ 引入 SPIFFE mTLS
阶段 3：mTLS 认证模式（最高安全等级）
```

---

## 六、使用说明

### 6.1 启用远程 KMS 模式

在 `.env` 文件中配置：

```env
KMS_PORT=12000
KMS_AUTH_TOKEN=<your-strong-random-token>
```

重启服务后，`run-local-all.mjs` 会自动启动 KMS 独立服务，主服务自动切换为远程模式。

### 6.2 生成强认证 Token

```bash
# 生成 32 字节随机 Token（推荐）
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 6.3 验证 KMS 服务

```bash
# 健康检查
curl http://127.0.0.1:12000/kms/v1/health

# 就绪检查
curl http://127.0.0.1:12000/kms/v1/ready

# 加密测试（需认证）
curl -X POST http://127.0.0.1:12000/kms/v1/encrypt \
  -H "Authorization: Bearer $KMS_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"plain":"test-secret","id":"test"}'
```

### 6.4 回退到嵌入式模式

```env
# 注释掉或清空 KMS_AUTH_TOKEN 即可回退
# KMS_AUTH_TOKEN=
```

---

## 七、接口兼容性矩阵

| 原接口 | 嵌入式模式 | 远程模式（同步） | 远程模式（异步） |
|--------|-----------|-----------------|-----------------|
| `putSecret` | ✅ 原生 | ❌ 抛错提示用 async | ✅ `putSecretAsync` |
| `resolveCipherRef` | ✅ 原生 | ❌ 抛错提示用 async | ✅ `resolveCipherRefAsync` |
| `rotateSecret` | ✅ 原生 | ❌ 抛错提示用 async | ✅ `rotateSecretAsync` |
| `rollbackSecret` | ✅ 原生 | ❌ 抛错提示用 async | ✅ `rollbackSecretAsync` |
| `getKmsState` | ✅ 原生 | ⚠️ 返回缓存状态 | ✅ `getKmsStateAsync` |
| `isKmsReady` | ✅ 原生 | ⚠️ 返回客户端配置状态 | ✅ `isKmsReadyAsync` |
| `kmsPerfection` | ✅ 原生 | ❌ 返回全 false | ✅ `kmsPerfectionAsync` |
| `initKms` | ✅ 原生 | ✅ 初始化客户端 | - |
| `resetKms` | ✅ 原生 | ✅ 重置客户端 | - |
| `toRefUri` | ✅ 原生 | ✅ 纯函数本地 | - |
| `parseRefUri` | ✅ 原生 | ✅ 纯函数本地 | - |
| `ensureWorkloadTrustAnchor` | ✅ 原生 | ✅ 本地调用 | - |
| `issueWorkloadCert` 等证书函数 | ✅ 原生 | ✅ 本地调用 | - |

> **说明**：同步接口在远程模式下抛错是设计使然，目的是让调用方显式感知到远程调用的异步特性，避免同步转异步的隐式阻塞。对于必须同步的场景，可保留嵌入式模式。

---

*文档结束 · CYP-memo KMS P1 改造*
