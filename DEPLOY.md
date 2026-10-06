# CYP-memo · 部署文档（统一运行模式 · 原生进程）

| 项 | 值 |
|----|-----|
| 项目 | CYP-memo · v2.0.0 |
| 部署法 | **统一运行模式**（Unified Runtime）· 一套架构，无限伸缩 |
| 架构基准 | [统一运行模式架构宣言](docs/unified-runtime.md) · 军械库统一运行底座架构 **V1.8.6** |
| 形态 | 面板 / NAS / Windows / Unix 原生进程（Server 发行包 + 桌面安装包） |
| 部署规模 | **最小部署**（1 节点 = 最小完整集群）→ **扩容部署**（N 节点）同一架构 |

> **核心原则**：不分模式，只有一套生产级架构。单节点即最小完整集群，多节点即扩容器。所有能力默认全开（Consul、Nomad、mTLS、限流、熔断、服务网格）。不存在「单机版」和「集群版」的区别。

## 矩阵摘要

| 层 | 稳定 ID 前缀 |
|----|----------------|
| L0 基础设施 | `RB-L0-INFRA-*` |
| L0 协调 | `RB-L0-COORD-*` |
| L1 管控 | `RB-L1-MGMT-*` |
| L1 托管 | `RB-L1-HOST-*` |
| L1 协作 | `RB-L1-COL-*` |
| L1 公开 | `RB-L1-PUB-*` |

探针：`pnpm verify:runtime-base` · `GET /healthz/ready`（`data.runtimeBase.items` 为 35 个稳定 ID）。

静态门禁（发版前建议）：`pnpm verify:gates`（encoding · CI02 · **font-glyph 文案字形** · gateway-center-naming；**font-glyph 不检、不改图标**）。

## Windows SCM

| 项 | 值 |
|----|-----|
| 注册 | `scripts/start/register-windows-scm.ps1`（NSSM 或 WinSW） |
| 卸载 | `scripts/start/unregister-windows-scm.ps1` |
| WinSW 描述 | `deploy/windows/cyp-memo.xml` |
| 安装入口 | `scripts/install/install-windows.ps1` 优先走 SCM；缺工具才进程回退 |
| 禁止 | 登录计划任务冒充服务；`sc create node.exe` 无 SCM 适配 |

Linux 对照单元：`deploy/systemd/cyp-memo.service`（`Type=notify`）。

## MCP 旁路进程

| 项 | 值 |
|----|-----|
| 包 | `packages/mcp`（`@cyp-memo/mcp`） |
| 传输 | stdio · Streamable HTTP（旁路环回协议面；内含可选 SSE 流）· 局域网经产品入口 `/mcp` 反代；**不**嵌入 server 同进程 MCP Server；**不**提供独立旧 HTTP+SSE |
| 启动 | **`pnpm local:all` / `start-local` 自动同启** 旁路 HTTPS 环回 `:13175`（规则 24.21）；客户端用产品 `:5170/mcp`；排障可单独 `pnpm mcp:local`；Cursor 子进程用 `pnpm mcp:stdio` |
| 探活 / 发现 | 产品 `GET /mcp/healthz`、`GET /mcp/discover`；旁路环回 `/healthz`、`/discover`（须 `MCP-Protocol-Version`） |
| 公开轨 | 无令牌；仅配置为公开的备忘录/文件（`mcpPublic`） |
| 全功能轨 | 个人令牌 PAT：`POST /api/mcp/pat`；请求头 `Authorization: Bearer` |
| 写能力 | 默认关闭；部署覆盖 `CYP_MCP_CAP_MEMO_WRITE` / `CYP_MCP_CAP_FILE_WRITE` |
| 观测 | `POST /api/mcp/audit` → security 观测（不打业务库整库落盘） |
| 设计 | `docs/design/CYP-memo-P2-MCP服务设计报告.md` |

`APP_ENV=prod` 下产品入口仍绑 `0.0.0.0:5170`。MCP 旁路**只绑** `127.0.0.1:13175`，局域网客户端使用 `https://<网卡IP>:5170/mcp`。正规证书放 `{dataDir}/tls/official/cert.pem` 与 `key.pem`；未放置则自动私有 CA / ECDSA 自签（TLS 1.2+），叶子落 `{dataDir}/tls/leaf/`，证书主题 **CN=CYP-memo**（禁 MCP 字样）。**主 API 与 MCP 凡需 TLS 的监听面同口径、同产品证书身份**。客户端须信任所用证书。**禁止**要求运维另开第二条手工命令才启用 MCP。

主 API 默认 HTTPS：`https://<网卡IP>:5170`；本机探针 `https://127.0.0.1:5170`；机检 `pnpm --filter @cyp-memo/server exec tsx scripts/api-tls-probe.ts`（`API_TLS_PROBE_PASS`）。

## 统一运行模式部署（Consul + Nomad）

> **生产推荐**：统一运行模式是 CYP-memo 的生产级部署方式。最小部署（1 节点）也运行完整的 Consul + Nomad，不是简化版。扩容部署（N 节点）只需加机器，不改配置、不改代码。

