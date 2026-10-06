/**
 * 运行底座完成判定唯一机检（架构 V1.8.6 NR-05 本仓执行面）
 * SSOT：docs/runtime-base/COMPLETION_STANDARD.md
 * 实机：若本机 ready 探针可连，再核对 items 键集。
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const fails = []
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8')
const exists = (rel) => fs.existsSync(path.join(root, rel))

const idsSrc = read('packages/server/src/runtime-base/l0/coord/plt/ready.ts')
const ids = [...idsSrc.matchAll(/'(RB-L[01]-[A-Z0-9-]+)'/g)].map((m) => m[1])
const uniqueIds = [...new Set(ids)]
if (uniqueIds.length !== 35) fails.push(`stable id count ${uniqueIds.length} != 35`)

const anchorRe = /'(RB-L[01]-[A-Z0-9-]+)': '(runtime-base\/[^']+)'/g
const anchors = [...idsSrc.matchAll(anchorRe)]
if (anchors.length !== 35) fails.push(`anchor rows ${anchors.length} != 35`)
const cardDir = path.join(root, 'docs/runtime-base/component-cards')
const cardFiles = fs.existsSync(cardDir)
  ? fs.readdirSync(cardDir).filter((n) => /^RB-L[01]-.*\.md$/.test(n))
  : []
if (cardFiles.length !== 35) fails.push(`component cards ${cardFiles.length} != 35`)
for (const name of cardFiles) {
  const text = fs.readFileSync(path.join(cardDir, name), 'utf8')
  for (const need of ['不解决：', '行业九类分层', 'API：', '上游：', '## 二、自检']) {
    if (!text.includes(need)) fails.push(`${name} missing ${need}`)
  }
  if (/完成态|业务模块|十二中心|质量门禁子平台/.test(text)) fails.push(`${name} banned term`)
}
const dirs = new Set()
const files = new Set()
for (const [, id, rel] of anchors) {
  const full = `packages/server/src/${rel}`
  if (!exists(full)) fails.push(`anchor missing ${id}: ${full}`)
  if (!read(full).includes(`ready_${id.toLowerCase().replace(/-/g, '_')}`)) {
    fails.push(`ready fn missing in ${full}`)
  }
  const dir = path.dirname(full)
  if (dirs.has(dir)) fails.push(`anchor dir conflict ${dir}`)
  if (files.has(full)) fails.push(`anchor file conflict ${full}`)
  dirs.add(dir)
  files.add(full)
  const names = fs.readdirSync(path.join(root, dir))
  /** 同槽辅助模块（仍单一 ready_*）；禁止另起服务文件 */
  const ALLOWED_COMPANIONS = new Set(['obs-store.ts', 'lanes.ts', 'admission.ts', 'egress.ts', 'mcp-proxy.ts'])
  const anchorBase = path.basename(full)
  const illegal = names.filter((n) => n !== anchorBase && !ALLOWED_COMPANIONS.has(n))
  if (!names.includes(anchorBase) || illegal.length) {
    fails.push(`anchor dir not a single file ${dir}: ${names.join(',')}`)
  }
}

