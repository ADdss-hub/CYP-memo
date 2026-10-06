# scripts/gate · 门禁令牌签发面

## 用途

按《上线（强制要求）-通用一键本地启动脚本与流程测试强制规范》3.1.1 提供**四关卡 gate_token** 签发/校验/归档能力，防止跨级跳用与伪造。

本目录属《AI 专属使用条例》1.4 #5 的**授权签发面**：`start/stop/clean/verify-e2e/diagnose` 五件套的修改必须先取得本目录签发的令牌。

## 入口

| 平台 | 入口 | 用法 |
|------|------|------|
| Windows | `issue-gate-token.ps1` | `powershell -File scripts\gate\issue-gate-token.ps1 issue --level merge --payload "..."` |
| Windows (cmd) | `issue-gate-token.bat` | `scripts\gate\issue-gate-token.bat issue --level merge --payload "..."` |
| Linux/macOS | `issue-gate-token.sh` | `bash scripts/gate/issue-gate-token.sh issue --level merge --payload "..."` |

## 子命令

| 子命令 | 参数 | 退出码 |
|--------|------|--------|
| `issue` | `--level <merge\|qa\|staging\|prod>` `--payload <文本>` `--expires-min <分钟>` | 0 成功 / 2 参数错 / 3 引用链缺失 |
| `verify` | `--token-file <文件>` `[--level <级别>]` | 0 有效 / 2 参数错 / 3 空令牌 / 4 无审计记录 / 5 已过期 |
| `archive` | `[--older-than-days <天数>]` | 0 成功 |

## 引用链（3.1.1-4，不可跨级跳用）

| 关卡 | 前置令牌 | 项目内对应 |
|------|---------|-----------|
| `merge` | 无 | `verify:gates` 全绿 + encoding/CI02 门禁 |
| `qa` | `merge` | `verify-e2e` 退出码 0 |
| `staging` | `merge` + `qa` | support-bundle 三平台等价 + 冒烟 |
| `prod` | `merge` + `qa` + `staging` | P7 上线审计 B7–B12 全过 |

跨级签发会被拒绝并返回退出码 3（`FAIL: level=X requires a prior Y token`）。

## 落盘

| 产物 | 路径 |
|------|------|
| 审计流水 | `logs/gate-tokens/YYYY-MM-DD.jsonl`（追加，JSON Lines） |
| 令牌密文 | `logs/gate-tokens/.current.<level>.token`（**不进 jsonl**，避免明文散落） |
| 归档 | `logs/gate-tokens/_archive/YYYY-MM-DD/`（默认保留 180 天，可用 `CYP_GATE_RETENTION_DAYS` 覆盖） |

审计字段（3.1.1-2）：`ts` / `gate_id` / `level` / `commit_sha` / `sha256` / `issuer` / `issued_at` / `expires_at` / `signer` / `payload_digest`。

## 示例

```bash
# 签发 merge 关卡令牌
bash scripts/gate/issue-gate-token.sh issue --level merge --payload "P0 fixes batch1"

# 校验
bash scripts/gate/issue-gate-token.sh verify --token-file logs/gate-tokens/.current.merge.token

# 跨级签发会被拒绝（退出码 3）
bash scripts/gate/issue-gate-token.sh issue --level prod --payload "release"

# 归档超期流水
bash scripts/gate/issue-gate-token.sh archive --older-than-days 180
```

## 依赖

- Node.js ≥ 20.19.6（JSON 生成与摘要计算）
- `git`（可选，缺失时 `commit_sha` 记为 `nogit`）
- `_internal/common.ps1`（Windows 侧 UTF-8 写入与根定位）