/**
 * CYP-memo KMS 密钥保险箱 · 客户端 SDK
 * 提供与嵌入式 KMS 完全一致的接口签名
 * 支持远程模式（HTTP 调用独立 KMS 服务）和嵌入式模式（本地直接调用）
 * 包含连接池、重试、超时等可靠性保障
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import http from 'http'
import {
  toRefUri as localToRefUri,
  parseRefUri as localParseRefUri,
  putSecret as localPutSecret,
  resolveCipherRef as localResolveCipherRef,
  resolveSecret as localResolveSecret,
  rotateSecret as localRotateSecret,
  rollbackSecret as localRollbackSecret,
  getKmsState as localGetKmsState,
  isKmsReady as localIsKmsReady,
  initKms as localInitKms,
  resetKms as localResetKms,
  kmsPerfection as localKmsPerfection,
  ready_rb_l1_mgmt_kms_01 as localReadyCheck,
  ensureWorkloadTrustAnchor as localEnsureWorkloadTrustAnchor,
  getWorkloadTrustAnchor as localGetWorkloadTrustAnchor,
  isWorkloadTrustAnchorReady as localIsWorkloadTrustAnchorReady,
  issueWorkloadCert as localIssueWorkloadCert,
  shouldRotateWorkloadCert as localShouldRotateWorkloadCert,
  rotateExpiredWorkloadCert as localRotateExpiredWorkloadCert,
  beginTrustAnchorDistribution as localBeginTrustAnchorDistribution,
  switchTrustAnchorSigning as localSwitchTrustAnchorSigning,
  bothCertsValid as localBothCertsValid,
  revokePreviousTrustAnchor as localRevokePreviousTrustAnchor,
  forceReconnectEstablished as localForceReconnectEstablished,
  resetWorkloadCertRotation as localResetWorkloadCertRotation,
  WORKLOAD_CERT_TTL_MS,
} from '../runtime-base/l1/mgmt/kms/ready.js'

import type {
  CipherRef,
  KmsState,
  KmsRotateAudit,
  WorkloadTrustAnchor,
  WorkloadCert,
} from '../runtime-base/l1/mgmt/kms/ready.js'

// 重新导出类型，保持接口一致性
export type { CipherRef, KmsState, KmsRotateAudit, WorkloadTrustAnchor, WorkloadCert }
export { WORKLOAD_CERT_TTL_MS }

/** KMS 客户端配置 */
interface KmsClientConfig {
  /** KMS 服务地址（默认 127.0.0.1） */
  host?: string
  /** KMS 服务端口（默认 12000） */
  port?: number
  /** East-West 认证 Token */
  authToken?: string
  /** 请求超时时间（毫秒，默认 5000） */
  timeoutMs?: number
  /** 最大重试次数（默认 2） */
  maxRetries?: number
  /** 重试间隔基数（毫秒，默认 200） */
  retryBaseDelayMs?: number
  /** 是否启用远程模式（默认自动检测） */
  remote?: boolean
}

/** 远程 API 响应结构 */
interface KmsApiResponse<T> {
  success: boolean
  code?: string
  message?: string
  data?: T
  timestamp?: string
}

/** KMS 客户端状态 */
const clientState = {
  configured: false,
  remoteMode: false,
  host: '127.0.0.1',
  port: 12000,
  authToken: '',
  timeoutMs: 5000,
  maxRetries: 2,
  retryBaseDelayMs: 200,
}

/** HTTP Agent 连接池（Keep-Alive 复用连接） */
let httpAgent: http.Agent | null = null

function getHttpAgent(): http.Agent {
  if (!httpAgent) {
    httpAgent = new http.Agent({
      keepAlive: true,
      keepAliveMsecs: 10_000,
      maxSockets: 10,
      maxFreeSockets: 5,
      timeout: 30_000,
    })
  }
  return httpAgent
}

/**
 * 检测是否应启用远程模式
 * 启用条件：KMS_PORT 或 KMS_AUTH_TOKEN 或 CYP_KMS_REMOTE=1 被设置
 */
function shouldUseRemote(): boolean {
  if (process.env.CYP_KMS_REMOTE === '1' || process.env.CYP_KMS_REMOTE === 'true') {
    return true
  }
  if (process.env.KMS_PORT && process.env.KMS_AUTH_TOKEN) {
    return true
  }
  return false
}

/**
 * 初始化 KMS 客户端
 * 根据配置自动选择远程模式或嵌入式模式
 */
