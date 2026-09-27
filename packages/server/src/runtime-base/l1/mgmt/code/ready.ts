/**
 * CYP-memo 全局元数据服务（嵌入式 · 语义翻译）
 * 专属：枚举/字典/业务类型编码/字段映射；开发期码值（Err）语义归属本服务
 * 红线：不存业务实体数据；不管理技术配置参数（配置服务）
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import type { Request, Response, NextFunction } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { buildTraceparent, parseTraceparent, requestTraceAls } from '../trace/ready.js'
import { log as log } from '../../../l0/infra/log/ready.js'

export type MetadataKind = 'error_code' | 'enum' | 'dict'

export interface MetadataEntry {
  kind: MetadataKind
  code: string
  label: string
  category?: string
}

export interface MetadataState {
  ready: boolean
  entryCount: number
}

const catalog = new Map<string, MetadataEntry>()

const state: MetadataState = {
  ready: false,
  entryCount: 0,
}

const ERR_LABELS: Record<string, string> = {
  E020: '未认证',
  E021: '令牌无效',
  E022: '登录失败',
  E023: '账号锁定',
  E024: '触发限流',
  E030: '禁止访问',
  E031: '跨租户拒绝',
  E032: '令牌探测拒绝',
  E040: '请求参数错误',
  E041: '用户名已存在',
  E042: '令牌已存在',
  E043: '备忘录不存在',
  E044: '缺少文件',
  E045: '缺少元数据',
  E046: '文件不存在',
  E047: '文件实体缺失',
  E048: '分享不存在',
  E049: '数据格式错误',
  E050: '需要确认',
  E051: '资源不存在',
  E052: '禁止删除当前用户',
  E429: '客户端上报限流',
  E410: '资源已失效',
  E080: '内部错误',
  E090: '紧急停机',
}

function keyOf(kind: MetadataKind, code: string): string {
  return `${kind}:${code}`
}

export function registerMetadata(entry: MetadataEntry): void {
  catalog.set(keyOf(entry.kind, entry.code), entry)
  state.entryCount = catalog.size
}

export function resolveLabel(kind: MetadataKind, code: string): string | null {
  return catalog.get(keyOf(kind, code))?.label ?? null
}

/** 将错误码渲染为人类可读文案（日志展示用） */
export function renderErrorCode(code: string): string {
  return resolveLabel('error_code', code) || code
}

export function listMetadata(kind?: MetadataKind): MetadataEntry[] {
  const all = [...catalog.values()]
  return kind ? all.filter((e) => e.kind === kind) : all
}

export function getMetadataState(): MetadataState {
  return { ready: state.ready, entryCount: state.entryCount }
}

export function isMetadataReady(): boolean {
  return state.ready
}

export function initMetadata(): MetadataState {
  catalog.clear()
  for (const code of Object.values(Err)) {
    registerMetadata({
      kind: 'error_code',
      code,
      label: ERR_LABELS[code] || code,
      category: 'api_envelope',
    })
  }
  // 业务枚举示例位（可扩展，不存实体）
  registerMetadata({ kind: 'enum', code: 'memo.visibility.private', label: '私有', category: 'memo' })
  registerMetadata({ kind: 'enum', code: 'memo.visibility.shared', label: '分享', category: 'memo' })

  state.ready = true
  log({
    level: 'info',
    message: 'metadata ready',
    type: 'runtime',
    action: 'metadata_ready',
    context: { entryCount: state.entryCount, note: 'Err codes owned here as semantics; not an infra component' },
  })
  return getMetadataState()
}

export function resetMetadata(): void {
  catalog.clear()
  state.ready = false
  state.entryCount = 0
}

export function ready_rb_l1_mgmt_code_01(): boolean {
  return isMetadataReady()
}

declare module 'express-serve-static-core' {
  interface Request {
    requestId?: string
    traceId?: string
  }
}

/**
 * 常用业务码（SSOT：与 reports/P2/CYP-memo-P2-错误码.md 对齐）
 * 每码唯一；禁止两语义共用同一 E0xx
 */
export const Err = {
  UNAUTH: 'E020',
  TOKEN_INVALID: 'E021',
  LOGIN_FAIL: 'E022',
  LOCKED: 'E023',
  RATE_LIMITED: 'E024',
  FORBIDDEN: 'E030',
  CROSS_TENANT: 'E031',
  TOKEN_PROBE: 'E032',
  BAD_REQUEST: 'E040',
  USERNAME_EXISTS: 'E041',
  TOKEN_EXISTS: 'E042',
  MEMO_NOT_FOUND: 'E043',
  NO_FILE: 'E044',
  NO_META: 'E045',
  FILE_NOT_FOUND: 'E046',
  FILE_BLOB_MISSING: 'E047',
  SHARE_NOT_FOUND: 'E048',
  BAD_DATA: 'E049',
  CONFIRM_REQUIRED: 'E050',
  /** 通用资源不存在（用户等）；勿与 BAD_REQUEST E040 混用 */
  NOT_FOUND: 'E051',
  /** 禁止删除当前登录用户；勿与 TOKEN_EXISTS E042 混用 */
  SELF_DELETE: 'E052',
  /** 客户端错误上报限流（HTTP 429） */
  CLIENT_RATE_LIMITED: 'E429',
  GONE: 'E410',
  INTERNAL: 'E080',
  KILL_SWITCH: 'E090',
} as const

