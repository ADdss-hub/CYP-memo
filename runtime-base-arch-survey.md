# CYP-memo 运行底座架构调研报告
> 调研目的：为「一服务一端口」架构改造做准备
> 调研日期：2026-10-05
> 项目路径：d:\kf\kf\CYP-memo

---

## 一、运行底座服务/中心清单（L0/L1 各层）

### 1.1 架构分层总览

运行底座遵循 KF 规范 35 项闭集架构，代码中按 L0/L1 两层组织，全部为**嵌入式同进程**实现。

```
runtime-base/
├── l0/                          # 基础设施平台（L0）
│   ├── coord/                   #   协调子平台（2 组件）
│   │   ├── cmp/                 #     组件协调器 Component Coordinator
│   │   └── plt/                 #     平台协调器 Platform Coordinator
│   └── infra/                   #   基础设施六组件（6 组件）
│       ├── init/                #     启动依赖管控
│       ├── cfg/                 #     配置管控
│       ├── log/                 #     全链路日志
│       ├── cache/               #     缓存
│       ├── db/                  #     数据库
│       └── mq/                  #     消息队列
└── l1/                          # 能力子平台（L1）
    ├── mgmt/                    #   管控子平台（10 组件）
    │   ├── boot/                #     启动引导
    │   ├── code/                #     错误码与统一响应
    │   ├── conf/                #     配置管控（热更新/版本/回滚）
    │   ├── fesec/               #     前端安全防护（CSP/幂等/注入）
    │   ├── iam/                 #     身份访问管控（认证/治理/封禁）
    │   ├── kms/                 #     密钥保险箱 KMS
    │   ├── perf/                #     性能运行管控
    │   ├── rbac/                #     RBAC 权限矩阵
    │   ├── risk/                #     风险运行管控
    │   └── trace/               #     全链路追踪
    ├── host/                    #   托管业务子平台（10 组件）
    │   ├── acct/                #     核算计费（数据血缘/资源计量）
    │   ├── alert/               #     告警中心
    │   ├── audit/               #     审计中心
    │   ├── biz/                 #     网关中心（门面/路由/金丝雀/限流）
    │   ├── rel/                 #     发布管理（金丝雀/回滚）
    │   ├── resil/               #     弹性韧性（熔断/降级/舱壁）
    │   ├── rule/                #     规则校验研判
    │   ├── sched/               #     任务调度中心
    │   ├── telem/               #     安全遥测
    │   └── tracean/             #     链路分析
    ├── col/                     #   协作能力子平台（5 组件）
    │   ├── ctr/                 #     契约管理
    │   ├── data/                #     数据协作（血缘/同步）
    │   ├── evt/                 #     事件协作（领域事件/订阅）
    │   ├── svc/                 #     服务协作管控（注册/发现/授权）
    │   └── ten/                 #     租户协作
    └── pub/                     #   公开子平台（2 组件）
        ├── acc/                 #     公开接入安全（零信任/IP白名单/TLS策略）
        └── open/                #     开放治理（契约/开放平台）
```

### 1.2 各层组件对照表

