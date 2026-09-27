/**
 * 公开接入安全（公开子平台 · B9.3）+ 零信任守卫
 * 专属：对外传输策略、公开面来源地址允许名单、拒绝留痕。
 * 写请求一次性键由 idempotency-service（前端安全防护）强制，本模块验收时联检，不另建防重栈。
 * 红线：不因网络位置放行业务接口；不信任 X-Forwarded-For 作身份；不替代前端安全防护。
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import type { NextFunction, Request, Response } from 'express'
import { fail, Err } from '../../mgmt/code/ready.js'
import { log as log } from '../../../l0/infra/log/ready.js'
import { recordChainMark } from '../../mgmt/trace/ready.js'

const PUBLIC_PREFIXES = ['/api/public/', '/api/auth/login', '/api/auth/register']

export interface ZeroTrustStatus {
  principle: '永不信任，始终验证'
  networkLocationTrusted: false
  publicAllowlistEnabled: boolean
  publicAllowlistSize: number
  /** 生产公开面是否要求 TLS（含反向代理 X-Forwarded-Proto） */
  publicTlsRequired: boolean
  /** 本机环回 HTTP 是否豁免（嵌入式联调） */
  loopbackHttpExempt: boolean
}

export type PublicAccessDenyReason = 'allowlist' | 'tls_required'

export interface PublicAccessVerdict {
  ok: boolean
  reason?: PublicAccessDenyReason
  clientIp: string
  secure: boolean
  allowlistEnabled: boolean
}

let denyLogCount = 0

function clientIpFromRequest(req: Request): string {
  const raw = req.socket?.remoteAddress || ''
  if (raw.startsWith('::ffff:')) return raw.slice('::ffff:'.length)
  if (raw === '::1') return '127.0.0.1'
  return raw
}

function parseAllowlist(): string[] {
  const raw = (process.env.CYP_PUBLIC_IP_ALLOWLIST || '').trim()
  if (!raw) return []
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function isLoopback(ip: string): boolean {
  return ip === '127.0.0.1' || ip === '::1' || ip === 'localhost'
}

/**
 * TLS 策略：
 * - CYP_PUBLIC_REQUIRE_TLS=0 → 不强制
 * - CYP_PUBLIC_REQUIRE_TLS=1 → 强制（环回可用 CYP_PUBLIC_ALLOW_INSECURE_LOOPBACK=1 豁免）
 * - 未设置且 APP_ENV=prod → 强制，但环回豁免（嵌入式本机联调）
 */
export function isPublicTlsRequired(): boolean {
  const flag = (process.env.CYP_PUBLIC_REQUIRE_TLS || '').trim()
  if (flag === '0') return false
  if (flag === '1') return true
  return (process.env.APP_ENV || '').trim() === 'prod'
}

export function isLoopbackHttpExempt(): boolean {
  if ((process.env.CYP_PUBLIC_ALLOW_INSECURE_LOOPBACK || '').trim() === '1') return true
  const flag = (process.env.CYP_PUBLIC_REQUIRE_TLS || '').trim()
  // 显式强制 TLS 且未开环回豁免 → 不豁免
  if (flag === '1') return false
  return true
}

export function isRequestSecure(req: Request): boolean {
  if (req.secure) return true
  const proto = String(req.headers['x-forwarded-proto'] || '')
    .split(',')[0]
    .trim()
    .toLowerCase()
  return proto === 'https'
}

export function isPublicSurface(path: string): boolean {
  return PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(p))
}

export function getZeroTrustStatus(): ZeroTrustStatus {
  const list = parseAllowlist()
  return {
    principle: '永不信任，始终验证',
    networkLocationTrusted: false,
    publicAllowlistEnabled: list.length > 0,
    publicAllowlistSize: list.length,
    publicTlsRequired: isPublicTlsRequired(),
    loopbackHttpExempt: isLoopbackHttpExempt(),
  }
}

