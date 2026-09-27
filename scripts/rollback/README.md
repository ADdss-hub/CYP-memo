# scripts/rollback

本机数据回滚权威入口（与 `scripts/snapshot` 配对）。

| 项 | 值 |
|----|-----|
| 入口（推荐） | `rollback-local.bat` / `rollback-local.ps1` |
| SSOT 实现 | `scripts/snapshot/rollback-local.ps1`（本目录入口委托调用，避免双份逻辑） |
| 目标 RTO | ≤ 60s（仅数据目录回拷；不含服务冷启动） |
| 安全 | 无快照则失败退出；回滚前自动写入 `backups/snapshots/pre-rollback-*`；**不**静默 wipe |

## 用法

```bat
REM 使用 LATEST.txt 指向的最近快照
scripts\rollback\rollback-local.bat

REM 或指定快照目录
scripts\rollback\rollback-local.bat backups\snapshots\snap-YYYYMMDD_HHMMSS
```

前置：先跑 `scripts\snapshot\snapshot-local.bat`（或已有可用 snap）。

回滚后若 API 进程仍在跑，须重启以使 sql.js 从磁盘重载（见 SSOT 脚本输出提示）。

服务端包回退：解压上一 VERSION 的 `cyp-memo-server-*.tar.gz` 后重跑对应 `scripts/install/*`，再跑 `verify-five-centers`（见 `DEPLOY.md`）。
