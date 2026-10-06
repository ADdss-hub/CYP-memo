# CYP-memo 跨平台统一启动规范合规审计报告

| 项目 | 内容 |
|------|------|
| **审计对象** | CYP-memo（Electron 桌面端 + 嵌入式服务端） |
| **审计依据** | 军械库 v3.0.0/v4.0.0 启动与端口系列规范 |
| **审计日期** | 2026-10-05 |
| **审计人** | CYP 合规审计工程师 |
| **规范版本** | 一键启动 v3.0.0 / 端口总纲 v3.0.0 / 前后端端口 v4.0.0 / 跨系统编排 v1.1.0 |

---

## 一、整体判定

> **整体判定：部分完成，完成度约 72%**

| 分类 | 应完成项 | 已完成项 | 部分完成 | 未完成 | 形态不适用 | 完成率 |
|------|---------|---------|---------|--------|-----------|--------|
| A. 一键启动脚本规范 | 18 | 13 | 2 | 3 | 0 | **78%** |
| B. 跨系统架构编排规范 | 10 | 4 | 2 | 1 | 3 | **60%**（扣不适用后） |
| **合计** | **28** | **17** | **4** | **4** | **3** | **约 72%** |

> **关键结论**：
> - 一键启动脚本基础框架完整度较高，八子目录、三平台、健康检查、CI02 生产基准等核心项均已落地。
> - **CI03 端口隔离存在架构级违规**：网关端口（5170）同时承载前端静态资源 + API 代理 + MCP 代理，违反"一服务一端口"强制原则。
> - 跨系统编排方面，systemd / Windows SCM / 制品签名 / 渐进式发布已落地，Nomad / Consul / 多机服务发现因单机产品形态不适用。
> - 若干细节缺口：redact 脚本位置不规范、部分子目录缺 .bat 入口、CI03 验证脚本未内置等。

---

## 二、已完成项清单

### 2.1 一键启动脚本规范（A 类）

| 编号 | 检查项 | 规范来源 | 落地情况 | 证据路径 |
|------|--------|---------|---------|---------|
| A1 | 八子目录结构（start/stop/clean/verify/diagnose/rollback/snapshot/_internal） | 一键启动规范 2.1.2 | ✅ 已完成，且额外扩展 install/gate/redact 共 11 个子目录 | `scripts/` |
| A2 | 每个子目录必含 README.md + CHANGELOG.md | 一键启动规范 2.1.2 | ✅ 11 个子目录全部配齐 | `scripts/*/README.md` `scripts/*/CHANGELOG.md` |
| A3 | 三平台脚本配对（.ps1/.sh/.bat） | 一键启动规范 #9 | ✅ 核心脚本（start/stop/clean/verify/diagnose/snapshot/rollback）三平台齐全 | `scripts/start/` `scripts/stop/` 等 |
| A4 | 端口占用预检（启动前硬阻断） | 一键启动规范 #20 / CI03-1 | ✅ 启动前扫描 5170/10170/10175/12000 端口，占用即报错退出，不自动切换 | `scripts/start/start-local.ps1:306-337` `scripts/start/start-local.sh:34-63` |
| A5 | 就绪探针（Readiness Probe） | 端口总纲 5.2 / 前后端规范 5.1 | ✅ `/healthz/ready` 返回就绪状态，含依赖检查 | `packages/server/src/index.ts:502` |
| A6 | 存活探针（Liveness Probe） | 端口总纲 5.3 / 前后端规范 5.1 | ✅ `/health/live` 返回存活状态 | `packages/server/src/index.ts:511` |
| A7 | 启动时间记录（start-time.json） | 一键启动规范 2.4.1-2 | ✅ 记录冷启动时长、健康检查耗时、启动时间戳等 | `scripts/start/start-local.sh:65-121` → `logs/start-time.json` |
| A8 | verify-e2e 端到端验证 | 一键启动规范 2.3 | ✅ 三平台齐全，覆盖鉴权、业务、异常、安全等场景；19 字段 JSONL 结构化日志；失败非零退出 | `scripts/verify/verify-e2e.ps1` `scripts/verify/verify-e2e.sh` `scripts/verify/verify-e2e.bat` |
| A9 | 支持包自动生成（≤60s） | 一键启动规范 #7 / 2.3.1 | ✅ diagnose/support-bundle 脚本存在；启动失败/超时时自动触发；60s 超时限制 | `scripts/diagnose/support-bundle.ps1` `scripts/diagnose/bundle.sh` |
| A10 | kill-switch 机制 | 一键启动规范 2.3 / F-18 | ✅ 服务端内置 activate/deactivate/isKillSwitchActive；verify-e2e 支持 `CYP_KILL_SWITCH=on` 观察模式 | `packages/server/src/runtime-base/l1/mgmt/iam/ready.ts` `scripts/verify/verify-e2e.ps1:22-23` |
| A11 | CI02 生产唯一基准（默认启动生产模式） | 一键启动规范 #18 / 端口总纲 CI02 | ✅ start-local 强制 `APP_ENV=prod` `NODE_ENV=production`；前端生产构建由后端托管；HMR 为旁路 | `scripts/start/start-local.ps1:26-38` `scripts/start/start-local.sh:21-23` |
| A12 | CI02 构建前置与校验 | 一键启动规范 #18 / CI02-6 | ✅ ensure-app-dist.js 确保生产构建产物存在；构建失败阻断启动 | `scripts/start/ensure-app-dist.js` |
| A13 | CI02 专项验证脚本 | 一键启动规范 2.1.0 | ✅ verify-ci02-prod-baseline.py 委托军械库 CI02 门禁工具 | `scripts/verify/verify-ci02-prod-baseline.py` |

