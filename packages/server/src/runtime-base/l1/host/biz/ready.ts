/**
 * CYP-memo 运行底座网关中心门面（嵌入式 · RB-L1-HOST-BIZ-01）
 * 南北向 + SPI + ClientMapper + canary；入站数据面见 lanes；出站归出站治理网关子中心（resil/egress）
 * 门面只读策略控制网关子中心规则，不内嵌 decideElasticity。
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import crypto from 'crypto'
import fs from 'fs'
import { database } from '../../../l0/infra/db/ready.js'
import { bindOrphanFilePurge, pipeEntityWrite } from '../acct/ready.js'
import { executeSaga } from '../sched/ready.js'
import { requestUserNotify } from '../../../../notify-service.js'
import type { Request, Response, NextFunction, RequestHandler } from 'express'
import { getGovernanceState, isKillSwitchActive, consumeApiBudget } from '../../mgmt/iam/ready.js'
import { listHealthyInstances, selectHealthyInstance, isServiceCallGranted } from '../../col/svc/ready.js'
import { log as log } from '../../../l0/infra/log/ready.js'
import { fail, Err } from '../../mgmt/code/ready.js'
import { publishDomainEvent, subscribeDomainEvent } from '../../col/evt/ready.js'
import { getReleaseState } from '../rel/ready.js'
import { tryAcquireIngressSlot, releaseIngressSlot } from '../resil/ready.js'
import { getPerfPressure } from '../../mgmt/perf/ready.js'
import { isUserBusinessRequest, isLongPollRequest } from './lanes.js'
import { resolveClientIpFromHeaders } from './admission.js'
import { resetAllCircuits } from '../resil/egress.js'

export {
  isUserBusinessRequest,
  isLongPollRequest,
  resolveIngressDataLane,
  USER_LANE_PATH_ROOTS,
  OPS_LANE_FORCE_PATHS,
} from './lanes.js'
export {
  ADMISSION_ORDER,
  getXffTrustPolicy,
  resolveClientIpFromHeaders,
  describeAdmissionOwnership,
} from './admission.js'
export {
  egressFetch,
  resetCircuit,
  forceOpen,
  forceClose,
  getCircuitState,
  getCircuitDetail,
  listCircuitSnapshot,
  listCircuitSnapshotDetail,
  resetAllCircuits,
} from '../resil/egress.js'

export interface GatewayState {
  ready: boolean
  serviceName: string
  canaryWeight: number
  /** @deprecated 出站电路改由出站治理网关子中心 listCircuitSnapshot；保留兼容字段 */
  circuitOpen: Record<string, boolean>
}

const state: GatewayState = {
  ready: false,
  serviceName: 'cyp-memo-server',
  canaryWeight: 0,
  circuitOpen: {},
}

const SPI_SECRET = process.env.CYP_SPI_SECRET || 'cyp-memo-spi-embedded'
const spiWhitelist = new Set<string>()

/** RateLimitTriggered 去重：同 key 冷却内不重复发 */
const rateLimitEventAt = new Map<string, number>()
const RATE_LIMIT_EVENT_DEDUP_MS = 5_000

function publishRateLimitOnce(key: string, limit: number): void {
  const now = Date.now()
  const prev = rateLimitEventAt.get(key) || 0
  if (now - prev < RATE_LIMIT_EVENT_DEDUP_MS) return
  rateLimitEventAt.set(key, now)
  publishDomainEvent('RateLimitTriggered', 2, { key, limit }, 'warn')
}

export function getGatewayState(): GatewayState {
  return { ...state, circuitOpen: { ...state.circuitOpen } }
}

export function isGatewayReady(): boolean {
  return state.ready
}

export function registerSpiCaller(moduleName: string): void {
  spiWhitelist.add(moduleName)
}

export function issueEastWestToken(opts: {
  caller: string
  callee: string
  ttlMs?: number
}): { token: string; expiresAt: number } {
  const ttl = opts.ttlMs ?? 60_000
  const expiresAt = Date.now() + ttl
  const payload = `${opts.caller}|${opts.callee}|${expiresAt}`
  const sig = crypto.createHmac('sha256', SPI_SECRET).update(payload).digest('hex')
  return { token: `${payload}|${sig}`, expiresAt }
}

export function assertEastWestToken(opts: {
  caller: string
  callee: string
  token: string
  maxSkewMs?: number
}): { ok: true } | { ok: false; code: 'E_EAST_WEST'; reason: string } {
  const parts = String(opts.token || '').split('|')
  if (parts.length !== 4) {
    publishDomainEvent('EastWestAuthFailed', 2, { caller: opts.caller, callee: opts.callee }, 'warn')
    return { ok: false, code: 'E_EAST_WEST', reason: 'malformed' }
  }
  const [caller, callee, expStr, sig] = parts
  const exp = Number(expStr)
  if (caller !== opts.caller || callee !== opts.callee) {
    publishDomainEvent('EastWestAuthFailed', 2, { caller: opts.caller, callee: opts.callee }, 'warn')
    return { ok: false, code: 'E_EAST_WEST', reason: 'mismatch' }
  }
  if (!Number.isFinite(exp) || Date.now() > exp + (opts.maxSkewMs ?? 0)) {
    publishDomainEvent('EastWestAuthFailed', 2, { caller: opts.caller, callee: opts.callee }, 'warn')
    return { ok: false, code: 'E_EAST_WEST', reason: 'expired' }
  }
  const expect = crypto
    .createHmac('sha256', SPI_SECRET)
    .update(`${caller}|${callee}|${exp}`)
    .digest('hex')
  if (expect !== sig) {
    publishDomainEvent('EastWestAuthFailed', 2, { caller: opts.caller, callee: opts.callee }, 'warn')
    return { ok: false, code: 'E_EAST_WEST', reason: 'bad_sig' }
  }
  if (spiWhitelist.size > 0 && !spiWhitelist.has(caller)) {
    publishDomainEvent('EastWestAuthFailed', 2, { caller: opts.caller, callee: opts.callee }, 'warn')
    return { ok: false, code: 'E_EAST_WEST', reason: 'not_whitelisted' }
  }
  return { ok: true }
}

export type ServiceRouteDenyReason = 'unregistered' | 'unauthorized'

export type ServiceRouteResult =
  | { ok: true; instanceId: string; serviceName: string; token: string }
  | { ok: false; reason: ServiceRouteDenyReason }

/**
 * 服务协作管控：内部调用必须同时过注册、健康实例选择与服务间授权。
 * 不替代业务协同对接（对外履约仍走业务路由表）。
 */