for (const banned of [
  'packages/server/src/runtime-base/ids.ts',
  'packages/server/src/runtime-base/probes.ts',
  'packages/server/src/runtime-base/projection.ts',
  'packages/server/src/runtime-base/boot-flag.ts',
  'packages/server/src/runtime-base/l0/coord/plt/wiring-table.ts',
  'packages/server/src/business-route-registry.ts',
  'packages/server/src/lineage-service.ts',
  'packages/server/src/data-source-registry.ts',
  'packages/server/src/machine-state.ts',
  'packages/server/src/domain-event-catalog.ts',
  'packages/server/src/alert-grading.ts',
  'packages/server/src/log-envelope.ts',
  'packages/server/src/login-challenge.ts',
  'packages/server/src/product-event-hooks.ts',
  'packages/server/src/file-storage-service.ts',
  'packages/server/src/migration-service.ts',
  'packages/server/src/infra-resource-service.ts',
  'packages/server/src/env-isolation-service.ts',
  'packages/server/src/disk-space.ts',
  'packages/server/src/logger.ts',
  'packages/server/src/csp.ts',
  'packages/server/src/geo-signal.ts',
  'packages/server/src/request-context.ts',
  'packages/server/src/api-envelope.ts',
  'packages/server/src/auth-middleware.ts',
  'packages/server/src/base-write-kit.ts',
  'packages/server/src/data-ops-service.ts',
  'packages/server/src/memo-write-service.ts',
  'packages/server/src/file-write-service.ts',
  'packages/server/src/share-write-service.ts',
  'packages/server/src/identity-write-service.ts',
  'packages/server/src/settings-write-service.ts',
  'packages/server/src/log-write-service.ts',
  'packages/server/src/runtime-modules-wire.ts',
  'packages/server/src/migrate-to-sqlite.ts',
]) {
  if (exists(banned)) fails.push(`shared bag still present ${banned}`)
}

const traceReady = read('packages/server/src/runtime-base/l1/mgmt/trace/ready.ts')
const iamReady = read('packages/server/src/runtime-base/l1/mgmt/iam/ready.ts')
if (!traceReady.includes('getLogRetentionDays') || !traceReady.includes('LOG_TYPES')) {
  fails.push('TRACE ready still aliases LOG')
}
if (!iamReady.includes('machineBoundOk')) fails.push('IAM ready missing own predicate')
if (!iamReady.includes('registerEgressAutoAllow') || !iamReady.includes('api.github.com')) {
  fails.push('IAM missing version-probe egress auto-allow (api.github.com)')
}
if (iamReady.includes('allowlistFromEnv') || /getEgressAllowlist[\s\S]{0,200}CYP_EGRESS_ALLOWLIST/.test(iamReady)) {
  fails.push('IAM getEgressAllowlist must not merge raw CYP_EGRESS_ALLOWLIST (R-018)')
}

const boot = read('packages/server/src/bootstrap.ts')
if (!boot.includes("registerEgressAutoAllow(['api.github.com'])") && !boot.includes('registerEgressAutoAllow(["api.github.com"])')) {
  fails.push('bootstrap missing version-probe registerEgressAutoAllow')
}
if (boot.includes('twelveCenters')) fails.push('bootstrap still reads twelveCenters')
if (/^\s*modules\s*:/m.test(boot)) fails.push('ready body still has parallel modules list')
if (!boot.includes('buildRuntimeBaseProjection')) fails.push('bootstrap missing projection')
if (/质量门禁|生产Mock|一键部署|系统通知中心/.test(boot)) {
  fails.push('bootstrap still mixes excluded keys')
}

