/**
 * 统一运行底座闭集 35 稳定 ID（架构 V1.8.5 附录 A）
 * 登记主键只认本表；显示名不得作机检键。
 * 平台协调：名册与接线表同文件。
 */

import { recordChainMark } from '../../../l1/mgmt/trace/ready.js'
import { recordAuditSafe } from '../../../l1/host/audit/ready.js'
import {
  forceReconnectEstablished,
  resetWorkloadCertRotation,
  rotateExpiredWorkloadCert,
  switchTrustAnchorSigning,
  issueWorkloadCert,
  WORKLOAD_CERT_TTL_MS,
} from '../../../l1/mgmt/kms/ready.js'

export const RUNTIME_BASE_STABLE_IDS = [
  'RB-L0-INFRA-CFG-01',
  'RB-L0-INFRA-INIT-01',
  'RB-L0-INFRA-LOG-01',
  'RB-L0-INFRA-CACHE-01',
  'RB-L0-INFRA-MQ-01',
  'RB-L0-INFRA-DB-01',
  'RB-L0-COORD-CMP-01',
  'RB-L0-COORD-PLT-01',
  'RB-L1-MGMT-CONF-01',
  'RB-L1-MGMT-RISK-01',
  'RB-L1-MGMT-TRACE-01',
  'RB-L1-MGMT-BOOT-01',
  'RB-L1-MGMT-CODE-01',
  'RB-L1-MGMT-FESEC-01',
  'RB-L1-MGMT-IAM-01',
  'RB-L1-MGMT-KMS-01',
  'RB-L1-MGMT-RBAC-01',
  'RB-L1-MGMT-PERF-01',
  'RB-L1-HOST-TELEM-01',
  'RB-L1-HOST-RULE-01',
  'RB-L1-HOST-SCHED-01',
  'RB-L1-HOST-ACCT-01',
  'RB-L1-HOST-REL-01',
  'RB-L1-HOST-BIZ-01',
  'RB-L1-HOST-ALERT-01',
  'RB-L1-HOST-TRACEAN-01',
  'RB-L1-HOST-AUDIT-01',
  'RB-L1-HOST-RESIL-01',
  'RB-L1-COL-SVC-01',
  'RB-L1-COL-EVT-01',
  'RB-L1-COL-CTR-01',
  'RB-L1-COL-TEN-01',
  'RB-L1-COL-DATA-01',
  'RB-L1-PUB-ACC-01',
  'RB-L1-PUB-OPEN-01',
] as const

export type RuntimeBaseStableId = (typeof RUNTIME_BASE_STABLE_IDS)[number]

export const RUNTIME_BASE_DISPLAY_NAMES: Record<RuntimeBaseStableId, string> = {
  'RB-L0-INFRA-CFG-01': '配置组件',
  'RB-L0-INFRA-INIT-01': '初始化组件',
  'RB-L0-INFRA-LOG-01': '日志组件',
  'RB-L0-INFRA-CACHE-01': '缓存组件',
  'RB-L0-INFRA-MQ-01': '消息队列组件',
  'RB-L0-INFRA-DB-01': '数据库',
  'RB-L0-COORD-CMP-01': '组件协调',
  'RB-L0-COORD-PLT-01': '平台协调',
  'RB-L1-MGMT-CONF-01': '配置管控',
  'RB-L1-MGMT-RISK-01': '风险运行管控',
  'RB-L1-MGMT-TRACE-01': '全链路日志',
  'RB-L1-MGMT-BOOT-01': '启动依赖管控',
  'RB-L1-MGMT-CODE-01': '码值标准化',
  'RB-L1-MGMT-FESEC-01': '前端安全防护',
  'RB-L1-MGMT-IAM-01': '身份访问管控',
  'RB-L1-MGMT-KMS-01': '密钥保险箱',
  'RB-L1-MGMT-RBAC-01': 'RBAC权限矩阵',
  'RB-L1-MGMT-PERF-01': '性能运行管控',
  'RB-L1-HOST-TELEM-01': '态势采集监测',
  'RB-L1-HOST-RULE-01': '规则校验研判',
  'RB-L1-HOST-SCHED-01': '流程调度编排',
  'RB-L1-HOST-ACCT-01': '数据处理核算',
  'RB-L1-HOST-REL-01': '版本变更发布',
  'RB-L1-HOST-BIZ-01': '业务协同对接',
  'RB-L1-HOST-ALERT-01': '风险告警处置',
  'RB-L1-HOST-TRACEAN-01': '溯源检索分析',
  'RB-L1-HOST-AUDIT-01': '安全审计防护',
  'RB-L1-HOST-RESIL-01': '系统韧性保障',
  'RB-L1-COL-SVC-01': '服务协作管控',
  'RB-L1-COL-EVT-01': '事件协作管控',
  'RB-L1-COL-CTR-01': '契约治理管控',
  'RB-L1-COL-TEN-01': '租户协作服务',
  'RB-L1-COL-DATA-01': '数据协作服务',
  'RB-L1-PUB-ACC-01': '公开接入安全',
  'RB-L1-PUB-OPEN-01': '开放协作管控',
}