export function routeInternalService(opts: { caller: string; callee: string }): ServiceRouteResult {
  const callerName = String(opts.caller || '').trim()
  const calleeName = String(opts.callee || '').trim()
  if (listHealthyInstances(callerName).length === 0 || listHealthyInstances(calleeName).length === 0) {
    return { ok: false, reason: 'unregistered' }
  }
  if (!isServiceCallGranted(callerName, calleeName)) {
    publishDomainEvent(
      'EastWestAuthFailed',
      2,
      { caller: callerName, callee: calleeName, reason: 'no_grant' },
      'warn'
    )
    return { ok: false, reason: 'unauthorized' }
  }
  const instance = selectHealthyInstance(calleeName)
  if (!instance) return { ok: false, reason: 'unregistered' }
  const issued = issueEastWestToken({ caller: callerName, callee: calleeName })
  const checked = assertEastWestToken({
    caller: callerName,
    callee: calleeName,
    token: issued.token,
  })
  if (!checked.ok) return { ok: false, reason: 'unauthorized' }
  return {
    ok: true,
    instanceId: instance.instanceId,
    serviceName: instance.serviceName,
    token: issued.token,
  }
}

export function isServiceCollabReady(serviceName = state.serviceName): boolean {
  if (!state.ready) return false
  if (listHealthyInstances('gateway').length === 0) return false
  if (listHealthyInstances('probe-denied').length === 0) return false
  if (listHealthyInstances(serviceName).length === 0) return false
  if (!isServiceCallGranted('gateway', serviceName)) return false
  if (isServiceCallGranted('probe-denied', serviceName)) return false
  return true
}

export function mapClientAppVersion(appVersion: string | undefined): {
  slot: string
  minRequired: string
  rejected: boolean
} {
  const active = getReleaseState().activeVersion || '2.0.0'
  const minRequired = active.split('.')[0] + '.0.0'
  if (!appVersion || !String(appVersion).trim()) {
    return { slot: active, minRequired, rejected: false }
  }
  const major = Number(String(appVersion).split('.')[0])
  const minMajor = Number(minRequired.split('.')[0])
  const rejected = Number.isFinite(major) && Number.isFinite(minMajor) && major < minMajor
  return { slot: active, minRequired, rejected }
}

export function applyCanaryDecision(req: Request): { stained: boolean; bucket: number } {
  const bucket = Math.abs(hashStr(req.ip || req.headers['x-forwarded-for']?.toString() || 'x')) % 100
  const stained = bucket < state.canaryWeight
  return { stained, bucket }
}

function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return h
}

export function gatewayIngressMiddleware(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (isKillSwitchActive() || getGovernanceState().killSwitch) {
      return fail(res, 503, Err.KILL_SWITCH, '服务紧急停机', req)
    }

    const userBiz = isUserBusinessRequest(req.method, req.path)
    const longPoll = isLongPollRequest(req.path)
    const resolved = resolveClientIpFromHeaders({
      xForwardedFor:
        typeof req.headers['x-forwarded-for'] === 'string' ? req.headers['x-forwarded-for'] : undefined,
      fallbackIp: req.ip || req.socket.remoteAddress || 'unknown',
    })
    const clientIp = resolved.ip
    const budgetKey = `${clientIp}:${req.method}:${userBiz ? 'user' : 'ops'}`
    const budget = consumeApiBudget(budgetKey, undefined, { protectUser: userBiz })
    if (!budget.ok) {
      publishRateLimitOnce(budgetKey, budget.limit)
      return fail(res, 429, Err.RATE_LIMITED, userBiz ? '请求过于频繁' : '观测请求过于频繁，已让路', req)
    }

    const pressure = getPerfPressure()
    if (pressure.control === 'crisis' && !userBiz && !longPoll) {
      return fail(res, 503, Err.RATE_LIMITED, '性能危机：观测请求已暂停，业务操作仍放行', req)
    }

    const slot = tryAcquireIngressSlot({
      control: pressure.control,
      lane: longPoll ? 'longpoll' : userBiz ? 'user' : 'ops',
    })
    if (!slot.ok) {
      return fail(
        res,
        slot.shed ? 503 : 429,
        Err.RATE_LIMITED,
        slot.lane === 'user'
          ? `业务并发已满（${slot.limit}），请稍后重试`
          : slot.lane === 'longpoll'
            ? `长轮询并发已满（${slot.limit}），请稍后重试`
            : slot.shed
              ? `观测请求已降载：上限 ${slot.limit}`
              : `观测请求已让路：上限 ${slot.limit}`,
        req
      )
    }
    if (slot.enforced) {
      let released = false
      const release = () => {
        if (released) return
        released = true
        releaseIngressSlot(slot.lane)
      }
      res.on('finish', release)
      res.on('close', release)
    }

    if (state.ready) {
      const routed = routeInternalService({ caller: 'gateway', callee: state.serviceName })
      if (!routed.ok) {
        return fail(res, 503, Err.INTERNAL, `服务协作管控拒绝：${routed.reason}`, req)
      }
      res.setHeader('X-CYP-Service-Instance', routed.instanceId)
    }

    const appVersion =
      (req.headers['app-version'] as string | undefined) ||
      (req.headers['x-cyp-client-build'] as string | undefined)
    const mapped = mapClientAppVersion(appVersion)
    if (mapped.rejected) {
      publishDomainEvent(
        'ClientVersionRejected',
        2,
        {
          appVersion,
          minRequired: mapped.minRequired,
          minSupported: mapped.minRequired,
          platform: req.headers['x-cyp-platform'] || 'web',
        },
        'warn'
      )
      res.setHeader('x-cyp-min-version', mapped.minRequired)
      return res.status(426).json({
        success: false,
        code: 'CLIENT_VERSION_REJECTED',
        message: '请升级客户端',
        data: { minRequired: mapped.minRequired },
      })
    }

    const canary = applyCanaryDecision(req)
    if (canary.stained) res.setHeader('x-cyp-canary', '1')
    const stain = (req.headers['x-cyp-canary'] as string | undefined)?.trim()
    if (stain) res.setHeader('x-cyp-canary', stain)

    next()
  }
}

export function gatewayAccessLogMiddleware(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const started = Date.now()
    res.on('finish', () => {
      log({
        level: 'info',
        message: `${req.method} ${req.path} ${res.statusCode}`,
        type: 'access',
        action: 'gateway_access',
        context: {
          method: req.method,
          path: req.path,
          status: res.statusCode,
          durationMs: Date.now() - started,
          requestId: req.requestId,
          traceId: req.traceId,
        },
      })
    })
    next()
  }
}

