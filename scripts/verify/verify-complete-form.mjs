/**
 * 完整形态静态门禁（闭集 35 锚点 + 开发设计约束 2 + 配置·缓存·告警闭环）
 * 实机：verify-config-complete-form.ps1 + verify-runtime-base-cutin.ps1 + 告警指派/关闭探针
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8')
const exists = (rel) => fs.existsSync(path.join(root, rel))

const fails = []

/** 5.7 二十八项 → 实现锚点文件（缺一即未完成） */
const ANCHORS = {
  配置组件: 'packages/server/src/runtime-base/l0/infra/cfg/ready.ts',
  初始化组件: 'packages/server/src/runtime-base/l0/infra/init/ready.ts',
  日志组件: 'packages/server/src/runtime-base/l0/infra/log/ready.ts',
  缓存组件: 'packages/server/src/runtime-base/l0/infra/cache/ready.ts',
  消息队列组件: 'packages/server/src/runtime-base/l0/infra/mq/ready.ts',
  数据库: 'packages/server/src/runtime-base/l0/infra/db/ready.ts',
  组件协调: 'packages/server/src/runtime-base/l0/coord/cmp/ready.ts',
  平台协调: 'packages/server/src/runtime-base/l0/coord/plt/ready.ts',
  配置管控: 'packages/server/src/runtime-base/l1/mgmt/conf/ready.ts',
  风险运行管控: 'packages/server/src/runtime-base/l1/mgmt/risk/ready.ts',
  全链路日志: 'packages/server/src/runtime-base/l1/mgmt/trace/ready.ts',
  启动依赖管控: 'packages/server/src/runtime-base/l1/mgmt/boot/ready.ts',
  码值标准化: 'packages/server/src/runtime-base/l1/mgmt/code/ready.ts',
  前端安全防护: 'packages/server/src/runtime-base/l1/mgmt/fesec/ready.ts',
  身份访问管控: 'packages/server/src/runtime-base/l1/mgmt/iam/ready.ts',
  密钥保险箱: 'packages/server/src/runtime-base/l1/mgmt/kms/ready.ts',
  性能运行管控: 'packages/server/src/runtime-base/l1/mgmt/perf/ready.ts',
  态势采集监测: 'packages/server/src/runtime-base/l1/host/telem/ready.ts',
  规则校验研判: 'packages/server/src/runtime-base/l1/host/rule/ready.ts',
  流程调度编排: 'packages/server/src/runtime-base/l1/host/sched/ready.ts',
  数据处理核算: 'packages/server/src/runtime-base/l1/host/acct/ready.ts',
  版本变更发布: 'packages/server/src/runtime-base/l1/host/rel/ready.ts',
  业务协同对接: 'packages/server/src/runtime-base/l1/host/biz/ready.ts',
  风险告警处置: 'packages/server/src/runtime-base/l1/host/alert/ready.ts',
  溯源检索分析: 'packages/server/src/runtime-base/l1/host/tracean/ready.ts',
  安全审计防护: 'packages/server/src/runtime-base/l1/host/audit/ready.ts',
  系统韧性保障: 'packages/server/src/runtime-base/l1/host/resil/ready.ts',
  RBAC权限矩阵: 'packages/server/src/runtime-base/l1/mgmt/rbac/ready.ts',
  生产Mock约束: 'packages/server/src/bootstrap.ts',
  一键部署启动: 'packages/server/src/bootstrap.ts',
  服务协作管控: 'packages/server/src/runtime-base/l1/col/svc/ready.ts',
  事件协作管控: 'packages/server/src/runtime-base/l1/col/evt/ready.ts',
  契约治理管控: 'packages/server/src/runtime-base/l1/col/ctr/ready.ts',
  租户协作服务: 'packages/server/src/runtime-base/l1/col/ten/ready.ts',
  数据协作服务: 'packages/server/src/runtime-base/l1/col/data/ready.ts',
  公开接入安全: 'packages/server/src/runtime-base/l1/pub/acc/ready.ts',
  开放协作管控: 'packages/server/src/runtime-base/l1/pub/open/ready.ts',
}

for (const [name, rel] of Object.entries(ANCHORS)) {
  if (!exists(rel)) fails.push(`5.7 anchor missing ${name}: ${rel}`)
}

const plt = read('packages/server/src/runtime-base/l0/coord/plt/ready.ts')
for (const need of ['SUPPORT_MATRIX', 'isSupportMatrixReady', 'RUNTIME_BASE_STABLE_IDS']) {
  if (!plt.includes(need)) fails.push(`support matrix missing: ${need}`)
}
if (!plt.includes("const SUPPORT_PLATFORMS = ['Server', 'Desktop']")) {
  fails.push('support matrix missing Desktop default set')
}

