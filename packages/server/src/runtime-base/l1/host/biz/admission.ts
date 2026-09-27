/**
 * 安全准入网关子中心 · 协调层（不重实现 IAM / PUB-ACC / FESEC）
 * 只定义跨模块准入顺序、信任链与拒绝口径说明。
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

export type AdmissionStepId =
  | 'kill_switch'
  | 'xff_trust'
  | 'client_version'
  | 'api_budget'
  | 'perf_shed'
  | 'ingress_slot'
  | 'auth_session'
  | 'login_challenge'

/** 门面推荐执行顺序（安全准入网关子中心口径） */
export const ADMISSION_ORDER: readonly AdmissionStepId[] = [
  'kill_switch',
  'xff_trust',
  'api_budget',
  'perf_shed',
  'ingress_slot',
  'client_version',
  'auth_session',
  'login_challenge',
] as const

export interface XffTrustPolicy {
  /** 信任的代理跳数；0=不信任 XFF，仅用 socket */
  trustedHops: number
  /** 缺省取环境 CYP_XFF_TRUSTED_HOPS，否则 1 */
  source: 'env' | 'default'
}

export function getXffTrustPolicy(): XffTrustPolicy {
  const raw = process.env.CYP_XFF_TRUSTED_HOPS
  if (raw == null || raw === '') return { trustedHops: 1, source: 'default' }
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return { trustedHops: 1, source: 'default' }
  return { trustedHops: Math.floor(n), source: 'env' }
}

/**
 * 按信任跳数解析客户端 IP（协调口径；由门面调用）。
 * 从右侧剥掉 trustedHops 个可信代理后，取剩余链最右一跳（业界「最右侧非可信」）。
 * trustedHops=0 → 忽略 XFF，仅用 socket。
 */
export function resolveClientIpFromHeaders(opts: {
  xForwardedFor?: string
  fallbackIp?: string
}): { ip: string; via: 'xff' | 'socket' | 'unknown' } {
  const policy = getXffTrustPolicy()
  const fb = (opts.fallbackIp || '').trim() || 'unknown'
  if (policy.trustedHops <= 0) {
    return { ip: fb, via: fb === 'unknown' ? 'unknown' : 'socket' }
  }
  const xff = String(opts.xForwardedFor || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (xff.length === 0) {
    return { ip: fb, via: fb === 'unknown' ? 'unknown' : 'socket' }
  }
  // 右侧 trustedHops 为代理；客户端 = length - trustedHops - 1（不足则取最左）
  const idx = Math.max(0, xff.length - policy.trustedHops - 1)
  return { ip: xff[idx], via: 'xff' }
}

export function describeAdmissionOwnership(): Record<
  AdmissionStepId,
  { owner: string; note: string }
> {
  return {
    kill_switch: { owner: 'MGMT-IAM/governance', note: '门面只读，不改策略' },
    xff_trust: { owner: '安全准入网关子中心口径 + 门面执行', note: 'CYP_XFF_TRUSTED_HOPS' },
    client_version: { owner: 'HOST-BIZ 门面 mapClientAppVersion', note: '拒绝口径统一事件' },
    api_budget: { owner: 'MGMT-IAM consumeApiBudget', note: '车道 protectUser' },
    perf_shed: { owner: 'MGMT-PERF 信号 + 门面执行', note: 'crisis 让路 ops' },
    ingress_slot: { owner: 'HOST-RESIL tryAcquireIngressSlot', note: '策略控制输出并发' },
    auth_session: { owner: 'MGMT-IAM', note: '安全准入不重实现' },
    login_challenge: { owner: 'MGMT-IAM', note: '安全准入只定何时要求' },
  }
}