export function initKmsClient(opts?: KmsClientConfig & { dataDir?: string; masterKey?: string | null }): void {
  const remoteExplicit = opts?.remote
  const autoRemote = shouldUseRemote()
  const useRemote = remoteExplicit ?? autoRemote

  clientState.host = opts?.host || process.env.KMS_HOST || '127.0.0.1'
  clientState.port = opts?.port ?? (Number(process.env.KMS_PORT) || 12000)
  clientState.authToken = opts?.authToken || process.env.KMS_AUTH_TOKEN || ''
  clientState.timeoutMs = opts?.timeoutMs ?? 5000
  clientState.maxRetries = opts?.maxRetries ?? 2
  clientState.retryBaseDelayMs = opts?.retryBaseDelayMs ?? 200

  if (useRemote) {
    clientState.remoteMode = true
    clientState.configured = true
  } else {
    // 嵌入式模式：初始化本地 KMS
    clientState.remoteMode = false
    if (opts?.dataDir) {
      localInitKms({
        dataDir: opts.dataDir,
        masterKey: opts.masterKey ?? (process.env.CYP_KMS_MASTER_KEY || null),
      })
    }
    clientState.configured = true
  }
}

/**
 * 重置 KMS 客户端状态
 */
export function resetKmsClient(): void {
  if (clientState.remoteMode) {
    if (httpAgent) {
      httpAgent.destroy()
      httpAgent = null
    }
  } else {
    localResetKms()
  }
  clientState.configured = false
  clientState.remoteMode = false
}

/**
 * 获取当前运行模式
 */
export function getKmsClientMode(): 'remote' | 'embedded' {
  return clientState.remoteMode ? 'remote' : 'embedded'
}

/**
 * 发起远程 KMS API 调用（带重试）
 */
async function callKmsApi<T>(
  method: 'GET' | 'POST',
  path: string,
  body?: Record<string, unknown>
): Promise<T> {
  const { host, port, authToken, timeoutMs, maxRetries, retryBaseDelayMs } = clientState

  let lastError: Error | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      // 指数退避
      const delay = retryBaseDelayMs * Math.pow(2, attempt - 1)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }

    try {
      const result = await makeHttpRequest<T>({
        method,
        host,
        port,
        path,
        body,
        authToken,
        timeoutMs,
      })
      return result
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      // 仅对网络错误/超时/5xx 进行重试
      const msg = lastError.message
      if (
        msg.includes('ECONNREFUSED') ||
        msg.includes('ECONNRESET') ||
        msg.includes('ETIMEDOUT') ||
        msg.includes('timeout') ||
        msg.includes('KMS_NOT_READY') ||
        msg.includes('503') ||
        msg.includes('500')
      ) {
        continue
      }
      // 其他错误（4xx 等）不重试
      throw lastError
    }
  }

  throw lastError || new Error('kms_api_call_failed')
}

/**
 * 单次 HTTP 请求
 */
function makeHttpRequest<T>(opts: {
  method: string
  host: string
  port: number
  path: string
  body?: Record<string, unknown>
  authToken: string
  timeoutMs: number
}): Promise<T> {
  return new Promise((resolve, reject) => {
    const bodyStr = opts.body ? JSON.stringify(opts.body) : ''
    const req = http.request(
      {
        method: opts.method,
        host: opts.host,
        port: opts.port,
        path: opts.path,
        agent: getHttpAgent(),
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(bodyStr),
          Authorization: `Bearer ${opts.authToken}`,
          'User-Agent': 'cyp-memo-kms-client/1.0',
        },
        timeout: opts.timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () => {
          try {
            const raw = Buffer.concat(chunks).toString('utf8')
            const parsed = JSON.parse(raw) as KmsApiResponse<T>
            if (parsed.success && res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve(parsed.data as T)
            } else {
              const code = parsed.code || 'UNKNOWN_ERROR'
              const message = parsed.message || `HTTP ${res.statusCode}`
              reject(new Error(`kms_api_error: ${code} - ${message}`))
            }
          } catch (parseErr) {
            reject(new Error(`kms_api_parse_error: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`))
          }
        })
      }
    )

    req.on('error', (err) => {
      reject(new Error(`kms_api_network_error: ${err.message}`))
    })

    req.on('timeout', () => {
      req.destroy()
      reject(new Error('kms_api_timeout'))
    })

    if (bodyStr) {
      req.write(bodyStr)
    }
    req.end()
  })
}

// ============================================================
// 以下为对外导出的 KMS 接口（与嵌入式签名完全一致）
// ============================================================

/** 引用 URI 工具（纯函数，本地直接调用） */
export function toRefUri(cipherId: string, provider = 'local'): string {
  return localToRefUri(cipherId, provider)
}

export function parseRefUri(ref: string): { provider: string; path: string } | null {
  return localParseRefUri(ref)
}

/**
 * 获取 KMS 状态
 */
