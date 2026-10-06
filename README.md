# CYP-memo 备忘录系统

一款现代化的备忘录管理系统，提供完整的中文界面和丰富的功能。

## 作者信息

- **作者**: CYP
- **邮箱**: nasDSSCYP@outlook.com
- **版本**: 2.0.0

---

## 项目简介

CYP-memo 是一款基于浏览器的现代化备忘录管理系统，采用前后端分离架构：

- **统一壳（App）** - 备忘录 + Owner 租户运维（`/tenant*`）同一产品壳
- **API 服务器** - 提供 RESTful API，使用 SQLite（sql.js）存储
- **桌面客户端** - 基于 Electron 的跨平台桌面应用，支持 Windows/macOS/Linux

---

## 核心特性

| 功能 | 说明 |
|------|------|
| 双重认证 | 账号密码 + 个人令牌，注册时自动生成 |
| 富文本编辑 | 基于 TipTap，支持 Markdown |
| 文件管理 | 支持附件上传，最大 10GB |
| 权限管理 | 分级权限，主账号/子账号体系 |
| 备忘录共享 | 主账号与子账号数据共享 |
| 分享功能 | 生成分享链接，支持密码和过期时间 |
| 数据统计 | 备忘录统计分析 |
| 深色主题 | 支持浅色/深色主题切换 |
| 高性能 | SQLite 数据库，性能提升 10-100 倍 |
| 桌面客户端 | 支持 Windows/macOS/Linux 三大平台 |
| 自动更新 | 全端支持版本检测和自动更新 |
| 离线支持 | 桌面端支持离线模式和数据同步 |

---

## 技术栈

| 类别 | 技术 |
|------|------|
| 前端框架 | Vue 3 + TypeScript |
| UI 组件库 | Element Plus |
| 富文本编辑器 | TipTap |
| 状态管理 | Pinia |
| 路由 | Vue Router |
| 后端 | Express.js |
| 数据库 | SQLite |
| 桌面端 | Electron |
| 构建工具 | Vite |
| 测试框架 | Vitest + fast-check |
| 包管理 | pnpm (Monorepo) |

---

## 快速开始

### 环境要求

- Node.js >= 20.19.6
- pnpm >= 10（仓库 `packageManager: pnpm@10.11.0`）

### 推荐方式：单节点集群部署（Nomad + Consul · 生产级）

> **生产级推荐**：单节点集群部署是 CYP-memo 的标准生产级部署方式。单节点即最小完整集群，具备全部生产级能力（Consul、Nomad、mTLS、限流、熔断、服务网格、可观测性）。未来扩容只需加机器，不改配置、不改代码。
>
> 架构宣言：[docs/unified-runtime.md](docs/unified-runtime.md) · 部署文档：[DEPLOY.md](DEPLOY.md)

**最小部署（1 节点 = 最小完整集群）：**

```bash
# 1. 克隆项目
git clone <repository-url>
cd cyp-memo

# 2. 安装依赖
pnpm install

# 3. 构建生产版本
pnpm build

# 4. 启动单节点 Consul + Nomad（最小完整集群）
#    详见 DEPLOY.md → 统一运行模式部署 → 最小部署

# 5. 部署 CYP-memo
nomad job run deploy/nomad/cyp-memo-server.nomad
nomad job run deploy/nomad/cyp-memo-monitoring.nomad
```

**访问地址**：`https://<服务器IP>:5170`