const wiring = read('packages/server/src/runtime-base/l0/coord/plt/ready.ts')
if (!wiring.includes("caller: 'RB-L1-PUB-ACC-01'") || !wiring.includes("callee: 'RB-L1-HOST-RESIL-01'")) {
  fails.push('H1 first hop ACC→RESIL missing')
}
if (wiring.includes('RB-L1-COL-SVC-01') && wiring.includes("callee: 'RB-L0-COORD-PLT-01'")) {
  /* coordination and collaboration are distinct ids */
} else {
  fails.push('coordination callee row missing')
}
for (const need of ['SPIFFE_TRUST_DOMAIN', 'toSpiffeId', 'citeServiceIdentity', 'spiffe://']) {
  if (!wiring.includes(need)) fails.push(`plt missing service identity: ${need}`)
}
for (const need of ['notify_system', 'notify_channel', 'notify_delivery', 'object_storage', 'rejectUnregisteredWiring']) {
  if (!wiring.includes(need)) fails.push(`plt missing ext wiring: ${need}`)
}
if (!wiring.includes('不进闭集') || !/object_storage[\s\S]{0,400}不进闭集/.test(wiring)) {
  fails.push('object_storage wiring must declare 不进闭集 (external dep, no stable id)')
}
for (const id of ['RJ-01', 'RJ-02', 'RJ-03']) {
  if (!wiring.includes(`id: '${id}'`)) fails.push(`rejection case missing ${id}`)
}
if (!wiring.includes('verify-rejection-cases.ts')) fails.push('rejection reproduce command missing')
if (!exists('packages/server/scripts/verify-rejection-cases.ts')) {
  fails.push('rejection reproduce script missing')
}
for (const need of ['LEDGER_INDEX', 'probeTrustAnchorRotation', 'confirmTrustAnchorLoaded', 'switchSigningAfterConfirm', 'rotateExpiredWorkloadCert', 'SUPPORT_MATRIX', 'isSupportMatrixReady', "const SUPPORT_PLATFORMS = ['Server', 'Desktop']"]) {
  if (!wiring.includes(need)) fails.push(`plt missing rotation ledger: ${need}`)
}
if (wiring.includes('WORKLOAD_CERT_ROTATE_REMAINING_MS')) {
  fails.push('plt still uses half-TTL rotate gate')
}
if (wiring.includes('switch_without_confirm') || wiring.includes('rotate_threshold')) {
  fails.push('plt probe still gates on all-hands confirm')
}
const cmpReady = read('packages/server/src/runtime-base/l0/coord/cmp/ready.ts')
if (!cmpReady.includes('effectiveProbeParams')) fails.push('probe param order missing')


const svcReady = read('packages/server/src/runtime-base/l1/col/svc/ready.ts')
for (const need of ['verifyServiceIdentity', 'assertServiceIdentityPair']) {
  if (!svcReady.includes(need)) fails.push(`svc missing identity verify: ${need}`)
}
const kmsReady = read('packages/server/src/runtime-base/l1/mgmt/kms/ready.ts')
for (const need of ['ensureWorkloadTrustAnchor', 'isWorkloadTrustAnchorReady', 'getWorkloadTrustAnchor', 'rotateExpiredWorkloadCert']) {
  if (!kmsReady.includes(need)) fails.push(`kms missing trust anchor: ${need}`)
}
if (kmsReady.includes('WORKLOAD_CERT_ROTATE_REMAINING_MS') || kmsReady.includes('switch_before_all_confirmed')) {
  fails.push('kms still uses confirm or half-TTL rotate gate')
}

const perf = read('packages/server/src/runtime-base/l1/mgmt/perf/ready.ts')
if (!perf.includes("capabilityId: 'IA85'") || !perf.includes('RB-L1-MGMT-PERF-01')) {
  fails.push('IA85 host row missing')
}
const acc = read('packages/server/src/runtime-base/l1/pub/acc/ready.ts')
if (acc.includes('isIdempotencyReady')) fails.push('ACC ready still borrows FESEC idempotency')
const perfSrc = read('packages/server/src/runtime-base/l1/mgmt/perf/ready.ts')
if (/return state\.ready && isElasticityReady/.test(perfSrc)) fails.push('PERF ready still borrows RESIL')
const traceSrc = read('packages/server/src/runtime-base/l1/mgmt/trace/ready.ts')
if (traceSrc.includes('isLogReady()')) fails.push('TRACE ready still borrows LOG')
const openSrc = read('packages/server/src/runtime-base/l1/pub/open/ready.ts')
if (/function isOpenCollabReady[\s\S]*isPublicAccessSecurityReady/.test(openSrc)) {
  fails.push('OPEN ready still borrows ACC')
}
const rbac = read('packages/server/src/runtime-base/l1/mgmt/rbac/ready.ts')
if (!rbac.includes('resolve_data_scope') || !rbac.includes('row_predicate') || !rbac.includes('column_mask')) {
  fails.push('rbac.resolve_data_scope missing')
}
if (!rbac.includes('killSwitch') || !rbac.includes('requirePermission') || !rbac.includes('listTenantMemos')) {
  fails.push('RBAC ready still aliases IAM')
}
const kms = read('packages/server/src/runtime-base/l1/mgmt/kms/ready.ts')
for (const k of ['k1', 'k2', 'k3', 'k4', 'k5', 'k6', 'k7']) {
  if (!kms.includes(k)) fails.push(`KMS ${k} missing`)
}
const cmp = read('packages/server/src/runtime-base/l0/coord/cmp/ready.ts')
if (!cmp.includes('failureThreshold: 6') || !cmp.includes('failureThreshold: 3')) {
  fails.push('probe defaults missing')
}