function makeErrId(requestId: string): string {
  const d = new Date()
  const stamp = [
    d.getUTCFullYear(),
    String(d.getUTCMonth() + 1).padStart(2, '0'),
    String(d.getUTCDate()).padStart(2, '0'),
    String(d.getUTCHours()).padStart(2, '0'),
    String(d.getUTCMinutes()).padStart(2, '0'),
    String(d.getUTCSeconds()).padStart(2, '0'),
  ].join('')
  return `ERR-${stamp}-${requestId.slice(0, 6).toUpperCase()}`
}

export function attachRequestIds(req: Request, res: Response, next: NextFunction): void {
  const incoming = (req.headers['x-request-id'] as string | undefined)?.trim()
  const requestId = incoming && incoming.length > 0 ? incoming : uuidv4().replace(/-/g, '')
  const fromParent = parseTraceparent(req.headers['traceparent'] as string | undefined)
  const traceIncoming = (req.headers['x-trace-id'] as string | undefined)?.trim()
  const traceId =
    (fromParent && fromParent.length === 32 ? fromParent : undefined) ||
    (traceIncoming && traceIncoming.length > 0 ? traceIncoming.replace(/-/g, '').toLowerCase() : undefined) ||
    requestId.replace(/-/g, '').toLowerCase()
  req.requestId = requestId
  req.traceId = traceId
  res.setHeader('X-Request-Id', requestId)
  res.setHeader('X-Trace-Id', traceId)
  res.setHeader('traceparent', buildTraceparent(traceId))
  requestTraceAls.run({ requestId, traceId }, () => next())
}

export interface FailBody {
  success: false
  code: string
  message: string
  data: null
  timestamp: string
  request_id: string
  trace_id: string
  errId: string
  error: { code: string; message: string }
}

/**
 * 失败响应：顶层七字段 + 嵌套 error 双写（ERR-01）
 */
export function fail(
  res: Response,
  status: number,
  code: string,
  message: string,
  req?: Request
): void {
  const request_id = req?.requestId || uuidv4().replace(/-/g, '')
  const trace_id = req?.traceId || request_id
  const timestamp = new Date().toISOString()
  const body: FailBody = {
    success: false,
    code,
    message,
    data: null,
    timestamp,
    request_id,
    trace_id,
    errId: makeErrId(request_id),
    error: { code, message },
  }
  res.status(status).json(body)
}

export function ok(res: Response, data: unknown): void {
  res.json({ success: true, data })
}

/** 按中文 message 推断稳定码（批量迁移用；未知 → E080） */
export function inferCodeFromMessage(message: string, httpStatus: number): string {
  const map: Record<string, string> = {
    '未认证：需要 Authorization Bearer': Err.UNAUTH,
    '未认证：Bearer 为空': Err.UNAUTH,
    未认证: Err.UNAUTH,
    令牌无效或已失效: Err.TOKEN_INVALID,
    用户名或密码错误: Err.LOGIN_FAIL,
    禁止跨租户访问: Err.CROSS_TENANT,
    禁止用他人令牌探测: Err.TOKEN_PROBE,
    用户不存在: Err.NOT_FOUND,
    用户名已存在: Err.USERNAME_EXISTS,
    令牌已存在: Err.TOKEN_EXISTS,
    不能删除当前登录用户: Err.SELF_DELETE,
    缺少用户标识: Err.BAD_REQUEST,
    用户名与密码必填: Err.BAD_REQUEST,
    备忘录不存在: Err.MEMO_NOT_FOUND,
    未上传文件: Err.NO_FILE,
    缺少文件元数据: Err.NO_META,
    文件不存在: Err.FILE_NOT_FOUND,
    文件内容不存在: Err.FILE_BLOB_MISSING,
    分享不存在: Err.SHARE_NOT_FOUND,
    分享链接不存在: Err.SHARE_NOT_FOUND,
    数据格式错误: Err.BAD_DATA,
    '需要提供确认码 DELETE_ALL_DATA 才能执行此操作': Err.CONFIRM_REQUIRED,
    'API-10：/api/admins/login 已退役，请使用 POST /api/auth/login': Err.GONE,
  }
  if (map[message]) return map[message]
  if (message.startsWith('权限不足')) return Err.FORBIDDEN
  if (message.startsWith('仅 Owner')) return Err.FORBIDDEN
  if (httpStatus === 401) return Err.UNAUTH
  if (httpStatus === 403) return Err.FORBIDDEN
  if (httpStatus === 404) return Err.NOT_FOUND
  if (httpStatus === 400) return Err.BAD_REQUEST
  if (httpStatus === 410) return Err.GONE
  return Err.INTERNAL
}

/**
 * 全局错误处理（未捕获异常 → 七字段）
 * 负压：畸形 JSON / body 解析失败 → 400，禁止冒充 500 系统故障
 */
export function globalErrorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const message = err instanceof Error ? err.message : '系统异常'
  const name = err instanceof Error ? err.name : ''
  const status =
    (err as { status?: number; statusCode?: number })?.status ||
    (err as { status?: number; statusCode?: number })?.statusCode
  const isBodyParse =
    name === 'SyntaxError' ||
    /JSON|Unexpected token|body|entity\.parse/i.test(message) ||
    status === 400
  if (isBodyParse) {
    fail(res, 400, Err.BAD_REQUEST, '请求体无效', req)
    return
  }
  fail(res, 500, Err.INTERNAL, message, req)
}
