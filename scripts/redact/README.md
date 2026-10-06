# 脱敏唯一入口（scripts/redact.*）使用与集成说明

> 对应缺陷 **F-07**：规范 2.8（隐私合规一票否决）与 AP-13（禁止 `grep -v` 假脱敏）。

## 一、这是什么

`scripts/redact/redact.sh`（Linux/macOS）与 `scripts/redact/redact.ps1`（Windows）是项目**唯一**的脱敏入口。
它做**内容替换**（把敏感值改成 `***`），而不是用 `grep -v` 删行做"假脱敏"。

## 二、正则覆盖清单（按级别启用）

| 类别 | 匹配目标 | 示例命中 |
| --- | --- | --- |
| 键值密钥 | `password`/`passwd`/`pwd`/`token`/`secret`/`apikey`/`api_key`/`authorization`/`jwt` 的值 | `token=abc123` → `token=***` |
| 手机号 | 11 位、1 开头 | `13800138000` → `***` |
| 邮箱 | 标准邮箱格式 | `a@b.com` → `***` |
| 身份证 | 18 位（末位可 X） | `11010119900307123X` → `***` |
| 银行卡 | 16–19 位数字串 | `6222021234567890123` → `***` |

级别：
- `strict`（默认）：启用全部 5 类。
- `normal`：键值密钥 + 手机号 + 邮箱（保守，避免误伤普通长数字）。
- `off`：完全不处理，直接复制，退出 0。

## 三、用法

```bash
# 处理单个文件
scripts/redact/redact.sh --in secret.log --out secret.redacted.log --level strict
# 原地处理
scripts/redact/redact.sh --in-place secret.log
# 扫描目录（就地脱敏）
scripts/redact/redact.sh --scan ./logs
```

## 四、退出码语义

| 码 | 含义 |
| --- | --- |
| 0 | 成功且内容发生替换（确有敏感信息被脱敏） |
| 3 | 成功但无变化（文件已干净 / 未检出敏感信息）—— 规范"无变化但已脱敏" |
| 2 | 参数/非法级别值 |
| 4 | 脱敏失败，**必须阻断上报**（规范 LC07） |

## 五、环境变量 `START_LOCAL_REDACT_LEVEL` 如何在启动时被消费

> 本脚本**不修改** `scripts/start/start-local.sh`（五件套由另一 agent 维护，避免冲突）。
> 这里约定它在启动链路中的标准接入口径：

1. `start-local.sh`（或统一的"一键本地启动"入口）在**任何日志/产物上报、归档、上传之前**，
   应当先调用本脱敏入口对 `logs/` 与待上报产物做一次 `redact --scan`：
   ```bash
   scripts/redact/redact.sh --scan ./logs --level "${START_LOCAL_REDACT_LEVEL:-strict}"
   ```
2. 若上一步退出码为 **4**，启动链路必须**终止上报**并告警（LC07 阻断）。
3. 级别解析优先级：命令行 `--level` > 环境变量 `START_LOCAL_REDACT_LEVEL` > 默认 `strict`；
   环境变量取到非法值（非 `strict|normal|off`）时，本脚本报错退出 2，启动链路应同样阻断。
4. `START_LOCAL_NO_TELEMETRY=1`：置位时本脚本**不写** `logs/redact-audit.jsonl` 审计行
   （脱敏本身照常执行，仅关闭副作用审计）。

## 六、CI 门禁

`scripts/verify/verify-redact-dryrun.mjs` 为 `redact-dryrun` 门禁实体：干跑扫描（默认 `logs/`），
检出**未脱敏**的敏感信息即以退出码 1 阻断流水线，且不修改任何文件。

```bash
node scripts/verify/verify-redact-dryrun.mjs --dir logs --level strict
```