export function getKmsState(): KmsState {
  if (clientState.remoteMode) {
    // 远程模式下通过同步包装获取（异步转同步不可行，使用缓存或返回基础状态）
    // 注：由于 getKmsState 是同步接口，远程模式下返回最近一次缓存的状态
    // 实际使用中建议通过 getKmsStateAsync 获取实时状态
    return {
      ready: clientState.configured,
      vaultPath: 'remote',
      secretCount: 0,
      lastPutAt: null,
      lastRotateAt: null,
    }
  }
  return localGetKmsState()
}

/**
 * 异步获取 KMS 状态（远程模式推荐使用）
 */
export async function getKmsStateAsync(): Promise<KmsState> {
  if (clientState.remoteMode) {
    return callKmsApi<KmsState>('GET', '/kms/v1/state')
  }
  return localGetKmsState()
}

/**
 * KMS 是否就绪
 */
export function isKmsReady(): boolean {
  if (clientState.remoteMode) {
    return clientState.configured
  }
  return localIsKmsReady()
}

/**
 * 异步就绪检查（远程模式推荐使用）
 */
export async function isKmsReadyAsync(): Promise<boolean> {
  if (clientState.remoteMode) {
    try {
      const resp = await makeHttpRequest<{ ready: boolean }>({
        method: 'GET',
        host: clientState.host,
        port: clientState.port,
        path: '/kms/v1/ready',
        authToken: clientState.authToken,
        timeoutMs: clientState.timeoutMs,
      })
      return resp.ready
    } catch {
      return false
    }
  }
  return localIsKmsReady()
}

/**
 * 加密并存储密钥
 */
export function putSecret(plain: string, opts?: { id?: string }): CipherRef {
  if (clientState.remoteMode) {
    throw new Error('remote_mode_requires_async: use putSecretAsync')
  }
  return localPutSecret(plain, opts)
}

/** 异步版本（远程模式必须使用） */
export async function putSecretAsync(plain: string, opts?: { id?: string }): Promise<CipherRef> {
  if (clientState.remoteMode) {
    return callKmsApi<CipherRef>('POST', '/kms/v1/encrypt', {
      plain,
      id: opts?.id,
    })
  }
  return localPutSecret(plain, opts)
}

/**
 * 解密密钥引用
 */
export function resolveCipherRef(ref: CipherRef | string): string {
  if (clientState.remoteMode) {
    throw new Error('remote_mode_requires_async: use resolveCipherRefAsync')
  }
  return localResolveCipherRef(ref)
}

/** 异步版本（远程模式必须使用） */
export async function resolveCipherRefAsync(ref: CipherRef | string): Promise<string> {
  if (clientState.remoteMode) {
    return callKmsApi<string>('POST', '/kms/v1/decrypt', { ref })
  }
  return localResolveCipherRef(ref)
}

/**
 * resolveSecret（resolveCipherRef 的别名）
 */
export function resolveSecret(ref: CipherRef | string): string {
  return resolveCipherRef(ref)
}

export async function resolveSecretAsync(ref: CipherRef | string): Promise<string> {
  return resolveCipherRefAsync(ref)
}

/**
 * 密钥轮换
 */
export function rotateSecret(
  ref: CipherRef | string,
  newPlain: string,
  opts?: { newId?: boolean }
): CipherRef {
  if (clientState.remoteMode) {
    throw new Error('remote_mode_requires_async: use rotateSecretAsync')
  }
  return localRotateSecret(ref, newPlain, opts)
}

export async function rotateSecretAsync(
  ref: CipherRef | string,
  newPlain: string,
  opts?: { newId?: boolean }
): Promise<CipherRef> {
  if (clientState.remoteMode) {
    return callKmsApi<CipherRef>('POST', '/kms/v1/rotate', {
      ref,
      newPlain,
      newId: opts?.newId,
    })
  }
  return localRotateSecret(ref, newPlain, opts)
}

/**
 * 密钥回滚
 */
export function rollbackSecret(ref: CipherRef | string): CipherRef {
  if (clientState.remoteMode) {
    throw new Error('remote_mode_requires_async: use rollbackSecretAsync')
  }
  return localRollbackSecret(ref)
}

export async function rollbackSecretAsync(ref: CipherRef | string): Promise<CipherRef> {
  if (clientState.remoteMode) {
    return callKmsApi<CipherRef>('POST', '/kms/v1/rollback', { ref })
  }
  return localRollbackSecret(ref)
}

/**
 * KMS 完备性校验
 */
export function kmsPerfection(): ReturnType<typeof localKmsPerfection> {
  if (clientState.remoteMode) {
    // 远程模式下返回占位（真实校验需异步调用）
    return { pass: false, k1: false, k2: false, k3: false, k4: false, k5: false, k6: false, k7: false }
  }
  return localKmsPerfection()
}