### 2.2 端口规范（端口总纲 + 前后端专项）

| 编号 | 检查项 | 规范来源 | 落地情况 | 证据路径 |
|------|--------|---------|---------|---------|
| P1 | 健康检查端点双探针（就绪+存活） | 端口总纲 第五章 | ✅ 已实现就绪探针 + 存活探针 + 综合健康 | `packages/server/src/index.ts:502-563` |
| P2 | 端口唯一性（冲突检测） | 端口总纲 1.3 / CI03-1 | ✅ 启动前端口占用硬阻断 | 同 A4 |
| P3 | HTTPS 加密传输 | 端口总纲 3.3 | ✅ 默认 HTTPS 产品入口（5170） | `local.js:29` |

### 2.3 跨系统架构编排规范（B 类）

| 编号 | 检查项 | 规范来源 | 落地情况 | 证据路径 |
|------|--------|---------|---------|---------|
| B1 | systemd 单元文件 + Type=notify | 跨系统编排规范 3.1 | ✅ systemd unit 配置完整，Type=notify，NotifyAccess=main | `deploy/systemd/cyp-memo.service` |
| B2 | systemd notify 实现 | 跨系统编排规范 3.1 | ✅ systemd-notify.ts 实现 READY=1 通知，非 systemd 环境自动忽略 | `packages/server/src/systemd-notify.ts` |
| B3 | Windows SCM 服务配置 | 跨系统编排规范 3.2 | ✅ WinSW XML 配置完整，含失败重试策略 | `deploy/windows/cyp-memo.xml` |
| B4 | Windows SCM 注册/注销脚本 | 跨系统编排规范 3.2 | ✅ register-windows-scm.ps1 / unregister-windows-scm.ps1 | `scripts/start/register-windows-scm.ps1` |
| B5 | 制品签名机制 | 跨系统编排规范 2.2 | ✅ GPG 签名登记机制；SHA256 校验；桌面端代码签名 + 公证 | `deploy/signing/README.md` `packages/desktop/scripts/sign-windows.js` `packages/desktop/scripts/sign-macos.js` |
| B6 | 渐进式发布（金丝雀） | 跨系统编排规范 5.4 | ✅ 内置 canaryWeight 金丝雀权重管理；发布阶段管理（canary/rolling/full/idle）；支持回滚 | `packages/server/src/runtime-base/l1/host/rel/ready.ts` |

---

## 三、未完成 / 部分完成项清单（含原因）

### 3.1 一键启动脚本规范（A 类）