| 层级 | 子平台 | 目录 | 组件全称 | 数量 |
|------|--------|------|----------|------|
| L0 | 协调子平台 | `l0/coord/cmp` | 组件协调器 | 1 |
| L0 | 协调子平台 | `l0/coord/plt` | 平台协调器 | 1 |
| L0 | 基础设施 | `l0/infra/init` | 启动依赖管控 | 1 |
| L0 | 基础设施 | `l0/infra/cfg` | 配置管控 | 1 |
| L0 | 基础设施 | `l0/infra/log` | 全链路日志 | 1 |
| L0 | 基础设施 | `l0/infra/cache` | 缓存 | 1 |
| L0 | 基础设施 | `l0/infra/db` | 数据库 | 1 |
| L0 | 基础设施 | `l0/infra/mq` | 消息队列 | 1 |
| L1 | 管控子平台 | `l1/mgmt/boot` | 启动引导 | 1 |
| L1 | 管控子平台 | `l1/mgmt/code` | 错误码与统一响应 | 1 |
| L1 | 管控子平台 | `l1/mgmt/conf` | 配置热更新/版本/回滚 | 1 |
| L1 | 管控子平台 | `l1/mgmt/fesec` | 前端安全防护 | 1 |
| L1 | 管控子平台 | `l1/mgmt/iam` | 身份访问管控 | 1 |
| L1 | 管控子平台 | `l1/mgmt/kms` | 密钥保险箱 | 1 |
| L1 | 管控子平台 | `l1/mgmt/perf` | 性能运行管控 | 1 |
| L1 | 管控子平台 | `l1/mgmt/rbac` | RBAC 权限矩阵 | 1 |
| L1 | 管控子平台 | `l1/mgmt/risk` | 风险运行管控 | 1 |
| L1 | 管控子平台 | `l1/mgmt/trace` | 全链路追踪 | 1 |
| L1 | 托管业务 | `l1/host/acct` | 核算计费/数据血缘 | 1 |
| L1 | 托管业务 | `l1/host/alert` | 告警中心 | 1 |
| L1 | 托管业务 | `l1/host/audit` | 审计中心 | 1 |
| L1 | 托管业务 | `l1/host/biz` | 网关中心（门面） | 1 |
| L1 | 托管业务 | `l1/host/rel` | 发布管理 | 1 |
| L1 | 托管业务 | `l1/host/resil` | 弹性韧性 | 1 |
| L1 | 托管业务 | `l1/host/rule` | 规则校验研判 | 1 |
| L1 | 托管业务 | `l1/host/sched` | 任务调度中心 | 1 |
| L1 | 托管业务 | `l1/host/telem` | 安全遥测 | 1 |
| L1 | 托管业务 | `l1/host/tracean` | 链路分析 | 1 |
| L1 | 协作能力 | `l1/col/ctr` | 契约管理 | 1 |
| L1 | 协作能力 | `l1/col/data` | 数据协作 | 1 |
| L1 | 协作能力 | `l1/col/evt` | 事件协作 | 1 |
| L1 | 协作能力 | `l1/col/svc` | 服务协作管控 | 1 |
| L1 | 协作能力 | `l1/col/ten` | 租户协作 | 1 |
| L1 | 公开子平台 | `l1/pub/acc` | 公开接入安全 | 1 |
| L1 | 公开子平台 | `l1/pub/open` | 开放治理 | 1 |

---

## 二、各服务当前的端口占用情况

### 2.1 端口清单

| 端口 | 进程/包 | 监听地址 | 承载内容 | 配置项 |
|------|---------|----------|----------|--------|
| **5170** | `packages/server` | `0.0.0.0` | **所有底座组件 + 全部业务 API + 前端静态资源 + MCP 网关反代** | `PORT` 环境变量 / `config.port` |
| **10175** | `packages/mcp` | `127.0.0.1`（仅环回） | MCP Server（Streamable HTTP + SSE channel） | `CYP_MCP_HTTP_PORT` |
| 5173 | Vite Dev Server（工具链旁路） | 127.0.0.1 | 前端 HMR 热重载工具链旁路，反向代理到底座 5170 端口；非运行底座组件，关闭不影响底座原生运行 | 开发期可选旁路，非产品入口 |

### 2.2 5170 端口承载的全部服务

主服务 `packages/server/src/index.ts` 中的单一 Express 实例承载了以下所有能力：

**基础设施层（全部嵌入式）：**
- 配置管控 API（`/api/config` 等）
- 全链路日志查询 API（`/api/observability/logs` 等）
- 数据库访问（同进程 SQLite，不占端口）
- 缓存（同进程内存 Map，不占端口）
- 消息队列（同进程内存队列，不占端口）

**管控层（全部嵌入式）：**
- 身份认证 API（`/api/auth/*`）
- RBAC 权限 API（`/api/permissions/*`）
- 配置热更新 API（`/api/config/revisions`）
- 性能管控 API（`/api/perf/*`）
- 风险管控 API（`/api/risk/*`）
- 前端安全（CSP 中间件、幂等中间件）
- KMS 状态查询（无独立 API，通过运维面板聚合）
- 链路追踪 API（`/api/tracing/*`）

**托管业务层（全部嵌入式）：**
- 网关中心中间件（限流、熔断、金丝雀、版本校验）
- 业务 API：备忘录 CRUD、文件上传/下载、分享、用户、租户
- MCP 相关 REST 路由（OAuth、PAT、公开投影、审计回传）
- 任务调度 API（`/api/schedule/*`）
- 告警中心 API（`/api/alerts/*`）
- 审计中心 API（`/api/audit/*`）
- 发布管理 API（`/api/release/*`）
- 弹性韧性 API（`/api/resilience/*`）
- 核算/数据血缘 API
- 安全遥测
- 链路分析 API

**协作层（全部嵌入式）：**
- 服务注册与发现（同进程内存 + JSON 文件持久化）
- 领域事件发布订阅（同进程）
- 契约管理 API
- 数据协作 API
- 租户协作 API

