# CYP-memo · 产品版本化管理（SSOT）

| 项 | 值 |
|----|-----|
| 项目 | CYP-memo · v2.0.0 |
| 日期 | 2026-08-16 |
| 军械库权威 | `d:\kf\CYP-skill-arsenal\mgs\docs\cyp-product-versioning-regulation.md` |
| 本仓落地 | 本文件 + `DEPLOY.md` 六 + 改版清单 0.4 + 契约 六 |
| 自动化 | `scripts/install/version-bump.js` · `scripts/verify/verify-version.js` · `scripts/install/release.js` |

> **强制**：
> 1. **已提交/已 tag 的 VERSION 基线**：后续修改须**先自动升版并写历史，再改码**（官方 `version:bump`）。
> 2. **未 git commit（或用户声明未提交）的同批**：禁止再 `version:bump`；修复说明**并入当前 VERSION** 历史后改码；**并入必须用 Edit/StrReplace，禁止脚本代写**（军械库 P12 / 规则 5.5）。
> 3. 验证**必须以生产或生产等价真实环境为准**；本机联调 = 生产配置基准（**无例外**）；禁止依赖缺失假成功。
> 4. 宣称 CI02 已落地前必须 `pnpm verify:ci02` 退出码 0（军械库 `cyp-tool-ci02-prod-baseline-gate.py`）。
> 4.1 宣称文案字形合规前必须 `pnpm verify:font-glyph` 退出码 0（规则 24.25；**不检、不改图标**）。
> 5. **禁止用脚本更新版本历史与工作日志**（含 `node -e`/临时 Python/PowerShell 写盘）；只读 `verify-version` 允许。
>
> 军械库权威细则：P1 / **P2.1** / **P12** / P8 / 三附 · CI02 附则 · Mock MOCK-012。

---

## 一、强制顺序

| # | 步骤 | 命令 / 动作 |
|---|------|-------------|
| 1 | 分类 | `fix`→patch · `feat`→minor · `breaking`→major |
| 1.5 | **批次门** | 当前 VERSION **未提交** → **跳过 bump**，走步骤 2′；已提交基线 → 步骤 2 |
| 2 | **先升版写史** | `pnpm version:bump -- <patch\|minor\|major> --change "type:说明" --yes`（**仅正式升版**） |
| 2′ | **同批并入** | 用 **Edit/StrReplace** 向当前 VERSION 的 CHANGELOG / `.version/changelog.json` / VERSION_HISTORY 追加；**禁止**临时脚本代写（P12） |
| 3 | 改码 / 删除 | 实现与历史条目一致 |
| 4 | 生产优先验证 | `start-local` / 安装脚本 + 真实 API（`APP_ENV=prod`）；禁沙箱；禁用非产品部署形态冒充验证 |
| 5 | 校验 | `pnpm version:info` 必须 0 |
| 6 | 发版（可选） | `pnpm release:<type> -- --yes` 或打 `v*` tag |

---

## 二、自动化覆盖面

| 自动写入 | 路径 |
|----------|------|
| 单源版本 | `VERSION` |
| 包版本 | 根 + app/server/shared/desktop `package.json` |
| 运行时 | `packages/shared/src/config/version.ts` |
| README 行 | `README.md` `**版本**:` |
| 人类历史 | `CHANGELOG.md` |
| 结构化历史 | `.version/changelog.json` |
| 可读台账 | `.version/VERSION_HISTORY.md`（正式 bump 可由工具重生；同批并入须 Edit 与 JSON 对齐） |

`.version/` **必须入库**（已从 `.gitignore` 解除忽略）。

---

## 三、变更类型 → 升版

| type | 升版建议 |
|------|----------|
| `breaking` / 重大改版 / 破坏性 `remove` | major |
| `feat` | minor |
| `fix` / `perf` / `refactor` / `docs` / `chore` / `test` / 兼容 `remove` | patch |

---

## 四、禁止提交

### 4.1 运行时 / 密钥 / 产物

| 禁止 |
|------|
| `.env` 真值、密钥、口令、证书私钥 |
| `*.sqlite` / `packages/server/data/` / uploads |
| `logs/`、`node_modules/`、`dist/`、`packages/desktop/release/` |
| 只改展示版本、不跑 `version:bump` |
| 未写史先合业务代码（既未升版也未并入当前 VERSION） |
| **未提交同批仍机械升 patch** |
| **用脚本/`node -e`/临时 Python 代写 CHANGELOG、`.version/*` 或 `.workbuddy/memory/`** |
| 无探针/探针失败却宣称「生产已验」 |

### 4.2 文档类 · 防泄露实现细节与系统漏洞（强制）

> 公开仓 / Release **禁止**成为漏洞与实现内幕情报源。军械库权威：`cyp-product-versioning-regulation.md` 6.2。

