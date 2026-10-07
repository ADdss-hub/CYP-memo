/**
 * 组件协调：闭集聚合与探针默认；领域事件订阅与启动发布接线同文件。
 */
import fs from 'fs'
import path from 'path'
import {
  RUNTIME_BASE_STABLE_IDS,
  RUNTIME_BASE_DISPLAY_NAMES,
  type RuntimeBaseStableId,
} from '../plt/ready.js'
import { isConfigRevisionReady } from '../../../l1/mgmt/conf/ready.js'
import { isRiskDispositionReady } from '../../../l1/mgmt/risk/ready.js'
import { isRiskPolicyBound } from '../../../l1/host/rule/ready.js'
import { isAlertDispositionReady, wireAlertSubscriptions } from '../../../l1/host/alert/ready.js'
import { isPerfReady } from '../../../l1/mgmt/perf/ready.js'
import { getAutomationIntelligenceState } from '../../../automation-matrix.js'
import { isIdempotencyReady, setCanaryPercent } from '../../../l1/mgmt/fesec/ready.js'
import { isWiringTableReady, isWiringRegistered, rejectUnregisteredWiring, listProbeOverrides, isSupportMatrixReady } from '../plt/ready.js'
import {
  isBusinessRouteRegistryReady,
  getBusinessRouteCount,
  wireGatewaySubscriptions,
  restoreMemoDeleteSnapshot,
} from '../../../l1/host/biz/ready.js'
import { ready_rb_l0_infra_cfg_01 } from '../../infra/cfg/ready.js'
import { ready_rb_l0_infra_init_01 } from '../../infra/init/ready.js'
import { ready_rb_l0_infra_log_01 } from '../../infra/log/ready.js'
import { ready_rb_l0_infra_cache_01, getSystemCache } from '../../infra/cache/ready.js'
import { ready_rb_l0_infra_mq_01 } from '../../infra/mq/ready.js'
import { ready_rb_l0_infra_db_01 } from '../../infra/db/ready.js'
import { ready_rb_l0_coord_plt_01 } from '../plt/ready.js'
import { ready_rb_l1_mgmt_conf_01 } from '../../../l1/mgmt/conf/ready.js'
import { ready_rb_l1_mgmt_risk_01 } from '../../../l1/mgmt/risk/ready.js'
import { ready_rb_l1_mgmt_trace_01 } from '../../../l1/mgmt/trace/ready.js'
import { ready_rb_l1_mgmt_boot_01 } from '../../../l1/mgmt/boot/ready.js'
import { ready_rb_l1_mgmt_code_01 } from '../../../l1/mgmt/code/ready.js'
import { ready_rb_l1_mgmt_fesec_01 } from '../../../l1/mgmt/fesec/ready.js'
import { ready_rb_l1_mgmt_iam_01 } from '../../../l1/mgmt/iam/ready.js'
import { ready_rb_l1_mgmt_rbac_01 } from '../../../l1/mgmt/rbac/ready.js'
import { ready_rb_l1_mgmt_kms_01 } from '../../../l1/mgmt/kms/ready.js'
import { ready_rb_l1_mgmt_perf_01 } from '../../../l1/mgmt/perf/ready.js'
import { ready_rb_l1_host_telem_01 } from '../../../l1/host/telem/ready.js'
import { ready_rb_l1_host_rule_01 } from '../../../l1/host/rule/ready.js'
import { ready_rb_l1_host_sched_01 } from '../../../l1/host/sched/ready.js'
import { registerSagaCompensation, registerJobHandler, registerCron } from '../../../l1/host/sched/ready.js'
import { ready_rb_l1_host_acct_01 } from '../../../l1/host/acct/ready.js'
import { ready_rb_l1_host_rel_01 } from '../../../l1/host/rel/ready.js'
import { getReleaseState } from '../../../l1/host/rel/ready.js'
import { ready_rb_l1_host_biz_01 } from '../../../l1/host/biz/ready.js'
import { ready_rb_l1_host_alert_01 } from '../../../l1/host/alert/ready.js'
import { ready_rb_l1_host_tracean_01 } from '../../../l1/host/tracean/ready.js'
import { ready_rb_l1_host_audit_01 } from '../../../l1/host/audit/ready.js'
import { ready_rb_l1_host_resil_01 } from '../../../l1/host/resil/ready.js'
import { wireElasticitySubscriptions, initElasticity } from '../../../l1/host/resil/ready.js'
import { ready_rb_l1_col_svc_01 } from '../../../l1/col/svc/ready.js'
import { ready_rb_l1_col_evt_01 } from '../../../l1/col/evt/ready.js'
import {
  markDomainEventBusReady,
  publishDomainEvent,
  setArtifactVersionProvider,
  startDomainEventDrain,
  wireDefaultObservabilitySubscribers,
  initEventCollab,
  publishProductEventStubOnce,
  subscribeDomainEvent,
} from '../../../l1/col/evt/ready.js'
import { ready_rb_l1_col_ctr_01 } from '../../../l1/col/ctr/ready.js'
import { ready_rb_l1_col_ten_01 } from '../../../l1/col/ten/ready.js'
import { ready_rb_l1_col_data_01 } from '../../../l1/col/data/ready.js'
import { ready_rb_l1_pub_acc_01 } from '../../../l1/pub/acc/ready.js'
import { ready_rb_l1_pub_open_01 } from '../../../l1/pub/open/ready.js'
import { wireNotifySubscriptions, initNotify } from '../../../../notify-service.js'

