# scripts/snapshot

本机数据快照（供回滚配对）。**非 placeholder** — 脚本已实装。

| 项 | 值 |
|----|-----|
| 拍快照 | `snapshot-local.bat` / `snapshot-local.ps1` / `snapshot-local.sh` |
| 回滚 SSOT | `rollback-local.bat` / `rollback-local.ps1` / `rollback-local.sh`（权威入口亦可走 `scripts/rollback/`） |
| 源目录 | `packages/server/data`（SQLite / uploads 等） |
| 产物 | `backups/snapshots/snap-YYYYMMDD_HHMMSS/` + `SNAPSHOT.json` + `MANIFEST.sha256` + `LATEST.txt` |
| 目标 | 拍/回拷 RTO ≤ 60s |

## 保留与 RPO（与脚本能力对齐）

| 策略字段 | 约定 |
|----------|------|
| 周期 | 发版前 / 迁移前 / 重大变更前 **必拍**；日常建议每日至少 1 次（可用任务计划调用本脚本或 `scripts/snapshot/backup.sh`） |
| 保留 | 脚本**不**自动删旧 snap；运维自行保留最近 **7～14** 份时间戳目录，或按磁盘配额清理更早的 `snap-*`（勿删正在指向的 `LATEST.txt` 目标） |
| RPO | 依赖最近一次成功快照或 `backup.sh` tar；未拍则 RPO = 自上次备份以来全部变更 |
| 异地 | 本脚本仅本地；异地请另拷 `backups/` 或 tar 到 NAS/对象存储（3-2-1 由运维落地） |
| 演练 | 见 `ops/README.md`：恢复/回滚后核对 `/healthz/ready` |

`backup.sh` / `restore.sh` / `restore-local.ps1` 为 tar 备份恢复通道。`restore.sh` 与 `restore-local.ps1` 均先跑 `verify-artifact-integrity`（无 `.sha256` 拒绝）。回滚前校验 `MANIFEST.sha256`，失败不覆盖。隔离演练可设 `CYP_SNAPSHOT_DATA_DIR` 与 `CYP_SNAPSHOT_ROOT`。公钥登记见 `deploy/signing/`。本机 Windows 无可用 bash 时用 `restore-local.ps1`。