const banRoots = [
  'packages/server/src/runtime-base',
  'packages/desktop/src/main',
  'packages/app/src/views/tenant/TenantMonitorView.vue',
  'README.md',
  'DEPLOY.md',
]
function walk(dir, out) {
  if (!fs.existsSync(dir)) return
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name)
    const st = fs.statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (/\.(ts|vue|md|mdc)$/.test(name)) out.push(p)
  }
}
const banFiles = []
for (const rel of banRoots) {
  const abs = path.join(root, rel)
  if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) walk(abs, banFiles)
  else if (fs.existsSync(abs)) banFiles.push(abs)
}
const GATEWAY_CENTER_ENUM = [
  '运行底座网关中心',
  '业务网关子中心',
  '系统网关子中心',
  '策略控制网关子中心',
  '出站治理网关子中心',
  '事件与可观测网关子中心',
  '安全准入网关子中心',
]

function illegalCenterPhrase(text) {
  const matches = text.match(/[\u4e00-\u9fff]{0,24}中心/g) || []
  for (const phrase of matches) {
    if (GATEWAY_CENTER_ENUM.some((a) => phrase === a || phrase.includes(a))) continue
    if (phrase === '中心') continue
    if (/禁止|不得|勿|称其|缺字|违规|枚举|例外|禁令|命名/.test(text) && phrase.length <= 6) continue
    if (/^[一二三四五六七八九十\d]*网关子中心$/.test(phrase) || phrase === '网关中心') continue
    if (/十二中心|科技中心|告警中心|性能中心|日志中心|通知中心|敏感信息管控中心/.test(phrase)) {
      return phrase
    }
    // 缺「网关」的子中心 / 其它中心
    if (phrase.includes('中心') && !phrase.includes('网关')) return phrase
  }
  return null
}

for (const file of banFiles) {
  const text = fs.readFileSync(file, 'utf8')
  const bad = illegalCenterPhrase(text)
  if (bad) fails.push(`banned 中心 in ${path.relative(root, file)}: ${bad}`)
  const base = path.basename(file)
  if (/(^|[^a-z])center([^a-z]|$)/i.test(base)) fails.push(`banned center filename ${base}`)
}

const serverSrc = path.join(root, 'packages/server/src')
function walkNames(dir) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name)
    if (fs.statSync(p).isDirectory()) walkNames(p)
    else if (/(^|[^a-z])center([^a-z]|$)/i.test(name)) fails.push(`center filename ${path.relative(root, p)}`)
  }
}
walkNames(serverSrc)

process.env.NODE_TLS_REJECT_UNAUTHORIZED = process.env.NODE_TLS_REJECT_UNAUTHORIZED || '0'
const baseUrl = process.env.CYP_READY_URL || 'https://127.0.0.1:5170/healthz/ready'
let live = 'skipped'
try {
  const res = await fetch(baseUrl, { signal: AbortSignal.timeout(2500) })
  const body = await res.json()
  const items = body?.data?.runtimeBase?.items || body?.runtimeBase?.items
  if (!items) fails.push('live ready missing runtimeBase.items')
  else {
    for (const id of uniqueIds) {
      if (!(id in items)) fails.push(`live missing key ${id}`)
    }
    const keys = Object.keys(items)
    if (keys.some((k) => /通知|Mock|一键|质量门禁/.test(k))) fails.push('live has excluded keys')
    if (!('RB-L0-COORD-CMP-01' in items) || !('RB-L1-COL-SVC-01' in items)) {
      fails.push('live coordination/collaboration keys missing')
    }
    live = `ok ${keys.length}`
  }
} catch {
  live = 'server-down'
}

