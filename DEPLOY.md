# CYP-memo · 部署文档（统一运行底座 · 非容器）

| 项 | 值 |
|----|-----|
| 项目 | CYP-memo · v2.0.0 |
| 部署法 | **统一运行底座**闭集 35（L0 六组件+协调 · L1 管控/托管/协作/公开） |
| 接线与名册 | `packages/server/src/runtime-base/` |
| 架构 | 军械库统一运行底座架构 **V1.8.3** |
| 禁止 | Docker / compose / Watchtower |

## 矩阵摘要

| 层 | 稳定 ID 前缀 |
|----|----------------|
| L0 基础设施 | `RB-L0-INFRA-*` |
| L0 协调 | `RB-L0-COORD-*` |
| L1 管控 | `RB-L1-MGMT-*` |
| L1 托管 | `RB-L1-HOST-*` |
| L1 协作 | `RB-L1-COL-*` |
| L1 公开 | `RB-L1-PUB-*` |

探针：`pnpm verify:runtime-base` · `GET /healthz/ready`（`data.runtimeBase.items` 为 35 个稳定 ID）。

静态门禁（发版前建议）：`pnpm verify:gates`（encoding · CI02 · **font-glyph 文案字形** · gateway-center-naming；**font-glyph 不检、不改图标**）。
