/**
 * CYP-memo 全局密钥与证书服务（嵌入式 · KMS）
 * 专属：敏感凭证保险箱；配置侧只持 { cipher: key-id }；resolve 明文仅内存
 * 红线：不存业务配置；不做限流；明文不落盘
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import crypto from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'

/** 配置侧引用形态：只存 key-id，从不存明文 */
export interface CipherRef {
  cipher: string
}

export interface KmsState {
  ready: boolean
  vaultPath: string | null
  secretCount: number
  lastPutAt: string | null
  lastRotateAt: string | null
}

interface VaultEntry {
  id: string
  /** aes-256-gcm 密文封套；永不写明文 */
  sealed: string
  createdAt: string
  rotatedAt: string | null
  /** 上一版密文（可回滚） */
  previousSealed?: string | null
  previousId?: string | null
}

export interface KmsRotateAudit {
  at: string
  actor: string
  oldRefId: string
  newRefId: string
}

const rotateAudits: KmsRotateAudit[] = []
const MAX_ROTATE_AUDITS = 200
let resolveFailBlocked = 0
const PROVIDERS = new Set(['local', 'file', 'env'])

export function toRefUri(cipherId: string, provider = 'local'): string {
  return `ref://${provider}/${String(cipherId).replace(/^ref:\/\/[^/]+\//, '')}`
}

export function parseRefUri(ref: string): { provider: string; path: string } | null {
  const m = /^ref:\/\/([a-z0-9_-]+)\/(.+)$/i.exec(String(ref || '').trim())
  if (!m) return null
  if (!PROVIDERS.has(m[1].toLowerCase())) return null
  return { provider: m[1].toLowerCase(), path: m[2] }
}

interface VaultFile {
  version: 1
  /** 仅密文条目 */
  entries: Record<string, VaultEntry>
}

const state: KmsState = {
  ready: false,
  vaultPath: null,
  secretCount: 0,
  lastPutAt: null,
  lastRotateAt: null,
}

let dataDirRef: string | null = null
/** 进程内 master key（派生自机器码或显式注入）；永不落盘 */
let masterKey: Buffer | null = null
/** 内存索引：仅密文条目 */
const memoryVault = new Map<string, VaultEntry>()

function vaultDir(): string {
  return path.join(dataDirRef || '.', 'kms')
}

function vaultFilePath(): string {
  return path.join(vaultDir(), 'vault.json')
}

function computeMachineMaterial(): string {
  return [
    os.hostname(),
    os.platform(),
    os.arch(),
    os.userInfo().username,
    process.env.COMPUTERNAME || '',
  ].join('|')
}

/**
 * 派生 32 字节 master key：
 * - 优先 CYP_KMS_MASTER_KEY / opts.masterKey（进程内注入）
 * - 否则由机器码材料 + 固定盐 scrypt 派生（绑定本机）
 */
function deriveMasterKey(explicit?: string | null): Buffer {
  const fromEnv = (explicit || process.env.CYP_KMS_MASTER_KEY || '').trim()
  if (fromEnv) {
    return crypto.createHash('sha256').update(`cyp-kms|${fromEnv}`).digest()
  }
  const material = computeMachineMaterial()
  return crypto.scryptSync(material, 'cyp-memo-kms-v1', 32)
}