| 编号 | 检查项 | 规范来源 | 当前状态 | 缺口说明 | 严重程度 |
|------|--------|---------|---------|---------|---------|
| A-X1 | **CI03 一服务一端口 · 架构级违规** | 一键启动规范 #20 / 端口总纲 CI03-1 / 前后端规范 v4.0.0 | 🔴 未完成 | **gatewayApp（端口 5170）同时承载三类业务**：① 前端静态资源（express.static）② /api/* 反向代理到后端 ③ /mcp/* 代理到 MCP 服务。违反"一个端口只能承载一个业务/服务"强制原则。前端静态资源应独立端口（5xxx段），网关应独立端口（12xxx段），当前混合模式不符合 CI03-1 要求。 | 🔴 一票否决 |
| A-X2 | **CI03 端口隔离验证未内置到启动脚本** | 一键启动规范 2.1.1 | 🟡 部分完成 | 启动脚本有端口占用预检，但缺少完整的 CI03 验证清单：前后端进程隔离验证、端口段合规验证、跨端口通信授权验证、核心后端加密验证。diagnose 脚本未输出端口隔离检查报告。 | 🟠 高 |
| A-X3 | **redact 脚本位置不规范** | 一键启动规范 2.1.2 | 🟡 部分完成 | `redact.ps1` 和 `redact.sh` 位于 `scripts/` 根目录，违反"禁止在 scripts/ 根目录直接散落脚本文件"规定。`scripts/redact/` 目录下只有 README/CHANGELOG，无实际脚本入口。 | 🟡 中 |
| A-X4 | **scripts/ 根目录有散文件** | 一键启动规范 2.1.2 | 🟡 部分完成 | `scripts/` 根目录存在 `devloop.ps1` `devloop.sh` `redact.ps1` `redact.sh` 四个散文件，应分别移入对应子目录（devloop → start/ 或独立子目录；redact → redact/）。 | 🟡 中 |
| A-X5 | **gate/ 子目录缺 .bat 入口** | 一键启动规范 #9 跨平台一致 | 🟡 部分完成 | `gate/` 下只有 `.ps1` 和 `.sh`，缺少 `.bat` 入口。同理 `install/` 缺少统一三平台入口脚本（只有零散的 install-unix.sh / install-windows.ps1 等）。 | 🟢 低 |
| A-X6 | **端口段合规性存疑（MCP 端口段）** | 端口总纲 CI03-5 | 🟡 部分完成 | MCP 服务使用 10175 端口（10xxx 段 = 后端 API 段），但 MCP 属于旁路/内部服务，按规范应使用 13000-13999（旁路/内部服务段）。需确认是否符合端口段分配规则。 | 🟡 中 |

### 3.2 跨系统架构编排规范（B 类）

| 编号 | 检查项 | 规范来源 | 当前状态 | 缺口说明 | 严重程度 | 形态判定 |
|------|--------|---------|---------|---------|---------|---------|
| B-X1 | **跨架构原生二进制矩阵** | 跨系统编排规范 第二章 | 🟡 部分完成 | 桌面端（Electron）支持 win/mac/linux 多平台构建；服务器端为 Node.js 脚本（非原生二进制），依赖目标机 Node.js 环境。pack-server-release.sh 仅按当前架构打包，无交叉编译产出 x64/arm64/loong64 三架构原生二进制矩阵。Node.js 项目是否必须原生二进制需结合形态判定。 | 🟡 中 | 部分适用：Server 为 Node.js 解释执行，非编译型语言，原生二进制非强制；但多架构制品打包应覆盖 |
| B-X2 | **Nomad 统一编排配置** | 跨系统编排规范 5.1 | ⚪ 形态不适用 | 无 Nomad job 配置文件。 | — | **不适用**：CYP-memo 为单机产品（Electron + 嵌入式服务端），非多节点集群，无需 Nomad 编排 |
| B-X3 | **Consul 服务注册与发现** | 跨系统编排规范 4.1 | ⚪ 形态不适用 | 无 Consul 配置。仅 LOCAL_DEV.md 提到相关概念。 | — | **不适用**：单机单实例产品，无多机服务发现需求 |
| B-X4 | **自动回滚（监控指标驱动）** | 跨系统编排规范 7.3 | 🟡 部分完成 | 有手动金丝雀权重调整和 rollback 接口，但缺少基于监控指标（错误率、延迟、资源）的自动回滚触发机制。渐进式发布为内置功能，非编排级自动回滚。 | 🟡 中 | 适用：单机产品也需要异常时自动回滚能力 |
| B-X5 | **配置中心与密钥管理** | 跨系统编排规范 7.1 | 🟡 部分完成 | 有 KMS 服务（端口 12000）和配置管理，但非集中式配置中心架构（如 Consul KV / Nacos），为嵌入式本地配置。 | 🟢 低 | 部分适用：嵌入式 KMS 满足单机需求，集中式配置中心不适用 |