> 从 1 节点扩到 N 节点，只需加机器 + 加入集群，零停机。详见 [统一运行模式架构宣言 → 扩展路径](docs/unified-runtime.md#扩展路径)。

### 轻量方式：直接进程部署（systemd / SCM · 生产级）

> **生产级部署方式之一**：直接进程部署是 CYP-memo 的轻量生产级部署方式，适合单节点固定场景。由系统服务管理器（systemd / Windows SCM）直接管理进程，不需要 Nomad/Consul 编排，业务代码、端口、API 与集群部署完全一致。

```bash
# 克隆项目
git clone <repository-url>
cd cyp-memo

# 安装依赖
pnpm install

# 构建生产版本
pnpm build

# 启动生产服务（systemd / SCM 管理，配置为生产级）
# 详见 DEPLOY.md → 直接进程部署
```

> **两种部署方式对比**：单节点集群部署（Nomad+Consul）与直接进程部署（systemd/SCM）都是生产级，业务代码完全一致、端口完全一致、API 完全一致，仅编排工具不同，适用场景不同。

### 本机联调（底座优先 · 生产配置基准）

> **底座优先，禁止第二套**：所有开发在统一运行底座上进行，Vite HMR 等工具链仅作旁路挂载，不替代底座。
>
> 开发流程：**启动底座 → 挂载工具链 → 开发验证 → 卸载工具链 · 底座原生验证**

详见 [LOCAL_DEV.md](LOCAL_DEV.md)（底座优先开发指南 · CI02 生产配置基准）和 [底座优先开发流程指南](docs/development-workflow.md)。Windows:

```bat
scripts\start\start-local.bat    :: 第一步：启动底座（生产级，唯一入口 :5170）
pnpm local:hmr                   :: 第二步：挂载 Vite HMR 旁路（:5173，代理到底座）
:: 第三步：日常开发（5173 享受 HMR，API 走底座 5170）
:: 第四步：关闭 HMR，直接访问 5170 验证底座原生运行
scripts\verify\verify-e2e.bat    :: 全量 e2e 验证
scripts\stop\stop-local.bat      :: 停止
```


### 访问地址

> **CI02**：与生产同口径。进程绑定 `0.0.0.0`，用**实机网卡 IP**访问；禁止以 `localhost` / 仅环回冒充生产访问地址。

| 服务 | 地址 |
|------|------|
| **产品入口（唯一）** | https://\<服务器IP\>:5170（API 同域静态 + 业务；正规优先否则自签） |
| MCP 协议 | 同一入口 `https://\<服务器IP\>:5170/mcp`（旁路进程仅环回；`local:all` 同启） |
| 租户运维 | https://\<服务器IP\>:5170/tenant |
| **运维控制台**（统一运行模式） | Consul UI: `http://<服务器IP>:8500` · Nomad UI: `http://<服务器IP>:4646` |

本机当前 IP 示例（启动脚本会打印实测值）：启动后看控制台「Product」行。可选 `pnpm local:hmr` 仅内部 Vite 热重载（端口 5173），**禁止**当作产品主链接。

### 默认 Owner

- 用户名：`admin`（空库首次 bootstrap）
- 口令：通过环境变量 `CYP_BOOTSTRAP_OWNER_PASSWORD` 注入（见 `.env.example`）；**文档不写明文默认口令**
- 首次登录后请立即修改

> ⚠️ 切勿把真实口令提交到版本控制。

### MCP 客户端接入（P4）

设计 SSOT：`docs/design/CYP-memo-P2-MCP服务设计报告.md`。

| 项 | 说明 |
|----|------|
| 启动 HTTPS | **`pnpm local:all` / start-local 自动同启旁路**；客户端连 **产品入口** `https://<服务器IP>:5170/mcp`（旁路只绑 127.0.0.1:13175）；排障可单独 `pnpm mcp:local` |
| 探活 / 发现 | 产品面 `GET /mcp/healthz`、`GET /mcp/discover`；旁路环回 `GET /healthz`、`GET /discover`（须带 `MCP-Protocol-Version`） |
| 协议头 | `/mcp` 与 `/discover` 必须带头；缺头或乱版本 400/`-32020`；产品发现面基线 `2026-07-28`；当前官方 SDK 会话认 `2025-11-25`（同列入 accepted） |
| 传输边界 | **禁止**独立旧 HTTP+SSE；SSE 仅 Streamable HTTP 内通道；设 `CYP_MCP_SSE_LEGACY=1` 会拒绝启动 |
| 部署形态 | **仅旁路** `packages/mcp`（环回）；**不做**嵌入同进程 MCP Server；局域网经运行底座网关中心门面反代；一键启动必须同启旁路 |
| 启动 stdio | `pnpm mcp:stdio`；Cursor 等配 command=`pnpm` args=`--filter @cyp-memo/mcp exec tsx src/index.ts --stdio` |
| 公开查询 | 无令牌；仅 `mcpPublic=true` 资源；最高层默认 summary |
| 全功能 | 个人令牌 `POST /api/mcp/pat`（≤30 天）或 OAuth 授权码+PKCE；MCP 旁路经 `POST /api/mcp/exchange` 换发 `cypmcpds_` 下游令牌再调业务 REST（PAT 直打 `/api/memos` 等会 401） |
| OAuth | `GET /.well-known/oauth-authorization-server` 与 `GET /api/mcp/oauth/metadata`；DCR `POST /api/mcp/oauth/register`；授权 `GET /api/mcp/oauth/authorize`（须登录会话）；换票 `POST /api/mcp/oauth/token` |
| 设置 / 编辑 | 帮助中心 MCP 页签发与吊销 PAT；备忘录/文件库勾选允许 MCP 公开查询 |
| 默认能力 | 仅 query；写能力默认关，可在帮助中心「策略」或热叠读配置打开 |
| 业务 API | MCP 调本机 `https://127.0.0.1:5170/api`（可用 `CYP_MCP_API_BASE` 覆盖；自签时旁路自动放宽校验） |

Cursor（stdio）示例（项目或用户 MCP 配置）：

```json
{
  "mcpServers": {
    "cyp-memo": {
      "command": "pnpm",
      "args": ["--filter", "@cyp-memo/mcp", "exec", "tsx", "src/index.ts", "--stdio"],
      "cwd": "D:/kf/kf/CYP-memo",
      "env": {
        "CYP_MCP_API_BASE": "https://127.0.0.1:5170/api",
        "CYP_MCP_PAT": "<可选·全功能轨个人令牌>"
      }
    }
  }
}
```

> 公开轨可不设 `CYP_MCP_PAT`。须先启动业务 API（`pnpm local:server`）。HTTP 环回客户端须带 `MCP-Protocol-Version`（发现面可用 `2026-07-28`；当前官方 SDK 工具会话用 `2025-11-25`）。

---

## 项目结构

```
cyp-memo/
├── packages/
│   ├── shared/          # 共享库
│   │   ├── config/      # 配置（版本信息）
│   │   ├── database/    # 数据访问层 (DAO)
│   │   ├── managers/    # 业务逻辑管理器
│   │   ├── storage/     # 存储适配器
│   │   ├── types/       # TypeScript 类型定义
│   │   ├── utils/       # 工具函数
│   │   └── workers/     # Web Workers
│   ├── app/             # 统一产品壳（含 /tenant 运维）
│   ├── admin/           # 已退役（勿启动；无 5174）
│   ├── server/          # API 服务器
│   ├── mcp/             # MCP 旁路服务（stdio / 环回 Streamable HTTP）
│   └── desktop/         # 桌面客户端 (Electron)
├── scripts/             # 构建脚本
├── docs/                # 详细文档
└── .version/            # 版本历史
```

---

## 功能模块

### 用户认证

- 账号密码登录/注册
- 个人令牌登录（64位十六进制）
- 注册时自动生成令牌
- 安全问题设置与验证
- 密码/账号找回功能

### 账号体系

- **主账号**: 完整权限，可创建子账号
- **子账号**: 由主账号创建，权限受限
- 主账号可查看所有子账号的备忘录
- 不同主账号之间数据完全隔离

### 备忘录管理

- 创建、编辑、删除备忘录
- 富文本编辑（Markdown 支持）
- 标签分类系统
- 优先级设置（低/中/高）
- 全文搜索和排序
- 显示创建人信息

### 文件附件

- 文件上传与下载
- 附件与备忘录关联
- 存储空间统计
- 孤立文件清理

### 分享功能

- 生成分享链接
- 可选密码保护
- 可设置过期时间
- 访问次数统计

### 数据管理

- JSON/Excel/PDF 导入导出
- 导入模板下载
- 数据清理功能

### 系统设置

- 主题切换（浅色/深色）
- 字体大小调整
- 自动清理配置

---

## 部署方式

> **部署权威**：[`DEPLOY.md`](DEPLOY.md)（**统一运行模式** · 一套架构无限伸缩 · 最小部署 1 节点 = 最小完整集群）。
> 架构宣言：[`docs/unified-runtime.md`](docs/unified-runtime.md)（五条铁律 · 五层架构 · 性能保障）

| 通道 | 入口 |
|------|------|
| **单节点集群部署（生产推荐）** | Consul + Nomad 编排 · 最小部署 1 节点 → 扩容 N 节点 · 零停机扩展 |
| **直接进程部署（生产级 · 轻量）** | systemd / Windows SCM 管理 · 单节点固定场景 · 同架构同端口 |
| 服务器面板（宝塔/1Panel） | `scripts/install/install-panel.sh` |
| NAS 原生（飞牛/群晖/威联） | `scripts/install/install-nas.sh` · `deploy/nas/README.md` |
| Windows | `scripts/install/install-windows.ps1` |
| Linux / macOS | `scripts/install/install-unix.sh` · `deploy/systemd/cyp-memo.service` |
| 本机联调（生产配置基准） | `scripts/start/start-local.*`（见 `LOCAL_DEV.md`） |

验收：`node scripts/verify/verify-runtime-base.mjs` 与 `node scripts/verify/verify-complete-form.mjs`，再加 `GET /healthz/ready`。闭集是 `data.runtimeBase.items` 的 35 个稳定 ID。质量门禁、生产 Mock、一键部署、系统通知与**对象存储**不进闭集（对象存储仅为扩展点，本机 `{dataDir}/uploads`）。
SSOT：军械库统一运行底座架构 V1.8.6。

### 环境变量（配置管控注入）

> 权威在配置管控；下表为键名说明。禁止以手工拼装代替配置管控生成/注入。

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `APP_ENV` | prod | 生产唯一基准 |
| `NODE_ENV` | production | 与生产一致 |
| `PORT` | 5170 | 服务端口 |
| `DATA_DIR` | （本机默认 server/data） | 数据 / 日志 / 管控 / 调度目录根 |
| `LOG_LEVEL` | info | 日志级别 |
| `TZ` | Asia/Shanghai | 时区 |
| `CYP_BOOTSTRAP_OWNER_PASSWORD` | （空） | 仅空库首次 Owner 种子 |

### 源码构建启动

```bash
pnpm build
cd packages/server && pnpm start
```

### 桌面端

支持 Windows / macOS / Linux（Electron）。构建：`pnpm --filter @cyp-memo/desktop build:win|mac|linux`。详见 Release 产物说明。

### 数据备份与恢复

```bash
./scripts/snapshot/backup.sh
./scripts/snapshot/restore.sh backups/cyp-memo-backup-YYYYMMDD_HHMMSS.tar.gz
```

### PM2 部署

```bash
pm2 start packages/server/dist/index.js --name cyp-memo
pm2 startup
pm2 save
```

---

## 故障排除

### 常见问题

#### 1. 进程启动失败

```bash
# 查看 DATA_DIR 下日志
# Windows: packages\server\data\logs\
# 或安装时指定的 DATA_DIR/logs/runtime/

# 就绪探针
curl -k https://127.0.0.1:5170/healthz/ready
powershell -File scripts/verify/verify-five-centers.ps1 -DataDir packages/server/data
```

#### 2. 端口被占用

```bash
# 检查端口占用（Windows）
netstat -ano | findstr :5170
# 修改 .env 中 PORT=
```

#### 3. 数据目录权限

```bash
# 确保运行用户可写 DATA_DIR、logs、governance
# 见 DEPLOY.md 与 deploy/nas/README.md
```

#### 4. 健康检查失败

```bash
curl -k https://127.0.0.1:5170/api/health
curl -k https://127.0.0.1:5170/healthz/ready
```

#### 5. 数据库初始化失败

```bash
# 检查 DATA_DIR 下 database.sqlite 与启动日志
# 回滚用 scripts/rollback 或 restore.sh
```

### 日志级别说明

| 级别 | 说明 |
|------|------|
| debug | 详细调试信息 |
| info | 一般运行信息（默认） |
| warn | 警告信息 |
| error | 错误信息 |

### 获取帮助

如果问题仍未解决：

1. 查看 `{DATA_DIR}/logs` 与进程标准输出
2. 检查系统资源（CPU / 内存 / 磁盘）
3. 提交 Issue 并附上日志信息

---

## 本机联调命令

```bash
# 本机联调（配置仍为 prod；脚本统一为 local）
pnpm local

# 构建生产版本
pnpm build

# 运行测试
pnpm test

# 代码检查
pnpm lint

# 代码格式化
pnpm format
```

---

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/health | 健康检查 |
| POST | /api/users | 创建用户 |
| GET | /api/users/:id | 获取用户 |
| PATCH | /api/users/:id | 更新用户 |
| DELETE | /api/users/:id | 删除用户 |
| POST | /api/memos | 创建备忘录 |
| GET | /api/memos/:id | 获取备忘录 |
| GET | /api/users/:userId/memos | 获取用户备忘录 |
| PATCH | /api/memos/:id | 更新备忘录 |
| DELETE | /api/memos/:id | 删除备忘录 |
| POST | /api/files | 上传文件 |
| GET | /api/files/:id/blob | 下载文件 |
| POST | /api/shares | 创建分享 |
| GET | /api/shares/:id | 获取分享 |
| DELETE | /api/data/clear | 清空数据库 |

---

## 文档

| 文档 | 说明 |
|------|------|
| [统一运行模式架构宣言](docs/unified-runtime.md) | 五条铁律 · 五层架构 · 设计开发五大原则 · 性能保障 · 扩展路径 |
| [底座优先开发流程指南](docs/development-workflow.md) | 四步开发法 · 工具链旁路规范 · 禁止清单 · 命令速查 |
| [运行底座一致性审计清单](docs/audit-runtime-base-checklist.md) | P5 开发审计 · P7 上线前审计 · 检查项 · 执行指南 |
| [部署](DEPLOY.md) | 统一运行模式 · 面板/NAS/Windows/Unix 原生进程部署 |
| [本机联调](LOCAL_DEV.md) | 底座优先开发指南 · 生产配置基准 |
| [运维](ops/README.md) | 备份/回滚/探针 |
| [产品版本化](docs/PRODUCT_VERSIONING.md) | 升版与发版纪律 |
| [端口明细](docs/port-usage-detail.md) | 统一运行模式端口总表（v3.0） |

---

## 开源依赖

- Vue 3 (MIT)
- Element Plus (MIT)
- TipTap (MIT)
- Pinia (MIT)
- Vue Router (MIT)
- Express.js (MIT)
- SQLite (Public Domain)
- Electron (MIT)
- Vite (MIT)
- TypeScript (Apache-2.0)

---

## 许可证

MIT License

---

## 版权声明

Copyright © 2026 CYP. All rights reserved.

---

**联系方式**: nasDSSCYP@outlook.com
