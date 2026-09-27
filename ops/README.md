# CYP-memo · 运维（ops）

| 项 | 说明 |
|----|------|
| 项目 | CYP-memo |
| 对齐 | `DEPLOY.md` 闭集 35 · Server 声明集 · 四通道安装 · `scripts/` |
| 禁止 | Docker / compose / Watchtower |

## 运行底座闭集探针

> 闭集 35 稳定 ID；脚本名仍为 `verify-five-centers.*`（历史文件名，探针内容已改闭集 35）。

| 动作 | 命令 |
|------|------|
| Windows | `powershell -File scripts/verify/verify-five-centers.ps1 -DataDir <path>` |
| Unix/NAS/面板 | `bash scripts/verify/verify-five-centers.sh http://127.0.0.1:5170 <DATA_DIR>` |

## 备份（backup）

| 动作 | 命令 |
|------|------|
| 数据备份 | `./scripts/backup.sh` |
| 本机快照 | `scripts/snapshot/snapshot-local.ps1` |

## 回滚（rollback）

| 动作 | 命令 |
|------|------|
| 权威入口 | `scripts/rollback/rollback-local.bat` / `.ps1` |
| 数据恢复（tar） | `./scripts/restore.sh backups/cyp-memo-backup-*.tar.gz` |
| 服务端回退 | 解压上一版 server tarball + 重跑对应 `scripts/install/*` |

## 监控与告警

| 动作 | 入口 |
|------|------|
| 存活 | `GET /api/health` |
| 就绪（优先） | `GET /healthz/ready` |
| 调度汇总 | `GET /api/schedule/status`（需权限） |
| 管控 | `GET /api/governance/status`（需权限） |
| 现场 | `scripts/diagnose/*` · `support-bundle.ps1` |

| 级别 | 触发 | 动作 |
|------|------|------|
| L1 | `/api/health` 失败 | 查进程与 `{DATA_DIR}/logs` |
| L2 | `/healthz/ready` 失败 | 停放量；查 bootstrap/配置中心 |
| L3 | 持续失败 | diagnose + support-bundle |
| L4 | 发版不达标 | 回滚安装包 / rollback-local |

## 安装通道

| 通道 | 入口 |
|------|------|
| 面板 A | `scripts/install/install-panel.sh` |
| NAS B | `scripts/install/install-nas.sh` |
| Windows | `scripts/install/install-windows.ps1` |
| Unix | `scripts/install/install-unix.sh` |