export function wireGatewaySubscriptions(): void {
  subscribeDomainEvent('CanaryWeightChanged', async ev => {
    state.canaryWeight = Number(ev.payload.weight ?? 0)
  })
  subscribeDomainEvent('ReleaseCanaryWeightChanged', async ev => {
    state.canaryWeight = Number(ev.payload.canaryWeight ?? state.canaryWeight)
  })
  subscribeDomainEvent('ReleaseDesiredStateChanged', async ev => {
    if (typeof ev.payload.canaryWeight === 'number') {
      state.canaryWeight = Number(ev.payload.canaryWeight)
    }
  })
}

export function initGateway(opts?: { serviceName?: string }): GatewayState {
  state.serviceName = opts?.serviceName || 'cyp-memo-server'
  state.ready = true
  registerSpiCaller('bootstrap')
  registerSpiCaller('gateway')
  registerSpiCaller('schedule-service')
  registerSpiCaller('release-service')
  registerSpiCaller('MemoManager')
  registerSpiCaller('FileStorage')
  log({
    level: 'info',
    message: 'gateway ready',
    type: 'runtime',
    action: 'gateway_ready',
    context: { serviceName: state.serviceName },
  })
  return getGatewayState()
}

export function resetGateway(): void {
  state.ready = false
  state.canaryWeight = 0
  state.circuitOpen = {}
  spiWhitelist.clear()
  resetAllCircuits()
}

export type HostedServiceId =
  | '态势采集监测'
  | '规则校验研判'
  | '流程调度编排'
  | '数据处理核算'
  | '版本变更发布'
  | '业务协同对接'
  | '风险告警处置'
  | '溯源检索分析'
  | '安全审计防护'
  | '系统韧性保障'

export type BasePlatformId =
  | '配置管控'
  | '风险运行管控'
  | '全链路日志'
  | '启动依赖管控'
  | '码值标准化'
  | '前端安全防护'
  | '身份访问管控'
  | '性能运行管控'
  | 'RBAC权限矩阵'

export interface BusinessRouteSpec {
  method: string
  path: string
  hostedService: HostedServiceId
  platforms: BasePlatformId[]
  note?: string
}

interface CompiledRoute extends BusinessRouteSpec {
  regex: RegExp
}

const catalog: CompiledRoute[] = []
let ready = false