export const PROBE_DEFAULTS = {
  Startup: { initialDelaySeconds: 0, periodSeconds: 5, failureThreshold: 30, timeoutSeconds: 2 },
  Readiness: { initialDelaySeconds: 0, periodSeconds: 10, failureThreshold: 3, timeoutSeconds: 1 },
  Liveness: { initialDelaySeconds: 0, periodSeconds: 10, failureThreshold: 6, timeoutSeconds: 1 },
} as const

export type ProbeKindName = keyof typeof PROBE_DEFAULTS

/** 先查覆盖登记；四项与审批齐全才覆盖，否则用默认值 */
export function effectiveProbeParams(kind: ProbeKindName, stableId?: string): {
  initialDelaySeconds: number
  periodSeconds: number
  failureThreshold: number
  timeoutSeconds: number
} {
  const row = listProbeOverrides().find((r) => r.kind === kind && (!stableId || r.stableId === stableId))
  if (
    row &&
    row.approver &&
    row.approvedAt &&
    [row.initialDelaySeconds, row.periodSeconds, row.failureThreshold, row.timeoutSeconds].every((n) =>
      Number.isFinite(n)
    )
  ) {
    return {
      initialDelaySeconds: row.initialDelaySeconds,
      periodSeconds: row.periodSeconds,
      failureThreshold: row.failureThreshold,
      timeoutSeconds: row.timeoutSeconds,
    }
  }
  return PROBE_DEFAULTS[kind]
}

export function ready_rb_l0_coord_cmp_01(): boolean {
  return (
    ready_rb_l0_infra_cfg_01() &&
    ready_rb_l0_infra_cache_01() &&
    ready_rb_l0_infra_mq_01() &&
    ready_rb_l0_infra_db_01() &&
    ready_rb_l0_infra_log_01() &&
    PROBE_DEFAULTS.Liveness.failureThreshold > PROBE_DEFAULTS.Readiness.failureThreshold
  )
}

export type ReadyProbeFn = () => boolean

