# scripts/rollback

本机数据回滚权威入口（与 `scripts/snapshot` 配对）。

| 项 | 值 |
|----|-----|
| 入口（推荐） | `rollback-local.bat` / `rollback-local.ps1` / `rollback-local.sh` |
| SSOT 实现 | `scripts/snapshot/rollback-local.ps1`（本目录入口委托调用，避免双份逻辑） |
| 目标 RTO | ≤ 60s（仅数据目录回拷；不含服务冷启动） |
| 安全 | 无快照则失败退出；回滚前自动写入 `backups/snapshots/pre-rollback-*`；**不**静默 wipe |
| 自动回滚 | `auto-rollback.ps1` / `auto-rollback.sh`（基于监控指标触发，默认 dry-run） |

## 手动回滚用法

```bat
REM 使用 LATEST.txt 指向的最近快照
scripts\rollback\rollback-local.bat

REM 或指定快照目录
scripts\rollback\rollback-local.bat backups\snapshots\snap-YYYYMMDD_HHMMSS
```

前置：先跑 `scripts\snapshot\snapshot-local.bat`（或已有可用 snap）。

回滚后若 API 进程仍在跑，须重启以使 sql.js 从磁盘重载（见 SSOT 脚本输出提示）。

服务端包回退：解压上一 VERSION 的 `cyp-memo-server-*.tar.gz` 后重跑对应 `scripts/install/*`，再跑 `verify-five-centers`（见 `DEPLOY.md`）。

## 自动回滚（auto-rollback）

基于监控指标的自动回滚机制，与 Prometheus 告警规则联动。策略定义见 `docs/auto-rollback-policy.md`。

### 安全默认
- **默认关闭**：须设置 `CYP_AUTO_ROLLBACK_ENABLED=true` 才启用
- **默认 dry-run**：即使启用，默认只检测不执行；须设置 `CYP_AUTO_ROLLBACK_DRY_RUN=false` 或使用 `--execute` 才真实执行

### 触发条件（5 分钟窗口）

| 条件 | L1 告警 | L2 软回滚（重启） | L3 硬回滚（快照+重启） |
|------|---------|-------------------|----------------------|
| API 错误率 | > 5% | > 10% | > 20% |
| P95 响应时间 | > 3s | > 5s | > 10s |
| 可用性 | < 99% | < 95% | < 90% |
| 健康检查失败 | 1 次 | ≥ 2 次 | — |
| 内存使用率 | > 85% | > 90% | > 95% |

### 快速开始

```bat
REM 1. 检测模式（默认安全，不执行任何操作）
scripts\rollback\auto-rollback.ps1

REM 2. 检查冷却状态
scripts\rollback\auto-rollback.ps1 --cooldown

REM 3. 启用并真实执行（生产环境请谨慎）
set CYP_AUTO_ROLLBACK_ENABLED=true
scripts\rollback\auto-rollback.ps1 --execute

REM 4. 重置冷却状态
scripts\rollback\auto-rollback.ps1 --reset-cooldown
```

```bash
# Linux/macOS
scripts/rollback/auto-rollback.sh              # dry-run 检测
scripts/rollback/auto-rollback.sh --cooldown   # 检查冷却
CYP_AUTO_ROLLBACK_ENABLED=true scripts/rollback/auto-rollback.sh --execute
scripts/rollback/auto-rollback.sh --reset-cooldown
```

### 配置参数

| 环境变量 | 默认值 | 说明 |
|---------|--------|------|
| `CYP_AUTO_ROLLBACK_ENABLED` | `false` | 总开关 |
| `CYP_AUTO_ROLLBACK_DRY_RUN` | `true` | dry-run 模式 |
| `CYP_AUTO_ROLLBACK_COOLDOWN_SEC` | `1800` | 冷却期（秒） |
| `CYP_AUTO_ROLLBACK_MAX_CONSECUTIVE` | `2` | 连续回滚上限，超限升级人工 |
| `CYP_AUTO_ROLLBACK_PROM_URL` | `http://localhost:9090` | Prometheus HTTP API 地址 |
| `CYP_AUTO_ROLLBACK_METRICS_FILE` | — | 本地指标文件（无 Prometheus 时使用） |
| `CYP_AUTO_ROLLBACK_LOG_FILE` | `logs/auto-rollback.jsonl` | 回滚日志路径 |

### 冷却机制
- 每次 L2/L3 回滚后进入 **30 分钟**冷却期，不再触发自动回滚
- 连续 **2 次**自动回滚后升级为人工介入（`escalated=true`），需手动 `--reset-cooldown`
- 冷却状态文件：`logs/auto-rollback-cooldown.json`

### 日志
- 运行日志（JSONL）：`logs/auto-rollback.jsonl`
- 冷却状态：`logs/auto-rollback-cooldown.json`
- 与 support-bundle 联动：自动回滚日志会被纳入支持包

### 与告警的关系
- Prometheus 告警规则见 `monitoring/prometheus/alerts.yml` 的 `cyp-memo-auto-rollback` 组
- 每条告警规则标注 `labels.rollback_tier`（L1/L2/L3），与脚本策略对齐
- 告警由 Alertmanager 负责通知；自动回滚由脚本独立判定和执行
