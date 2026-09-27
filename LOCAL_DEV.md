# 本机联调（生产配置基准）

> **CI02**：本机联调 = 生产配置基准。强制 `APP_ENV=prod`、`NODE_ENV=production`。  
> **禁止**把本机联调表述成独立配置面；源码挂载与热重载只是工具链，不改变配置基准。

Windows-first helpers under `scripts/`。根脚本统一 `local` / `local:all`（生产配置基准）；一键入口见下表。

## One commands

| Action | Command |
|--------|---------|
| Start | `scripts\start\start-local.bat` |
| Stop | `scripts\stop\stop-local.bat` |
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

| Service | URL |
|---------|-----|
| App（唯一产品壳） | http://localhost:5173 |
| API | http://localhost:5170 |
| Health | http://localhost:5170/api/health |
| Ready | http://localhost:5170/healthz/ready |
| Ready · 底座投影 | `data.runtimeBase.items` 闭集 35 个稳定 ID |
| Tenant 运维 | http://localhost:5173/tenant |

> **统一运行底座**：闭集 35。机检 `node scripts/verify/verify-runtime-base.mjs`。  
> VIEW-05：独立管理端 **5174 已废止**；勿再启动 `packages/admin`。  
> 5173 为本机 Vite 联调壳；生产由 API 同域或镜像静态提供。

Owner 种子：`.env` 中设 `CYP_BOOTSTRAP_OWNER_PASSWORD`（空库）；留空则跳过种子，走自助注册。

## Config baseline（CI02）

| 变量 | 本机联调强制值 | 说明 |
|------|----------------|------|
| `APP_ENV` | `prod` | 生产唯一基准；其它取值一律拒绝并纠正为 prod |
| `NODE_ENV` | `production` | 与生产一致；其它取值一律纠正为 production |
| `LOG_LEVEL` | `info`（建议） | 勿默认 `debug` 冒充独立配置面 |

Docker 源码挂载联调已取消；本机请用 `scripts/start/start-local.*`。

## Notes

- Start polls `/healthz/ready` until ready or timeout (`CYP_START_TIMEOUT`, default 120 seconds).
- Stop kills listeners on 5170/5173（兼容清理残留 5174 若仍有旧进程）。

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