const READY_FNS: Record<RuntimeBaseStableId, ReadyProbeFn> = {
  'RB-L0-COORD-CMP-01': ready_rb_l0_coord_cmp_01,
  'RB-L0-INFRA-CFG-01': ready_rb_l0_infra_cfg_01,
  'RB-L0-INFRA-INIT-01': ready_rb_l0_infra_init_01,
  'RB-L0-INFRA-LOG-01': ready_rb_l0_infra_log_01,
  'RB-L0-INFRA-CACHE-01': ready_rb_l0_infra_cache_01,
  'RB-L0-INFRA-MQ-01': ready_rb_l0_infra_mq_01,
  'RB-L0-INFRA-DB-01': ready_rb_l0_infra_db_01,
  'RB-L0-COORD-PLT-01': ready_rb_l0_coord_plt_01,
  'RB-L1-MGMT-CONF-01': ready_rb_l1_mgmt_conf_01,
  'RB-L1-MGMT-RISK-01': ready_rb_l1_mgmt_risk_01,
  'RB-L1-MGMT-TRACE-01': ready_rb_l1_mgmt_trace_01,
  'RB-L1-MGMT-BOOT-01': ready_rb_l1_mgmt_boot_01,
  'RB-L1-MGMT-CODE-01': ready_rb_l1_mgmt_code_01,
  'RB-L1-MGMT-FESEC-01': ready_rb_l1_mgmt_fesec_01,
  'RB-L1-MGMT-IAM-01': ready_rb_l1_mgmt_iam_01,
  'RB-L1-MGMT-RBAC-01': ready_rb_l1_mgmt_rbac_01,
  'RB-L1-MGMT-KMS-01': ready_rb_l1_mgmt_kms_01,
  'RB-L1-MGMT-PERF-01': ready_rb_l1_mgmt_perf_01,
  'RB-L1-HOST-TELEM-01': ready_rb_l1_host_telem_01,
  'RB-L1-HOST-RULE-01': ready_rb_l1_host_rule_01,
  'RB-L1-HOST-SCHED-01': ready_rb_l1_host_sched_01,
  'RB-L1-HOST-ACCT-01': ready_rb_l1_host_acct_01,
  'RB-L1-HOST-REL-01': ready_rb_l1_host_rel_01,
  'RB-L1-HOST-BIZ-01': ready_rb_l1_host_biz_01,
  'RB-L1-HOST-ALERT-01': ready_rb_l1_host_alert_01,
  'RB-L1-HOST-TRACEAN-01': ready_rb_l1_host_tracean_01,
  'RB-L1-HOST-AUDIT-01': ready_rb_l1_host_audit_01,
  'RB-L1-HOST-RESIL-01': ready_rb_l1_host_resil_01,
  'RB-L1-COL-SVC-01': ready_rb_l1_col_svc_01,
  'RB-L1-COL-EVT-01': ready_rb_l1_col_evt_01,
  'RB-L1-COL-CTR-01': ready_rb_l1_col_ctr_01,
  'RB-L1-COL-TEN-01': ready_rb_l1_col_ten_01,
  'RB-L1-COL-DATA-01': ready_rb_l1_col_data_01,
  'RB-L1-PUB-ACC-01': ready_rb_l1_pub_acc_01,
  'RB-L1-PUB-OPEN-01': ready_rb_l1_pub_open_01,
}

export type RuntimeBaseProjection = {
  items: Record<RuntimeBaseStableId, boolean>
  displayNames: typeof RUNTIME_BASE_DISPLAY_NAMES
  layers: {
    L0: Record<string, boolean>
    L1: Record<string, boolean>
  }
  routesRegistered: boolean
  routeCount: number
  completeForm: boolean
  ia85: {
    capabilityId: 'IA85'
    hostStableId: 'RB-L1-MGMT-PERF-01'
    registered: boolean
  }
  automation: ReturnType<typeof getAutomationIntelligenceState>
  forbiddenKeysAbsent: boolean
}

export function buildRuntimeBaseProjection(opts: {
  bootstrapReady: boolean
}): RuntimeBaseProjection {
  const items = {} as Record<RuntimeBaseStableId, boolean>
  for (const id of RUNTIME_BASE_STABLE_IDS) {
    items[id] = Boolean(READY_FNS[id]())
  }

  const L0: Record<string, boolean> = {}
  const L1: Record<string, boolean> = {}
  for (const id of RUNTIME_BASE_STABLE_IDS) {
    if (id.startsWith('RB-L0-')) L0[id] = items[id]
    else L1[id] = items[id]
  }

  const allReady = RUNTIME_BASE_STABLE_IDS.every((id) => items[id] === true)
  /** 完整形态投影（completeForm，不等于完成标准）：闭集就绪布尔 + 配置修订/风险/告警/性能/幂等/接线。不等于 NR-05（必建+完整+完善 / 5.7）。 */
  const completeForm = Boolean(
    allReady &&
      opts.bootstrapReady &&
      isConfigRevisionReady() &&
      isRiskPolicyBound() &&
      isAlertDispositionReady() &&
      isRiskDispositionReady() &&
      isPerfReady() &&
      isIdempotencyReady() &&
      isWiringTableReady() &&
      isSupportMatrixReady()
  )

  return {
    items,
    displayNames: RUNTIME_BASE_DISPLAY_NAMES,
    layers: { L0, L1 },
    routesRegistered: isBusinessRouteRegistryReady(),
    routeCount: getBusinessRouteCount(),
    completeForm,
    ia85: {
      capabilityId: 'IA85',
      hostStableId: 'RB-L1-MGMT-PERF-01',
      registered: items['RB-L1-MGMT-PERF-01'] === true,
    },
    automation: getAutomationIntelligenceState(),
    forbiddenKeysAbsent: true,
  }
}

let wired = false

