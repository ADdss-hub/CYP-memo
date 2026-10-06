# scripts/stop

Stop local CYP-memo processes **only** if they listen on **5170 / 5173 / 13175**.

| 端口 | 用途 |
|------|------|
| 5170 | 唯一产品入口（API + 同域静态） |
| 5173 | 可选热重载（`pnpm local:hmr`，非产品入口；残留进程才杀） |
| 13175 | MCP 旁路（仅环回） |

> 产品壳 **5174 已废止**（VIEW-05）；勿再杀/宣传 5174。

## Entry

- `stop-local.ps1` / `stop-local.bat`
- `stop-local.sh`

PowerShell 入口会把运维 JSONL 追加到 `logs/ops-stop.jsonl`（`case_id=S04-stop`，`scenario=stop`）。

Does not kill unrelated processes.
