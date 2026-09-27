# scripts/stop

Stop local CYP-memo processes **only** if they listen on **5170 / 5173 / 5175**.

| 端口 | 用途 |
|------|------|
| 5170 | API / server |
| 5173 | App（唯一产品壳） |
| 5175 | Desktop Vite 联调服 |

> 产品壳 **5174 已废止**（VIEW-05）；勿再杀/宣传 5174。

## Entry

- `stop-local.ps1` / `stop-local.bat`
- `stop-local.sh`

PowerShell 入口会把运维 JSONL 追加到 `logs/ops-stop.jsonl`（`case_id=S04-stop`，`scenario=stop`）。

Does not kill unrelated processes.