{
  const desk = path.join(root, 'scripts/verify/verify-support-desktop.mjs')
  if (!exists('scripts/verify/verify-support-desktop.mjs')) {
    fails.push('verify-support-desktop.mjs missing')
  } else {
    const { spawnSync } = await import('child_process')
    const r = spawnSync(process.execPath, [desk], { encoding: 'utf8', cwd: root, env: process.env })
    if (r.status !== 0) {
      fails.push(`support-desktop: ${(r.stderr || r.stdout || 'fail').trim().split('\n').slice(0, 4).join(' | ')}`)
    }
  }
}

{
  for (const rel of [
    'docs/runtime-base/INFRA_FORM_SELECTION.md',
    'docs/runtime-base/SECURITY_DEPTH_EVIDENCE.md',
    'docs/runtime-base/MODULE_DESCRIPTORS.md',
    'docs/runtime-base/COMPLETION_STANDARD.md',
  ]) {
    if (!exists(rel)) fails.push(`deliverable missing ${rel}`)
  }
  const std = read('docs/runtime-base/COMPLETION_STANDARD.md')
  if (!std.includes('RB_VERDICT') || !std.includes('pnpm verify:runtime-base')) {
    fails.push('COMPLETION_STANDARD missing unique verdict command')
  }
}

if (process.env.CYP_SKIP_ELECTRON_EMBED !== '1') {
  const emb = path.join(root, 'scripts/verify/verify-electron-embed.mjs')
  if (!exists('scripts/verify/verify-electron-embed.mjs')) {
    fails.push('verify-electron-embed.mjs missing')
  } else {
    const { spawnSync } = await import('child_process')
    const r = spawnSync(process.execPath, [emb], {
      encoding: 'utf8',
      cwd: root,
      env: process.env,
      timeout: 120000,
    })
    if (r.status !== 0) {
      fails.push(`electron-embed: ${(r.stderr || r.stdout || 'fail').trim().split('\n').slice(0, 6).join(' | ')}`)
    }
  }
}

{
  const { spawnSync } = await import('child_process')
  const nest = [
    ['scripts/verify/verify-complete-form.mjs', 'complete-form'],
    ['scripts/verify/verify-gateway-center-naming.mjs', 'gateway-naming'],
    ['scripts/verify/verify-gateway-egress.mjs', 'gateway-egress'],
  ]
  for (const [rel, tag] of nest) {
    if (!exists(rel)) {
      fails.push(`nested missing ${rel}`)
      continue
    }
    const r = spawnSync(process.execPath, [path.join(root, rel)], {
      encoding: 'utf8',
      cwd: root,
      env: process.env,
      timeout: 120000,
    })
    if (r.status !== 0) {
      fails.push(`${tag}: ${(r.stderr || r.stdout || 'fail').trim().split('\n').slice(0, 6).join(' | ')}`)
    }
  }
  const r = spawnSync(
    process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
    ['--filter', '@cyp-memo/server', 'exec', 'tsx', 'scripts/verify-embedded-equivalents.ts'],
    { encoding: 'utf8', cwd: root, env: process.env, timeout: 60000, shell: process.platform === 'win32' },
  )
  if (r.status !== 0) {
    fails.push(`embedded-equivalents: ${(r.stderr || r.stdout || 'fail').trim().split('\n').slice(0, 6).join(' | ')}`)
  }
}

if (fails.length) {
  console.error(fails.join('\n'))
  console.error(`FAIL_RUNTIME_BASE ${fails.length} live=${live}`)
  console.error('RB_VERDICT=未完成')
  process.exit(1)
}
console.log(`PASS_RUNTIME_BASE ids=35 anchors=35 live=${live}`)
console.log('RB_VERDICT=完成')
