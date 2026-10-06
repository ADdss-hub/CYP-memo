/**
 * 写出闭集 35 张组件卡片（十一交付物 #2–#4）。
 * 字段对齐军械库组件卡片模板 12 项 + 自动化 ACL。
 * 本脚本只写 docs/runtime-base/component-cards/，不写版本史/工作日志。
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const matrix = JSON.parse(fs.readFileSync(path.join(root, 'docs/runtime-base/automation-matrix.json'), 'utf8'))
const outDir = path.join(root, 'docs/runtime-base/component-cards')
fs.mkdirSync(outDir, { recursive: true })

const layerOf = (id) => {
  if (id.includes('-INFRA-')) return '基础设施六组件'
  if (id.includes('-COORD-')) return '协调子平台'
  if (id.includes('-MGMT-')) return '管控子平台'
  if (id.includes('-HOST-')) return '托管业务子平台'
  if (id.includes('-COL-')) return '协作能力子平台'
  if (id.includes('-PUB-')) return '公开子平台'
  return '未分组'
}

const fiveSeven = {
  'RB-L0-INFRA-CFG-01': '配置加载与环境隔离可核验；存储空间探测只认 dataDir 所在卷',
  'RB-L0-INFRA-INIT-01': '启动引导与子目录创建可核验；失败不得冒充就绪',
  'RB-L0-INFRA-LOG-01': '日志信封与脱敏可核验；采样与保留期受配置管控',
  'RB-L0-INFRA-CACHE-01': '系统缓存可核验；禁止业务侧平行缓存冒充',
  'RB-L0-INFRA-MQ-01': '通道可用；事件契约不由本组件冒充',
  'RB-L0-INFRA-DB-01': '持久化根唯一；迁移在本目录。附件 blob 不属本槽',
  'RB-L0-COORD-CMP-01': '闭集聚合与探针默认可核验；接线后领域订阅已挂',
  'RB-L0-COORD-PLT-01': '名册、接线表、支持矩阵、确认留痕台账同文件；未登记接线拒绝',
  'RB-L1-MGMT-CONF-01': '配置具备版本、审计与回滚及可核验热变更面',
  'RB-L1-MGMT-RISK-01': '运行告警有收敛与处置记录，且可追溯到全链路日志',
  'RB-L1-MGMT-TRACE-01': '请求链路可按统一标识检索；鉴权失败与公开面拒绝有留痕',
  'RB-L1-MGMT-BOOT-01': '启动顺序与依赖探活失败时拒绝进入就绪',
  'RB-L1-MGMT-CODE-01': '业务码、状态码、错误码有唯一码表，契约引用该码表',
  'RB-L1-MGMT-FESEC-01': '输出默认脱敏；前端具备内容安全策略与请求防重',
  'RB-L1-MGMT-IAM-01': '业务接口的认证与鉴权只挂载于本组件；密钥只经密钥保险箱引用',
  'RB-L1-MGMT-KMS-01': 'K1-K7 可核验；工作负载证书到期自动更换',
  'RB-L1-MGMT-RBAC-01': '每一受控资源有权限行；无行即拒绝',
  'RB-L1-MGMT-PERF-01': '存在基线、SLA、频率、越界处置、可逆手段与可核验指标面',
  'RB-L1-HOST-TELEM-01': '指标来自本组件，不由托管业务服务私建平行监测栈',
  'RB-L1-HOST-RULE-01': '规则与阈值的判定读取配置管控，不在业务代码中硬编码第二套阈值',
  'RB-L1-HOST-SCHED-01': '任务与工单的状态迁移可审计，并受性能运行管控约束',
  'RB-L1-HOST-ACCT-01': '清洗、聚合、对账结果可回放，口径来自配置管控',
  'RB-L1-HOST-REL-01': '配置与版本变更有灰度与回滚记录',
  'RB-L1-HOST-BIZ-01': '对外业务履约接口经身份访问管控，不自建认证',
  'RB-L1-HOST-ALERT-01': '管理员告警分级、指派、关闭形成闭环，并回链全链路日志',
  'RB-L1-HOST-TRACEAN-01': '能由日志与业务码定位到单次业务处理',
  'RB-L1-HOST-AUDIT-01': '敏感操作与鉴权协作有独立审计记录',
  'RB-L1-HOST-RESIL-01': '限流、熔断、降级有统一策略；出站须 half-open 可自动恢复',
  'RB-L1-COL-SVC-01': '内部服务调用经注册、路由与服务间授权，不直连绕过',
  'RB-L1-COL-EVT-01': '事件有目录、契约、幂等与死信处理；消息队列只承担通道',
  'RB-L1-COL-CTR-01': '接口与事件契约有版本兼容结论；不兼容变更有审批记录',
  'RB-L1-COL-TEN-01': '跨租户授权编排完成后，权限仍落到 RBAC权限矩阵的行',
  'RB-L1-COL-DATA-01': '数据交换有合约、权限与血缘；不替代数据处理核算的对账',
  'RB-L1-PUB-ACC-01': '对外生产传输加密；写请求具备一次性键；启用名单后默认拒绝名单外访问',
  'RB-L1-PUB-OPEN-01': '开放接口的应用、订阅、配额与 SLA 有登记；未登记不得宣称已开放',
}

const notSolve = {
  default: '不替代其它闭集项；不新增第 36 键；嵌入式只改载体',
}

for (const it of matrix.items) {
  const layer = layerOf(it.id)
  const cond = fiveSeven[it.id] || '见架构 5.7 同行'
  const body = `# ${it.name}

| 字段 | 填写 |
|------|------|
| 项目名 | CYP-memo |
| 卡片版本 | 2.0.0 |
| 日期 | 2026-10-04 |
| 作者 / Owner | CYP |
| 稳定 ID | \`${it.id}\` |
| 组件中文全称 | ${it.name} |
| 所属层 | ${layer} |
| 边界 | 底座 |
| 部署形态 | 嵌入式 |
| 自动化 ACL | ${it.acl} |

## 十二项正文

| # | 项 | 填写 |
|---|----|------|
| 1 | 名称与版本 | 名称：${it.name}。版本：2.0.0。兼容范围：本产品嵌入式进程 |
| 2 | 定位 | 解决：${cond}。不解决：${notSolve.default} |
| 3 | 边界 | 实现锚点见平台协调 RUNTIME_BASE_ANCHORS。禁止平行第二实现 |
| 4 | 契约 | API：经业务协同对接登记。事件：事件协作管控目录。错误码：码值标准化 |
| 5 | 部署形态 | 嵌入式（同进程）。Desktop 同载体 |
| 6 | 配置模型 | 来源仅配置管控。密钥只经密钥保险箱引用。热更新以配置管控修订为准 |
| 7 | 生命周期 | 初始化组件引导 → 启动依赖管控探活 → 运行 → 停用。健康：对应 ready 函数 |
| 8 | 依赖关系 | 上游：平台协调接线。下游：全链路日志 / 安全审计防护。强依赖按接线表 |
| 9 | SLA | 可用性与延迟跟性能运行管控 SLA。容量跟本机识别 |
| 10 | 可观测 | 日志走全链路日志。指标走态势采集监测与性能运行管控。追踪：traceId |
| 11 | 安全 | 认证授权：身份访问管控与 RBAC权限矩阵。审计：安全审计防护 |
| 12 | 扩展与治理 | 扩展点经平台协调登记。限流走系统韧性保障。灰度与回滚走版本变更发布 / 配置管控 |

## 自动化

| 项 | 值 |
|----|----|
| 自动化 ACL | ${it.acl} |
| 能力点 | ${(it.capIds || []).join('、')} |
| 闭环 | ${it.loop} |
| 运维面 | ${it.ops} |
| 符号 | ${(it.symbols || []).join('、')} |

本卡登记闭集项。完成判定只看架构 NR-05 与 5.7，不看本卡是否落盘。
`
  fs.writeFileSync(path.join(outDir, `${it.id}.md`), body, 'utf8')
}

const index = `# 组件卡片索引

闭集 35。每张一文件。登记主键为稳定 ID。显示名为中文全称。

| 稳定 ID | 中文全称 | 自动化 ACL |
|---------|----------|------------|
${matrix.items.map((it) => `| \`${it.id}\` | ${it.name} | ${it.acl} |`).join('\n')}

机检：\`pnpm verify:automation-matrix\`。
`
fs.writeFileSync(path.join(outDir, 'README.md'), index, 'utf8')
console.log(`wrote ${matrix.items.length} cards`)
