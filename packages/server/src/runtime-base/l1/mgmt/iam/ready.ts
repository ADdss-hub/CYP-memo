/**
 * CYP-memo ??????? / ???????????????? ? B07/B14 / G04 / G06 / G21???G26??
 * ?????????? ? ????? ? ?? ? blocklist ? ????? ? kill-switch ? ??????????? ? ??????????? B15
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import os from 'os'
import { spawnSync } from 'child_process'
import { fileURLToPath } from 'url'
import type { Request, Response, NextFunction } from 'express'
import type { User } from '../../../../types.js'
import { database } from '../../../l0/infra/db/ready.js'
import { getMachineCapacity } from '../../../l0/infra/cfg/ready.js'
import { fail, Err } from '../code/ready.js'
import { log as log } from '../../../l0/infra/log/ready.js'
import { getAppliedElasticity } from '../../host/resil/ready.js'

const HCM_RE = /^HCM-([A-Za-z0-9_\-.]{4,8})(-[A-Za-z0-9_\-.]{4,8})+$/
const LBN_RE = /^LBN-.+$/

export interface MachineStateFile {
  HCM: string
  LBN: string
  DCM: 'MATCH' | 'MISMATCH'
  machineIdPrefix: string
  writtenAt: string
  source: 'decryptor' | 'local-fingerprint'
}

function sliceSeg(raw: string): string {
  const cleaned = (raw || '').trim().replace(/[^A-Za-z0-9_\-.]/g, '').slice(0, 8)
  if (!cleaned) return '0000'
  if (cleaned.length < 4) return (cleaned + '0000').slice(0, 4)
  return cleaned
}

/** 与军械库 Decryptor 同形：多源 4–8 位段 → HCM-…（无 TPM） */
export function computeLocalHcm(): string {
  const segs = [
    sliceSeg(os.hostname()),
    sliceSeg(os.platform()),
    sliceSeg(os.arch()),
    sliceSeg(os.userInfo().username),
    sliceSeg(process.env.COMPUTERNAME || ''),
    sliceSeg(os.release()),
  ].filter((s) => s && s !== '0000')
  const use = segs.length >= 2 ? segs.slice(0, 6) : ['host0000', 'plat0000']
  const hcm = 'HCM-' + use.join('-')
  return HCM_RE.test(hcm) ? hcm : 'HCM-local000-bind0001'
}

function findDecryptorScript(): string | null {
  const env = (process.env.CYP_ARSENAL_ROOT || process.env.CYP_DECRYPTOR_PATH || '').trim()
  const candidates: string[] = []
  if (env) {
    if (env.toLowerCase().endsWith('.py')) candidates.push(env)
    else {
      candidates.push(
        path.join(env, 'cc', 'csc', 'tools', 'decryptor', 'cyp-tool-lbn-decryptor.py')
      )
    }
  }
  candidates.push(
    path.resolve('d:\\kf\\CYP-skill-arsenal\\cc\\csc\\tools\\decryptor\\cyp-tool-lbn-decryptor.py'),
    path.resolve('/kf/CYP-skill-arsenal/cc/csc/tools/decryptor/cyp-tool-lbn-decryptor.py')
  )
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c
  }
  return null
}

/** 实跑 Decryptor 干采 HCM（self-check 输出 hcm_dry） */
export function collectHcmViaDecryptor(): string | null {
  const script = findDecryptorScript()
  if (!script) return null
  const stateFile = path.join(os.tmpdir(), 'cyp-memo-decryptor-tool-state.json')
  const r = spawnSync(
    process.env.PYTHON || 'python',
    [script, '--self-check', '--state-file', stateFile, '--audit-root', os.tmpdir()],
    { encoding: 'utf8', timeout: 20000, windowsHide: true }
  )
  const out = `${r.stdout || ''}\n${r.stderr || ''}`
  const m = out.match(/hcm_dry\s*:\s*(HCM-[A-Za-z0-9_\-.]+)/i)
  if (m && HCM_RE.test(m[1])) return m[1]
  return null
}

/** LBN：优先环境绑定码；否则由 machineId 派生稳定本地绑定（LBN- + 10） */
export function resolveLbn(machineId: string, lbnBindingCode?: string | null): string {
  const fromEnv = (lbnBindingCode || process.env.CYP_LBN_BINDING_CODE || '').trim()
  if (fromEnv && LBN_RE.test(fromEnv) && fromEnv.length >= 14) return fromEnv
  const payload = (machineId || crypto.createHash('sha256').update(os.hostname()).digest('hex'))
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(0, 10)
    .padEnd(10, '0')
  return `LBN-${payload}`
}

function projectRootDataDir(): string {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url))
  // packages/server/src/runtime-base/l1/mgmt/iam → repo root
  return path.resolve(moduleDir, '../../../../../../../data')
}