function compilePath(path: string): RegExp {
  const escaped = path
    .replace(/\/+$/, '')
    .replace(/\//g, '\\/')
    .replace(/:[A-Za-z_][A-Za-z0-9_]*/g, '[^/]+')
  return new RegExp(`^${escaped}\\/?$`, 'i')
}

export function resetBusinessRouteRegistry(): void {
  catalog.length = 0
  ready = false
}

export function registerBusinessRoute(spec: BusinessRouteSpec): void {
  const method = spec.method.toUpperCase()
  const path = spec.path.startsWith('/') ? spec.path : `/${spec.path}`
  if (catalog.some((r) => r.method === method && r.path === path)) return
  catalog.push({
    ...spec,
    method,
    path,
    regex: compilePath(path),
  })
}

/** 批量登记写路由（与 index.ts 现网写入口对齐） */
export function bootstrapBusinessRouteCatalog(): number {
  resetBusinessRouteRegistry()
  const specs: BusinessRouteSpec[] = [
    // —— 业务协同对接 业务协同 / 身份写 ——
    { method: 'POST', path: '/api/auth/login', hostedService: '业务协同对接', platforms: ['身份访问管控', 'RBAC权限矩阵'] },
    { method: 'POST', path: '/api/auth/register', hostedService: '业务协同对接', platforms: ['身份访问管控', 'RBAC权限矩阵'] },
    { method: 'POST', path: '/api/auth/logout', hostedService: '业务协同对接', platforms: ['身份访问管控'] },
    { method: 'POST', path: '/api/auth/change-password', hostedService: '业务协同对接', platforms: ['身份访问管控'] },
    { method: 'POST', path: '/api/auth/recover/question', hostedService: '业务协同对接', platforms: ['身份访问管控'] },
    { method: 'POST', path: '/api/auth/recover/verify', hostedService: '业务协同对接', platforms: ['身份访问管控'] },
    { method: 'POST', path: '/api/auth/recover/reset', hostedService: '业务协同对接', platforms: ['身份访问管控'] },
    { method: 'POST', path: '/api/auth/recover/by-token', hostedService: '业务协同对接', platforms: ['身份访问管控'] },
    { method: 'POST', path: '/api/auth/recover/reset-by-token', hostedService: '业务协同对接', platforms: ['身份访问管控'] },
    { method: 'PATCH', path: '/api/me', hostedService: '业务协同对接', platforms: ['身份访问管控', 'RBAC权限矩阵'] },
    { method: 'POST', path: '/api/users', hostedService: '业务协同对接', platforms: ['身份访问管控', 'RBAC权限矩阵'] },
    { method: 'PATCH', path: '/api/users/:id', hostedService: '业务协同对接', platforms: ['身份访问管控', 'RBAC权限矩阵'] },
    { method: 'DELETE', path: '/api/users/:id', hostedService: '业务协同对接', platforms: ['身份访问管控', 'RBAC权限矩阵'] },
    { method: 'POST', path: '/api/memos', hostedService: '业务协同对接', platforms: ['身份访问管控', 'RBAC权限矩阵', '全链路日志'] },
    { method: 'PATCH', path: '/api/memos/:id', hostedService: '业务协同对接', platforms: ['身份访问管控', 'RBAC权限矩阵', '全链路日志'] },
    { method: 'DELETE', path: '/api/memos/:id', hostedService: '业务协同对接', platforms: ['身份访问管控', 'RBAC权限矩阵', '全链路日志'] },
    { method: 'POST', path: '/api/memo-history', hostedService: '业务协同对接', platforms: ['身份访问管控', 'RBAC权限矩阵'] },
    { method: 'DELETE', path: '/api/memos/:memoId/history', hostedService: '业务协同对接', platforms: ['身份访问管控'] },
    { method: 'POST', path: '/api/files', hostedService: '业务协同对接', platforms: ['身份访问管控', '前端安全防护'] },
    { method: 'PATCH', path: '/api/files/:id', hostedService: '业务协同对接', platforms: ['身份访问管控', '前端安全防护'] },
    { method: 'DELETE', path: '/api/files/:id', hostedService: '业务协同对接', platforms: ['身份访问管控', '前端安全防护'] },
    { method: 'POST', path: '/api/shares', hostedService: '业务协同对接', platforms: ['身份访问管控', 'RBAC权限矩阵'] },
    { method: 'PATCH', path: '/api/shares/:id', hostedService: '业务协同对接', platforms: ['身份访问管控', 'RBAC权限矩阵'] },
    { method: 'DELETE', path: '/api/shares/:id', hostedService: '业务协同对接', platforms: ['身份访问管控', 'RBAC权限矩阵'] },
    { method: 'POST', path: '/api/public/shares/:id/access', hostedService: '业务协同对接', platforms: ['身份访问管控', 'RBAC权限矩阵'] },
    { method: 'POST', path: '/api/public/shares/:id/comments', hostedService: '业务协同对接', platforms: ['身份访问管控', '前端安全防护'] },
    { method: 'POST', path: '/api/shares/:id/comments/:commentId/reply', hostedService: '业务协同对接', platforms: ['身份访问管控', 'RBAC权限矩阵'] },
    { method: 'POST', path: '/api/users/:userId/notifications/:nid/read', hostedService: '业务协同对接', platforms: ['身份访问管控'] },
    { method: 'POST', path: '/api/users/:userId/notifications/read-all', hostedService: '业务协同对接', platforms: ['身份访问管控'] },
    { method: 'PUT', path: '/api/settings/:key', hostedService: '业务协同对接', platforms: ['配置管控', '身份访问管控'] },
    // —— 数据处理核算 数据 ——
    { method: 'POST', path: '/api/data/import', hostedService: '数据处理核算', platforms: ['配置管控', '身份访问管控'] },
    { method: 'DELETE', path: '/api/data/clear', hostedService: '数据处理核算', platforms: ['配置管控', '身份访问管控'] },
    { method: 'DELETE', path: '/api/cleanup/deleted-memos', hostedService: '数据处理核算', platforms: ['配置管控', '身份访问管控'] },
    { method: 'DELETE', path: '/api/cleanup/orphaned-files', hostedService: '数据处理核算', platforms: ['配置管控', '身份访问管控'] },
    { method: 'DELETE', path: '/api/cleanup/expired-shares', hostedService: '数据处理核算', platforms: ['配置管控', '身份访问管控'] },
    { method: 'POST', path: '/api/cleanup/perform', hostedService: '数据处理核算', platforms: ['配置管控', '身份访问管控'] },
    { method: 'DELETE', path: '/api/cleanup/all', hostedService: '数据处理核算', platforms: ['配置管控', '身份访问管控'] },
    // —— 溯源检索分析 日志 ——
    { method: 'POST', path: '/api/logs', hostedService: '溯源检索分析', platforms: ['全链路日志'] },
    { method: 'POST', path: '/api/logs/client-error', hostedService: '溯源检索分析', platforms: ['全链路日志', '前端安全防护'] },
    { method: 'DELETE', path: '/api/logs', hostedService: '溯源检索分析', platforms: ['全链路日志'] },
    { method: 'DELETE', path: '/api/logs/before/:date', hostedService: '溯源检索分析', platforms: ['全链路日志'] },
    { method: 'POST', path: '/api/logs/cleanup', hostedService: '溯源检索分析', platforms: ['全链路日志'] },
    // —— 流程调度编排 调度 ——
    { method: 'POST', path: '/api/schedule/jobs/:id/trigger', hostedService: '流程调度编排', platforms: ['启动依赖管控', '性能运行管控'] },
    // —— 版本变更发布 发布 ——
    { method: 'POST', path: '/api/release/canary', hostedService: '版本变更发布', platforms: ['配置管控'] },
    { method: 'POST', path: '/api/release/rollback', hostedService: '版本变更发布', platforms: ['配置管控', '全链路日志'] },
    { method: 'POST', path: '/api/config/hot', hostedService: '版本变更发布', platforms: ['配置管控', '身份访问管控', '全链路日志'] },
    { method: 'POST', path: '/api/config/rollback', hostedService: '版本变更发布', platforms: ['配置管控', '身份访问管控', '全链路日志'] },
    // —— 性能运行管控 / 系统韧性保障 弹性 ——
    { method: 'POST', path: '/api/perf/baseline', hostedService: '系统韧性保障', platforms: ['性能运行管控', '配置管控'] },
    { method: 'POST', path: '/api/perf/sla', hostedService: '系统韧性保障', platforms: ['性能运行管控', '配置管控'] },
    { method: 'POST', path: '/api/elasticity/revert', hostedService: '系统韧性保障', platforms: ['性能运行管控', '启动依赖管控'] },
    { method: 'POST', path: '/api/elasticity/promote-baseline', hostedService: '系统韧性保障', platforms: ['性能运行管控', '配置管控'] },
    // —— 风险告警处置 告警（拨号后自动派自动化闭环；运维只观测）——
    { method: 'POST', path: '/api/alerts/test', hostedService: '风险告警处置', platforms: ['风险运行管控', '全链路日志'] },
    { method: 'GET', path: '/api/alerts', hostedService: '风险告警处置', platforms: ['风险运行管控', '全链路日志'] },
    { method: 'GET', path: '/api/ops/snapshot', hostedService: '风险告警处置', platforms: ['性能运行管控', '风险运行管控', '系统韧性保障'] },
    { method: 'POST', path: '/api/gateway/circuit/force-open', hostedService: '系统韧性保障', platforms: ['系统韧性保障'] },
    { method: 'POST', path: '/api/gateway/circuit/force-close', hostedService: '系统韧性保障', platforms: ['系统韧性保障'] },
    { method: 'POST', path: '/api/gateway/circuit/reset', hostedService: '系统韧性保障', platforms: ['系统韧性保障'] },
    { method: 'GET', path: '/api/automation/status', hostedService: '组件协调', platforms: ['性能运行管控', '风险告警处置', '系统韧性保障'] },
    { method: 'POST', path: '/api/pipeline/replay', hostedService: '数据处理核算', platforms: ['配置管控', '全链路日志'] },
    // —— 系统韧性保障 / 风险运行管控 治理 ——
    { method: 'POST', path: '/api/governance/kill-switch', hostedService: '系统韧性保障', platforms: ['风险运行管控', '启动依赖管控'] },
    { method: 'DELETE', path: '/api/governance/kill-switch', hostedService: '系统韧性保障', platforms: ['风险运行管控', '启动依赖管控'] },
    { method: 'POST', path: '/api/governance/bans/lift', hostedService: '安全审计防护', platforms: ['风险运行管控', '身份访问管控'] },
    // —— B9.1 协作能力子平台探针（挂业务协同对接；能力归属协作管控）——
    { method: 'POST', path: '/api/collab/service/route-probe', hostedService: '业务协同对接', platforms: ['身份访问管控', '启动依赖管控'] },
    { method: 'POST', path: '/api/collab/event/probe', hostedService: '业务协同对接', platforms: ['全链路日志'] },
    { method: 'POST', path: '/api/collab/contract/probe', hostedService: '业务协同对接', platforms: ['配置管控', '码值标准化'] },
    { method: 'POST', path: '/api/collab/tenant/probe', hostedService: '业务协同对接', platforms: ['身份访问管控', 'RBAC权限矩阵'] },
    { method: 'POST', path: '/api/collab/data/probe', hostedService: '业务协同对接', platforms: ['RBAC权限矩阵', '全链路日志'] },
    { method: 'POST', path: '/api/collab/public-access/probe', hostedService: '业务协同对接', platforms: ['前端安全防护', '身份访问管控'] },
    { method: 'POST', path: '/api/collab/open/probe', hostedService: '业务协同对接', platforms: ['身份访问管控', '码值标准化'] },
  ]
  for (const s of specs) registerBusinessRoute(s)
  ready = catalog.length > 0
  return catalog.length
}

export function isBusinessRouteRegistryReady(): boolean {
  return ready && catalog.length > 0
}

export function getBusinessRouteCount(): number {
  return catalog.length
}

export function listBusinessRoutes(): BusinessRouteSpec[] {
  return catalog.map(({ regex: _r, ...rest }) => rest)
}

export function isBusinessRouteExempt(method: string, path: string): boolean {
  const m = method.toUpperCase()
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return true
  const p = path.split('?')[0]
  if (
    p === '/healthz/ready' ||
    p === '/api/health' ||
    p === '/api/config' ||
    p === '/api/auth/challenge' ||
    p === '/api/version/latest'
  ) {
    return true
  }
  // 退役墓碑：仅放行到 410 处理器，禁止当作业务双路径
  if (p === '/api/admins' || p.startsWith('/api/admins/')) return true
  if (p === '/api/memos/tenant-scope' || p.startsWith('/api/memos/tenant-scope/')) return true
  return false
}

export function findBusinessRoute(method: string, path: string): CompiledRoute | null {
  const m = method.toUpperCase()
  const p = path.split('?')[0]
  for (const r of catalog) {
    if (r.method === m && r.regex.test(p)) return r
  }
  return null
}

export function assertBusinessRouteAllowed(
  method: string,
  path: string
): { ok: true; route?: CompiledRoute } | { ok: false; reason: string } {
  if (isBusinessRouteExempt(method, path)) return { ok: true }
  const m = method.toUpperCase()
  if (m !== 'POST' && m !== 'PUT' && m !== 'PATCH' && m !== 'DELETE') return { ok: true }
  if (!path.startsWith('/api')) return { ok: true }
  if (!isBusinessRouteRegistryReady()) {
    return { ok: false, reason: '业务路由表未就绪' }
  }
  const hit = findBusinessRoute(method, path)
  if (!hit) {
    return { ok: false, reason: `未登记业务路由：${m} ${path.split('?')[0]}` }
  }
  return { ok: true, route: hit }
}

export function ready_rb_l1_host_biz_01(): boolean {
  return Boolean(isGatewayReady() && isBusinessRouteRegistryReady())
}


export function setSettingViaBase(key: string, value: string): void {
  database.setSetting(key, value)
  pipeEntityWrite({
    table: 'settings',
    op: 'update',
    key,
    eventName: 'DomainEntityChanged',
    payload: { settingKey: key, entityType: 'setting', op: 'update' },
  })
}


export function createUserViaBase(user: Parameters<typeof database.createUser>[0]): void {
  database.createUser(user)
  const userId = user.id
  if (!userId) throw new Error('createUserViaBase: user.id required')
  pipeEntityWrite({
    table: 'users',
    op: 'insert',
    key: userId,
    eventName: 'DomainEntityChanged',
    payload: { userId: user.id, username: user.username, entityType: 'user', op: 'create' },
  })
}

export function updateUserViaBase(
  id: string,
  patch: Record<string, unknown>
): void {
  database.updateUser(id, patch)
  pipeEntityWrite({
    table: 'users',
    op: 'update',
    key: id,
    eventName: 'DomainEntityChanged',
    payload: { userId: id, changedFields: Object.keys(patch), entityType: 'user', op: 'update' },
  })
}

export function deleteUserViaBase(id: string): ReturnType<typeof database.deleteUserWithData> {
  const result = database.deleteUserWithData(id)
  pipeEntityWrite({
    table: 'users',
    op: 'delete',
    key: id,
    eventName: 'DomainEntityChanged',
    payload: { userId: id, entityType: 'user', op: 'delete' },
  })
  return result
}


export function createFileViaBase(file: Parameters<typeof database.createFile>[0]): void {
  database.createFile(file)
  pipeEntityWrite({
    table: 'files',
    op: 'insert',
    key: file.id!,
    eventName: 'DomainEntityChanged',
    payload: { fileId: file.id, userId: file.userId, memoId: file.memoId, entityType: 'file', op: 'create' },
  })
}

export function updateFileViaBase(
  id: string,
  updates: Parameters<typeof database.updateFile>[1]
): void {
  database.updateFile(id, updates)
  pipeEntityWrite({
    table: 'files',
    op: 'update',
    key: id,
    eventName: 'DomainEntityChanged',
    payload: { fileId: id, ...updates, entityType: 'file', op: 'update' },
  })
}

/**
 * 将文件 ID 写入备忘录 attachments（若尚未包含）
 */
function appendFileToMemoAttachmentsViaBase(memoId: string, fileId: string): void {
  const memo = database.getMemoById(memoId)
  if (!memo) return
  const prev = memo.attachments || []
  if (prev.includes(fileId)) return

  database.updateMemo(memoId, {
    attachments: [...prev, fileId],
    updatedAt: new Date().toISOString(),
  })
  pipeEntityWrite({
    table: 'memos',
    op: 'update',
    key: memoId,
    eventName: 'MemoUpdated',
    payload: {
      memoId,
      userId: memo.userId,
      changedFields: ['attachments'],
      entityType: 'memo',
      op: 'update',
    },
  })
}

/**
 * 除指定备忘录外，仍在使用该文件的另一条备忘录（attachments 为准）
 */
function anotherMemoUsingFile(fileId: string, userId: string, exceptMemoId: string): string | null {
  // 只读 id+attachments，避免为关联扫描拉全量正文
  for (const memo of database.getMemoAttachmentLinks(userId)) {
    if (memo.id === exceptMemoId) continue
    if ((memo.attachments || []).includes(fileId)) return memo.id
  }
  const file = database.getFileById(fileId)
  if (file?.memoId && file.memoId !== exceptMemoId) {
    const other = database.getMemoById(file.memoId)
    if (other && !other.deletedAt) return other.id
  }
  return null
}

/**
 * 只从一条备忘录的 attachments 移除文件（其它备忘录保持使用）
 */
function removeFileFromOneMemo(fileId: string, memoId: string): void {
  const memo = database.getMemoById(memoId)
  if (!memo) return
  const prev = memo.attachments || []
  const next = prev.filter((id) => id !== fileId)
  if (next.length === prev.length) return
  database.updateMemo(memoId, {
    attachments: next,
    updatedAt: new Date().toISOString(),
  })
  pipeEntityWrite({
    table: 'memos',
    op: 'update',
    key: memoId,
    eventName: 'MemoUpdated',
    payload: {
      memoId,
      userId: memo.userId,
      changedFields: ['attachments'],
      entityType: 'memo',
      op: 'update',
    },
  })
}

/**
 * 双向关联：同一文件可同时出现在多条备忘录 attachments 中。
 * files.memoId 只作主关联（最近一次显式关联）；nextMemoId=null 表示全部解绑。
 */
export function syncFileMemoLinkViaBase(fileId: string, nextMemoId: string | null): void {
  const file = database.getFileById(fileId)
  if (!file) return

  const prevMemoId = file.memoId || null
  if (!nextMemoId) {
    detachFileFromMemosViaBase(fileId, prevMemoId)
    if (prevMemoId) updateFileViaBase(fileId, { memoId: null })
    return
  }

  if (prevMemoId === nextMemoId) {
    appendFileToMemoAttachmentsViaBase(nextMemoId, fileId)
    return
  }

  // 保留原备忘录使用，再追加新备忘录（禁止抢走唯一关联）
  if (prevMemoId) appendFileToMemoAttachmentsViaBase(prevMemoId, fileId)
  appendFileToMemoAttachmentsViaBase(nextMemoId, fileId)
  updateFileViaBase(fileId, { memoId: nextMemoId })
}

/**
 * 按备忘录集合设置文件的全部使用关系（文件库「管理关联」）
 */
export function syncFileMemoLinksViaBase(fileId: string, nextMemoIds: string[]): void {
  const file = database.getFileById(fileId)
  if (!file) return

  const next = [...new Set(nextMemoIds.map((id) => String(id || '').trim()).filter(Boolean))]
  const nextSet = new Set(next)
  const memos = database.getMemoAttachmentLinks(file.userId)

  for (const memo of memos) {
    const has = (memo.attachments || []).includes(fileId)
    if (has && !nextSet.has(memo.id)) {
      removeFileFromOneMemo(fileId, memo.id)
    } else if (!has && nextSet.has(memo.id)) {
      appendFileToMemoAttachmentsViaBase(memo.id, fileId)
    }
  }

  const primary =
    file.memoId && nextSet.has(file.memoId) ? file.memoId : (next[0] ?? null)
  if ((file.memoId || null) !== primary) {
    updateFileViaBase(fileId, { memoId: primary })
  }
}

/**
 * 备忘录 attachments 权威列表变更后，反写 files.memoId（解绑不删文件、不抢走其它备忘录）
 */
export function syncMemoAttachmentFilesViaBase(memoId: string, nextIds: string[]): void {
  const nextSet = new Set(nextIds.filter(Boolean))
  const linked = database.getFilesByMemoId(memoId)

  for (const file of linked) {
    if (nextSet.has(file.id)) continue
    const fallback = anotherMemoUsingFile(file.id, file.userId, memoId)
    updateFileViaBase(file.id, { memoId: fallback })
  }

  for (const fileId of nextSet) {
    const file = database.getFileById(fileId)
    if (!file) continue
    if (!file.memoId) {
      updateFileViaBase(fileId, { memoId })
    }
  }
}

export function deleteFileViaBase(id: string): void {
  database.deleteFile(id)
  pipeEntityWrite({
    table: 'files',
    op: 'delete',
    key: id,
    eventName: 'DomainEntityChanged',
    payload: { fileId: id, entityType: 'file', op: 'delete' },
  })
}

/**
 * 从备忘录 attachments 中移除指定文件（按 memoId + 用户备忘录反查）
 */
export function detachFileFromMemosViaBase(fileId: string, preferredMemoId?: string | null): void {
  const memoIds = new Set<string>()
  if (preferredMemoId) memoIds.add(preferredMemoId)

  const file = database.getFileById(fileId)
  const userId = file?.userId
  if (userId) {
    for (const memo of database.getMemoAttachmentLinks(userId)) {
      if ((memo.attachments || []).includes(fileId)) {
        memoIds.add(memo.id)
      }
    }
  }

  for (const memoId of memoIds) {
    const memo = database.getMemoById(memoId)
    if (!memo) continue
    const prev = memo.attachments || []
    const next = prev.filter((id) => id !== fileId)
    if (next.length === prev.length) continue

    database.updateMemo(memoId, {
      attachments: next,
      updatedAt: new Date().toISOString(),
    })
    pipeEntityWrite({
      table: 'memos',
      op: 'update',
      key: memoId,
      eventName: 'MemoUpdated',
      payload: {
        memoId,
        userId: memo.userId,
        changedFields: ['attachments'],
        entityType: 'memo',
        op: 'update',
      },
    })
  }
}

/**
 * 删除备忘录独占的附件（磁盘 blob + 元数据）。
 * 仍被其它备忘录使用的文件只改主关联，不删 blob。
 */
export function deleteMemoFilesViaBase(memoId: string): number {
  const memo = database.getMemoById(memoId)
  const ids = new Set<string>()

  for (const file of database.getFilesByMemoId(memoId)) {
    ids.add(file.id)
  }
  for (const fileId of memo?.attachments || []) {
    if (fileId) ids.add(fileId)
  }

  let removed = 0
  for (const id of ids) {
    const file = database.getFileById(id)
    if (!file) continue
    const keepWith = anotherMemoUsingFile(id, file.userId, memoId)
    if (keepWith) {
      if ((file.memoId || null) === memoId) {
        updateFileViaBase(id, { memoId: keepWith })
      }
      continue
    }
    removed += deleteFileWithBlobViaBase(id, { skipMemoDetach: true }) ? 1 : 0
  }
  return removed
}

/** 删除单个附件：磁盘 + 元数据；默认同步从备忘录 attachments 移除 */
export function deleteFileWithBlobViaBase(
  id: string,
  opts?: { skipMemoDetach?: boolean }
): boolean {
  const file = database.getFileById(id)
  if (!file) return false

  if (!opts?.skipMemoDetach) {
    try {
      detachFileFromMemosViaBase(id, file.memoId)
    } catch (err) {
      log({
        level: 'warn',
        type: 'business',
        message: 'detach file from memo failed',
        action: 'file_detach_memo_fail',
        context: { fileId: id, memoId: file.memoId, err: String(err) },
      })
    }
  }

  if (file.path && fs.existsSync(file.path)) {
    try {
      fs.unlinkSync(file.path)
    } catch (err) {
      log({
        level: 'warn',
        type: 'business',
        message: 'file blob unlink failed',
        action: 'file_unlink_fail',
        context: { fileId: id, err: String(err) },
      })
    }
  }
  deleteFileViaBase(id)
  return true
}

/**
 * 清理孤立附件（备忘录缺失或已软删除）并删磁盘
 */
export function purgeOrphanedFilesViaBase(): number {
  const orphaned = database.getOrphanedFiles()
  let removed = 0
  for (const file of orphaned) {
    if (deleteFileWithBlobViaBase(file.id)) removed++
  }
  return removed
}

bindOrphanFilePurge(purgeOrphanedFilesViaBase)


export function createShareViaBase(share: Parameters<typeof database.createShare>[0]): void {
  database.createShare(share)
  pipeEntityWrite({
    table: 'shares',
    op: 'insert',
    key: share.id!,
    eventName: 'MemoShared',
    payload: {
      shareId: share.id,
      memoId: share.memoId,
      userId: share.userId,
      entityType: 'share',
      op: 'create',
    },
  })
}

export function updateShareViaBase(id: string, patch: Record<string, unknown>): void {
  database.updateShare(id, patch)
  pipeEntityWrite({
    table: 'shares',
    op: 'update',
    key: id,
    eventName: 'DomainEntityChanged',
    payload: { shareId: id, changedFields: Object.keys(patch), entityType: 'share', op: 'update' },
  })
}

export function deleteShareViaBase(id: string): void {
  database.deleteShare(id)
  pipeEntityWrite({
    table: 'shares',
    op: 'delete',
    key: id,
    eventName: 'ShareRevoked',
    payload: { shareId: id, entityType: 'share', op: 'delete' },
  })
}

export function createShareCommentViaBase(
  comment: Parameters<typeof database.createShareComment>[0]
): string {
  const id = database.createShareComment(comment)
  const share = database.getShareById(comment.shareId)
  const authorName = (comment.authorName || '匿名访客').trim() || '匿名访客'
  const preview = comment.content.trim().slice(0, 80)
  pipeEntityWrite({
    table: 'share_comments',
    op: 'insert',
    key: id,
    eventName: 'DomainEntityChanged',
    payload: {
      shareId: comment.shareId,
      commentId: id,
      feedback: comment.feedback,
      userId: share?.userId,
      entityType: 'share_comment',
      op: 'create',
    },
  })
  if (share?.userId) {
    const feedbackLabel =
      comment.feedback === 'helpful'
        ? '有帮助'
        : comment.feedback === 'neutral'
          ? '一般'
          : '需改进'
    /** 业务用户触达 → ⑫ notify；禁止走风险告警处置（管理员系统告警） */
    requestUserNotify({
      channel: 'in_app',
      templateId: 'share_comment_received',
      userId: share.userId,
      title: '收到分享评论',
      body: `${authorName}（${feedbackLabel}）：${preview}`,
      link: '/shares',
      dedupeKey: `share_comment:${id}`,
    })
  }
  return id
}

export function replyShareCommentViaBase(input: {
  commentId: string
  replyContent: string
  replyBy: string
}): void {
  database.replyShareComment(input.commentId, {
    replyContent: input.replyContent,
    replyBy: input.replyBy,
  })
  const comment = database.getShareCommentById(input.commentId)
  pipeEntityWrite({
    table: 'share_comments',
    op: 'update',
    key: input.commentId,
    eventName: 'DomainEntityChanged',
    payload: {
      shareId: comment?.shareId,
      commentId: input.commentId,
      userId: input.replyBy,
      entityType: 'share_comment',
      op: 'reply',
    },
  })
}


export interface CreateMemoInput {
  id: string
  userId: string
  title: string
  content: string
  tags: string[]
  priority?: string | null
  attachments?: unknown[]
  createdAt: string
  updatedAt: string
  tenantRootId?: string
}

export function createMemoViaBase(input: CreateMemoInput): { id: string } {
  const attachments = (input.attachments as string[]) || []
  database.createMemo({
    id: input.id,
    userId: input.userId,
    title: input.title,
    content: input.content || '',
    tags: input.tags || [],
    priority: input.priority || null,
    attachments,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  })
  if (attachments.length) {
    try {
      syncMemoAttachmentFilesViaBase(input.id, attachments.map((x) => String(x)).filter(Boolean))
    } catch (err) {
      log({
        level: 'warn',
        type: 'business',
        message: 'memo create attachments file link sync failed',
        action: 'memo_attachments_file_sync_fail',
        context: { memoId: input.id, err: String(err) },
      })
    }
  }
  pipeEntityWrite({
    table: 'memos',
    op: 'insert',
    key: input.id,
    eventName: 'MemoCreated',
    payload: {
      memoId: input.id,
      userId: input.userId,
      tenantId: input.tenantRootId,
      tagIds: input.tags || [],
      entityType: 'memo',
      op: 'create',
    },
  })
  return { id: input.id }
}

export function updateMemoViaBase(
  id: string,
  body: Record<string, unknown>,
  actorUserId: string
): void {
  const softDeleting =
    body.deletedAt !== undefined && body.deletedAt !== null && body.deletedAt !== ''
  const prev = database.getMemoById(id)
  const touchesBody =
    body.title !== undefined || body.content !== undefined || body.tags !== undefined
  if (prev && touchesBody && !softDeleting) {
    const nextTitle = body.title !== undefined ? String(body.title) : prev.title
    const nextContent = body.content !== undefined ? String(body.content) : prev.content
    const nextTags = body.tags !== undefined ? (body.tags as string[]) : prev.tags || []
    const prevTags = prev.tags || []
    const unchanged =
      nextTitle === (prev.title || '') &&
      nextContent === (prev.content || '') &&
      JSON.stringify(nextTags) === JSON.stringify(prevTags)
    if (!unchanged) {
      createMemoHistoryViaBase({
        memoId: id,
        title: prev.title || '',
        content: prev.content || '',
        tags: prev.tags || [],
        priority: prev.priority ?? null,
        createdAt: new Date().toISOString(),
      })
    }
  }
  if (softDeleting) {
    try {
      deleteMemoFilesViaBase(id)
    } catch (err) {
      log({
        level: 'warn',
        type: 'business',
        message: 'memo soft-delete attachment cleanup failed',
        action: 'memo_soft_delete_files_fail',
        context: { memoId: id, err: String(err) },
      })
    }
  }

  database.updateMemo(id, body)

  // attachments 权威列表变更时，反写 files.memoId（解绑不删 blob）
  if (Array.isArray(body.attachments)) {
    try {
      syncMemoAttachmentFilesViaBase(
        id,
        (body.attachments as unknown[]).map((x) => String(x)).filter(Boolean)
      )
    } catch (err) {
      log({
        level: 'warn',
        type: 'business',
        message: 'memo attachments file link sync failed',
        action: 'memo_attachments_file_sync_fail',
        context: { memoId: id, err: String(err) },
      })
    }
  }

  pipeEntityWrite({
    table: 'memos',
    op: 'update',
    key: id,
    eventName: 'MemoUpdated',
    payload: {
      memoId: id,
      userId: actorUserId,
      changedFields: Object.keys(body),
      entityType: 'memo',
      op: 'update',
    },
  })
}

/** 硬删：③ Saga 完成（禁止空补偿） */
export async function deleteMemoViaBase(id: string, actorUserId: string): Promise<void> {
  const memo = database.getMemoById(id)
  if (!memo) return

  const shares = database.getSharesByMemoId(id).map((s) => ({ ...s }))
  const files = database.getFilesByMemoId(id).map((f) => ({ ...f }))

  await executeSaga(
    'memo.delete',
    {
      memoId: id,
      userId: actorUserId,
      snapshot: { memo: { ...memo }, shares, files },
    },
    [
      {
        stepId: 'revoke_share',
        forward: async (ctx) => {
          const memoId = String(ctx.memoId || '')
          for (const share of database.getSharesByMemoId(memoId)) {
            if (share.id) deleteShareViaBase(share.id)
          }
        },
      },
      {
        stepId: 'remove_blob',
        forward: async (ctx) => {
          deleteMemoFilesViaBase(String(ctx.memoId || ''))
        },
      },
      {
        stepId: 'delete_row',
        forward: async (ctx) => {
          const memoId = String(ctx.memoId || '')
          database.deleteMemo(memoId)
          pipeEntityWrite({
            table: 'memos',
            op: 'delete',
            key: memoId,
            eventName: 'MemoDeleted',
            payload: {
              memoId,
              userId: String(ctx.userId || actorUserId),
              entityType: 'memo',
              op: 'delete',
            },
          })
        },
      },
    ]
  )
}

export function createMemoHistoryViaBase(
  history: Parameters<typeof database.createMemoHistory>[0]
): string {
  const id = database.createMemoHistory(history)
  pipeEntityWrite({
    table: 'memo_history',
    op: 'insert',
    key: String(id),
    eventName: 'DomainEntityChanged',
    payload: {
      memoId: history.memoId,
      historyId: id,
      entityType: 'memo_history',
      op: 'create',
    },
  })
  return id
}

export function deleteMemoHistoryViaBase(memoId: string): void {
  database.deleteMemoHistory(memoId)
  pipeEntityWrite({
    table: 'memo_history',
    op: 'delete',
    key: memoId,
    eventName: 'DomainEntityChanged',
    payload: {
      memoId,
      entityType: 'memo_history',
      op: 'delete',
    },
  })
}

/** Saga 补偿：从快照恢复（供组件协调登记） */
export function restoreMemoDeleteSnapshot(ctx: Record<string, unknown>): void {
  const snap = ctx.snapshot as
    | {
        memo?: Record<string, unknown>
        shares?: Array<Record<string, unknown>>
        files?: Array<Record<string, unknown>>
      }
    | undefined
  if (!snap?.memo?.id) return

  const memoId = String(snap.memo.id)
  if (!database.getMemoById(memoId)) {
    database.createMemo({
      id: memoId,
      userId: String(snap.memo.userId || ''),
      title: String(snap.memo.title || ''),
      content: String(snap.memo.content || ''),
      tags: Array.isArray(snap.memo.tags) ? (snap.memo.tags as string[]) : [],
      priority: (snap.memo.priority as string | null) || null,
      attachments: Array.isArray(snap.memo.attachments)
        ? (snap.memo.attachments as string[])
        : [],
      createdAt: String(snap.memo.createdAt || new Date().toISOString()),
      updatedAt: String(snap.memo.updatedAt || new Date().toISOString()),
    })
  }

  for (const share of snap.shares || []) {
    if (!share.id || database.getShareById(String(share.id))) continue
    createShareViaBase({
      id: String(share.id),
      userId: String(share.userId || ''),
      memoId,
      shareCode: String(share.shareCode || ''),
      passwordHash: (share.passwordHash as string | null) ?? null,
      expiresAt: (share.expiresAt as string | null) ?? null,
      viewCount: Number(share.viewCount) || 0,
      createdAt: String(share.createdAt || new Date().toISOString()),
    } as Parameters<typeof createShareViaBase>[0])
  }

  for (const file of snap.files || []) {
    if (!file.id) continue
    try {
      if (database.getFileById(String(file.id))) continue
      createFileViaBase({
        id: String(file.id),
        userId: String(file.userId || ''),
        memoId,
        filename: String(file.filename || file.name || 'restored'),
        path: String(file.path || ''),
        size: Number(file.size) || 0,
        mimeType: String(file.mimeType || 'application/octet-stream'),
        createdAt: String(file.createdAt || new Date().toISOString()),
      } as Parameters<typeof createFileViaBase>[0])
    } catch (err) {
      log({
        level: 'warn',
        type: 'runtime',
        message: 'saga compensate file meta restore best-effort',
        action: 'saga_file_restore',
        context: { fileId: file.id, err: String(err) },
      })
    }
  }
}
