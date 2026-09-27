# scripts/verify

Local readiness checks.

## Entry

| 脚本 | 用途 |
|------|------|
| `verify-e2e.ps1` / `.bat` / `.sh` | R5 基线：端口 / health / ready / Trace+CSP / 异常码 |
| `verify-five-centers.ps1` | 闭集 35 稳定 ID；禁止旧编制键与并行 modules 清单 |
| `verify-runtime-base.ps1` | 底座探针别名（转调 five-centers） |
| `verify-no-prod-mock.ps1` | 生产Mock约束 生产零 Mock |
| `verify-ci02-prod-baseline.py` | CI02：生产唯一基准零残留（禁 `dev` 脚本/标识/文案）；`pnpm verify:ci02` |
| `verify-font-glyph.mjs` | 规则 24.25：文案未批准字母/数字/符号 + 禁 Helvetica/Arial 等第二套硬编码字族；**不检图标**；`pnpm verify:font-glyph` / `pnpm verify:gates` |
| `verify-cfg-reject.ps1` | G-SYS-01：非法配置不得 listen |
| `verify-s03-auth.ps1` | S-03 部分：注册/登录/子用户/租户隔离/E410/client-error |
| `verify-runtime-base-stress.ps1` | 运行底座加压：负例洪泛 / 幂等风暴 / 并发 CRUD（429 分列） |
| `verify-extreme-full-link.ps1` | **极高用户量 + 数据流全环节**：先 stress（干净 IP 预算）→ 65s cool-down → 批量注册（429 退避）→ 写放大/分享旁路 → five-centers → 弹性决策落盘核验；429≠硬失败。默认画像 LAN 团队 L2/L3：Users=80 MemosPerUser=30 ShareFlood=120 |
| `verify-extreme-intelligence-loop.ps1` | **智控闭环**：404 路径扫描 → 客户端版本拒绝洪水（弹性收紧）→ 告警投递 → 调度心跳 → 核验 alerts/elasticity/notify/logs 增量 → 运行底座闭集投影 |
| `verify-support-desktop.mjs` | 默认声明集 Desktop：嵌入同一服务端 + SUPPORT_MATRIX Server/Desktop + 实机 ready |
| `verify-electron-embed.mjs` | Desktop Electron 实启：编译主进程 → 嵌入 server → `/healthz/ready`×35 |

## verify-e2e 要点

- Ports **5170 / 5173** listening（5174 已废止）
- `GET /api/health` · `GET /healthz/ready`
- Exit `1` on any failure

S-03 九类全量断言仍归 **P6**。