/**
 * 管控服务绑定成功后写入 machine-state.json（dataDir + 项目根 data/）
 */
export function writeMachineState(opts: {
  dataDir: string
  machineId: string
  lbnBindingCode?: string | null
  machineBoundOk: boolean
}): MachineStateFile {
  let source: MachineStateFile['source'] = 'local-fingerprint'
  let hcm = collectHcmViaDecryptor()
  if (hcm) source = 'decryptor'
  else hcm = computeLocalHcm()

  const lbn = resolveLbn(opts.machineId, opts.lbnBindingCode)
  const dcm: MachineStateFile['DCM'] = opts.machineBoundOk ? 'MATCH' : 'MISMATCH'
  const payload: MachineStateFile = {
    HCM: hcm,
    LBN: lbn,
    DCM: dcm,
    machineIdPrefix: opts.machineId.slice(0, 8),
    writtenAt: new Date().toISOString(),
    source,
  }

  const targets = [
    path.join(opts.dataDir, 'machine-state.json'),
    path.join(projectRootDataDir(), 'machine-state.json'),
  ]
  const body = JSON.stringify(payload, null, 2) + '\n'
  for (const t of targets) {
    fs.mkdirSync(path.dirname(t), { recursive: true })
    fs.writeFileSync(t, body, 'utf8')
  }
  return payload
}

const MAX_FAILS = 5
const LOCK_MS = 15 * 60 * 1000
const WINDOW_MS = 60 * 1000
const MAX_ATTEMPTS_PER_WINDOW = 20
/** ????????ms? */
const CHALLENGE_DELAY_MS = 800

export interface LoginGateKey {
  username: string
  ip: string
  digitalId?: string
  deviceHint?: string
}

interface FailBucket {
  fails: number
  totalFails: number
  lockedUntil: number
  windowStart: number
  windowCount: number
}

export type PermanentBanStatus = 'active' | 'lifted'
export interface PermanentBanRecord {
  id: string
  ip: string
  username: string
  digitalId?: string
  at: string
  reason: string
  fails: number
  status: PermanentBanStatus
}

const permanentBans = new Map<string, PermanentBanRecord>()

export interface GovernanceState {
  ready: boolean
  killSwitch: boolean
  killSwitchReason: string | null
  machineId: string
  lbnBindingCode: string | null
  machineBoundOk: boolean
}

const buckets = new Map<string, FailBucket>()

const state: GovernanceState = {
  ready: false,
  killSwitch: false,
  killSwitchReason: null,
  machineId: '',
  lbnBindingCode: null,
  machineBoundOk: true,
}

function bucketKey(key: LoginGateKey): string {
  return `${(key.username || '').toLowerCase()}@${key.ip || 'unknown'}`
}

function digitalBucketKey(key: LoginGateKey): string | null {
  const d = key.digitalId?.trim()
  return d ? `did:${d}@${key.ip || 'unknown'}` : null
}

function isUnderObservation(_key: LoginGateKey): boolean {
  return false
}

export function listPermanentBans(opts?: {
  status?: 'active' | 'lifted' | 'all' | string
}): PermanentBanRecord[] {
  const status = opts?.status || 'active'
  const rows = [...permanentBans.values()]
  if (status === 'all') return rows
  const liftedLabel = '\u5df2\u4eba\u5de5\u89e3\u9664'
  if (status === liftedLabel || status === 'lifted') {
    return rows.filter((r) => r.status === 'lifted' || (r.status as string) === liftedLabel)
  }
  return rows.filter((r) => r.status === 'active')
}

/** CI17 machine id helper */
export function computeMachineId(): string {
  const raw = [
    os.hostname(),
    os.platform(),
    os.arch(),
    os.userInfo().username,
    process.env.COMPUTERNAME || '',
  ].join('|')
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32)
}

function killSwitchPath(dataDir: string): string {
  return path.join(dataDir, 'governance', 'kill-switch.on')
}