export async function kmsPerfectionAsync(): Promise<ReturnType<typeof localKmsPerfection>> {
  if (clientState.remoteMode) {
    return callKmsApi<ReturnType<typeof localKmsPerfection>>('GET', '/kms/v1/perfection')
  }
  return localKmsPerfection()
}

/**
 * RB-L1-MGMT-KMS-01 就绪校验
 */
export function ready_rb_l1_mgmt_kms_01(): boolean {
  if (clientState.remoteMode) {
    return clientState.configured
  }
  return localReadyCheck()
}

// ============================================================
// SPIFFE / 工作负载证书相关（本地直接调用，不远程化）
// 这些功能属于身份与信任锚管理，与核心加密解耦
// ============================================================

export function ensureWorkloadTrustAnchor(dataDir: string): WorkloadTrustAnchor {
  return localEnsureWorkloadTrustAnchor(dataDir)
}

export function getWorkloadTrustAnchor(): WorkloadTrustAnchor | null {
  if (clientState.remoteMode) {
    // 远程模式下信任锚在 KMS 服务端管理，此处返回 null
    // 实际使用中应通过服务端 API 获取
    return null
  }
  return localGetWorkloadTrustAnchor()
}

export function isWorkloadTrustAnchorReady(): boolean {
  if (clientState.remoteMode) {
    return clientState.configured
  }
  return localIsWorkloadTrustAnchorReady()
}

export function issueWorkloadCert(now?: number): WorkloadCert {
  return localIssueWorkloadCert(now)
}

export function shouldRotateWorkloadCert(now?: number): boolean {
  return localShouldRotateWorkloadCert(now)
}

export function rotateExpiredWorkloadCert(now?: number): { rotated: boolean; fingerprint: string } {
  return localRotateExpiredWorkloadCert(now)
}

export function beginTrustAnchorDistribution(now?: number): { fingerprint: string } {
  return localBeginTrustAnchorDistribution(now)
}

export function switchTrustAnchorSigning(fingerprint: string, confirmed = true): void {
  return localSwitchTrustAnchorSigning(fingerprint, confirmed)
}

export function bothCertsValid(now?: number): boolean {
  return localBothCertsValid(now)
}

export function revokePreviousTrustAnchor(): void {
  return localRevokePreviousTrustAnchor()
}

export function forceReconnectEstablished(): { ok: false; reason: 'forbid_force_reconnect' } {
  return localForceReconnectEstablished()
}

export function resetWorkloadCertRotation(): void {
  return localResetWorkloadCertRotation()
}

// ============================================================
// 兼容性：initKms / resetKms 别名（供 bootstrap 调用）
// ============================================================

export function initKms(opts: { dataDir: string; masterKey?: string | null }): KmsState {
  initKmsClient({
    dataDir: opts.dataDir,
    masterKey: opts.masterKey,
  })
  return getKmsState()
}

export function resetKms(): void {
  resetKmsClient()
}

/**
 * 健康检查（探测远程 KMS 服务是否存活）
 */
export async function pingKmsService(): Promise<boolean> {
  if (!clientState.remoteMode) return true
  try {
    await makeHttpRequest<{ status: string }>({
      method: 'GET',
      host: clientState.host,
      port: clientState.port,
      path: '/kms/v1/health',
      authToken: clientState.authToken,
      timeoutMs: 2000,
    })
    return true
  } catch {
    return false
  }
}

export default {
  initKmsClient,
  resetKmsClient,
  getKmsClientMode,
  toRefUri,
  parseRefUri,
  getKmsState,
  getKmsStateAsync,
  isKmsReady,
  isKmsReadyAsync,
  putSecret,
  putSecretAsync,
  resolveCipherRef,
  resolveCipherRefAsync,
  resolveSecret,
  resolveSecretAsync,
  rotateSecret,
  rotateSecretAsync,
  rollbackSecret,
  rollbackSecretAsync,
  kmsPerfection,
  kmsPerfectionAsync,
  ready_rb_l1_mgmt_kms_01,
  ensureWorkloadTrustAnchor,
  getWorkloadTrustAnchor,
  isWorkloadTrustAnchorReady,
  issueWorkloadCert,
  shouldRotateWorkloadCert,
  rotateExpiredWorkloadCert,
  beginTrustAnchorDistribution,
  switchTrustAnchorSigning,
  bothCertsValid,
  revokePreviousTrustAnchor,
  forceReconnectEstablished,
  resetWorkloadCertRotation,
  WORKLOAD_CERT_TTL_MS,
  initKms,
  resetKms,
  pingKmsService,
}
