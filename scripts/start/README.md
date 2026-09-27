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
3. Start `pnpm.cmd local:all` in background（CI02：配置仍为 prod；仅 `local:all`）
4. Poll `http://localhost:5170/healthz/ready` + ports 5170/5173 until ready or timeout (default 120s, override `CYP_START_TIMEOUT`)
5. Print URLs + `[CYP-memo startup]` 同形摘要；Owner 种子见 `CYP_BOOTSTRAP_OWNER_PASSWORD`（空=跳过种子）

## Usage

```bat
scripts\start\start-local.bat
```