/** 必建通知面（挂业务协同对接，≠ 告警；不进闭集） */
for (const rel of ['packages/server/src/notify-service.ts', 'packages/server/src/runtime-base/l1/mgmt/fesec/ready.ts']) {
  if (!exists(rel)) fails.push(`missing ${rel}`)
}

const rev = read('packages/server/src/runtime-base/l1/mgmt/conf/ready.ts')
for (const need of [
  "action: 'hot'",
  'rollback',
  'revisions.json',
  'infoSamplePercent',
  'retentionDays',
  'riskThresholds',
  'perfSla',
  'isConfigRevisionReady',
]) {
  if (!rev.includes(need) && !rev.includes(need.replace(/'/g, '"'))) {
    fails.push(`config-revision missing: ${need}`)
  }
}

const logc = read('packages/server/src/runtime-base/l0/infra/log/ready.ts')
for (const need of [
  'setLogInfoSamplePercent',
  'setLogRetentionDays',
  'infoSamplePercent',
  'DEFAULT_RETENTION_DAYS',
]) {
  if (!logc.includes(need)) fails.push(`log-service missing: ${need}`)
}

const idem = read('packages/server/src/runtime-base/l1/mgmt/fesec/ready.ts')
if (!idem.includes('getSystemCache')) fails.push('idempotency not on system cache')
if (/const cache = new Map/.test(idem)) fails.push('parallel response cache Map')

const alert = read('packages/server/src/runtime-base/l1/host/alert/ready.ts')
for (const need of [
  'assignAlertTicket',
  'closeAlertTicket',
  'autoDispatchToAutomation',
  'reconcileOpenTicketsToAutomation',
  'isAlertDispositionReady',
  'tickets.json',
  'alert_ticket_assign',
  'alert_ticket_close',
  'alert_ticket_auto_dispatch',
  'automation:perf',
  'recordRiskDisposition',
]) {
  if (!alert.includes(need)) fails.push(`alert disposition missing: ${need}`)
}

const riskTel = read('packages/server/src/runtime-base/l1/mgmt/risk/ready.ts')
for (const need of [
  'recordRiskDisposition',
  'isRiskDispositionReady',
  'dispositions.jsonl',
  'listRecentRiskDispositions',
]) {
  if (!riskTel.includes(need)) fails.push(`risk disposition missing: ${need}`)
}
const ruleTel = read('packages/server/src/runtime-base/l1/host/rule/ready.ts')
for (const need of ['setRiskThresholds', 'isRiskPolicyBound', 'getRiskThresholds']) {
  if (!ruleTel.includes(need)) fails.push(`rule judge missing: ${need}`)
}

const pipe = read('packages/server/src/runtime-base/l1/host/acct/ready.ts')
if (!pipe.includes('replaySyncLog') && !pipe.includes('replayDataPipelineSyncLog')) {
  fails.push('pipeline missing replay')
}
if (!pipe.includes('replayedAt')) fails.push('pipeline replay missing replayedAt')

const perf = read('packages/server/src/runtime-base/l1/mgmt/perf/ready.ts')
for (const need of ['capturePerfBaseline', 'setPerfSla', 'slaOk', 'breachCount', 'baseline.json', 'sla.json', 'shouldDeferScheduleForPerf', 'HIGH_STANDARD_SLA', 'PerfSlaRecovered', 'loopPhase', 'autoSense', 'autoRegulate', 'autoRelease', 'runPerfAutomation', 'evaluatePerfPressure']) {
  if (!perf.includes(need)) fails.push(`perf missing: ${need}`)
}

const elast = read('packages/server/src/runtime-base/l1/host/resil/ready.ts')
if (!elast.includes('revertElasticity')) fails.push('elasticity missing revertElasticity')

const sched = read('packages/server/src/runtime-base/l1/host/sched/ready.ts')
if (!sched.includes('shouldDeferScheduleForPerf') || !sched.includes("'deferred'")) {
  fails.push('schedule missing perf defer gate')
}

const rel = read('packages/server/src/runtime-base/l1/host/rel/ready.ts')
if (!rel.includes('export function rollback')) fails.push('release missing rollback')

const notify = read('packages/server/src/notify-service.ts')
for (const need of ['getNotifyState', 'NOTIFY_CHANNELS', 'requestUserNotify']) {
  if (!notify.includes(need)) fails.push(`notify missing: ${need}`)
}

const catalog = read('packages/server/src/runtime-base/l1/col/evt/ready.ts')
for (const ev of ['AlertAssigned', 'AlertClosed', 'AlertDispatched']) {
  if (!catalog.includes(ev)) fails.push(`domain catalog missing: ${ev}`)
}

const index = read('packages/server/src/index.ts')
for (const need of [
  '/api/config/hot',
  '/api/config/rollback',
  '/api/alerts',
  '/api/notify/status',
  '/api/risk/dispositions',
  '/api/pipeline/replay',
  '/api/perf/baseline',
  '/api/perf/sla',
  '/api/elasticity/revert',
  '/api/release/rollback',
  '/api/logs/by-code/:code',
  'consumeApiBudget',
]) {
  if (!index.includes(need)) fails.push(`route missing: ${need}`)
}
if (index.includes('/api/alerts/:id/assign') || index.includes('/api/alerts/:id/close')) {
  fails.push('ops must not expose manual alert assign/close routes')
}
if (/clientErrorBuckets/.test(index)) fails.push('parallel client-error rate limit Map')
if (!index.includes("action: 'auth_login'") && !index.includes('auth_login')) {
  fails.push('login missing independent audit')
}
for (const need of ['config_hot', 'config_rollback', 'kill_switch_on', 'auth_login_failed']) {
  if (!index.includes(need)) fails.push(`sensitive audit missing: ${need}`)
}
const audit = read('packages/server/src/runtime-base/l1/host/audit/ready.ts')
if (!audit.includes('recordAuditSafe')) fails.push('audit missing recordAuditSafe')
const rbacDeny = read('packages/server/src/runtime-base/l1/mgmt/rbac/ready.ts')
if (!rbacDeny.includes('permission_denied')) fails.push('rbac deny missing audit')


const bootGate = read('packages/server/src/runtime-base/l1/mgmt/boot/ready.ts')
for (const need of [
  'registerBootProbe',
  'markBootProbe',
  'isBootDependencyGateOpen',
  'ready_rb_l1_mgmt_boot_01',
]) {
  if (!bootGate.includes(need)) fails.push(`boot gate missing: ${need}`)
}

const boot = read('packages/server/src/runtime-base/l0/coord/cmp/ready.ts')
const conf = read('packages/server/src/runtime-base/l1/mgmt/conf/ready.ts')
const alertGate = read('packages/server/src/runtime-base/l1/host/alert/ready.ts')
const riskGate = read('packages/server/src/runtime-base/l1/mgmt/risk/ready.ts')
const ruleGate = read('packages/server/src/runtime-base/l1/host/rule/ready.ts')
if (!boot.includes('completeForm') || !conf.includes('isConfigRevisionReady')) {
  fails.push('ready missing completeForm / revision gate')
}
if (!alertGate.includes('isAlertDispositionReady')) {
  fails.push('ready missing alert disposition gate')
}
if (!riskGate.includes('isRiskDispositionReady')) {
  fails.push('ready missing risk disposition gate')
}
if (!ruleGate.includes('isRiskPolicyBound')) {
  fails.push('ready missing risk policy gate')
}

const reg = read('packages/server/src/runtime-base/l1/host/biz/ready.ts')
for (const need of [
  '/api/config/hot',
  '/api/config/rollback',
  '/api/alerts',
  '/api/alerts/test',
]) {
  if (!reg.includes(need)) fails.push(`registry missing: ${need}`)
}
if (reg.includes('/api/alerts/:id/assign') || reg.includes('/api/alerts/:id/close')) {
  fails.push('registry must not list manual alert assign/close')
}

// 禁止防重再引入平行响应缓存
const serverSrc = path.join(root, 'packages/server/src')
const walk = (dir) => {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name)
    const st = fs.statSync(p)
    if (st.isDirectory()) walk(p)
    else if (name.endsWith('.ts') && name.includes('idempotency')) {
      const t = fs.readFileSync(p, 'utf8')
      if (/const cache = new Map/.test(t)) fails.push(`parallel cache in ${name}`)
    }
  }
}
walk(serverSrc)

if (!exists('docs/runtime-base/automation-matrix.json') || !exists('docs/runtime-base/AUTOMATION_INTELLIGENCE.md')) {
  fails.push('missing automation intelligence SSOT')
}
const cmpAuto = read('packages/server/src/runtime-base/l0/coord/cmp/ready.ts')
if (!cmpAuto.includes('getAutomationIntelligenceState')) {
  fails.push('runtime projection missing automation matrix')
}
if (!index.includes('/api/automation/status')) {
  fails.push('route missing: /api/automation/status')
}
const autoMod = read('packages/server/src/runtime-base/automation-matrix.ts')
for (const need of ['AUTOMATION_A3_IDS', 'opsObservesOnly', '系统处置单', 'getAutomationIntelligenceState']) {
  if (!autoMod.includes(need)) fails.push(`automation-matrix missing: ${need}`)
}
if (fails.length) {
  console.error('FAIL_COMPLETE_FORM')
  for (const f of fails) console.error(f)
  process.exit(1)
}
console.log('PASS_COMPLETE_FORM')
console.log(`anchors=${Object.keys(ANCHORS).length}`)
