# 底座优先开发指南（本机联调 · 生产配置基准）

> **核心理念**：运行底座唯一，禁止第二套。所有开发都在统一运行底座上进行，工具链仅作旁路挂载，不替代底座。
>
> **CI02 铁律**：本机联调 = 生产配置基准。强制 `APP_ENV=prod`、`NODE_ENV=production`。  
> **禁止**把本机联调表述成独立配置面；源码挂载与热重载只是工具链，不改变配置基准。
>
> **完整开发流程**：[底座优先开发流程指南](docs/development-workflow.md) · [运行底座一致性审计清单](docs/audit-runtime-base-checklist.md)

Windows-first helpers under `scripts/`。根脚本统一 `local` / `local:all`（生产配置基准）；一键入口见下表。

---

## 底座优先四步开发法

```
┌──────────┬──────────┬──────────────────┬───────────────────────┐
│ 第一步    │ 第二步    │ 第三步            │ 第四步                 │
│ 启动底座  │ 挂载工具链 │ 在底座上开发验证  │ 卸载工具链·底座原生验证 │
└──────────┴──────────┴──────────────────┴───────────────────────┘
```

**第一步 · 启动底座**：`scripts\start\start-local.bat` → 5170 端口（生产级，全能力）
**第二步 · 挂载工具链**：`pnpm local:hmr` → 5173 端口（Vite HMR 旁路，代理到底座）
**第三步 · 开发验证**：日常开发用 5173 享受 HMR，但所有 API 走底座 5170
**第四步 · 底座原生验证**：关闭 5173，直接访问 5170，确认功能完整

> ⚠️ **第四步是必须的**：任何功能必须经过无工具链验证，确认不依赖旁路工具。

## One commands

| Action | Command |
|--------|---------|
| Start | `scripts\start\start-local.bat`（**自动同启** API `:5170` + MCP `:13175`） |
| Stop | `scripts\stop\stop-local.bat` |
| MCP 单独排障 | `pnpm mcp:local`（日常勿手工；已含在 local:all） |
| MCP stdio | `pnpm mcp:stdio`（Cursor 子进程） |
| Verify | `scripts\verify\verify-e2e.bat` |
| 运行底座闭集 35 | `verify-runtime-base.ps1` + `verify-runtime-base-cutin.ps1` + `verify-no-compat-dualpath.ps1` |
| 负压压测 | `scripts\verify\verify-runtime-base-stress.ps1`（并发 CRUD + 410/400/503 洪水 + 防重风暴） |
| Auth smoke (S-03 partial) | `scripts\verify\verify-s03-auth.ps1` |
| 生产Mock约束 零 Mock | `scripts\verify\verify-no-prod-mock.ps1` |
| Diagnose | `scripts\diagnose\diagnose.bat` |
| Clean | `scripts\clean\clean-local.bat` |

PowerShell equivalents: same names with `.ps1`.

## Prerequisites

- Node.js >= 20.19.6, pnpm >= 10
- Dependencies installed (`pnpm install` or `.workbuddy\install-with-vs.bat` on Windows when native modules need VS tools)

## URLs after start

> **CI02 = 生产访问形态**：绑定 `0.0.0.0`，浏览器用**实机网卡 IP**；`127.0.0.1` 仅作本机探针可选。

| Service | URL |
|---------|-----|
| **产品入口（唯一）** | https://\<服务器IP\>:5170（API 同域静态 + 业务；正规 `{dataDir}/tls/official/` 优先，否则叶子 `{dataDir}/tls/leaf/`，主题 CN=CYP-memo） |
| MCP（同启旁路 · 环回） | 旁路 `https://127.0.0.1:13175`；客户端用产品 `https://\<服务器IP\>:5170/mcp` |
| MCP 探活 / 发现 | 产品 `/mcp/healthz` `/mcp/discover`；旁路环回 `/healthz` `/discover`（须 `MCP-Protocol-Version`） |

Cursor stdio 样例见 README「MCP 客户端接入」。
| Health | https://\<服务器IP\>:5170/api/health |
| Live | https://\<服务器IP\>:5170/health/live （进程存活 JSON；别名 `/live`） |
| Ready | https://\<服务器IP\>:5170/healthz/ready |
| Ready · 底座投影 | `data.runtimeBase.items` 闭集 35 个稳定 ID |
| Tenant 运维 | https://\<服务器IP\>:5170/tenant |

> **统一运行底座**：闭集 35。机检 `node scripts/verify/verify-runtime-base.mjs`。  
> VIEW-05：独立管理端 **5174 已废止**；勿再启动 `packages/admin`。  
> **R-PROD-004**：不分联调与业务，始终同一个产品入口（`:5170`）。可选热重载 `pnpm local:hmr` 仅内部工具（`:5173`），**禁止**广告为产品壳。

Owner 种子：`.env` 中设 `CYP_BOOTSTRAP_OWNER_PASSWORD`（空库）；留空则跳过种子，走自助注册。

## Config baseline（CI02）

| 变量 | 本机联调强制值 | 说明 |
|------|----------------|------|
| `APP_ENV` | `prod` | 生产唯一基准；其它取值一律拒绝并纠正为 prod |
| `NODE_ENV` | `production` | 与生产一致；其它取值一律纠正为 production |
| `LOG_LEVEL` | `info`（建议） | 勿默认 `debug` 冒充独立配置面 |

本机请用 `scripts/start/start-local.*`（生产配置基准）。

## Notes

- Start polls `/healthz/ready` until ready or timeout (`CYP_START_TIMEOUT`, default 120 seconds).
- Stop kills listeners on 5170（兼容清理残留 5173/5174 若仍有旧进程）。
- 单机原生进程不启用 Nomad/Consul；跨机多实例另开批次。

## Encoding (UTF-8 · 防乱码)

| 项 | 要求 |
|----|------|
| 文本落盘 | **UTF-8 无 BOM**（禁止 PowerShell 5.1 默认 `>` / `Out-File` → UTF-16） |
| 会话 | `chcp 65001` · `PYTHONUTF8=1` · `PYTHONIOENCODING=utf-8`（`scripts/*.bat` 与 `scripts/_internal/encoding-utf8.ps1` 已强制） |
| 捕获命令输出 | `powershell -File scripts\_internal\capture-utf8.ps1 -OutFile <path> -- <cmd>` |
| 机检 | `pnpm verify:encoding` · **`pnpm verify:ci02`** · `pnpm verify:font-glyph` · 或一并 **`pnpm verify:gates`**（含 gateway 命名；font-glyph **不检图标**） |
| 自动修复（UTF-16/NUL/BOM） | `python d:\kf\CYP-skill-arsenal\gcc\workspace\cmd-line\tools\phase-gate\cyp-tool-encoding-gate.py . --fix` |
| 军械库 SSOT | `cyp-tool-encoding-gate.py` · **`cyp-tool-ci02-prod-baseline-gate.py`** |

> 中文控制台乱码多为「错码页捕获后再落盘」；根治靠强制 UTF-8 会话 + 禁止 UTF-16 重定向，而非事后猜编码。
- Clean default keeps databases; `--purge` asks for `YES` and still skips DB.
- S-03 全量九类仍归 P6；`verify-s03-auth` 仅覆盖鉴权/租户部分。