**公开层（全部嵌入式）：**
- 零信任守卫中间件
- 公开接入安全（IP 白名单、TLS 策略）
- MCP 协议反代（`/mcp` → `127.0.0.1:10175`）
- 开放治理 API

**前端静态资源：**
- 前端 dist 目录托管（`/`）

### 2.3 独立端口的服务（唯一例外）

**MCP Server（packages/mcp）**
- 端口：默认 10175，绑定 `127.0.0.1`（仅环回）
- 协议：Streamable HTTP（HTTPS）+ SSE channel
- 与主服务关系：
  - **入站**：外部通过主服务 5170 端口的 `/mcp` 路径访问，由 `mcp-proxy.ts` 反向代理到 127.0.0.1:10175
  - **出站**：MCP Server 通过 `api-client.ts` 调用主服务的 REST API（`/api/mcp/*`），地址为 `https://127.0.0.1:5170/api`
  - 认证：PAT 令牌换发下游令牌（downstream token）

---

## 三、服务间通信方式

### 3.1 通信方式总览

| 通信场景 | 方式 | 典型路径 |
|----------|------|----------|
| runtime-base 各组件之间 | **直接 import 函数调用**（同进程） | `import { xxx } from '../../mgmt/iam/ready.js'` |
| 主服务 → 业务逻辑 | **直接函数调用**（同进程） | `createMemoViaBase()` → `pipeEntityWrite()` → database |
| 主服务 → MCP Server | **HTTP 反向代理**（mcp-proxy） | `/mcp` → `https://127.0.0.1:10175/mcp` |
| MCP Server → 主服务 | **HTTP REST API 调用** | `api-client.ts` → `https://127.0.0.1:5170/api/mcp/*` |
| 组件间事件通知 | **发布/订阅模式**（同进程内存） | `publishDomainEvent()` / `subscribeDomainEvent()` |
| 异步任务 | **进程内消息队列** | `getSystemMq()` → outbox 模式 |
| 服务注册与发现 | **内存注册表 + JSON 持久化** | `registerInstance()` / `listHealthyInstances()` |
| 服务间授权 | **East-West Token**（同进程验证） | `issueEastWestToken()` / `assertEastWestToken()` |

### 3.2 关键发现

1. **全部底座组件为同进程嵌入式架构**：runtime-base 下 33 个组件（L0 8 + L1 25）全部通过直接 import 互相调用，无任何 HTTP 或 RPC 边界。

2. **服务协作管控为"逻辑"而非"物理"隔离**：
   - `routeInternalService()` 虽然实现了注册发现 + 授权 + East-West Token 的完整逻辑
   - 但实际调用时，调用方和被调用方在同一个进程中，token 签发后立即在同函数内验证
   - 这是为未来多实例部署预留的能力，当前是嵌入式模拟

3. **MCP 是唯一的跨进程通信**：
   - MCP Server 运行在独立进程（sidecar 模式）
   - 主服务 ↔ MCP Server 之间是双向 HTTP 调用
   - 已明确禁止嵌入式 MCP（`CYP_MCP_EMBED_SERVER` 设为 true 会直接抛错）

4. **事件和 MQ 均为进程内**：
   - 领域事件（`publishDomainEvent`）是同进程内的发布订阅
   - 消息队列（`getSystemMq`）是内存队列 + outbox 文件持久化

---

## 四、现有加密/安全组件清单

### 4.1 安全相关组件一览

| 组件 | 路径 | 核心职责 | 关键能力 |
|------|------|----------|----------|
| **密钥保险箱 KMS** | `l1/mgmt/kms/ready.ts` | 敏感凭证加密存储 | AES-256-GCM 信封加密、master key 派生、密钥轮换/回滚、SPIFFE 信任根、工作负载证书 |
| **身份访问管控 IAM** | `l1/mgmt/iam/ready.ts` | 认证与治理 | 用户认证、登录治理（封禁/延迟/挑战）、kill switch、API 预算 |
| **RBAC 权限矩阵** | `l1/mgmt/rbac/ready.ts` | 授权控制 | 角色权限、租户权限、权限校验中间件 |
| **前端安全防护** | `l1/mgmt/fesec/ready.ts` | 前端侧安全 | CSP 策略、幂等性保护、XSS 防护 |
| **风险运行管控** | `l1/mgmt/risk/ready.ts` | 风险处置 | 告警收敛、处置记录、风险工单 |
| **公开接入安全** | `l1/pub/acc/ready.ts` | 零信任 & 接入安全 | IP 白名单、TLS 强制策略、零信任守卫、公开面访问控制 |
| **开放治理** | `l1/pub/open/ready.ts` | 开放平台治理 | 契约管理、开放接口管控 |
| **审计中心** | `l1/host/audit/ready.ts` | 安全审计 | 审计日志、操作留痕、审计查询 |
| **安全遥测** | `l1/host/telem/ready.ts` | 安全指标采集 | 设备指纹、异常行为检测、导出遥测 |
| **全链路追踪** | `l1/mgmt/trace/ready.ts` | 追踪与溯源 | Trace ID、调用链标记 |
| **错误码中心** | `l1/mgmt/code/ready.ts` | 统一错误处理 | 统一错误码、全局错误捕获、请求 ID 注入 |
| **弹性韧性** | `l1/host/resil/` | 可用性安全 | 熔断、降级、舱壁、出站治理 |
| **网关中心** | `l1/host/biz/` | 入口安全 | 限流、并发控制、版本校验、金丝雀 |