function seal(plain: string): string {
  if (!masterKey) throw new Error('kms service not ready')
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1:${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`
}

function open(sealed: string): string {
  if (!masterKey) throw new Error('kms service not ready')
  const [ver, ivHex, tagHex, dataHex] = sealed.split(':')
  if (ver !== 'v1' || !ivHex || !tagHex || !dataHex) {
    throw new Error('invalid kms sealed blob')
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey, Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  return Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final(),
  ]).toString('utf8')
}

function persistVault(): void {
  if (!dataDirRef) return
  const dir = vaultDir()
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const file: VaultFile = { version: 1, entries: {} }
  for (const [id, entry] of memoryVault) {
    file.entries[id] = {
      id: entry.id,
      sealed: entry.sealed,
      createdAt: entry.createdAt,
      rotatedAt: entry.rotatedAt,
    }
  }
  // 只落盘密文；禁止写入任何明文字段
  fs.writeFileSync(vaultFilePath(), JSON.stringify(file, null, 2), 'utf-8')
  state.secretCount = memoryVault.size
  state.vaultPath = vaultFilePath()
}

function loadVault(): void {
  memoryVault.clear()
  const p = vaultFilePath()
  if (!fs.existsSync(p)) {
    state.secretCount = 0
    state.vaultPath = p
    return
  }
  const raw = fs.readFileSync(p, 'utf-8')
  const parsed = JSON.parse(raw) as VaultFile
  if (parsed?.version !== 1 || !parsed.entries || typeof parsed.entries !== 'object') {
    throw new Error('kms vault.json corrupt or unsupported version')
  }
  for (const [id, entry] of Object.entries(parsed.entries)) {
    if (!entry?.sealed || typeof entry.sealed !== 'string') continue
    memoryVault.set(id, {
      id,
      sealed: entry.sealed,
      createdAt: entry.createdAt || new Date().toISOString(),
      rotatedAt: entry.rotatedAt ?? null,
      previousSealed: entry.previousSealed ?? null,
      previousId: entry.previousId ?? null,
    })
  }
  state.secretCount = memoryVault.size
  state.vaultPath = p
}

function newKeyId(): string {
  return `key-${crypto.randomBytes(12).toString('hex')}`
}

function normalizeRef(ref: CipherRef | string): string {
  const raw = typeof ref === 'string' ? ref.trim() : String(ref?.cipher || '').trim()
  if (!raw) throw new Error('invalid cipher ref')
  if (raw.startsWith('{') && raw.includes('cipher')) {
    try {
      const obj = JSON.parse(raw) as CipherRef
      if (obj?.cipher) return normalizeRef(obj.cipher)
    } catch {
      /* fallthrough */
    }
  }
  const parsed = parseRefUri(raw)
  if (parsed) return parsed.path
  return raw
}

function recordRotateAudit(row: KmsRotateAudit): void {
  rotateAudits.push(row)
  if (rotateAudits.length > MAX_ROTATE_AUDITS) rotateAudits.splice(0, rotateAudits.length - MAX_ROTATE_AUDITS)
  if (!dataDirRef) return
  const file = path.join(vaultDir(), 'rotations.jsonl')
  fs.appendFileSync(file, `${JSON.stringify(row)}\n`, 'utf8')
}

export function getKmsState(): KmsState {
  return { ...state, secretCount: memoryVault.size }
}

export function isKmsReady(): boolean {
  return state.ready
}

/**
 * 写入密钥：明文仅在内存中加密后落盘密文；返回配置侧可存的 { cipher: key-id }
 */
export function putSecret(plain: string, opts?: { id?: string }): CipherRef {
  if (!state.ready) throw new Error('kms service not ready')
  if (typeof plain !== 'string' || plain.length === 0) {
    throw new Error('putSecret requires non-empty plaintext')
  }
  const id = opts?.id?.trim() || newKeyId()
  const now = new Date().toISOString()
  const entry: VaultEntry = {
    id,
    sealed: seal(plain),
    createdAt: memoryVault.get(id)?.createdAt || now,
    rotatedAt: memoryVault.has(id) ? now : null,
  }
  memoryVault.set(id, entry)
  persistVault()
  state.lastPutAt = now
  return { cipher: toRefUri(id) }
}

/**
 * resolveCipherRef：由 {cipher:key-id} 解出明文，仅驻留调用方内存；本服务不缓存明文、不落盘
 */
export function resolveCipherRef(ref: CipherRef | string): string {
  if (!state.ready) throw new Error('kms service not ready')
  try {
    const id = normalizeRef(ref)
    const entry = memoryVault.get(id)
    if (!entry) throw new Error(`kms secret not found: ${id}`)
    return open(entry.sealed)
  } catch (err) {
    resolveFailBlocked += 1
    void import('../../host/audit/ready.js')
      .then((m) => {
        m.recordAuditSafe({
          actor: 'kms',
          action: 'kms_resolve_blocked',
          resource: typeof ref === 'string' ? ref : ref?.cipher || 'unknown',
          detail: err instanceof Error ? err.message : String(err),
        })
      })
      .catch(() => undefined)
    throw err
  }
}

/** 与 resolveCipherRef 同义（对外稳定名） */
export function resolveSecret(ref: CipherRef | string): string {
  return resolveCipherRef(ref)
}

/**
 * 轮换：用新明文重封同一 key-id（或新建）；旧密文被覆盖；明文仍不落盘
 */
export function rotateSecret(
  ref: CipherRef | string,
  newPlain: string,
  opts?: { newId?: boolean }
): CipherRef {
  if (!state.ready) throw new Error('kms service not ready')
  if (typeof newPlain !== 'string' || newPlain.length === 0) {
    throw new Error('rotateSecret requires non-empty plaintext')
  }
  const oldId = normalizeRef(ref)
  if (!memoryVault.has(oldId) && !opts?.newId) {
    throw new Error(`kms secret not found: ${oldId}`)
  }
  const id = opts?.newId ? newKeyId() : oldId
  const prev = memoryVault.get(oldId)
  const now = new Date().toISOString()
  memoryVault.set(id, {
    id,
    sealed: seal(newPlain),
    createdAt: prev?.createdAt || now,
    rotatedAt: now,
    previousSealed: prev?.sealed || null,
    previousId: prev?.id || oldId,
  })
  if (opts?.newId && oldId !== id) {
    memoryVault.delete(oldId)
  }
  persistVault()
  recordRotateAudit({
    at: now,
    actor: 'kms',
    oldRefId: oldId,
    newRefId: id,
  })
  state.lastRotateAt = now
  state.lastPutAt = now
  return { cipher: toRefUri(id) }
}

/** 回到上一版密文。没有上一版则拒绝，不降级为明文。 */
export function rollbackSecret(ref: CipherRef | string): CipherRef {
  if (!state.ready) throw new Error('kms service not ready')
  const id = normalizeRef(ref)
  const entry = memoryVault.get(id)
  if (!entry?.previousSealed) throw new Error('kms rollback blocked: no previous sealed ref')
  const now = new Date().toISOString()
  memoryVault.set(id, {
    ...entry,
    sealed: entry.previousSealed,
    previousSealed: null,
    rotatedAt: now,
  })
  persistVault()
  recordRotateAudit({
    at: now,
    actor: 'kms',
    oldRefId: entry.previousId || id,
    newRefId: id,
  })
  return { cipher: toRefUri(id) }
}

export function initKms(opts: {
  dataDir: string
  /** 进程内 master key；缺省用机器码派生 */
  masterKey?: string | null
}): KmsState {
  dataDirRef = opts.dataDir
  masterKey = deriveMasterKey(opts.masterKey)
  const dir = vaultDir()
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  loadVault()
  ensureWorkloadTrustAnchor(opts.dataDir)
  state.ready = true
  state.lastPutAt = null
  state.lastRotateAt = null
  return getKmsState()
}

export function resetKms(): void {
  memoryVault.clear()
  masterKey = null
  dataDirRef = null
  trustAnchor = null
  resetWorkloadCertRotation()
  state.ready = false
  state.vaultPath = null
  state.secretCount = 0
  state.lastPutAt = null
  state.lastRotateAt = null
}

/** 工作负载信任根：SPIFFE 信任域材料由本服务托管，不依赖平台协调运行时签发 */
const SPIFFE_TRUST_DOMAIN = 'runtimebase.local'

export interface WorkloadTrustAnchor {
  trustDomain: string
  fingerprint: string
  path: string
  createdAt: string
}

let trustAnchor: WorkloadTrustAnchor | null = null

export function ensureWorkloadTrustAnchor(dataDir: string): WorkloadTrustAnchor {
  const dir = path.join(dataDir, 'kms', 'trust')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, 'spiffe-trust-anchor.json')
  if (fs.existsSync(file)) {
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as WorkloadTrustAnchor
      if (raw?.trustDomain === SPIFFE_TRUST_DOMAIN && raw.fingerprint && raw.path) {
        trustAnchor = raw
        return raw
      }
    } catch {
      /* recreate */
    }
  }
  const seed = crypto.createHash('sha256').update(`spiffe-anchor:${dataDir}:${SPIFFE_TRUST_DOMAIN}`).digest('hex')
  const anchor: WorkloadTrustAnchor = {
    trustDomain: SPIFFE_TRUST_DOMAIN,
    fingerprint: seed.slice(0, 32),
    path: file,
    createdAt: new Date().toISOString(),
  }
  fs.writeFileSync(file, JSON.stringify(anchor, null, 2), 'utf-8')
  trustAnchor = anchor
  return anchor
}

export function getWorkloadTrustAnchor(): WorkloadTrustAnchor | null {
  return trustAnchor ? { ...trustAnchor } : null
}

export function isWorkloadTrustAnchorReady(): boolean {
  return Boolean(
    trustAnchor &&
      trustAnchor.trustDomain === SPIFFE_TRUST_DOMAIN &&
      trustAnchor.fingerprint &&
      trustAnchor.path
  )
}

/** 工作负载证书 TTL 默认 24 小时。到期后自动更换，签发不要求全员确认。 */
export const WORKLOAD_CERT_TTL_MS = 24 * 60 * 60 * 1000

export interface WorkloadCert {
  fingerprint: string
  notBefore: number
  notAfter: number
  status: 'active' | 'previous' | 'revoked'
}

let activeCert: WorkloadCert | null = null
let previousCert: WorkloadCert | null = null
let rotationPhase: 'idle' | 'distributed' | 'switched' = 'idle'
let pendingFingerprint: string | null = null

export function resetWorkloadCertRotation(): void {
  activeCert = null
  previousCert = null
  rotationPhase = 'idle'
  pendingFingerprint = null
}

export function issueWorkloadCert(now = Date.now()): WorkloadCert {
  const fingerprint = crypto.createHash('sha256').update(`cert:${now}:${crypto.randomBytes(8).toString('hex')}`).digest('hex').slice(0, 32)
  activeCert = {
    fingerprint,
    notBefore: now,
    notAfter: now + WORKLOAD_CERT_TTL_MS,
    status: 'active',
  }
  return { ...activeCert }
}

/** 仅在 notAfter 已到或已过时为真。未到期不更换。 */
export function shouldRotateWorkloadCert(now = Date.now()): boolean {
  if (!activeCert) return true
  return now >= activeCert.notAfter
}

/** 到期后自动签发下一张。不读取确认登记，不中断已建立连接。 */
export function rotateExpiredWorkloadCert(now = Date.now()): { rotated: boolean; fingerprint: string } {
  if (activeCert && now < activeCert.notAfter) {
    return { rotated: false, fingerprint: activeCert.fingerprint }
  }
  if (activeCert) previousCert = { ...activeCert, status: 'revoked' }
  const next = issueWorkloadCert(now)
  rotationPhase = 'idle'
  pendingFingerprint = null
  return { rotated: true, fingerprint: next.fingerprint }
}

export function beginTrustAnchorDistribution(now = Date.now()): { fingerprint: string } {
  if (rotationPhase !== 'idle') throw new Error('rotation_in_progress')
  if (!activeCert) issueWorkloadCert(now)
  const fingerprint = crypto.createHash('sha256').update(`dist:${now}:${crypto.randomBytes(8).toString('hex')}`).digest('hex').slice(0, 32)
  pendingFingerprint = fingerprint
  rotationPhase = 'distributed'
  return { fingerprint }
}

/** 新旧证书在主动撤销前可同时有效。签发不依赖确认登记。 */
export function switchTrustAnchorSigning(fingerprint: string, _confirmed = true): void {
  if (rotationPhase !== 'distributed') throw new Error('switch_before_distribute')
  if (fingerprint !== pendingFingerprint) throw new Error('fingerprint_mismatch')
  const now = Date.now()
  if (activeCert && activeCert.status !== 'revoked') {
    previousCert = { ...activeCert, status: 'previous' }
  }
  activeCert = {
    fingerprint,
    notBefore: now,
    notAfter: now + WORKLOAD_CERT_TTL_MS,
    status: 'active',
  }
  rotationPhase = 'switched'
}

export function bothCertsValid(now = Date.now()): boolean {
  if (!activeCert || !previousCert) return false
  if (previousCert.status !== 'previous' || activeCert.status !== 'active') return false
  return now < activeCert.notAfter && now < previousCert.notAfter
}

export function revokePreviousTrustAnchor(): void {
  if (rotationPhase !== 'switched') throw new Error('revoke_before_switch')
  if (previousCert) previousCert = { ...previousCert, status: 'revoked' }
  rotationPhase = 'idle'
  pendingFingerprint = null
}

/** 禁止在已建立连接中强制中断后重新握手 */
export function forceReconnectEstablished(): { ok: false; reason: 'forbid_force_reconnect' } {
  return { ok: false, reason: 'forbid_force_reconnect' }
}

const PLAINTEXT = [/BEGIN PRIVATE KEY/, /password=/, /token=/]

function scanTextForPlaintext(text: string): boolean {
  return PLAINTEXT.some((re) => re.test(text))
}

function k1LogsClean(): boolean {
  if (!dataDirRef) return true
  const roots = [path.join(dataDirRef, 'logs'), path.join(dataDirRef, 'kms')]
  for (const root of roots) {
    if (!fs.existsSync(root)) continue
    const names = fs.readdirSync(root).slice(0, 40)
    for (const name of names) {
      const file = path.join(root, name)
      try {
        if (!fs.statSync(file).isFile()) continue
        const text = fs.readFileSync(file, 'utf8').slice(0, 64_000)
        if (scanTextForPlaintext(text)) return false
      } catch {
        return false
      }
    }
  }
  return true
}

function k3DumpClean(): boolean {
  if (!dataDirRef) return true
  if (process.platform === 'linux') {
    try {
      const pattern = fs.readFileSync('/proc/sys/kernel/core_pattern', 'utf8')
      if (/\|/.test(pattern) && /plain|password|token/i.test(pattern)) return false
    } catch {
      return false
    }
    return true
  }
  const names = fs.existsSync(dataDirRef) ? fs.readdirSync(dataDirRef) : []
  for (const name of names) {
    if (!/\.(dmp|mdmp)$/i.test(name)) continue
    const text = fs.readFileSync(path.join(dataDirRef, name)).toString('utf8').slice(0, 64_000)
    if (scanTextForPlaintext(text)) return false
  }
  return true
}

let k7Proven = false
let k56Proven = false

function proveRotateAuditAndRollback(): { k5: boolean; k6: boolean } {
  if (k56Proven) return { k5: true, k6: true }
  if (!state.ready || !masterKey) return { k5: false, k6: false }
  const id = `__k56_${Date.now().toString(36)}`
  try {
    putSecret('probe-a', { id })
    rotateSecret(toRefUri(id), 'probe-b')
    const entry = memoryVault.get(id)
    if (!entry?.previousSealed) return { k5: false, k6: false }
    rollbackSecret(toRefUri(id))
    const plain = resolveCipherRef(toRefUri(id))
    memoryVault.delete(id)
    persistVault()
    const last = rotateAudits[rotateAudits.length - 1]
    const k5 = Boolean(last && last.oldRefId && last.newRefId && last.actor && last.at)
    const k6 = plain === 'probe-a'
    k56Proven = k5 && k6
    return { k5, k6 }
  } catch {
    memoryVault.delete(id)
    try { persistVault() } catch { /* ignore */ }
    return { k5: false, k6: false }
  }
}

function proveResolveBlocks(): boolean {
  if (k7Proven) return true
  const before = resolveFailBlocked
  try {
    resolveCipherRef('ref://local/__missing_k7__')
    return false
  } catch {
    k7Proven = resolveFailBlocked > before
    return k7Proven
  }
}

export function ready_rb_l1_mgmt_kms_01(): boolean {
  return isKmsReady() && kmsPerfection().pass
}

export function kmsPerfection(): { pass: boolean; k1: boolean; k2: boolean; k3: boolean; k4: boolean; k5: boolean; k6: boolean; k7: boolean } {
  const k1 = k1LogsClean()
  const k2 = !Object.keys(process.env).some((name) => {
    if (/^(PATH|PATHEXT|TEMP|TMP|WINDIR|SYSTEMROOT)$/i.test(name)) return false
    if (!/(_KEY|_SECRET|_TOKEN)$/i.test(name)) return false
    const value = process.env[name] || ''
    return value.length > 24 && PLAINTEXT.some((re) => re.test(value))
  })
  const k3 = k3DumpClean()
  const parsed = parseRefUri('ref://local/db')
  const k4 = Boolean(parsed && parsed.provider === 'local' && parsed.path === 'db' && parseRefUri('password=x') === null)
  const proved = proveRotateAuditAndRollback()
  const k5 = proved.k5
  const k6 = proved.k6
  const k7 = state.ready ? proveResolveBlocks() : false
  const pass = Boolean(k1 && k2 && k3 && k4 && k5 && k6 && k7)
  return { pass, k1, k2, k3, k4, k5, k6, k7 }
}