export function evaluatePublicAccess(input: {
  path: string
  clientIp: string
  secure: boolean
  allowlist?: string[]
}): PublicAccessVerdict {
  const clientIp = input.clientIp || ''
  const allowlist = input.allowlist ?? parseAllowlist()
  const allowlistEnabled = allowlist.length > 0
  const base: PublicAccessVerdict = {
    ok: true,
    clientIp,
    secure: input.secure,
    allowlistEnabled,
  }
  if (!isPublicSurface(input.path)) return base

  if (isPublicTlsRequired()) {
    const exempt = isLoopbackHttpExempt() && isLoopback(clientIp)
    if (!input.secure && !exempt) {
      return { ...base, ok: false, reason: 'tls_required' }
    }
  }

  if (allowlistEnabled && !allowlist.includes(clientIp)) {
    return { ...base, ok: false, reason: 'allowlist' }
  }
  return base
}

function recordPublicDeny(verdict: PublicAccessVerdict, path: string): void {
  denyLogCount += 1
  const traceId = `pubdeny_${Date.now().toString(36)}`
  log({
    level: 'warn',
    type: 'audit',
    message: `公开面拒绝：${verdict.reason}`,
    action: 'public_access_deny',
    traceId,
    context: {
      path,
      reason: verdict.reason,
      clientIp: verdict.clientIp,
      secure: verdict.secure,
      allowlistEnabled: verdict.allowlistEnabled,
    },
  })
  recordChainMark('public_deny', `${verdict.reason}:${verdict.clientIp}:${path}`, traceId)
}

export function getPublicAccessDenyLogCount(): number {
  return denyLogCount
}

export function isPublicAccessSecurityReady(): boolean {
  const st = getZeroTrustStatus()
  const tlsPolicyDefined =
    (process.env.CYP_PUBLIC_REQUIRE_TLS || '').trim() === '0' ||
    (process.env.CYP_PUBLIC_REQUIRE_TLS || '').trim() === '1' ||
    (process.env.APP_ENV || '').trim() === 'prod'
  return Boolean(tlsPolicyDefined && st.networkLocationTrusted === false)
}

/**
 * 探针：名单启用后拒绝名单外；拒绝进入全链路日志；TLS 策略可核验。
 * 写防重归属前端安全防护，不在本服务就绪条件里。
 * 不改进程环境变量，用注入名单模拟。
 */
export function runPublicAccessProbe(): {
  allowlistDeny: boolean
  denyLogged: boolean
  tlsPolicyDefined: boolean
  loopbackExemptUnderDefaultProd: boolean
} {
  const before = denyLogCount
  const verdict = evaluatePublicAccess({
    path: '/api/public/shares/probe/access',
    clientIp: '127.0.0.1',
    secure: false,
    allowlist: ['203.0.113.9'],
  })
  if (!verdict.ok) recordPublicDeny(verdict, '/api/public/shares/probe/access')
  const nonLoopbackInsecure = evaluatePublicAccess({
    path: '/api/auth/login',
    clientIp: '203.0.113.50',
    secure: false,
    allowlist: [],
  })
  const tlsExplicitOff = (process.env.CYP_PUBLIC_REQUIRE_TLS || '').trim() === '0'
  const tlsPolicyDefined =
    tlsExplicitOff ||
    (nonLoopbackInsecure.ok === false && nonLoopbackInsecure.reason === 'tls_required') ||
    isPublicTlsRequired()
  return {
    allowlistDeny: verdict.ok === false && verdict.reason === 'allowlist',
    denyLogged: denyLogCount > before,
    tlsPolicyDefined,
    loopbackExemptUnderDefaultProd: isPublicTlsRequired() && isLoopbackHttpExempt(),
  }
}

/**
 * 挂在业务路由之前。
 * - 不读取、不信任 X-Forwarded-For 作为身份
 * - 允许名单仅作用于公开面；业务接口仍必须走身份访问管控
 */
export function zeroTrustGuard(req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-CYP-Zero-Trust', 'always-verify')
  if (!isPublicSurface(req.path)) {
    next()
    return
  }
  const verdict = evaluatePublicAccess({
    path: req.path,
    clientIp: clientIpFromRequest(req),
    secure: isRequestSecure(req),
  })
  if (verdict.ok) {
    next()
    return
  }
  recordPublicDeny(verdict, req.path)
  if (verdict.reason === 'tls_required') {
    fail(res, 403, Err.FORBIDDEN, '公开面拒绝：生产传输须加密（TLS / X-Forwarded-Proto=https）', req)
    return
  }
  fail(res, 403, Err.FORBIDDEN, '公开面拒绝：来源地址不在允许名单', req)
}

export function ready_rb_l1_pub_acc_01(): boolean {
  return isPublicAccessSecurityReady()
}