---

## 四、形态适用性判定

> CYP-memo 是一款**单机 Electron 桌面应用 + 嵌入式 HTTP 服务端**的混合形态产品，核心运行模式为"桌面端内嵌服务端"，同时支持独立服务端部署（NAS / 面板）。

### 4.1 适用条款（必须满足）

| 规范条款 | 适用理由 |
|---------|---------|
| 一键启动脚本八子目录结构 | 任何端任何形态都必须提供一键脚本（规范 #1） |
| 三平台脚本配对（.ps1/.sh/.bat） | 桌面端跨 Windows/macOS/Linux，服务端跨平台部署 |
| 端口占用预检 + 硬阻断 | 通用要求，任何服务启动前必须检测 |
| 健康检查（就绪 + 存活探针） | API 服务通用要求 |
| CI02 生产唯一基准 | 通用强制，桌面端也必须以生产模式启动 |
| **CI03 一服务一端口** | **通用强制，即使单机也必须端口隔离**（架构原则） |
| systemd / Windows SCM 服务 | 服务端独立部署时需要 |
| 制品签名与完整性校验 | 安装包 / 发布物通用要求 |
| 渐进式发布 | 自动更新场景需要 |
| 支持包 / diagnose / kill-switch | 通用运维要求 |

### 4.2 不适用条款（单机形态豁免）

| 规范条款 | 不适用理由 |
|---------|-----------|
| Nomad 统一编排 | 单节点产品，无多机调度需求 |
| Consul 服务注册与发现 | 单实例服务，无服务发现需求 |
| 跨机 / 多服务编排 | 单机嵌入式架构，服务均在同一机器上 |
| 信创环境 Nacos 兼容 | 非信创项目、非多服务架构 |
| 服务网格（Service Mesh） | 单机单实例，无需服务网格 |
| 跨机通信加密（mTLS 全网） | 本机环回通信，跨机通信场景有限 |

### 4.3 存疑 / 需进一步确认条款

| 规范条款 | 判定难点 | 建议 |
|---------|---------|------|
| 跨架构原生二进制矩阵 | Node.js 项目是否需要 pkg/nexe 打包为原生二进制？规范要求是"原生二进制"，但 Node.js 解释执行也是业界常态。 | 建议明确：Node.js 项目可提供包含 Node runtime 的打包（如 pkg），但非强制；至少需保证多架构制品完整性 |
| CI03 跨端口通信授权 | 单机产品的内部跨端口通信（网关→API）是否需要登记授权？ | 建议仍需登记（遵循最小权限原则），但可简化审批流程 |
| 自动回滚触发机制 | 单机产品是否需要基于监控的自动回滚？还是手动回滚即可？ | 建议至少实现错误率超阈值时的自动降级/回滚 |

---

## 五、重点缺口详析（CI03 架构违规）

### 5.1 问题描述

当前架构中，**端口 5170（gatewayApp）同时承载三类业务**：

```
端口 5170 (gatewayApp)
  ├── 前端静态资源服务（express.static → appDistPath）
  ├── /api/* 反向代理 → 后端 API 服务（127.0.0.1:10170）
  ├── /healthz/* 代理 → 就绪探针
  ├── /health/* 代理 → 存活探针
  └── /mcp/* 代理 → MCP 服务（127.0.0.1:10175）
```

违反规范：
- **CI03-1 一服务一端口**：一个端口承载前端静态 + API 网关 + MCP 代理多类业务
- **CI03-5 端口段分配**：5170 属于前端静态资源段（5000-5999），但同时承载了网关和旁路功能

### 5.2 整改建议