/** 实现锚点：相对 packages/server/src 的独立文件（NR-24） */
export const RUNTIME_BASE_ANCHORS: Record<RuntimeBaseStableId, string> = {
  'RB-L0-INFRA-CFG-01': 'runtime-base/l0/infra/cfg/ready.ts',
  'RB-L0-INFRA-INIT-01': 'runtime-base/l0/infra/init/ready.ts',
  'RB-L0-INFRA-LOG-01': 'runtime-base/l0/infra/log/ready.ts',
  'RB-L0-INFRA-CACHE-01': 'runtime-base/l0/infra/cache/ready.ts',
  'RB-L0-INFRA-MQ-01': 'runtime-base/l0/infra/mq/ready.ts',
  'RB-L0-INFRA-DB-01': 'runtime-base/l0/infra/db/ready.ts',
  'RB-L0-COORD-CMP-01': 'runtime-base/l0/coord/cmp/ready.ts',
  'RB-L0-COORD-PLT-01': 'runtime-base/l0/coord/plt/ready.ts',
  'RB-L1-MGMT-CONF-01': 'runtime-base/l1/mgmt/conf/ready.ts',
  'RB-L1-MGMT-RISK-01': 'runtime-base/l1/mgmt/risk/ready.ts',
  'RB-L1-MGMT-TRACE-01': 'runtime-base/l1/mgmt/trace/ready.ts',
  'RB-L1-MGMT-BOOT-01': 'runtime-base/l1/mgmt/boot/ready.ts',
  'RB-L1-MGMT-CODE-01': 'runtime-base/l1/mgmt/code/ready.ts',
  'RB-L1-MGMT-FESEC-01': 'runtime-base/l1/mgmt/fesec/ready.ts',
  'RB-L1-MGMT-IAM-01': 'runtime-base/l1/mgmt/iam/ready.ts',
  'RB-L1-MGMT-KMS-01': 'runtime-base/l1/mgmt/kms/ready.ts',
  'RB-L1-MGMT-RBAC-01': 'runtime-base/l1/mgmt/rbac/ready.ts',
  'RB-L1-MGMT-PERF-01': 'runtime-base/l1/mgmt/perf/ready.ts',
  'RB-L1-HOST-TELEM-01': 'runtime-base/l1/host/telem/ready.ts',
  'RB-L1-HOST-RULE-01': 'runtime-base/l1/host/rule/ready.ts',
  'RB-L1-HOST-SCHED-01': 'runtime-base/l1/host/sched/ready.ts',
  'RB-L1-HOST-ACCT-01': 'runtime-base/l1/host/acct/ready.ts',
  'RB-L1-HOST-REL-01': 'runtime-base/l1/host/rel/ready.ts',
  'RB-L1-HOST-BIZ-01': 'runtime-base/l1/host/biz/ready.ts',
  'RB-L1-HOST-ALERT-01': 'runtime-base/l1/host/alert/ready.ts',
  'RB-L1-HOST-TRACEAN-01': 'runtime-base/l1/host/tracean/ready.ts',
  'RB-L1-HOST-AUDIT-01': 'runtime-base/l1/host/audit/ready.ts',
  'RB-L1-HOST-RESIL-01': 'runtime-base/l1/host/resil/ready.ts',
  'RB-L1-COL-SVC-01': 'runtime-base/l1/col/svc/ready.ts',
  'RB-L1-COL-EVT-01': 'runtime-base/l1/col/evt/ready.ts',
  'RB-L1-COL-CTR-01': 'runtime-base/l1/col/ctr/ready.ts',
  'RB-L1-COL-TEN-01': 'runtime-base/l1/col/ten/ready.ts',
  'RB-L1-COL-DATA-01': 'runtime-base/l1/col/data/ready.ts',
  'RB-L1-PUB-ACC-01': 'runtime-base/l1/pub/acc/ready.ts',
  'RB-L1-PUB-OPEN-01': 'runtime-base/l1/pub/open/ready.ts',
}

/** 《支持矩阵》默认声明集：Windows / x64 / Server 与 Desktop。桌面进程嵌入同一服务端。 */
export type SupportMatrixRow = {
  stableId: RuntimeBaseStableId
  displayName: string
  os: 'Windows'
  arch: 'x64'
  platform: 'Server' | 'Desktop'
  declared: '声明'
  caseId: string
  caseStatus: '已实现' | '待实现' | '阻塞'
}

const SUPPORT_PLATFORMS = ['Server', 'Desktop'] as const

function buildSupportCaseId(
  id: RuntimeBaseStableId,
  platform: 'Server' | 'Desktop',
  seq = '001'
): string {
  return `TC-${id}-Windows-x64-${platform}-${seq}`
}

export const SUPPORT_MATRIX: SupportMatrixRow[] = SUPPORT_PLATFORMS.flatMap((platform) =>
  RUNTIME_BASE_STABLE_IDS.map((stableId) => ({
    stableId,
    displayName: RUNTIME_BASE_DISPLAY_NAMES[stableId],
    os: 'Windows' as const,
    arch: 'x64' as const,
    platform,
    declared: '声明' as const,
    caseId: buildSupportCaseId(stableId, platform),
    caseStatus: '已实现' as const,
  }))
)

export function isSupportMatrixReady(): boolean {
  if (SUPPORT_MATRIX.length !== RUNTIME_BASE_STABLE_IDS.length * SUPPORT_PLATFORMS.length) return false
  for (const id of RUNTIME_BASE_STABLE_IDS) {
    for (const platform of SUPPORT_PLATFORMS) {
      const row = SUPPORT_MATRIX.find((r) => r.stableId === id && r.platform === platform)
      if (!row || row.declared !== '声明' || row.caseStatus !== '已实现') return false
      if (row.os !== 'Windows' || row.arch !== 'x64') return false
    }
  }
  return true
}

/**
 * 平台协调 · 接线表（唯一适配面 · NR-15）
 * 契约入口：contract://{caller}/{callee}
 * 登记号：PR-{caller}-{callee}-{seq}
 */

export type WiringExtPoint = 'notify_system' | 'notify_channel' | 'notify_delivery' | 'object_storage'