### 4.2 KMS 详细能力

密钥保险箱（`RB-L1-MGMT-KMS-01`）是当前最核心的加密组件：

```
核心能力：
├── 信封加密：AES-256-GCM，配置侧只存 { cipher: key-id }
├── Master Key 管理：
│   ├── 优先 CYP_KMS_MASTER_KEY 环境变量注入
│   └── 缺省由机器码（hostname+platform+arch+username）scrypt 派生
├── 密钥生命周期：
│   ├── putSecret / resolveSecret
│   ├── rotateSecret（支持轮换，保留上一版密文）
│   └── rollbackSecret（回滚到上一版）
├── 信任基础设施：
│   ├── SPIFFE 信任根（runtimebase.local）
│   ├── 工作负载证书签发与轮换（24h TTL）
│   └── 双证书过渡（distributed → switched → revoke）
└── 完善性自检（K1-K7）：
    ├── K1：日志无明文
    ├── K2：环境变量无明文密钥
    ├── K3：dump 文件无明文
    ├── K4：引用格式校验
    ├── K5：轮换审计
    ├── K6：回滚验证
    └── K7：解析失败阻断审计
```

### 4.3 安全相关 ready.ts 文件路径汇总

```
packages/server/src/runtime-base/
├── l1/mgmt/kms/ready.ts          # 密钥保险箱
├── l1/mgmt/iam/ready.ts          # 身份访问管控
├── l1/mgmt/rbac/ready.ts         # RBAC 权限矩阵
├── l1/mgmt/fesec/ready.ts        # 前端安全防护
├── l1/mgmt/risk/ready.ts         # 风险运行管控
├── l1/mgmt/trace/ready.ts        # 全链路追踪
├── l1/mgmt/code/ready.ts         # 错误码/统一响应
├── l1/pub/acc/ready.ts           # 公开接入安全/零信任
├── l1/pub/open/ready.ts          # 开放治理
├── l1/host/audit/ready.ts        # 审计中心
├── l1/host/telem/ready.ts        # 安全遥测
├── l1/host/biz/ready.ts          # 网关中心（限流/入口安全）
├── l1/host/biz/mcp-proxy.ts      # MCP 协议入站反代安全
├── l1/host/biz/admission.ts      # 准入控制（IP 解析/XFF 信任）
├── l1/host/resil/ready.ts        # 弹性韧性（入站）
├── l1/host/resil/egress.ts       # 出站治理（熔断/电路）
└── l0/infra/log/obs-store.ts     # 可观测性日志存储（安全审计依赖）
```

---

## 五、可以拆分为独立端口的服务候选列表

### 5.1 评估维度

| 维度 | 说明 |
|------|------|
| **独立性** | 组件是否有清晰的边界，可否独立部署 |
| **耦合度** | 与其他组件的 import / 调用依赖程度 |
| **现有通信** | 当前是否已有 HTTP/RPC 接口形态 |
| **安全敏感** | 是否涉及密钥/认证等高敏操作 |
| **改造收益** | 拆分后在隔离性/可扩展性/安全性方面的收益 |

### 5.2 候选分级

#### P0：已具备独立形态，拆分成本最低

| 候选服务 | 现状 | 独立端口建议 | 理由 |
|----------|------|-------------|------|
| **MCP Server** | 已独立进程 + 独立端口（10175 环回） | 保持 10175（当前已是 sidecar 模式） | 已经是 sidecar 架构，仅需评估是否需要对外开放端口 |
| **KMS 密钥保险箱** | 嵌入式，有清晰 API 边界（putSecret/resolveSecret/rotate） | 新增端口，建议 10176 环回 | 安全敏感，独立进程可降低明文泄漏面；API 简洁，依赖少 |