| 禁止提交 | 示例 |
|----------|------|
| **`reports/` 全目录** | 八阶段报告、审计/改版/升版/债批次等——**整树禁止入库** |
| **`docs/` 内实现/修复/架构类资料（默认整树）** | `VERSION_*_SUMMARY`、`FIXES_*`、`*_MIGRATION`、`ARCHITECTURE_*`、`DEVELOPMENT`、`生产环境`、镜像/依赖排查纪要等——**明显泄露实现与攻击面** |
| 未脱敏漏洞/安全资料 | 含利用步骤、PoC、payload、绕过路径、未修复高危清单 |
| 渗透/诊断原始包 | `support-bundles/`、`local-debug-*.zip`、未裁剪 HAR/trace、内存转储 |
| 实现内幕过曝 | 真实机器码/LBN、kill-switch 密钥样例、默认超管真实口令、未公开后门说明 |
| 凭据导出附件 | `.pem` / `.key` / API Key 清单贴进 md 或 zip |
| 可直接打生产的复现命令 | 未授权端点+完整 curl 攻击样例 |

| 允许（须脱敏） | 要求 |
|----------------|------|
| `CHANGELOG.md` / `.version/*` | 只写修复结论与能力，不写攻击步骤 |
| `README` / `DEPLOY` / `LOCAL_DEV` / `.env.example` | 交付与运维必要说明；无真实密钥、无 exploit |
| **`docs/PRODUCT_VERSIONING.md`（白名单）** | 产品版本化 SSOT；禁止夹带凭据/PoC |
| 军械库 `internal-kb/<项目>/` 补录 | 按规则 20；仍禁止夹带凭据与 PoC |

**`reports/` / `docs/`（除白名单）**：仅本机工作区保留；已写入 `.gitignore`。需要沉淀时走军械库资料库，**禁止** `git add reports` / 禁交类 `docs`。

**入库前**：有攻击步骤 / 真值凭据 / 未修复高危可定位现网 → **禁止 `git add`**，移至 `security-private/`（已 ignore）或私密通道。

本地隔离（已 `.gitignore`）：`reports/`、`docs/**`（例外 `docs/PRODUCT_VERSIONING.md`）、4.3 所列路径、`security-private/`、`vuln-private/`、`pentest-raw/`。

若远端曾跟踪禁交文档，发版前按 4.3 执行 `git rm --cached` 后仅 add 白名单。

### 4.3 仓内其它路径（不在 reports/docs 内 · 强制）

> 攻击面与实现内幕**不限**于 `reports/`、`docs/`。下列路径同样 **禁止提交**。

| 禁止路径 / 模式 | 原因 |
|-----------------|------|
| `.workbuddy/` | 会话记忆、安装旁路、环境与过程痕迹 |
| `**/BUILD.md`（如 `packages/desktop/BUILD.md`） | 签名证书、CSC/Apple 密钥变量、发布密钥操作面 |
| `scripts/**/CHANGELOG.md` | 脚本内部演进；非产品对外变更史（对外只用根 `CHANGELOG.md`） |
| `**/DEPRECATED.md` · `**/FIXES*.md` · `**/COMMIT_GUIDE.md` | 废弃/修复过程与提交内幕 |
| `frontend/`（若残留） | 旧前端树与旁路实现 |

| 允许入库（根与运维白名单 · 须脱敏） | 说明 |
|--------------------------------------|------|
| `README.md` · `DEPLOY.md` · `LOCAL_DEV.md` · `CHANGELOG.md` · `VERSION` · `LICENSE` | 交付/运维必要 |
| `.env.example` · `package.json` / lock · 源码与测试 | 工程本体 |
| `deploy/**` · `scripts/install/**` · `scripts/verify/verify-five-centers.*` | 面板/NAS/Windows/Unix 原生部署形态 |
| `.github/workflows/*` | CI；secrets 只引用名称不写真值 |
| `.version/*` · `docs/PRODUCT_VERSIONING.md` | 版本权威 |
| `scripts/**/*` 可执行与简短 README（**不含** `scripts/**/CHANGELOG.md`） | 一键运维 |
| `ops/README.md` | 运维清单 |

**原则**：凡描述「如何绕过/如何签名取证/如何打点现网/未修复缺陷复现」的 Markdown，不论目录，一律禁交；有疑义默认不提交。  
**禁止**：再提交已废止的编排目录或平行部署通道。

---

## 五、生产优先

| 要求 | 说明 |
|------|------|
| 主环境 | 生产配置或本机一键等价路径（真实 5170、真实 dataDir） |
| 禁止 | 沙箱、假 health、未启动进程的「纸面通过」、用非产品形态冒充验证 |
| 发版后 | 线上消费经 **server tarball / 安装脚本 / 桌面 updater**；commit ≠ 已更新线上 |

---

## 六、自托管灰度（面板 / NAS / Windows / Unix · 与 DEPLOY 一致）

| 项 | 约定 |
|----|------|
| 产物权威 | Release `cyp-memo-server-<VERSION>-*.tar.gz` 或桌面包；**禁止**平行镜像通道 |
| 升档 | 实例批次 `canary→batch-1→batch-2→all`（面板/NAS 逐台换包） |
| 观察窗 | canary ≥30min · batch-1 ≥1h · batch-2 ≥2h · all 稳态 24h |
| 通过 | `pnpm verify:runtime-base` + `/healthz/ready` + 核心读写抽检 |
| 失败回滚 | 上一 VERSION 包重装；数据异常则 `scripts/rollback/rollback-local.*` |

操作细则见 `DEPLOY.md` · `ops/README.md`。
