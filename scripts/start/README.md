# scripts/start

One-click local startup for CYP-memo.

## Entry

| File | Platform |
|------|----------|
| `start-local.ps1` / `start-local.bat` | Windows (preferred) |
| `start-local.sh` | Linux / macOS |

## Behavior

1. Probe Node / pnpm (Windows uses `pnpm.cmd`)
2. Require `node_modules` (else hint `.workbuddy\install-with-vs.bat` or `pnpm install`)
3. Start `pnpm local:all`（`scripts/start/ensure-app-dist.js` + **API + MCP 旁路同启**；CI02 prod）。薄封装：`pnpm local` → `scripts/start/local.js`
4. Poll `https://127.0.0.1:5170/healthz/ready` + `/` 静态 + `https://127.0.0.1:13175/healthz`（旁路环回）；控制台广告 **唯一产品入口** `:5170` 与 MCP ` /mcp`
5. 可选热重载：`pnpm local:hmr`（`:5173`，非产品入口，勿写入主链接）

## Windows SCM

生产 Windows 用 SCM，不用登录计划任务：

```bat
powershell -NoProfile -File scripts\start\register-windows-scm.ps1 -DryRun
```

正式安装须管理员，且本机已有 NSSM 或 `deploy\windows\winsw.exe`。卸载：`unregister-windows-scm.ps1`。WinSW 描述：`deploy\windows\cyp-memo.xml`。

## Usage

```bat
scripts\start\start-local.bat
```