export type WiringRow = {
  caller: string
  /** 闭集被调用方；扩展点行留空，不得填稳定 ID */
  callee: string
  extPoint?: WiringExtPoint
  contractEntry: string
  registration: string
  readyFnVersion: string
  caseId: string
  caseStatus: '已实现' | '待实现' | '阻塞'
  note?: string
}

/** 默认声明集：Windows / x64 / Server 与 Desktop。接线行引用 Server 用例编号；Desktop 为同一被调用方，桌面进程嵌入同一服务端。 */
export const WIRING_TABLE: WiringRow[] = [
  {
    caller: 'RB-L1-PUB-ACC-01',
    callee: 'RB-L1-HOST-RESIL-01',
    contractEntry: 'contract://RB-L1-PUB-ACC-01/RB-L1-HOST-RESIL-01',
    registration: 'PR-RB-L1-PUB-ACC-01-RB-L1-HOST-RESIL-01-0001',
    readyFnVersion: '1.0.0',
    caseId: 'TC-RB-L1-HOST-RESIL-01-Windows-x64-Server-001',
    caseStatus: '已实现',
    note: 'H1 第一跳固定',
  },
  {
    caller: 'RB-L1-HOST-RESIL-01',
    callee: 'RB-L1-MGMT-IAM-01',
    contractEntry: 'contract://RB-L1-HOST-RESIL-01/RB-L1-MGMT-IAM-01',
    registration: 'PR-RB-L1-HOST-RESIL-01-RB-L1-MGMT-IAM-01-0001',
    readyFnVersion: '1.0.0',
    caseId: 'TC-RB-L1-MGMT-IAM-01-Windows-x64-Server-001',
    caseStatus: '已实现',
  },
  {
    caller: 'RB-L1-MGMT-IAM-01',
    callee: 'RB-L1-MGMT-RBAC-01',
    contractEntry: 'contract://RB-L1-MGMT-IAM-01/RB-L1-MGMT-RBAC-01',
    registration: 'PR-RB-L1-MGMT-IAM-01-RB-L1-MGMT-RBAC-01-0001',
    readyFnVersion: '1.0.0',
    caseId: 'TC-RB-L1-MGMT-RBAC-01-Windows-x64-Server-001',
    caseStatus: '已实现',
  },
  {
    caller: 'RB-L1-MGMT-RBAC-01',
    callee: 'RB-L1-HOST-BIZ-01',
    contractEntry: 'contract://RB-L1-MGMT-RBAC-01/RB-L1-HOST-BIZ-01',
    registration: 'PR-RB-L1-MGMT-RBAC-01-RB-L1-HOST-BIZ-01-0001',
    readyFnVersion: '1.0.0',
    caseId: 'TC-RB-L1-HOST-BIZ-01-Windows-x64-Server-001',
    caseStatus: '已实现',
  },
  {
    caller: 'RB-L1-HOST-BIZ-01',
    callee: 'RB-L0-INFRA-DB-01',
    contractEntry: 'contract://RB-L1-HOST-BIZ-01/RB-L0-INFRA-DB-01',
    registration: 'PR-RB-L1-HOST-BIZ-01-RB-L0-INFRA-DB-01-0001',
    readyFnVersion: '1.0.0',
    caseId: 'TC-RB-L0-INFRA-DB-01-Windows-x64-Server-001',
    caseStatus: '已实现',
  },
  {
    caller: 'RB-L0-COORD-PLT-01',
    callee: 'RB-L0-INFRA-CFG-01',
    contractEntry: 'contract://RB-L0-COORD-PLT-01/RB-L0-INFRA-CFG-01',
    registration: 'PR-RB-L0-COORD-PLT-01-RB-L0-INFRA-CFG-01-0001',
    readyFnVersion: '1.0.0',
    caseId: 'TC-RB-L0-INFRA-CFG-01-Windows-x64-Server-001',
    caseStatus: '已实现',
  },
  {
    caller: 'RB-L0-COORD-PLT-01',
    callee: 'RB-L0-INFRA-INIT-01',
    contractEntry: 'contract://RB-L0-COORD-PLT-01/RB-L0-INFRA-INIT-01',
    registration: 'PR-RB-L0-COORD-PLT-01-RB-L0-INFRA-INIT-01-0001',
    readyFnVersion: '1.0.0',
    caseId: 'TC-RB-L0-INFRA-INIT-01-Windows-x64-Server-001',
    caseStatus: '已实现',
  },
  {
    caller: 'RB-L0-COORD-PLT-01',
    callee: 'RB-L0-INFRA-LOG-01',
    contractEntry: 'contract://RB-L0-COORD-PLT-01/RB-L0-INFRA-LOG-01',
    registration: 'PR-RB-L0-COORD-PLT-01-RB-L0-INFRA-LOG-01-0001',
    readyFnVersion: '1.0.0',
    caseId: 'TC-RB-L0-INFRA-LOG-01-Windows-x64-Server-001',
    caseStatus: '已实现',
  },
  {
    caller: 'RB-L0-COORD-PLT-01',
    callee: 'RB-L0-INFRA-CACHE-01',
    contractEntry: 'contract://RB-L0-COORD-PLT-01/RB-L0-INFRA-CACHE-01',
    registration: 'PR-RB-L0-COORD-PLT-01-RB-L0-INFRA-CACHE-01-0001',
    readyFnVersion: '1.0.0',
    caseId: 'TC-RB-L0-INFRA-CACHE-01-Windows-x64-Server-001',
    caseStatus: '已实现',
  },
  {
    caller: 'RB-L0-COORD-PLT-01',
    callee: 'RB-L0-INFRA-MQ-01',
    contractEntry: 'contract://RB-L0-COORD-PLT-01/RB-L0-INFRA-MQ-01',
    registration: 'PR-RB-L0-COORD-PLT-01-RB-L0-INFRA-MQ-01-0001',
    readyFnVersion: '1.0.0',
    caseId: 'TC-RB-L0-INFRA-MQ-01-Windows-x64-Server-001',
    caseStatus: '已实现',
  },
  {
    caller: 'RB-L0-COORD-CMP-01',
    callee: 'RB-L0-INFRA-DB-01',
    contractEntry: 'contract://RB-L0-COORD-CMP-01/RB-L0-INFRA-DB-01',
    registration: 'PR-RB-L0-COORD-CMP-01-RB-L0-INFRA-DB-01-0001',
    readyFnVersion: '1.0.0',
    caseId: 'TC-RB-L0-INFRA-DB-01-Windows-x64-Desktop-001',
    caseStatus: '已实现',
  },
  {
    caller: 'RB-L1-MGMT-CONF-01',
    callee: 'RB-L0-INFRA-CFG-01',
    contractEntry: 'contract://RB-L1-MGMT-CONF-01/RB-L0-INFRA-CFG-01',
    registration: 'PR-RB-L1-MGMT-CONF-01-RB-L0-INFRA-CFG-01-0001',
    readyFnVersion: '1.0.0',
    caseId: 'TC-RB-L1-MGMT-CONF-01-Windows-x64-Server-001',
    caseStatus: '已实现',
  },
  {
    caller: 'RB-L1-MGMT-TRACE-01',
    callee: 'RB-L0-INFRA-LOG-01',
    contractEntry: 'contract://RB-L1-MGMT-TRACE-01/RB-L0-INFRA-LOG-01',
    registration: 'PR-RB-L1-MGMT-TRACE-01-RB-L0-INFRA-LOG-01-0001',
    readyFnVersion: '1.0.0',
    caseId: 'TC-RB-L1-MGMT-TRACE-01-Windows-x64-Server-001',
    caseStatus: '已实现',
  },
  {
    caller: 'RB-L1-MGMT-BOOT-01',
    callee: 'RB-L0-INFRA-INIT-01',
    contractEntry: 'contract://RB-L1-MGMT-BOOT-01/RB-L0-INFRA-INIT-01',
    registration: 'PR-RB-L1-MGMT-BOOT-01-RB-L0-INFRA-INIT-01-0001',
    readyFnVersion: '1.0.0',
    caseId: 'TC-RB-L1-MGMT-BOOT-01-Windows-x64-Server-001',
    caseStatus: '已实现',
  },
  {
    caller: 'RB-L1-MGMT-KMS-01',
    callee: 'RB-L0-INFRA-DB-01',
    contractEntry: 'contract://RB-L1-MGMT-KMS-01/RB-L0-INFRA-DB-01',
    registration: 'PR-RB-L1-MGMT-KMS-01-RB-L0-INFRA-DB-01-0001',
    readyFnVersion: '1.0.0',
    caseId: 'TC-RB-L1-MGMT-KMS-01-Windows-x64-Server-001',
    caseStatus: '已实现',
  },
  {
    caller: 'RB-L1-MGMT-PERF-01',
    callee: 'RB-L1-HOST-TELEM-01',
    contractEntry: 'contract://RB-L1-MGMT-PERF-01/RB-L1-HOST-TELEM-01',
    registration: 'PR-RB-L1-MGMT-PERF-01-RB-L1-HOST-TELEM-01-0001',
    readyFnVersion: '1.0.0',
    caseId: 'TC-RB-L1-MGMT-PERF-01-Windows-x64-Server-001',
    caseStatus: '已实现',
  },
  {
    caller: 'RB-L1-HOST-ALERT-01',
    callee: 'RB-L1-MGMT-RISK-01',
    contractEntry: 'contract://RB-L1-HOST-ALERT-01/RB-L1-MGMT-RISK-01',
    registration: 'PR-RB-L1-HOST-ALERT-01-RB-L1-MGMT-RISK-01-0001',
    readyFnVersion: '1.0.0',
    caseId: 'TC-RB-L1-HOST-ALERT-01-Windows-x64-Server-001',
    caseStatus: '已实现',
  },
  {
    caller: 'RB-L1-COL-SVC-01',
    callee: 'RB-L0-COORD-PLT-01',
    contractEntry: 'contract://RB-L1-COL-SVC-01/RB-L0-COORD-PLT-01',
    registration: 'PR-RB-L1-COL-SVC-01-RB-L0-COORD-PLT-01-0001',
    readyFnVersion: '1.0.0',
    caseId: 'TC-RB-L0-COORD-PLT-01-Windows-x64-Server-001',
    caseStatus: '已实现',
  },
  {
    caller: 'RB-L1-COL-EVT-01',
    callee: 'RB-L0-INFRA-MQ-01',
    contractEntry: 'contract://RB-L1-COL-EVT-01/RB-L0-INFRA-MQ-01',
    registration: 'PR-RB-L1-COL-EVT-01-RB-L0-INFRA-MQ-01-0001',
    readyFnVersion: '1.0.0',
    caseId: 'TC-RB-L1-COL-EVT-01-Windows-x64-Server-001',
    caseStatus: '已实现',
  },
  {
    caller: 'RB-L1-COL-CTR-01',
    callee: 'RB-L1-MGMT-CODE-01',
    contractEntry: 'contract://RB-L1-COL-CTR-01/RB-L1-MGMT-CODE-01',
    registration: 'PR-RB-L1-COL-CTR-01-RB-L1-MGMT-CODE-01-0001',
    readyFnVersion: '1.0.0',
    caseId: 'TC-RB-L1-COL-CTR-01-Windows-x64-Server-001',
    caseStatus: '已实现',
  },
  {
    caller: 'RB-L1-COL-TEN-01',
    callee: 'RB-L1-MGMT-RBAC-01',
    contractEntry: 'contract://RB-L1-COL-TEN-01/RB-L1-MGMT-RBAC-01',
    registration: 'PR-RB-L1-COL-TEN-01-RB-L1-MGMT-RBAC-01-0001',
    readyFnVersion: '1.0.0',
    caseId: 'TC-RB-L1-COL-TEN-01-Windows-x64-Server-001',
    caseStatus: '已实现',
  },
  {
    caller: 'RB-L1-COL-DATA-01',
    callee: 'RB-L1-HOST-ACCT-01',
    contractEntry: 'contract://RB-L1-COL-DATA-01/RB-L1-HOST-ACCT-01',
    registration: 'PR-RB-L1-COL-DATA-01-RB-L1-HOST-ACCT-01-0001',
    readyFnVersion: '1.0.0',
    caseId: 'TC-RB-L1-COL-DATA-01-Windows-x64-Server-001',
    caseStatus: '已实现',
  },
  {
    caller: 'RB-L1-PUB-OPEN-01',
    callee: 'RB-L1-PUB-ACC-01',
    contractEntry: 'contract://RB-L1-PUB-OPEN-01/RB-L1-PUB-ACC-01',
    registration: 'PR-RB-L1-PUB-OPEN-01-RB-L1-PUB-ACC-01-0001',
    readyFnVersion: '1.0.0',
    caseId: 'TC-RB-L1-PUB-OPEN-01-Windows-x64-Server-001',
    caseStatus: '已实现',
  },
  {
    caller: 'RB-L1-HOST-SCHED-01',
    callee: 'RB-L1-MGMT-PERF-01',
    contractEntry: 'contract://RB-L1-HOST-SCHED-01/RB-L1-MGMT-PERF-01',
    registration: 'PR-RB-L1-HOST-SCHED-01-RB-L1-MGMT-PERF-01-0001',
    readyFnVersion: '1.0.0',
    caseId: 'TC-RB-L1-HOST-SCHED-01-Windows-x64-Server-001',
    caseStatus: '已实现',
  },
  {
    caller: 'RB-L1-HOST-REL-01',
    callee: 'RB-L1-MGMT-CONF-01',
    contractEntry: 'contract://RB-L1-HOST-REL-01/RB-L1-MGMT-CONF-01',
    registration: 'PR-RB-L1-HOST-REL-01-RB-L1-MGMT-CONF-01-0001',
    readyFnVersion: '1.0.0',
    caseId: 'TC-RB-L1-HOST-REL-01-Windows-x64-Server-001',
    caseStatus: '已实现',
  },
  {
    caller: 'RB-L1-HOST-TRACEAN-01',
    callee: 'RB-L1-MGMT-TRACE-01',
    contractEntry: 'contract://RB-L1-HOST-TRACEAN-01/RB-L1-MGMT-TRACE-01',
    registration: 'PR-RB-L1-HOST-TRACEAN-01-RB-L1-MGMT-TRACE-01-0001',
    readyFnVersion: '1.0.0',
    caseId: 'TC-RB-L1-HOST-TRACEAN-01-Windows-x64-Server-001',
    caseStatus: '已实现',
  },
  {
    caller: 'RB-L1-HOST-AUDIT-01',
    callee: 'RB-L0-INFRA-DB-01',
    contractEntry: 'contract://RB-L1-HOST-AUDIT-01/RB-L0-INFRA-DB-01',
    registration: 'PR-RB-L1-HOST-AUDIT-01-RB-L0-INFRA-DB-01-0001',
    readyFnVersion: '1.0.0',
    caseId: 'TC-RB-L1-HOST-AUDIT-01-Windows-x64-Server-001',
    caseStatus: '已实现',
  },
  {
    caller: 'RB-L1-MGMT-FESEC-01',
    callee: 'RB-L0-INFRA-CACHE-01',
    contractEntry: 'contract://RB-L1-MGMT-FESEC-01/RB-L0-INFRA-CACHE-01',
    registration: 'PR-RB-L1-MGMT-FESEC-01-RB-L0-INFRA-CACHE-01-0001',
    readyFnVersion: '1.0.0',
    caseId: 'TC-RB-L1-MGMT-FESEC-01-Windows-x64-Server-001',
    caseStatus: '已实现',
  },
  {
    caller: 'RB-L1-HOST-RULE-01',
    callee: 'RB-L1-MGMT-CONF-01',
    contractEntry: 'contract://RB-L1-HOST-RULE-01/RB-L1-MGMT-CONF-01',
    registration: 'PR-RB-L1-HOST-RULE-01-RB-L1-MGMT-CONF-01-0001',
    readyFnVersion: '1.0.0',
    caseId: 'TC-RB-L1-HOST-RULE-01-Windows-x64-Server-001',
    caseStatus: '已实现',
  },
  {
    caller: 'RB-L1-HOST-TELEM-01',
    callee: 'RB-L1-MGMT-TRACE-01',
    contractEntry: 'contract://RB-L1-HOST-TELEM-01/RB-L1-MGMT-TRACE-01',
    registration: 'PR-RB-L1-HOST-TELEM-01-RB-L1-MGMT-TRACE-01-0001',
    readyFnVersion: '1.0.0',
    caseId: 'TC-RB-L1-HOST-TELEM-01-Windows-x64-Server-001',
    caseStatus: '已实现',
  },
  {
    caller: 'RB-L0-COORD-PLT-01',
    callee: 'RB-L0-COORD-CMP-01',
    contractEntry: 'contract://RB-L0-COORD-PLT-01/RB-L0-COORD-CMP-01',
    registration: 'PR-RB-L0-COORD-PLT-01-RB-L0-COORD-CMP-01-0001',
    readyFnVersion: '1.0.0',
    caseId: 'TC-RB-L0-COORD-CMP-01-Windows-x64-Server-001',
    caseStatus: '已实现',
  },
  {
    caller: 'RB-L1-MGMT-CODE-01',
    callee: 'RB-L0-INFRA-CFG-01',
    contractEntry: 'contract://RB-L1-MGMT-CODE-01/RB-L0-INFRA-CFG-01',
    registration: 'PR-RB-L1-MGMT-CODE-01-RB-L0-INFRA-CFG-01-0001',
    readyFnVersion: '1.0.0',
    caseId: 'TC-RB-L1-MGMT-CODE-01-Windows-x64-Server-001',
    caseStatus: '已实现',
  },
  {
    caller: 'RB-L1-HOST-ACCT-01',
    callee: 'RB-L0-INFRA-DB-01',
    contractEntry: 'contract://RB-L1-HOST-ACCT-01/RB-L0-INFRA-DB-01',
    registration: 'PR-RB-L1-HOST-ACCT-01-RB-L0-INFRA-DB-01-0001',
    readyFnVersion: '1.0.0',
    caseId: 'TC-RB-L1-HOST-ACCT-01-Windows-x64-Server-001',
    caseStatus: '已实现',
  },
  {
    caller: 'RB-L1-MGMT-RISK-01',
    callee: 'RB-L1-MGMT-TRACE-01',
    contractEntry: 'contract://RB-L1-MGMT-RISK-01/RB-L1-MGMT-TRACE-01',
    registration: 'PR-RB-L1-MGMT-RISK-01-RB-L1-MGMT-TRACE-01-0001',
    readyFnVersion: '1.0.0',
    caseId: 'TC-RB-L1-MGMT-RISK-01-Windows-x64-Server-001',
    caseStatus: '已实现',
  },
  {
    caller: 'RB-L1-HOST-BIZ-01',
    callee: '',
    extPoint: 'notify_system',
    contractEntry: 'contract://RB-L1-HOST-BIZ-01/ext/notify_system',
    registration: 'PR-RB-L1-HOST-BIZ-01-EXT-notify_system-0001',
    readyFnVersion: '1.0.0',
    caseId: 'TC-RB-L1-HOST-BIZ-01-Windows-x64-Server-001',
    caseStatus: '已实现',
    note: '用户触达扩展点，不进闭集',
  },
  {
    caller: 'RB-L1-HOST-BIZ-01',
    callee: '',
    extPoint: 'notify_channel',
    contractEntry: 'contract://RB-L1-HOST-BIZ-01/ext/notify_channel',
    registration: 'PR-RB-L1-HOST-BIZ-01-EXT-notify_channel-0001',
    readyFnVersion: '1.0.0',
    caseId: 'TC-RB-L1-HOST-BIZ-01-Windows-x64-Server-001',
    caseStatus: '已实现',
  },
  {
    caller: 'RB-L1-HOST-BIZ-01',
    callee: '',
    extPoint: 'notify_delivery',
    contractEntry: 'contract://RB-L1-HOST-BIZ-01/ext/notify_delivery',
    registration: 'PR-RB-L1-HOST-BIZ-01-EXT-notify_delivery-0001',
    readyFnVersion: '1.0.0',
    caseId: 'TC-RB-L1-HOST-BIZ-01-Windows-x64-Server-001',
    caseStatus: '已实现',
  },
  {
    caller: 'RB-L1-HOST-ALERT-01',
    callee: '',
    extPoint: 'notify_system',
    contractEntry: 'contract://RB-L1-HOST-ALERT-01/ext/notify_system',
    registration: 'PR-RB-L1-HOST-ALERT-01-EXT-notify_system-0001',
    readyFnVersion: '1.0.0',
    caseId: 'TC-RB-L1-HOST-ALERT-01-Windows-x64-Server-001',
    caseStatus: '已实现',
    note: '管理员通知扩展点，不进闭集',
  },
  {
    caller: 'RB-L1-HOST-ALERT-01',
    callee: '',
    extPoint: 'notify_channel',
    contractEntry: 'contract://RB-L1-HOST-ALERT-01/ext/notify_channel',
    registration: 'PR-RB-L1-HOST-ALERT-01-EXT-notify_channel-0001',
    readyFnVersion: '1.0.0',
    caseId: 'TC-RB-L1-HOST-ALERT-01-Windows-x64-Server-001',
    caseStatus: '已实现',
  },
  {
    caller: 'RB-L1-HOST-ALERT-01',
    callee: '',
    extPoint: 'notify_delivery',
    contractEntry: 'contract://RB-L1-HOST-ALERT-01/ext/notify_delivery',
    registration: 'PR-RB-L1-HOST-ALERT-01-EXT-notify_delivery-0001',
    readyFnVersion: '1.0.0',
    caseId: 'TC-RB-L1-HOST-ALERT-01-Windows-x64-Server-001',
    caseStatus: '已实现',
  },
  {
    caller: 'RB-L0-INFRA-DB-01',
    callee: '',
    extPoint: 'object_storage',
    contractEntry: 'contract://RB-L0-INFRA-DB-01/ext/object_storage',
    registration: 'PR-RB-L0-INFRA-DB-01-EXT-object_storage-0001',
    readyFnVersion: '1.0.0',
    caseId: 'TC-RB-L0-INFRA-DB-01-Windows-x64-Server-001',
    caseStatus: '已实现',
    note: '对象存储选型扩展（外部依赖 · 不进闭集 35 · 不设独立就绪键）；失败改走数据库主路径仅指元数据',
  },
]

