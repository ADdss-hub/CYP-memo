# 安全政策（Security Policy）

> 本项目为单机本地优先的备忘录系统，含 `scripts/gate/` 授权签发面与 `dataDir` 下的用户私钥/令牌数据，安全披露至关重要。

## 一、安全漏洞报告渠道

**请勿在公开 Issue / PR / Discussion 中披露漏洞。** 请通过以下私下渠道报告：

- **邮箱**：nasDSSCYP@outlook.com（主题注明 `[SECURITY]`）
- **加密**：如环境支持，可对报告内容签名/加密后发送；项目不托管独立 PGP 公钥，沟通中以维护者回执确认收悉。

请在报告中尽量包含：

1. 漏洞类型与受影响组件（`packages/server` / `packages/app` / `packages/mcp` / `scripts/` 等）。
2. 复现步骤与环境（版本号、OS、是否 `APP_ENV=prod` 基准）。
3. 影响面评估与建议修复方向。

## 二、支持版本

| 版本线 | 支持状态 | 说明 |
|--------|----------|------|
| 2.0.x（当前 `VERSION=2.0.0`） | **积极维护** | 接收安全修复与功能更新 |
| ≤ 1.x | **停止维护** | 不再接收安全补丁，请升级 |

安全修复随补丁/小版本发布，并在 `CHANGELOG.md` 标注 `security` 条目。

## 三、响应时限（SLA）

| 阶段 | 目标时限 | 说明 |
|------|----------|------|
| 收悉确认 | ≤ 72 小时 | 维护者回执确认收到报告 |
| 初步分级 | ≤ 7 天 | 按 CVSS 与运行时暴露面定级（critical/high/medium/low） |
| 修复或缓解方案 | 依严重级 | critical/high 优先；依赖层漏洞参照最近一次安全审计结论处理 |
| 公开披露 | 修复后协商 | 不经 reporter 同意不抢先公开 |

## 四、最近一次安全审计

- 报告：`SECURITY-AUDIT-2026-09-28.md`（检测时间 2026-09-28，范围 `D:\kf\kf\CYP-memo`）。
- 结论摘要：代码层安全卫生良好（无硬编码凭据、无 TLS 绕过、`.env` 合规、P0 强制能力真实落地）；主要风险来自第三方依赖（jsPDF、xlsx/SheetJS 等），修复后 critical 归零。
- 持续跟踪依赖漏洞：`pnpm audit`（官方源）。

## 五、安全相关约定

- 数据库唯一根 `getConfig().dataDir`，禁止 cwd 旁路写入用户数据。
- 令牌/密钥密文不进审计 `jsonl`，仅落 `logs/gate-tokens/.current.<level>.token`。
- 修改 `scripts/` 五件套须持 `gate_token`（见 `scripts/gate/README.md`），防止跨级跳用与伪造。
- 生产配置基准 `APP_ENV=prod` 不可被本机联调覆盖（CI02），避免配置漂移引入安全差异。