function ensureGovDir(dataDir: string): void {
  const dir = path.join(dataDir, 'governance')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

/**
 * Phase2 ???????????
 */
export function initGovernance(opts: {
  dataDir: string
  lbnBindingCode?: string | null
  expectedMachineId?: string | null
  /** ??????????????????????CI17?? */
  machineId?: string | null
}): GovernanceState {
  ensureGovDir(opts.dataDir)
  state.machineId = opts.machineId?.trim() || computeMachineId()
  state.lbnBindingCode = opts.lbnBindingCode?.trim() || null

  const expected = opts.expectedMachineId?.trim() || process.env.CYP_EXPECTED_MACHINE_ID?.trim() || ''
  if (expected && expected !== state.machineId) {
    state.machineBoundOk = false
    activateKillSwitch(opts.dataDir, 'CI17 machine_id mismatch ??? refuse start')
  } else {
    state.machineBoundOk = true
  }

  const envKill = (process.env.CYP_KILL_SWITCH || '').trim().toLowerCase()
  if (envKill === '1' || envKill === 'on' || envKill === 'true') {
    activateKillSwitch(opts.dataDir, 'CYP_KILL_SWITCH env')
  } else if (fs.existsSync(killSwitchPath(opts.dataDir))) {
    const reason = fs.readFileSync(killSwitchPath(opts.dataDir), 'utf-8').trim() || 'file kill-switch.on'
    state.killSwitch = true
    state.killSwitchReason = reason
  }

  state.ready = true

  // CI17???????????????????? machine-state.json??HCM/LBN/DCM??
  try {
    const ms = writeMachineState({
      dataDir: opts.dataDir,
      machineId: state.machineId,
      lbnBindingCode: state.lbnBindingCode,
      machineBoundOk: state.machineBoundOk,
    })
    log({
      level: 'info',
      message: 'CI17 machine-state written',
      type: 'security',
      action: 'machine_state_write',
      context: {
        dcm: ms.DCM,
        source: ms.source,
        machineIdPrefix: ms.machineIdPrefix,
        hcmPrefix: ms.HCM.slice(0, 24),
      },
    })
  } catch (err) {
    log({
      level: 'warn',
      message: `CI17 machine-state write failed: ${err instanceof Error ? err.message : String(err)}`,
      type: 'security',
      action: 'machine_state_write_fail',
    })
  }

  log({
    level: 'info',
    message: 'governance ready',
    type: 'security',
    action: 'governance_ready',
    context: {
      killSwitch: state.killSwitch,
      machineBoundOk: state.machineBoundOk,
      machineIdPrefix: state.machineId.slice(0, 8),
      lbnBound: Boolean(state.lbnBindingCode),
    },
  })

  startActiveHealthProbe(opts.dataDir)
  return getGovernanceState()
}

/** ???????????????? DB/???????????????? ??? ?????????????? + ???????????????????????? */
let healthTimer: ReturnType<typeof setInterval> | null = null
let healthFails = 0
const HEALTH_FAIL_THRESHOLD = 3

function startActiveHealthProbe(dataDir: string): void {
  if (healthTimer) clearInterval(healthTimer)
  healthFails = 0
  healthTimer = setInterval(() => {
    void (async () => {
      try {
        const { database } = await import('../../../l0/infra/db/ready.js')
        const { getBootstrapState } = await import('../../../../bootstrap.js')
        const boot = getBootstrapState()
        // ??????????????????????????????????????????????
        if (!boot.ready) {
          healthFails = 0
          return
        }
        const ok = database.isHealthy()
        if (ok) {
          healthFails = 0
          return
        }
        healthFails += 1
        if (healthFails >= HEALTH_FAIL_THRESHOLD) {
          const { forceDeregister, listHealthyInstances } = await import('../../col/svc/ready.js')
          for (const inst of listHealthyInstances()) {
            forceDeregister(inst.instanceId, 'governance active health fail')
          }
          const { emitAlert } = await import('../../host/alert/ready.js')
          await emitAlert({
            severity: 'P0',
            source: 'governance',
            title: 'active health check failed',
            detail: `fails=${healthFails}`,
          })
          healthFails = 0
        }
      } catch {
        healthFails += 1
      }
    })()
  }, 10_000)
  if (typeof healthTimer === 'object' && healthTimer && 'unref' in healthTimer) {
    ;(healthTimer as NodeJS.Timeout).unref()
  }
  void dataDir
}

export function getGovernanceState(): GovernanceState {
  return { ...state }
}

export function isKillSwitchActive(): boolean {
  return state.killSwitch
}

export function activateKillSwitch(dataDir: string, reason: string): void {
  ensureGovDir(dataDir)
  state.killSwitch = true
  state.killSwitchReason = reason
  fs.writeFileSync(killSwitchPath(dataDir), `${reason}\n${new Date().toISOString()}\n`, 'utf-8')
  log({
    level: 'error',
    message: `kill-switch ON: ${reason}`,
    type: 'security',
    action: 'kill_switch_on',
    context: { reason },
  })
  // ???????????????????????
  void import('../../host/alert/ready.js')
    .then((m) =>
      m.emitAlert({
        severity: 'P0',
        source: 'governance',
        title: 'kill-switch activated',
        detail: reason,
      })
    )
    .catch(() => undefined)
}

/** ?????????????????????????????? */
export function deactivateKillSwitch(dataDir: string, actor: string): void {
  ensureGovDir(dataDir)
  const p = killSwitchPath(dataDir)
  if (fs.existsSync(p)) fs.unlinkSync(p)
  state.killSwitch = false
  state.killSwitchReason = null
  log({
    level: 'warn',
    message: `kill-switch OFF by ${actor}`,
    type: 'audit',
    action: 'kill_switch_off',
    context: { actor },
  })
}

export type LoginGateResult =
  | { ok: true }
  | { ok: false; code: 'E023' | 'E024'; message: string; retryAfterSec?: number }

/** G23/G25???????????????? */
export function assertLoginAllowed(key: LoginGateKey): LoginGateResult {
  if (state.killSwitch) {
    return { ok: false, code: 'E023', message: '???????????????kill-switch?????????????' }
  }
  const k = bucketKey(key)
  const now = Date.now()
  let b = buckets.get(k)
  if (!b) {
    b = { fails: 0, totalFails: 0, lockedUntil: 0, windowStart: now, windowCount: 0 }
    buckets.set(k, b)
  }
  if (b.lockedUntil > now) {
    const retryAfterSec = Math.ceil((b.lockedUntil - now) / 1000)
    return {
      ok: false,
      code: 'E023',
      message: `??????????????????????/blocklist????? ${retryAfterSec}s ???????`,
      retryAfterSec,
    }
  }
  if (now - b.windowStart > WINDOW_MS) {
    b.windowStart = now
    b.windowCount = 0
  }
  b.windowCount += 1
  if (b.windowCount > MAX_ATTEMPTS_PER_WINDOW) {
    b.lockedUntil = now + LOCK_MS
    log({
      level: 'warn',
      message: 'login rate limit lock',
      type: 'security',
      action: 'login_rate_lock',
      context: { username: key.username, ip: key.ip },
    })
    return {
      ok: false,
      code: 'E024',
      message: '????????????????????????',
      retryAfterSec: Math.ceil(LOCK_MS / 1000),
    }
  }
  return { ok: true }
}

/** G23/G24???????? + ?????????? */
export function recordLoginFailure(key: LoginGateKey): void {
  const k = bucketKey(key)
  const now = Date.now()
  let b = buckets.get(k)
  if (!b) {
    b = { fails: 0, totalFails: 0, lockedUntil: 0, windowStart: now, windowCount: 0 }
    buckets.set(k, b)
  }
  b.fails += 1
  b.totalFails = (b.totalFails || 0) + 1
  log({
    level: 'warn',
    message: `login fail count=${b.fails}`,
    type: 'security',
    action: 'auth_login_failed',
    context: { username: key.username, ip: key.ip, fails: b.fails },
  })
  if (b.fails >= MAX_FAILS) {
    b.lockedUntil = now + LOCK_MS
    b.fails = 0
    log({
      level: 'error',
      message: 'login lockout after max fails',
      type: 'security',
      action: 'login_lockout',
      context: { username: key.username, ip: key.ip, lockMs: LOCK_MS },
    })
  }
}

export function recordLoginSuccess(key: LoginGateKey): void {
  buckets.delete(bucketKey(key))
  log({
    level: 'info',
    message: 'login success gate clear',
    type: 'security',
    action: 'auth_login_ok',
    context: { username: key.username, ip: key.ip },
  })
}

export function resetGovernance(): void {
  if (healthTimer) {
    clearInterval(healthTimer)
    healthTimer = null
  }
  healthFails = 0
  buckets.clear()
  state.ready = false
  state.killSwitch = false
  state.killSwitchReason = null
  state.machineId = ''
  state.lbnBindingCode = null
  state.machineBoundOk = true
}

/**
 * AUD-S03 ?????????????????????????????? ? ???????????
 * - ???????logout / ????????????? `UPDATE users SET token=NULL`??? POST /api/auth/logout??
 * - ??????????? `token_revocations(jti|tokenHash, userId, revokedAt)` ???
 *   ???????? `sha256(token)` ??? `sealSensitiveField`?????????????????
 *   ????????????????? + ?? users.token?????????????????????????
 */
/** G22?????????????????????????????????? bcrypt ???????????????????????????? */
export function sealSensitiveField(plain: string, secret: string): string {
  const key = crypto.createHash('sha256').update(secret).digest()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1:${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`
}

export function openSensitiveField(sealed: string, secret: string): string {
  const [ver, ivHex, tagHex, dataHex] = sealed.split(':')
  if (ver !== 'v1' || !ivHex || !tagHex || !dataHex) {
    throw new Error('invalid sealed field')
  }
  const key = crypto.createHash('sha256').update(secret).digest()
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  return Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final(),
  ]).toString('utf8')
}

export function getLoginChallengeDelayMs(key: LoginGateKey): number {
  const b = buckets.get(bucketKey(key)) || (digitalBucketKey(key) ? buckets.get(digitalBucketKey(key)!) : undefined)
  if (!b) return 0
  if (b.lockedUntil > Date.now()) return 0
  if (b.fails >= 1 || b.totalFails >= 1) return CHALLENGE_DELAY_MS
  if (isUnderObservation(key)) return CHALLENGE_DELAY_MS
  return 0
}

/** ?????????????????????? delay ?????? */

export function isLoginChallengeRequired(key: LoginGateKey): boolean {
  return getLoginChallengeDelayMs(key) > 0
}

// --- 出站治理 + 弹性限流系数（嵌入式完整能力，禁止空桩） ---

const egressHits = new Map<string, number[]>()
const apiHits = new Map<string, number[]>()
const API_HITS_MAX_KEYS = 8_000
const API_HITS_MAX_SAMPLES = 256

function pruneApiHits(now: number): void {
  const windowStart = now - 60_000
  for (const [k, arr] of apiHits) {
    const next = arr.filter((t) => t >= windowStart)
    if (next.length === 0) apiHits.delete(k)
    else if (next.length !== arr.length || next.length > API_HITS_MAX_SAMPLES) {
      apiHits.set(k, next.slice(-API_HITS_MAX_SAMPLES))
    }
  }
  if (apiHits.size <= API_HITS_MAX_KEYS) return
  // 超限时删最旧键
  const overflow = apiHits.size - API_HITS_MAX_KEYS
  let i = 0
  for (const k of apiHits.keys()) {
    if (i++ >= overflow) break
    apiHits.delete(k)
  }
}

function hostOf(target: string): string {
  try {
    if (target.includes('://')) return new URL(target).hostname
  } catch {
    /* fallthrough */
  }
  return target.split('/')[0]?.split(':')[0] || target
}

function isLocalHost(host: string): boolean {
  const h = host.toLowerCase()
  return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h.endsWith('.local')
}

/** 出站自动放行（产品必建项，禁止依赖手工 env 才生效） */
const egressAutoAllowHosts = new Set<string>(['api.github.com'])

/**
 * 注册出站自动放行主机（bootstrap / 产品必建探测用）。
 * 与 CYP_EGRESS_ALLOWLIST 合并；自动项不可被空 env 取消。
 */
export function registerEgressAutoAllow(hosts: string[]): string[] {
  for (const h of hosts) {
    const n = String(h || '')
      .trim()
      .toLowerCase()
    if (n) egressAutoAllowHosts.add(n)
  }
  return getEgressAllowlist()
}

function allowlistFromEnv(): string[] {
  return String(process.env.CYP_EGRESS_ALLOWLIST || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

/** 生效名单 = 自动必建放行 ∪ 环境附加 */
export function getEgressAllowlist(): string[] {
  return Array.from(new Set([...egressAutoAllowHosts, ...allowlistFromEnv()]))
}

/** 出站允许：本机始终允许；外网 = 自动必建放行 ∪ CYP_EGRESS_ALLOWLIST */
export function assertEgressAllowed(target: string): { ok: boolean; reason?: string } {
  const host = hostOf(String(target || '')).toLowerCase()
  if (!host) return { ok: false, reason: 'empty' }
  if (isLocalHost(host)) return { ok: true }
  const list = getEgressAllowlist()
  if (list.includes(host) || list.includes('*')) return { ok: true }
  return { ok: false, reason: 'not_allowlisted' }
}

/**
 * API 预算：基准 RPM × 弹性限流系数（<1 收紧）。超限返回 ok:false。
 * 系统网关子中心（ops）：保留最低可观测地板，禁止 factor 压到失明。
 */
export function consumeApiBudget(
  key: string,
  baseRpm?: number,
  opts?: { protectUser?: boolean }
): { ok: boolean; limit: number } {
  const cap = getMachineCapacity()
  const capRpm = cap.apiRpm
  const rpm = baseRpm == null || !Number.isFinite(baseRpm) ? capRpm : baseRpm
  let factor = 1
  if (!opts?.protectUser) {
    try {
      factor = getAppliedElasticity().rateLimitFactor
    } catch {
      factor = 1
    }
  }
  let limit = Math.max(1, Math.floor(rpm * (Number.isFinite(factor) ? factor : 1)))
  // ops 可观测地板：至少 clientErrorRpm 与 apiRpm×5% 的较大者
  if (!opts?.protectUser) {
    const floor = Math.max(cap.clientErrorRpm || 10, Math.floor(capRpm * 0.05))
    limit = Math.max(limit, floor)
  }
  const now = Date.now()
  if (apiHits.size > API_HITS_MAX_KEYS || Math.random() < 0.02) pruneApiHits(now)
  const windowStart = now - 60_000
  const bucket = (apiHits.get(key) || []).filter((t) => t >= windowStart)
  if (bucket.length >= limit) {
    apiHits.set(key, bucket)
    return { ok: false, limit }
  }
  bucket.push(now)
  apiHits.set(key, bucket.length > API_HITS_MAX_SAMPLES ? bucket.slice(-API_HITS_MAX_SAMPLES) : bucket)
  void egressHits
  return { ok: true, limit }
}

import { getBootstrapReadyFlag } from '../../../l0/infra/init/ready.js'

export function ready_rb_l1_mgmt_iam_01(): boolean {
  const g = getGovernanceState()
  return Boolean(g.ready && getBootstrapReadyFlag() && g.machineBoundOk)
}

interface ChallengeRec {
  answer: string
  ip: string
  expiresAt: number
  prompt: string
}

const challenges = new Map<string, ChallengeRec>()
const TTL_MS = 5 * 60_000

function prune(now = Date.now()): void {
  for (const [id, c] of challenges) {
    if (c.expiresAt < now) challenges.delete(id)
  }
}

function normalizeIp(ip: string): string {
  let s = (ip || '').trim()
  if (s.toLowerCase().startsWith('::ffff:')) s = s.slice(7)
  return s || 'unknown'
}

/** 签发挑战（按 IP；不绑定用户名以免枚举） */
export function issueLoginChallenge(ip: string): {
  challengeId: string
  prompt: string
  expiresInSec: number
  type: 'arith'
} {
  prune()
  const a = 1 + Math.floor(Math.random() * 9)
  const b = 1 + Math.floor(Math.random() * 9)
  const id = crypto.randomBytes(12).toString('hex')
  const prompt = `${a}+${b}=?`
  challenges.set(id, {
    answer: String(a + b),
    ip: normalizeIp(ip),
    expiresAt: Date.now() + TTL_MS,
    prompt,
  })
  log({
    level: 'info',
    type: 'security',
    message: 'login challenge issued',
    action: 'login_challenge_issue',
    context: { challengeId: id, ip: normalizeIp(ip) },
  })
  return {
    challengeId: id,
    prompt,
    expiresInSec: Math.floor(TTL_MS / 1000),
    type: 'arith',
  }
}

export function verifyLoginChallenge(input: {
  challengeId?: string
  challengeAnswer?: string
  ip: string
}): { ok: true } | { ok: false; reason: string } {
  prune()
  const id = String(input.challengeId || '').trim()
  const ans = String(input.challengeAnswer || '').trim()
  if (!id || !ans) return { ok: false, reason: 'missing' }
  const rec = challenges.get(id)
  if (!rec) return { ok: false, reason: 'expired_or_unknown' }
  if (rec.expiresAt < Date.now()) {
    challenges.delete(id)
    return { ok: false, reason: 'expired' }
  }
  if (rec.ip !== normalizeIp(input.ip)) {
    return { ok: false, reason: 'ip_mismatch' }
  }
  if (rec.answer !== ans) {
    return { ok: false, reason: 'wrong' }
  }
  challenges.delete(id)
  return { ok: true }
}

export function resetLoginChallenges(): void {
  challenges.clear()
}

export type GeoRegion = 'cn' | 'hk' | 'mo' | 'foreign' | 'unknown'

export interface GeoSignal {
  region: GeoRegion
  asn: string | null
  /** 是否命中白名单（跳过 foreign 加权） */
  whitelisted: boolean
  /** 仅信号：可降低临时锁阈值，不可单独永久封 */
  signalOnly: true
  source: 'config' | 'env' | 'default'
}

interface GeoConfig {
  whitelistIps?: string[]
  prefixes?: Array<{ prefix: string; region: GeoRegion; asn?: string }>
  defaultRegion?: GeoRegion
}

let dataDirRef: string | null = null
let cached: GeoConfig | null = null
let cachedAt = 0
const CACHE_MS = 30_000

export function initGeoSignal(dataDir: string): void {
  dataDirRef = dataDir
  cached = null
  cachedAt = 0
}

function configPath(): string | null {
  if (!dataDirRef) return null
  return path.join(dataDirRef, 'governance', 'geo-signals.json')
}

function loadConfig(): GeoConfig {
  const now = Date.now()
  if (cached && now - cachedAt < CACHE_MS) return cached
  const p = configPath()
  let cfg: GeoConfig = { defaultRegion: 'unknown', whitelistIps: ['127.0.0.1', '::1', '::ffff:127.0.0.1'], prefixes: [] }
  if (p && fs.existsSync(p)) {
    try {
      const raw = JSON.parse(fs.readFileSync(p, 'utf-8')) as GeoConfig
      cfg = {
        defaultRegion: raw.defaultRegion || 'unknown',
        whitelistIps: raw.whitelistIps || cfg.whitelistIps,
        prefixes: Array.isArray(raw.prefixes) ? raw.prefixes : [],
      }
    } catch (err) {
      log({
        level: 'warn',
        type: 'security',
        message: 'geo-signals.json parse failed; using defaults',
        action: 'geo_signal_load_fail',
        context: { err: err instanceof Error ? err.message : String(err) },
      })
    }
  }
  cached = cfg
  cachedAt = now
  return cfg
}

function normalizeGeoIp(ip: string): string {
  let s = (ip || '').trim().toLowerCase()
  if (s.startsWith('::ffff:')) s = s.slice('::ffff:'.length)
  return s || 'unknown'
}

/**
 * 解析地域信号。无 MaxMind 库时仅依赖可配置前缀表 + env；未知则 unknown。
 */
export function resolveGeoSignal(ip: string): GeoSignal {
  const nip = normalizeGeoIp(ip)
  const cfg = loadConfig()
  if ((cfg.whitelistIps || []).some((w) => normalizeGeoIp(w) === nip)) {
    return {
      region: 'cn',
      asn: null,
      whitelisted: true,
      signalOnly: true,
      source: 'config',
    }
  }

  const prefixes = [...(cfg.prefixes || [])].sort((a, b) => b.prefix.length - a.prefix.length)
  for (const row of prefixes) {
    if (nip.startsWith(row.prefix.toLowerCase())) {
      return {
        region: row.region,
        asn: row.asn || null,
        whitelisted: false,
        signalOnly: true,
        source: 'config',
      }
    }
  }

  const envPolicy = (process.env.CYP_GEO_POLICY || '').trim().toLowerCase()
  if (envPolicy === 'foreign_strict' || envPolicy === 'foreign') {
    // env 仅声明「按境外敏感策略加权」，不声称已识别真实地理
    return {
      region: 'foreign',
      asn: null,
      whitelisted: false,
      signalOnly: true,
      source: 'env',
    }
  }

  return {
    region: cfg.defaultRegion || 'unknown',
    asn: null,
    whitelisted: false,
    signalOnly: true,
    source: 'default',
  }
}

/** 写入示例配置（若不存在），便于运维填充真实前缀/ASN */
export function ensureGeoSignalExample(dataDir: string): void {
  const dir = path.join(dataDir, 'governance')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const p = path.join(dir, 'geo-signals.json')
  if (fs.existsSync(p)) return
  const example: GeoConfig = {
    defaultRegion: 'unknown',
    whitelistIps: ['127.0.0.1', '::1', '::ffff:127.0.0.1'],
    prefixes: [
      { prefix: '10.', region: 'cn', asn: 'PRIVATE' },
      { prefix: '192.168.', region: 'cn', asn: 'PRIVATE' },
    ],
  }
  fs.writeFileSync(p, JSON.stringify(example, null, 2), 'utf-8')
}

declare module 'express-serve-static-core' {
  interface Request {
    authUser?: User
    /** 身份主体：一律以 digitalId 为准（会话 Bearer 仍为 opaque token） */
    authSubject?: string
  }
}

/** API-06 白名单：method + path（path 为 /api 后路径） */
const WHITELIST_EXACT: ReadonlyArray<{ method: string; path: string }> = [
  { method: 'GET', path: '/health' },
  { method: 'GET', path: '/config' },
  { method: 'GET', path: '/version/latest' },
  { method: 'POST', path: '/auth/login' },
  { method: 'POST', path: '/auth/register' },
  { method: 'GET', path: '/auth/challenge' },
  { method: 'POST', path: '/auth/recover/question' },
  { method: 'POST', path: '/auth/recover/verify' },
  { method: 'POST', path: '/auth/recover/reset' },
  { method: 'POST', path: '/auth/recover/by-token' },
  { method: 'POST', path: '/auth/recover/reset-by-token' },
  { method: 'POST', path: '/admins/login' },
  { method: 'GET', path: '/users/check-username' },
  { method: 'GET', path: '/users/check-token' },
  /** SIX-LOG：前端错误上报（限流 + 服务端脱敏；可选 Bearer） */
  { method: 'POST', path: '/logs/client-error' },
]

const WHITELIST_PREFIX: ReadonlyArray<{ method: string; prefix: string }> = [
  { method: 'GET', prefix: '/users/check-username/' },
  { method: 'GET', prefix: '/users/check-token/' },
  /** 公开分享访问 / 评论（访客无需登录） */
  { method: 'POST', prefix: '/public/shares/' },
  { method: 'GET', prefix: '/public/shares/' },
]

function apiPath(req: Request): string {
  if (req.baseUrl === '/api' || req.path.startsWith('/')) {
    const p = req.path.startsWith('/api') ? req.path.slice('/api'.length) || '/' : req.path
    return p.startsWith('/') ? p : `/${p}`
  }
  const raw = (req.originalUrl || req.url || '').split('?')[0]
  if (raw.startsWith('/api')) return raw.slice('/api'.length) || '/'
  return raw
}

export function isWhitelisted(req: Request): boolean {
  const method = req.method.toUpperCase()
  const path = apiPath(req)
  // API-10：退役 /admins* 一律放行到路由层返回 410（禁止先 401 冒充仍存活）
  if (path === '/admins' || path.startsWith('/admins/')) return true
  // 废止双路径列表：放行到 410（禁止先 401 冒充仍存活）
  if (path === '/memos/tenant-scope' || path.startsWith('/memos/tenant-scope/')) return true
  if (WHITELIST_EXACT.some((w) => w.method === method && w.path === path)) return true
  if (WHITELIST_PREFIX.some((w) => w.method === method && path.startsWith(w.prefix))) return true
  return false
}

/** API-09：禁止下发 passwordHash / 安全答案原文 / 个人令牌原文 */
export function sanitizeUser(user: User): Record<string, unknown> {
  const { passwordHash: _ph, token: _tok, ...rest } = user
  const out: Record<string, unknown> = {
    ...rest,
    /** 布尔标志；禁止把 hash 下发到前端 */
    hasPassword: Boolean(_ph),
  }
  if (rest.securityQuestion) {
    out.securityQuestion = {
      question: rest.securityQuestion.question,
      answer: '',
    }
  }
  return out
}

/** 跨租户拒绝可观测（数据流方案 P0 钩子） */
function noteCrossTenantDenied(req: Request, reason: string): void {
  void import('../../host/telem/ready.js')
    .then((m) => {
      m.recordCrossTenantDenied(req, reason)
    })
    .catch(() => undefined)
}

export function assertSameTenant(
  req: Request,
  resourceTenantRootId: string | null | undefined
): boolean {
  const user = req.authUser
  if (!user) return false
  if (!resourceTenantRootId) return false
  return resourceTenantRootId === user.tenantRootId
}

export function forbidCrossTenant(res: Response, req?: Request): void {
  if (req) noteCrossTenantDenied(req, 'forbidCrossTenant')
  fail(res, 403, Err.CROSS_TENANT, '禁止跨租户访问', req)
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  if (isWhitelisted(req)) {
    next()
    return
  }

  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    fail(res, 401, Err.UNAUTH, '未认证：需要 Authorization Bearer', req)
    return
  }

  const token = header.slice('Bearer '.length).trim()
  if (!token) {
    fail(res, 401, Err.UNAUTH, '未认证：Bearer 为空', req)
    return
  }

  const user = database.getUserByToken(token)
  if (!user) {
    fail(res, 401, Err.TOKEN_INVALID, '令牌无效或已失效', req)
    return
  }

  // 身份主体以 digitalId 为准（会话 Bearer 仍为 opaque token）
  if (!user.digitalId || !/^\d{6}$/.test(user.digitalId)) {
    fail(res, 401, Err.TOKEN_INVALID, '令牌对应用户缺少有效 digitalId', req)
    return
  }

  req.authUser = user
  req.authSubject = user.digitalId
  next()
}


export function guardTenantUser(
  req: Request,
  res: Response,
  userId: string | null | undefined
): boolean {
  if (!req.authUser) {
    fail(res, 401, Err.UNAUTH, '未认证', req)
    return false
  }
  if (!userId) {
    fail(res, 400, Err.BAD_REQUEST, '缺少用户标识', req)
    return false
  }
  if (userId === req.authUser.id) return true
  const target = database.getUserById(userId)
  if (!target) {
    fail(res, 404, Err.NOT_FOUND, '用户不存在', req)
    return false
  }
  if (!assertSameTenant(req, target.tenantRootId)) {
    forbidCrossTenant(res, req)
    return false
  }
  return true
}

export function guardMemoAccess(
  req: Request,
  res: Response,
  memoId: string
): { id: string; userId: string } | null {
  const memo = database.getMemoById(memoId)
  if (!memo) {
    fail(res, 404, Err.MEMO_NOT_FOUND, '备忘录不存在', req)
    return null
  }
  if (!guardTenantUser(req, res, memo.userId)) return null
  return memo
}

export function guardFileAccess(
  req: Request,
  res: Response,
  fileId: string
): { id: string; userId: string; path: string; filename: string; mimeType: string } | null {
  const file = database.getFileById(fileId)
  if (!file) {
    fail(res, 404, Err.FILE_NOT_FOUND, '文件不存在', req)
    return null
  }
  if (!guardTenantUser(req, res, file.userId)) return null
  return file
}

export function guardShareAccess(
  req: Request,
  res: Response,
  shareId: string
): { id: string; userId: string } | null {
  const share = database.getShareById(shareId)
  if (!share) {
    fail(res, 404, Err.SHARE_NOT_FOUND, '分享不存在', req)
    return null
  }
  if (!guardTenantUser(req, res, share.userId)) return null
  return share
}