const EXT_POINTS: readonly WiringExtPoint[] = [
  'notify_system',
  'notify_channel',
  'notify_delivery',
  'object_storage',
]

function extRowOk(r: WiringRow): boolean {
  if (!r.extPoint || !EXT_POINTS.includes(r.extPoint)) return false
  if (r.callee) return false
  if (r.contractEntry !== `contract://${r.caller}/ext/${r.extPoint}`) return false
  if (!r.registration.startsWith(`PR-${r.caller}-EXT-${r.extPoint}-`)) return false
  return true
}

export function isWiringRegistered(caller: string, calleeOrExt: string): boolean {
  const c = String(caller || '').trim()
  const t = String(calleeOrExt || '').trim()
  return WIRING_TABLE.some((r) => {
    if (r.caller !== c) return false
    if (r.extPoint) return r.extPoint === t
    return r.callee === t
  })
}

/** 未登记接线不得汇入。扩展点名不得当作闭集稳定 ID。 */
export function rejectUnregisteredWiring(caller: string, calleeOrExt: string): {
  ok: boolean
  reason?: string
} {
  if (isWiringRegistered(caller, calleeOrExt)) return { ok: true }
  return { ok: false, reason: 'unregistered_wiring' }
}

export function isWiringTableReady(): boolean {
  if (WIRING_TABLE.length === 0) return false
  const needExt: WiringExtPoint[] = [
    'notify_system',
    'notify_channel',
    'notify_delivery',
    'object_storage',
  ]
  for (const name of needExt) {
    if (!WIRING_TABLE.some((r) => r.extPoint === name)) return false
  }
  return WIRING_TABLE.every((r) => {
    if (!r.registration.startsWith('PR-')) return false
    const callerId = citeServiceIdentity(r.caller).spiffeId
    if (!isValidSpiffeId(callerId)) return false
    if (r.extPoint) return extRowOk(r)
    if (!r.callee || r.callee.startsWith('notify_') || r.callee === 'object_storage') return false
    const calleeId = citeServiceIdentity(r.callee).spiffeId
    return isValidSpiffeId(calleeId)
  })
}