方案一（推荐 · 严格遵循 CI03）：
```
端口 5170（5xxx段） → 前端静态资源服务（独立进程/独立Express实例）
端口 12170（12xxx段） → 网关服务（独立进程，统一入口，反向代理前后端）
端口 10170（10xxx段） → 后端 API 服务（已实现）
端口 13175（13xxx段） → MCP 旁路服务（当前为 10175，需调整到 13xxx 段）
```

方案二（折中 · 保持单进程但逻辑隔离）：
- 保留当前架构，但明确 5170 为"产品统一入口网关"（归到 12xxx 基础设施段）
- 前端静态资源作为网关的内置模块，不作为独立服务计算
- 需在《端口使用明细表》中明确说明并获得架构审批

---

## 六、整改优先级与建议

### P0（立即整改 · 一票否决项）

| 项 | 内容 | 预计工作量 |
|----|------|-----------|
| 1 | **CI03 架构整改**：网关与前端静态资源端口分离，或提交架构豁免审批 | 中（2-3 天） |
| 2 | **启动脚本内置 CI03 验证清单**：端口段合规检查、进程隔离验证、通信授权验证 | 小（0.5-1 天） |

### P1（高优先级 · 本迭代补齐）

| 项 | 内容 | 预计工作量 |
|----|------|-----------|
| 1 | redact 脚本移入 redact/ 子目录，补齐三平台入口 | 小 |
| 2 | devloop 脚本移入 start/ 子目录或独立 devloop/ 子目录 | 小 |
| 3 | gate/ 子目录补齐 .bat 入口 | 小 |
| 4 | MCP 端口调整到 13xxx 旁路段（或登记说明） | 小 |

### P2（中优先级 · 下一迭代）

| 项 | 内容 | 预计工作量 |
|----|------|-----------|
| 1 | 基于监控指标的自动回滚机制 | 中 |
| 2 | 跨架构制品打包优化（覆盖 arm64） | 中 |

### P3（低优先级 · 形态不适用 / 可选增强）

| 项 | 内容 | 形态判定 |
|----|------|---------|
| 1 | Nomad / Consul 配置 | 不适用 |
| 2 | 多机服务发现 | 不适用 |
| 3 | 服务网格 | 不适用 |

---

## 七、证据文件索引

| 类别 | 文件路径 | 说明 |
|------|---------|------|
| 规范文件 | `d:\kf\CYP-skill-arsenal\dmc\spec\kf-specs\上线（强制要求）-通用一键本地启动脚本与流程测试强制规范.md` | v3.0.0 |
| 规范文件 | `d:\kf\CYP-skill-arsenal\dmc\spec\kf-specs\开发-通用服务启动与端口管理总纲.md` | v3.0.0 |
| 规范文件 | `d:\kf\CYP-skill-arsenal\dmc\spec\kf-specs\开发要求-通用前后端启动方式与端口强制要求规范.md` | v4.0.0 |
| 规范文件 | `d:\kf\CYP-skill-arsenal\dmc\spec\kf-specs\部署（强制要求）-通用非容器跨系统架构平台服务启动编排规范.md` | v1.1.0 |
| 启动脚本 | `d:\kf\kf\CYP-memo\scripts\start\start-local.ps1` | Windows 启动入口 |
| 启动脚本 | `d:\kf\kf\CYP-memo\scripts\start\start-local.sh` | Unix 启动入口 |
| 验证脚本 | `d:\kf\kf\CYP-memo\scripts\verify\verify-e2e.ps1` | E2E 验证入口 |
| 服务端代码 | `d:\kf\kf\CYP-memo\packages\server\src\index.ts` | 网关 + API 双 Express 实例 |
| systemd | `d:\kf\kf\CYP-memo\deploy\systemd\cyp-memo.service` | Linux 服务单元 |
| Windows SCM | `d:\kf\kf\CYP-memo\deploy\windows\cyp-memo.xml` | WinSW 服务配置 |
| 健康检查 | `d:\kf\kf\CYP-memo\packages\server\src\index.ts:502-563` | 就绪/存活/综合健康 |

---

*报告结束 · 审计人：CYP 合规审计工程师 · 2026-10-05*