| 项 | 值 |
|----|-----|
| 架构 | 统一运行模式（Unified Runtime）· 五层架构 |
| 编排引擎 | Nomad + Consul（服务发现 + 服务网格） |
| 驱动 | Docker（默认） / exec（备选） |
| 最小部署 | 1 节点（Consul Server+Client / Nomad Server+Client 同体） |
| 扩容部署 | N 节点（Consul 3+ Server / Nomad 3+ Server + N Client） |
| Job Spec | `deploy/nomad/cyp-memo-server.nomad` |
| 监控栈 | `deploy/nomad/cyp-memo-monitoring.nomad` |
| 部署文档 | `docs/nomad-deployment-guide.md` |
| 架构宣言 | `docs/unified-runtime.md` |

### 架构分组（与 CI03 一服务一端口对齐）

| Group | 服务名 | 端口 | 说明 |
|-------|--------|------|------|
| `gateway` | `cyp-memo-gateway` | 5170 | 前端网关：静态资源 + 反代 API/MCP + TLS 终止 |
| `api` | `cyp-memo-api` | 10170 | 后端 API 服务（含嵌入式 KMS，可选独立） |
| `mcp` | `cyp-memo-mcp` | 13175 | MCP 旁路服务（可选，`enable_mcp` 控制） |

> **端口一致性**：以上端口在最小部署（1 节点）和扩容部署（N 节点）下完全相同，无任何差异。

### 最小部署（1 节点 = 最小完整集群）

适用场景：个人使用、小型团队、生产起步、POC 验证。

**特点**：
- Consul：1 Server + 1 Client（同进程，Server 与 Client 同体）
- Nomad：1 Server + 1 Client（同进程，Server 与 Client 同体）
- 业务服务：各 1 实例
- 存储：本地 SQLite
- **所有能力默认全开**：服务发现、mTLS、限流、熔断、服务网格、可观测性

**部署步骤**：
```bash
# 1. 安装 Consul + Nomad
# 2. 启动单节点 Consul（Server + Client 模式）
consul agent -server -bootstrap-expect=1 -data-dir=/opt/consul -config-dir=/etc/consul.d -bind=<本机IP> -client=0.0.0.0 -ui

# 3. 启动单节点 Nomad（Server + Client 模式）
nomad agent -server -bootstrap-expect=1 -data-dir=/opt/nomad -config-dir=/etc/nomad.d -bind=<本机IP> -client

# 4. 部署 CYP-memo
nomad job run deploy/nomad/cyp-memo-server.nomad
nomad job run deploy/nomad/cyp-memo-monitoring.nomad

# 5. 验证
nomad job status cyp-memo
consul members
```

### 扩容部署（N 节点 = 水平扩展）

适用场景：生产高可用、中大型团队、多租户、高并发。

**特点**：
- Consul：3+ Server（Raft 选举）+ N Client
- Nomad：3+ Server + N Client
- 业务服务：按需弹性伸缩
- 存储：主从复制 / 共享存储
- **与最小部署同一套架构、同一套配置、同一套端口**

**扩容步骤（零停机）**：
```bash
# 在新节点上执行相同部署，加入现有集群
consul agent -data-dir=/opt/consul -config-dir=/etc/consul.d -bind=<新节点IP> -client=0.0.0.0 -retry-join=<已有节点IP>
nomad agent -data-dir=/opt/nomad -config-dir=/etc/nomad.d -bind=<新节点IP> -client -retry-join=<已有节点IP>

# 验证节点已加入
consul members
nomad node status

# 业务服务自动在新节点上调度实例，无需手动操作
```

> **扩容承诺**：从 1 节点扩到 N 节点，只需加机器 + 加入集群，不改配置、不改代码、零停机。

### 直接进程部署（Direct Process Deployment · 生产级）

> **生产级部署方式之一**：直接进程部署是 CYP-memo 的轻量生产级部署方式，适合单节点固定场景。由系统服务管理器（systemd / Windows SCM）直接管理进程，不需要 Nomad/Consul 编排。业务代码、端口、API 与集群部署完全一致，仅编排工具不同。

| 维度 | 直接进程部署（生产级 · 轻量） | 单节点集群部署（生产级 · 推荐） |
|------|----------------------------|-------------------------------|
| 定位 | 单节点固定场景 · 轻量生产级 | 标准生产级 · 全能力 · 可扩容 |
| 编排工具 | systemd / Windows SCM | Nomad + Consul |
| 服务发现 | 本机环回（进程内置注册） | Consul 动态发现 + 健康检查 |
| mTLS | API 自签 + 嵌入式 mTLS | 服务网格 mTLS + 自动证书轮换 |
| 限流/熔断 | 应用内实现（嵌入式） | 服务网格实现 + 应用层兜底 |
| 可观测性 | 本地日志 + 嵌入式指标 | Prometheus + Grafana + 日志中心 |
| 扩缩容 | 垂直扩展（加资源） | 水平扩展（加节点 + 自动弹性） |
| 适用场景 | 单节点固定部署、NAS、面板 | 生产环境 / 多节点 / 高可用 |
| 业务代码 | 同一套 | 同一套 |
| 端口分配 | 完全一致 | 完全一致 |
| API 契约 | 完全一致 | 完全一致 |

> **核心原则**：两种部署方式都是生产级，没有高低之分，只是编排形态和适用场景不同。业务能力完全一致，未来从直接进程部署迁移到集群部署零代码变更。

详见 [统一运行模式架构宣言](docs/unified-runtime.md)。