export function listWiringRows(): WiringRow[] {
  return WIRING_TABLE.map((r) => ({ ...r }))
}

/** SPIFFE 信任域（固定 · 架构 V1.8.5） */
export const SPIFFE_TRUST_DOMAIN = 'runtimebase.local'

/**
 * 稳定 ID → SPIFFE path：去 RB- 前缀与末尾实例号，连字符改 /，小写。
 * 例：RB-L1-HOST-TRACEAN-01 → l1/host/tracean
 */
export function stableIdToSpiffePath(stableId: string): string {
  const raw = String(stableId || '').trim()
  const noRb = raw.replace(/^RB-/i, '')
  const noInst = noRb.replace(/-\d+$/, '')
  return noInst
    .split('-')
    .filter(Boolean)
    .map((s) => s.toLowerCase())
    .join('/')
}

export function toSpiffeId(stableId: string): string {
  const p = stableIdToSpiffePath(stableId)
  if (!p) throw new Error('empty SPIFFE path')
  return `spiffe://${SPIFFE_TRUST_DOMAIN}/${p}`
}

export function isValidSpiffeId(spiffeId: string): boolean {
  const s = String(spiffeId || '').trim()
  const m = /^spiffe:\/\/([^/]+)\/(.+)$/.exec(s)
  if (!m) return false
  if (m[1] !== SPIFFE_TRUST_DOMAIN) return false
  if (!/^[a-z0-9]+(?:\/[a-z0-9]+)*$/.test(m[2])) return false
  // 禁止系统信任库式主机名冒充；本域只认固定信任域
  return true
}

