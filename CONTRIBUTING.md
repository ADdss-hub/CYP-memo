# 贡献指南（Contributing Guide）

欢迎参与 CYP-memo 备忘录系统的开发。本文档说明从环境准备到合并的完整流程，所有新增代码与文档必须遵循本指南与《上线（强制要求）-通用一键本地启动脚本与流程测试强制规范》。

## 一、开发环境要求

| 工具 | 版本 | 校验命令 |
|------|------|----------|
| Node.js | ≥ 20.19.6 | `node -v` |
| pnpm | ≥ 10（仓库 `packageManager: pnpm@10.11.0`） | `pnpm -v` |

- 安装依赖：`pnpm install`（Windows 原生模块如需 VS 工具链，用 `.workbuddy\install-with-vs.bat`）。
- 仓库为 pnpm monorepo（`pnpm-workspace.yaml`），包位于 `packages/{shared,app,server,mcp,desktop}`。

## 二、一键启动与验证

本机联调 = 生产配置基准（CI02：`APP_ENV=prod`、`NODE_ENV=production`）。

```bash
# 启动（生产配置基准，自动同启 API :5170 + MCP :13175）
scripts\start\start-local.bat        # 或 bash scripts/start/start-local.sh

# 停止
scripts\stop\stop-local.bat

# 端到端验证
scripts\verify\verify-e2e.bat

# 诊断 / 清理
scripts\diagnose\diagnose.bat
scripts\clean\clean-local.bat
```

PowerShell 等价命令请用 `.ps1` 后缀（如 `scripts\start\start-local.ps1`）。

## 三、代码规范

- 语言：TypeScript（前端 Vue 3 + Element Plus；后端 Express）。
- 风格：`pnpm lint` / `pnpm format`（各包自带 ESLint + Prettier）。
- 编码：所有文本落盘 **UTF-8 无 BOM**、LF 换行、简体中文界面文案。禁止 PowerShell 5.1 默认 `>`/`Out-File` 的 UTF-16 重定向。
- 数据库唯一根：`getConfig().dataDir`，禁止用 cwd 旁路写数据。
- 对外端口：产品入口唯一 `:5170`；`:5173` 仅内部热重载、`:5174` 管理端已废止，禁止当产品壳。

## 四、提交信息规范

采用 Conventional Commits：

```
<type>(<scope>): <subject>
```

- `type`：`feat` / `fix` / `docs` / `refactor` / `test` / `chore` / `perf` / `security`
- `scope`：受影响包或模块，如 `server`、`app`、`mcp`、`scripts`、`docs`
- 示例：`fix(server): 修正 dataDir 下 SQLite 初始化竞态`

提交前必须本地通过：`pnpm verify:encoding && pnpm verify:ci02 && pnpm verify:gates`。

## 五、PR 流程（含 gate_token 要求）

修改 `scripts/`（start/stop/clean/verify-e2e/diagnose 五件套）属于**授权签发面**（`scripts/gate/`），必须先取得 `merge` 级 gate_token：

1. 本地跑通全部门禁：`pnpm verify:gates`（全绿）+ 编码/CI02 门禁。
2. 签发合并令牌：
   ```bash
   powershell -File scripts\gate\issue-gate-token.ps1 issue --level merge --payload "本次改动摘要"
   ```
3. 提交 PR，在描述中附 `gate_token` 摘要（令牌密文不进仓库，仅附审计 `gate_id`）。
4. 引用链（不可跨级跳用）：`merge` → `qa`（verify-e2e 绿）→ `staging`（support-bundle 三平台等价）→ `prod`（P7 上线审计 B7–B12）。

未附有效 `merge` 级 gate_token 的 `scripts/` 改动将被拒绝合并。

## 六、文档随附勾选项（PR 提交前自查）

- [ ] 代码改动同步更新了对应 `docs/`（如 API/运维/AI 约束），无「先合并后补文档」（规范 AP-30 禁止）。
- [ ] 新增配置/环境变量已在 `README.md` 或 `LOCAL_DEV.md` 的表格登记。
- [ ] 安全相关改动已在 `SECURITY.md` 或安全台账留痕。
- [ ] 运行底座闭集 35 的组件卡片（如涉及）已同步 `docs/runtime-base/component-cards/`。
- [ ] 编码门禁 `pnpm verify:encoding` 退出码 0。

## 七、行为准则

参与本仓库即视为同意 [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md)。安全漏洞请按 [`SECURITY.md`](SECURITY.md) 渠道私下报告，勿公开 Issue。

## 八、联系方式

- 作者：CYP · nasDSSCYP@outlook.com
- Issue / PR：GitHub 仓库（见 `package.json` 的 `homepage`）