export function wireRuntimeModules(opts: { dataDir: string; port?: number }): void {
  if (wired) return
  wired = true

  setArtifactVersionProvider(() => getReleaseState().activeVersion || '0.0.0')
  initElasticity({ dataDir: opts.dataDir })
  initEventCollab({ dataDir: opts.dataDir })

  // 通知三键与对象存储只经已登记扩展点；未登记不得汇入
  const notifyOk =
    isWiringRegistered('RB-L1-HOST-BIZ-01', 'notify_system') &&
    isWiringRegistered('RB-L1-HOST-ALERT-01', 'notify_system') &&
    rejectUnregisteredWiring('RB-L1-HOST-BIZ-01', 'notify_ghost').ok === false
  if (notifyOk) {
    initNotify({ dataDir: opts.dataDir })
    wireNotifySubscriptions()
  }


  // 专属订阅先于默认可观测：默认可观测只补 catalog 缺口，避免无 handler 堵 drain
  wireAlertSubscriptions()
  wireElasticitySubscriptions()
  wireGatewaySubscriptions()
  wireDefaultObservabilitySubscribers()

  subscribeDomainEvent('CacheNamespaceBumped', async ev => {
    const toPrefix = String(ev.payload.toPrefix || ev.payload.newPrefix || '')
    const fromPrefix = String(ev.payload.fromPrefix || ev.payload.oldPrefix || '')
    const cache = getSystemCache()
    if (fromPrefix) cache.invalidatePrefix(fromPrefix)
    if (toPrefix) cache.setKeyPrefix(toPrefix)
  })

  subscribeDomainEvent('CanaryWeightChanged', async ev => {
    setCanaryPercent(Number(ev.payload.weight ?? 0))
  })
  subscribeDomainEvent('ReleaseCanaryWeightChanged', async ev => {
    setCanaryPercent(Number(ev.payload.canaryWeight ?? 0))
  })

  // memo.delete 补偿：快照逆序恢复（禁止空桩）
  registerSagaCompensation('memo.delete', 'revoke_share', async (ctx) => {
    restoreMemoDeleteSnapshot(ctx)
  })
  registerSagaCompensation('memo.delete', 'remove_blob', async (ctx) => {
    restoreMemoDeleteSnapshot(ctx)
  })
  registerSagaCompensation('memo.delete', 'delete_row', async (ctx) => {
    restoreMemoDeleteSnapshot(ctx)
  })

  // Archive cron (④ lifecycle)
  registerJobHandler('sys.archive_warm', async () => {
    const year = new Date().toISOString().slice(0, 4)
    const archiveDir = path.join(opts.dataDir, 'archive', year)
    if (!fs.existsSync(archiveDir)) fs.mkdirSync(archiveDir, { recursive: true })
    const manifest = path.join(archiveDir, 'manifest.jsonl')
    const cutoff = Date.now() - 365 * 24 * 60 * 60 * 1000
    const { database: db } = await import('../../infra/db/ready.js')
    let archived = 0
    for (const user of db.getUsers()) {
      const memos = db.getMemosByUserId(user.id) || []
      for (const memo of memos) {
        const updated = new Date(String(memo.updatedAt || memo.createdAt || 0)).getTime()
        if (!Number.isFinite(updated) || updated > cutoff) continue
        if (memo.deletedAt) continue
        const row = {
          at: new Date().toISOString(),
          tier: 'warm',
          entityType: 'memo',
          entityId: memo.id,
          userId: user.id,
        }
        fs.appendFileSync(manifest, `${JSON.stringify(row)}\n`, 'utf-8')
        archived += 1
        if (archived >= 50) break
      }
      if (archived >= 50) break
    }
    publishDomainEvent('EntityArchived', 4, {
      entityType: 'memo',
      entityId: archived ? 'batch' : 'none',
      tier: 'warm',
      count: archived,
      coldUri: manifest,
    })
  })
  try {
    registerCron('sys.archive_warm', 'every:3600s', 'sys.archive_warm')
  } catch {
    /* already registered */
  }

  markDomainEventBusReady()
  startDomainEventDrain(2000)
  publishProductEventStubOnce()

  // Boot publishes (①)
  publishDomainEvent(
    'ConfigSnapshotPublished',
    1,
    { configVersion: getReleaseState().activeVersion || 'boot', hash: 'boot' },
    'info'
  )
  publishDomainEvent(
    'MigrationApplied',
    1,
    { scriptId: 'bootstrap', dataVersion: getReleaseState().activeVersion || 'boot' },
    'info'
  )
  publishDomainEvent(
    'ServiceRegistered',
    1,
    { instanceId: `local-${process.pid}`, port: opts.port || 5170 },
    'info'
  )
}

export function resetRuntimeModulesWiring(): void {
  wired = false
}