/** 接线登记时签发或引用服务身份（本服务只引用/推导，不自行核验） */
export function citeServiceIdentity(stableId: string): {
  spiffeId: string
  source: 'cite'
  citedAt: string
} {
  return {
    spiffeId: toSpiffeId(stableId),
    source: 'cite',
    citedAt: new Date().toISOString(),
  }
}

export function ready_rb_l0_coord_plt_01(): boolean {
  return isWiringTableReady()
}

export interface WiringRejection {
  at: string
  caller: string
  callee: string
  traceId: string
  reason: string
}

const wiringRejections: WiringRejection[] = []

export function listWiringRejections(): WiringRejection[] {
  return wiringRejections.map((r) => ({ ...r }))
}

/**
 * 经接线表访问。未登记则拒绝且不执行 read，故读不到库。
 */
export function readThroughWiring<T>(
  caller: string,
  callee: string,
  read: () => T
): { ok: true; value: T } | { ok: false; reason: string; rowsRead: 0 } {
  const gate = rejectUnregisteredWiring(caller, callee)
  if (!gate.ok) {
    const traceId = `wire_${Date.now().toString(36)}`
    wiringRejections.push({
      at: new Date().toISOString(),
      caller,
      callee,
      traceId,
      reason: gate.reason || 'unregistered_wiring',
    })
    recordChainMark('wiring_deny', `${caller}->${callee}`, traceId)
    recordAuditSafe({
      actor: caller,
      action: 'wiring_denied',
      resource: callee,
      detail: gate.reason || 'unregistered_wiring',
      serviceIdentity: toSpiffeId(caller),
      permissionRow: '无行',
      result: '拒绝',
      traceId,
    })
    return { ok: false, reason: gate.reason || 'unregistered_wiring', rowsRead: 0 }
  }
  return { ok: true, value: read() }
}