#### P1：边界清晰，改造中等

| 候选服务 | 现状 | 独立端口建议 | 理由 |
|----------|------|-------------|------|
| **认证服务（IAM + RBAC）** | 嵌入式，有独立中间件和 API | 新增端口，建议 10177 | 安全敏感；已有 authenticate/requirePermission 等清晰接口；与业务逻辑耦合度可控 |
| **审计中心** | 嵌入式，有独立 API 和存储 | 新增端口，建议 10178 | 写入路径清晰（recordAudit），查询路径独立；可独立扩容和审计 |
| **配置管控中心** | 嵌入式，有热更新/版本/回滚 API | 新增端口，建议 10179 | 控制面与数据面分离的典型场景；已有 applyHotConfig/rollbackConfig 接口 |

#### P2：可拆分但耦合较深

| 候选服务 | 现状 | 独立端口建议 | 理由 |
|----------|------|-------------|------|
| **全链路日志/可观测性** | 嵌入式，SQLite 存储 + 查询 API | 新增端口 | 数据量大，独立后可独立调优存储；但当前被大量组件直接 import log() |
| **告警中心** | 嵌入式，有独立 ticket/outbox 机制 | 新增端口 | 边界较清晰，但依赖事件订阅和风险管控联动 |
| **任务调度中心** | 嵌入式，有 jobs/saga 机制 | 新增端口 | 边界清晰，但依赖业务回调和数据库操作 |

#### P3：不建议拆分（强耦合/嵌入式合理）

| 组件 | 原因 |
|------|------|
| **缓存 (l0/infra/cache)** | 内存缓存，进程内才有意义；独立后反而增加延迟 |
| **消息队列 (l0/infra/mq)** | 当前是内存队列 + 文件 outbox；若独立需引入真正的 MQ 中间件 |
| **数据库 (l0/infra/db)** | SQLite 本地文件数据库，不适合独立端口；若要独立应改用 C/S 数据库 |
| **网关中心 (l1/host/biz)** | 入口门面，必须和业务 API 在同一进程才能做限流/路由 |
| **前端安全防护 (l1/mgmt/fesec)** | Express 中间件形态，必须嵌入请求链路 |
| **弹性韧性 (l1/host/resil)** | 入站熔断/舱壁是中间件，必须在请求链路内 |
| **链路追踪 (l1/mgmt/trace)** | 贯穿全链路的上下文，独立会大幅增加调用开销 |

### 5.3 推荐拆分路径（分阶段）

**第一阶段：验证模式**
- KMS 密钥保险箱 → 独立端口（127.0.0.1:10176）
- 验证跨进程加密调用的性能和可靠性
- 收益：安全隔离，明文只在 KMS 进程内存中

**第二阶段：安全面独立**
- IAM + RBAC 认证服务 → 独立端口
- 审计中心 → 独立端口
- 收益：安全面与业务面隔离，符合零信任原则

**第三阶段：控制面独立**
- 配置管控中心 → 独立端口
- 告警中心 → 独立端口
- 收益：控制面与数据面分离，可独立扩缩容

**第四阶段：数据面拆分（需架构升级）**
- 可观测性日志 → 独立端口 + 独立存储
- 任务调度 → 独立端口
- 前提：数据库从 SQLite 迁移到 C/S 架构

---

## 六、关键发现总结

1. **当前是典型的单体嵌入式架构**：33 个底座组件全部运行在同一个 Express 进程、同一个 5170 端口中，通过直接 import 互相调用。

2. **MCP 是唯一的 sidecar 先例**：已经验证了「主端口 + 环回 sidecar + 网关反代」的模式可行，可作为其他服务拆分的参考范式。

3. **服务协作管控已预埋**：`routeInternalService()`、`issueEastWestToken()`、`selectHealthyInstance()` 等机制已实现，未来多端口/多服务时可直接启用物理隔离。

4. **KMS 是拆分优先级最高的安全组件**：API 边界最清晰、安全敏感性最高、依赖最少，且已有完整的完善性自检体系。

5. **拆分的主要挑战**：
   - 组件间直接 import 依赖极深（每个组件平均 import 5+ 其他组件）
   - 数据库是 SQLite 本地文件，无法跨进程共享
   - 事件/消息是进程内模式，跨进程需要引入真正的 MQ
   - Express 中间件形态的组件（网关、安全、限流）天然适合嵌入式

---

> 报告生成完毕。相关代码路径均为绝对路径，可直接跳转验证。
