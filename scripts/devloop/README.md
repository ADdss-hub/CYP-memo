# scripts/devloop · 研发效能度量四件套

> 对应规范 **2.7**：研发效能度量（devloop 四件套 + jsonl 度量口径）。

## 一、这是什么

`scripts/devloop/devloop.sh`（Linux/macOS）与 `scripts/devloop/devloop.ps1`（Windows）是项目研发效能度量的**唯一记录入口**。

这是一个"度量记录器"，**不实际启动服务 / 重跑用例**（避免副作用与端口占用）。每次调用向 `logs/devloop-metrics.jsonl` 追加一行。

## 二、业务子命令

| 子命令 | 用途 | 记录 stage |
|--------|------|-----------|
| `start` | 冷启动度量（优先读 `logs/start-time.json` 的 `cold_start_ms`） | `cold_start` |
| `rerun` | 按 tag 精准重跑 verify 用例 | `rerun` |
| `locate` | 失败定位（记录错误信息） | `locate` |
| `fix-check` | 修复校验 | `fix_check` |
| `record` | 底层记账接口（自定义 stage/file/result） | 自定义 |
| `report` | 生成周报（`--since 7d`），对照阈值 | — |

## 三、阈值（规范 2.7）

| 指标 | 阈值 |
|------|------|
| 冷启动 cold_start | ≤ 120s |
| 热重载 hot_reload | ≤ 5s |
| 精准重跑 rerun | ≤ 30s |
| 失败定位 locate | ≤ 60s |
| 单次修复闭环 fix_check | ≤ 5min |
| verify 失败率 | ≤ 10% |
| Devloop 完成率 | ≥ 80% |

## 四、用法

```bash
# 记录冷启动
bash scripts/devloop/devloop.sh start --duration-ms 85000

# 精准重跑
bash scripts/devloop/devloop.sh rerun --tag auth-login --duration-ms 22000

# 失败定位
bash scripts/devloop/devloop.sh locate "E410 client-error mismatch"

# 修复校验
bash scripts/devloop/devloop.sh fix-check --result pass

# 自定义记录
bash scripts/devloop/devloop.sh record --stage hot_reload --duration-ms 3200

# 周报
bash scripts/devloop/devloop.sh report --since 7d
```

## 五、落盘

| 产物 | 路径 |
|------|------|
| 度量流水 | `logs/devloop-metrics.jsonl`（JSON Lines，每行独立可 JSON.parse） |
| 失败明细 | `logs/devloop-failures.jsonl`（`result=fail` 时额外追加） |

审计字段：`ts` / `commit_sha` / `file` / `stage` / `duration_ms` / `result` / `actor` / `trace_id`。

## 六、环境变量

| 变量 | 说明 |
|------|------|
| `ACTOR` | 操作者（默认取 `$USER` 或 `ci`） |