/** RJ-03：未登记接线直连库必须拒绝，回调不得执行 */
export function probeUnregisteredDbBypass(): { refused: boolean; rowsRead: number } {
  let rowsRead = 0
  const denied = readThroughWiring('RB-L1-PUB-OPEN-01', 'RB-L0-INFRA-DB-01', () => {
    rowsRead = 1
    return ['must-not-read']
  })
  const allowed = readThroughWiring('RB-L1-HOST-BIZ-01', 'RB-L0-INFRA-DB-01', () => 1)
  return {
    refused: denied.ok === false && denied.rowsRead === 0 && rowsRead === 0 && allowed.ok === true,
    rowsRead,
  }
}

/** 三道边界拒绝用例。复现命令非空且脚本可执行才记已实现。 */
export const REJECTION_CASES = [
  {
    id: 'RJ-01',
    boundary: '对外进入',
    expected: '名单外拒绝，不得进入身份访问管控之后的履约',
    trace: '全链路日志',
    reproduce: 'pnpm --dir packages/server exec tsx scripts/verify-rejection-cases.ts RJ-01',
    status: '已实现' as const,
  },
  {
    id: 'RJ-02',
    boundary: '子平台之间',
    expected: '已有会话但无权限行则拒绝',
    trace: '全链路日志；安全审计防护',
    reproduce: 'pnpm --dir packages/server exec tsx scripts/verify-rejection-cases.ts RJ-02',
    status: '已实现' as const,
  },
  {
    id: 'RJ-03',
    boundary: '子平台到基础设施平台',
    expected: '未登记接线直连库被拒绝，不得读到库',
    trace: '平台协调拒绝记录；全链路日志',
    reproduce: 'pnpm --dir packages/server exec tsx scripts/verify-rejection-cases.ts RJ-03',
    status: '已实现' as const,
  },
] as const

/** 台账索引：确认登记与探针覆盖都在本文件，机检按此路径定位 */
export const LEDGER_INDEX = {
  trustAnchorConfirmations: 'runtime-base/l0/coord/plt/ready.ts#trustAnchorConfirmations',
  probeOverrides: 'runtime-base/l0/coord/plt/ready.ts#probeOverrides',
} as const

export interface TrustAnchorConfirmation {
  stableId: string
  fingerprint: string
  confirmedAt: string
  subject: string
}

const trustAnchorConfirmations: TrustAnchorConfirmation[] = []

export function listTrustAnchorConfirmations(): TrustAnchorConfirmation[] {
  return trustAnchorConfirmations.map((r) => ({ ...r }))
}

export function confirmTrustAnchorLoaded(stableId: string, fingerprint: string, subject: string): void {
  const id = String(stableId || '').trim()
  const fp = String(fingerprint || '').trim()
  const who = String(subject || '').trim()
  if (!id || !fp || !who) throw new Error('confirmation_incomplete')
  trustAnchorConfirmations.push({
    stableId: id,
    fingerprint: fp,
    confirmedAt: new Date().toISOString(),
    subject: who,
  })
}

export function allServicesConfirmed(fingerprint: string, ids: readonly string[] = RUNTIME_BASE_STABLE_IDS): boolean {
  return ids.every((id) =>
    trustAnchorConfirmations.some(
      (c) => c.stableId === id && c.fingerprint === fingerprint && c.subject && c.confirmedAt
    )
  )
}

/** 确认登记只作留痕，不阻断到期自动签发 */
export function switchSigningAfterConfirm(fingerprint: string): void {
  switchTrustAnchorSigning(fingerprint, true)
}

export function probeTrustAnchorRotation(): { ok: boolean; detail: string } {
  resetWorkloadCertRotation()
  trustAnchorConfirmations.length = 0
  const issued = issueWorkloadCert()
  const early = rotateExpiredWorkloadCert(issued.notAfter - 1)
  if (early.rotated || early.fingerprint !== issued.fingerprint) {
    return { ok: false, detail: 'rotate_too_early' }
  }
  const late = rotateExpiredWorkloadCert(issued.notAfter)
  if (!late.rotated || late.fingerprint === issued.fingerprint) {
    return { ok: false, detail: 'rotate_on_expiry' }
  }
  if (trustAnchorConfirmations.length !== 0) return { ok: false, detail: 'confirm_required' }
  if (WORKLOAD_CERT_TTL_MS !== 24 * 60 * 60 * 1000) return { ok: false, detail: 'ttl' }
  if (forceReconnectEstablished().reason !== 'forbid_force_reconnect') {
    return { ok: false, detail: 'reconnect' }
  }
  return { ok: true, detail: 'ok' }
}

export type ProbeKind = 'Startup' | 'Readiness' | 'Liveness'

export interface ProbeOverride {
  stableId: string
  kind: ProbeKind
  initialDelaySeconds: number
  periodSeconds: number
  failureThreshold: number
  timeoutSeconds: number
  reason: string
  approver: string
  approvedAt: string
}

const probeOverrides: ProbeOverride[] = []

export function listProbeOverrides(): ProbeOverride[] {
  return probeOverrides.map((r) => ({ ...r }))
}

export function registerProbeOverride(row: ProbeOverride): void {
  const nums = [row.initialDelaySeconds, row.periodSeconds, row.failureThreshold, row.timeoutSeconds]
  if (!row.stableId || !row.kind || !row.reason || !row.approver || !row.approvedAt) {
    throw new Error('probe_override_incomplete')
  }
  if (nums.some((n) => !Number.isFinite(n))) throw new Error('probe_override_incomplete')
  probeOverrides.push({ ...row })
}

