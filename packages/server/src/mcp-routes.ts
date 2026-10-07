/**
 * MCP 相关 REST 路由：公开投影 · PAT · 审核回传 · 文件辅助
 * 观测走 security/runtime，禁止默认 audit 打业务库（R-015）
 */

import type { Express, Request, Response } from 'express'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import { v4 as uuidv4 } from 'uuid'
import { database, getUploadRoot } from './runtime-base/l0/infra/db/ready.js'
import { requirePermission, requireAnyPermission, resolveVisibleUserIds } from './runtime-base/l1/mgmt/rbac/ready.js'
import { guardMemoAccess, guardFileAccess } from './runtime-base/l1/mgmt/iam/ready.js'
import { fail, Err } from './runtime-base/l1/mgmt/code/ready.js'
import { log } from './runtime-base/l0/infra/log/ready.js'
import {
  isObservabilityStoreReady,
  listObservabilityLogsByAction,
} from './runtime-base/l0/infra/log/obs-store.js'
import { createFileViaBase, updateMemoViaBase } from './runtime-base/l1/host/biz/ready.js'
import { getUserByMcpDownstreamToken } from './mcp-token.js'
import { issueMcpDownstreamToken } from './mcp-token.js'
import { gradeAndEmitAlertCandidate, listAlertTickets } from './runtime-base/l1/host/alert/ready.js'
import { getConfig } from './runtime-base/l0/infra/cfg/ready.js'
import {
  getPublicMaxLayer,
  loadMcpPublicConfig,
  saveMcpPublicConfig,
  getMemoPublicSelector,
  getFilePublicSelector,
  matchMemoSelector,
  matchFileSelector,
  type PublicMaxLayer,
} from './mcp-public-config.js'
import {
  loadMcpCapConfig,
  saveMcpCapConfig,
  isMcpPublicTrackEnabled,
} from './mcp-cap-config.js'

const PAT_TTL_MS = 30 * 24 * 60 * 60 * 1000
const OAUTH_CODES = new Map<
  string,
  { clientId: string; userId: string; redirectUri: string; challenge: string; exp: number }
>()
const AUDIT_RETENTION_MS = 180 * 24 * 60 * 60 * 1000

/**
 * 从请求中尝试解析 Bearer token 并获取租户 ID（MCP 公开查询租户隔离）
 * 公开查询在鉴权白名单里，不走 authenticate 中间件；此处手动解析仅用于租户过滤
 * 支持：会话 token / MCP 下游令牌 / MCP PAT
 */
function tryResolveTenantFromRequest(req: Request): string | null {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) return null
  const token = header.slice(7).trim()
  if (!token) return null

  // 会话 token
  let user = database.getUserByToken(token)
  // MCP 下游令牌
  if (!user && token.startsWith('cypmcpds_')) {
    user = getUserByMcpDownstreamToken(token)
  }
  // MCP PAT（仅用于换发入口，这里也允许提取租户）
  if (!user && token.startsWith('cypmcp_')) {
    user = database.getUserByMcpPat(token)
  }
  return user?.tenantRootId || null
}

function oauthIssuer(req: Request): string {
  const host = String(req.headers.host || '').trim()
  const xf = String(req.headers['x-forwarded-proto'] || '')
  const proto = xf === 'https' || (req.socket as { encrypted?: boolean }).encrypted ? 'https' : 'http'
  return `${proto}://${host || '127.0.0.1'}`
}

function oauthMetadata(req: Request) {
  const iss = oauthIssuer(req)
  return {
    issuer: iss,
    authorization_endpoint: `${iss}/api/mcp/oauth/authorize`,
    token_endpoint: `${iss}/api/mcp/oauth/token`,
    registration_endpoint: `${iss}/api/mcp/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['client_secret_post', 'none'],
  }
}

function pkceS256(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url')
}

function parseOauthAuthorizeQuery(req: Request): {
  ok: true
  clientId: string
  redirectUri: string
  challenge: string
  method: string
  state: string
  responseType: string
} | { ok: false; message: string } {
  const clientId = String(req.query.client_id || '')
  const redirectUri = String(req.query.redirect_uri || '')
  const challenge = String(req.query.code_challenge || '')
  const method = String(req.query.code_challenge_method || 'S256')
  const state = String(req.query.state || '')
  const responseType = String(req.query.response_type || 'code')
  if (responseType !== 'code') {
    return { ok: false, message: '仅支持 response_type=code' }
  }
  const client = database.getMcpOauthClient(clientId)
  if (!client || !client.redirectUris.includes(redirectUri) || method !== 'S256' || challenge.length < 16) {
    return { ok: false, message: 'OAuth 授权参数无效' }
  }
  return { ok: true, clientId, redirectUri, challenge, method, state, responseType }
}

/** 浏览器导航走同意页；带 Bearer 且 Accept 偏 JSON 的机检/API 仍可直接发码 */
function wantsOauthConsentUi(req: Request): boolean {
  if (String(req.query.ui || '') === '1') return true
  const accept = String(req.headers.accept || '').toLowerCase()
  const auth = String(req.headers.authorization || '')
  const hasBearer = auth.toLowerCase().startsWith('bearer ')
  if (hasBearer && accept.includes('application/json') && !accept.includes('text/html')) {
    return false
  }
  if (!hasBearer) return true
  if (accept.includes('text/html')) return true
  return false
}

function buildConsentPageUrl(req: Request, q: {
  clientId: string
  redirectUri: string
  challenge: string
  method: string
  state: string
}): string {
  const origin = oauthIssuer(req)
  const params = new URLSearchParams({
    client_id: q.clientId,
    redirect_uri: q.redirectUri,
    code_challenge: q.challenge,
    code_challenge_method: q.method,
    response_type: 'code',
  })
  if (q.state) params.set('state', q.state)
  return `${origin}/help/mcp/oauth/consent?${params.toString()}`
}

function issueOauthAuthorizeCode(input: {
  clientId: string
  userId: string
  redirectUri: string
  challenge: string
}): string {
  const code = crypto.randomBytes(24).toString('hex')
  OAUTH_CODES.set(code, {
    clientId: input.clientId,
    userId: input.userId,
    redirectUri: input.redirectUri,
    challenge: input.challenge,
    exp: Date.now() + 5 * 60 * 1000,
  })
  return code
}

function purgeOldMcpAuditJsonl(dir: string): void {
  if (!fs.existsSync(dir)) return
  const cutoff = Date.now() - AUDIT_RETENTION_MS
  for (const name of fs.readdirSync(dir)) {
    const m = /^mcp-audit-(\d{4}-\d{2}-\d{2})\.jsonl$/.exec(name)
    if (!m) continue
    const t = Date.parse(`${m[1]}T00:00:00Z`)
    if (!Number.isFinite(t) || t >= cutoff) continue
    try {
      fs.unlinkSync(path.join(dir, name))
    } catch {
      /* ignore */
    }
  }
}

function appendMcpAuditJsonl(row: Record<string, unknown>): void {
  const dir = path.join(getConfig().dataDir, 'logs', 'mcp')
  fs.mkdirSync(dir, { recursive: true })
  const day = new Date().toISOString().slice(0, 10)
  fs.appendFileSync(path.join(dir, `mcp-audit-${day}.jsonl`), `${JSON.stringify(row)}\n`, 'utf8')
}

function parseObsDetails(details: string | null | undefined): Record<string, unknown> {
  if (!details) return {}
  try {
    const o = JSON.parse(details) as Record<string, unknown>
    const ctx =
      o.context && typeof o.context === 'object' ? (o.context as Record<string, unknown>) : {}
    return { ...o, ...ctx }
  } catch {
    return {}
  }
}

function mapMcpAuditRow(row: {
  id: string
  level: string
  message: string
  action?: string | null
  userId?: string | null
  details?: string | null
  traceId?: string | null
  createdAt: string
}) {
  const ctx = parseObsDetails(row.details)
  return {
    id: row.id,
    at: row.createdAt,
    level: row.level,
    message: row.message,
    action: row.action || 'mcp.audit',
    userId: row.userId || null,
    traceId: row.traceId || null,
    tier: typeof ctx.tier === 'string' ? ctx.tier : '',
    tool: typeof ctx.tool === 'string' ? ctx.tool : '',
    subject: typeof ctx.subject === 'string' ? ctx.subject : '',
    resultCode: typeof ctx.resultCode === 'string' ? ctx.resultCode : '',
    layers: Array.isArray(ctx.layers) ? ctx.layers.map(String) : [],
    clientName: typeof ctx.clientName === 'string' ? ctx.clientName : '',
    connectorId: typeof ctx.connectorId === 'string' ? ctx.connectorId : '',
    tokenFingerprint: typeof ctx.tokenFingerprint === 'string' ? ctx.tokenFingerprint : '',
  }
}

function pageSlice<T>(items: T[], page: number, pageSize: number): { items: T[]; total: number } {
  const p = Math.max(1, page)
  const ps = Math.min(100, Math.max(1, pageSize))
  const start = (p - 1) * ps
  return { items: items.slice(start, start + ps), total: items.length }
}

/** 公开轨用途摘要（≤50 字；服务端计算，避免 REST 回传全文） */
function buildPublicPurposeSummary(input: {
  title?: string | null
  tags?: string[]
  contentHint?: string | null
}): { summary: string; summary_truncated: boolean } {
  const tags = (input.tags || []).filter(Boolean).slice(0, 3)
  const title = (input.title || '').trim()
  let purpose = title
    ? `用途：记录与「${title}」相关的备忘`
    : '用途：备忘录条目，供后续查阅与引用'
  if (tags.length) purpose += `；标签 ${tags.join('、')}`
  const hint = (input.contentHint || '').replace(/\s+/g, ' ').trim()
  if (hint.length > 20) {
    const words = hint.split(/[，。；！？\s]+/).filter((w) => w.length >= 2 && w.length <= 8)
    if (words[0] && !purpose.includes(words[0])) purpose += `；涉及${words[0]}`
  }
  const chars = [...purpose]
  if (chars.length <= 50) return { summary: purpose, summary_truncated: false }
  return { summary: chars.slice(0, 50).join(''), summary_truncated: true }
}

export function registerMcpRoutes(app: Express): void {
  app.get('/.well-known/oauth-authorization-server', (req, res) => {
    res.json(oauthMetadata(req))
  })

  app.get('/api/mcp/oauth/metadata', (req, res) => {
    res.json(oauthMetadata(req))
  })

  app.post('/api/mcp/oauth/register', (req, res) => {
    const body = (req.body || {}) as { redirect_uris?: string[]; client_name?: string }
    const uris = Array.isArray(body.redirect_uris) ? body.redirect_uris.map(String).filter(Boolean) : []
    if (!uris.length) {
      fail(res, 400, Err.BAD_REQUEST, '缺少 redirect_uris', req)
      return
    }
    const clientId = `mcpcli_${crypto.randomBytes(12).toString('hex')}`
    const secret = crypto.randomBytes(24).toString('hex')
    const secretHash = crypto.createHash('sha256').update(secret).digest('hex')
    database.createMcpOauthClient({ clientId, secretHash, redirectUris: uris })
    log({
      level: 'info',
      type: 'security',
      message: 'MCP OAuth client registered',
      action: 'mcp.oauth.register',
      context: { clientId, client_name: String(body.client_name || '').slice(0, 64) },
    })
    res.status(201).json({
      client_id: clientId,
      client_secret: secret,
      redirect_uris: uris,
      token_endpoint_auth_method: 'client_secret_post',
    })
  })

  app.get('/api/mcp/oauth/authorize', (req, res) => {
    const parsed = parseOauthAuthorizeQuery(req)
    if (!parsed.ok) {
      fail(res, 400, Err.BAD_REQUEST, parsed.message, req)
      return
    }
    if (wantsOauthConsentUi(req)) {
      res.redirect(302, buildConsentPageUrl(req, parsed))
      return
    }
    if (!req.authUser) {
      fail(res, 401, Err.UNAUTH, '授权码换发须登录会话', req)
      return
    }
    const code = issueOauthAuthorizeCode({
      clientId: parsed.clientId,
      userId: req.authUser.id,
      redirectUri: parsed.redirectUri,
      challenge: parsed.challenge,
    })
    res.json({
      success: true,
      data: { code, state: parsed.state, redirect_uri: parsed.redirectUri },
    })
  })

  app.post('/api/mcp/oauth/consent', (req, res) => {
    if (!req.authUser) {
      fail(res, 401, Err.UNAUTH, '授权须登录会话', req)
      return
    }
    const body = (req.body || {}) as Record<string, unknown>
    const approve = body.approve === true || body.approve === 'true' || body.approve === 1
    const clientId = String(body.client_id || '')
    const redirectUri = String(body.redirect_uri || '')
    const challenge = String(body.code_challenge || '')
    const method = String(body.code_challenge_method || 'S256')
    const state = String(body.state || '')
    const client = database.getMcpOauthClient(clientId)
    if (!client || !client.redirectUris.includes(redirectUri) || method !== 'S256' || challenge.length < 16) {
      fail(res, 400, Err.BAD_REQUEST, 'OAuth 授权参数无效', req)
      return
    }
    if (!approve) {
      const deny = new URL(redirectUri)
      deny.searchParams.set('error', 'access_denied')
      if (state) deny.searchParams.set('state', state)
      log({
        level: 'info',
        type: 'security',
        message: 'MCP OAuth consent denied',
        action: 'mcp.oauth.consent.deny',
        userId: req.authUser.id,
        context: { clientId },
      })
      res.json({ success: true, data: { approved: false, redirect: deny.toString() } })
      return
    }
    const code = issueOauthAuthorizeCode({
      clientId,
      userId: req.authUser.id,
      redirectUri,
      challenge,
    })
    const okUrl = new URL(redirectUri)
    okUrl.searchParams.set('code', code)
    if (state) okUrl.searchParams.set('state', state)
    log({
      level: 'info',
      type: 'security',
      message: 'MCP OAuth consent approved',
      action: 'mcp.oauth.consent.approve',
      userId: req.authUser.id,
      context: { clientId },
    })
    res.json({
      success: true,
      data: { approved: true, redirect: okUrl.toString(), code, state, redirect_uri: redirectUri },
    })
  })

  app.post('/api/mcp/oauth/token', (req, res) => {
    const body = (req.body || {}) as Record<string, string>
    if (body.grant_type !== 'authorization_code') {
      fail(res, 400, Err.BAD_REQUEST, '仅支持 authorization_code', req)
      return
    }
    const rec = OAUTH_CODES.get(String(body.code || ''))
    if (!rec || rec.exp < Date.now()) {
      fail(res, 400, Err.BAD_REQUEST, '授权码无效或过期', req)
      return
    }
    OAUTH_CODES.delete(String(body.code || ''))
    const client = database.getMcpOauthClient(rec.clientId)
    if (!client || rec.redirectUri !== String(body.redirect_uri || '')) {
      fail(res, 400, Err.BAD_REQUEST, 'redirect_uri 不匹配', req)
      return
    }
    if (client.secretHash) {
      const secret = String(body.client_secret || '')
      const hash = crypto.createHash('sha256').update(secret).digest('hex')
      if (hash !== client.secretHash) {
        fail(res, 401, Err.UNAUTH, 'client_secret 无效', req)
        return
      }
    }
    if (pkceS256(String(body.code_verifier || '')) !== rec.challenge) {
      fail(res, 400, Err.BAD_REQUEST, 'PKCE 校验失败', req)
      return
    }
    const raw = `cypmcp_${crypto.randomBytes(24).toString('hex')}`
    const tokenHash = crypto.createHash('sha256').update(raw).digest('hex')
    const expiresAt = new Date(Date.now() + PAT_TTL_MS).toISOString()
    const patId = database.createMcpPat({
      userId: rec.userId,
      tokenHash,
      tokenPrefix: raw.slice(0, 12),
      label: 'oauth',
      expiresAt,
    })
    const ds = issueMcpDownstreamToken({ userId: rec.userId, patId })
    res.json({
      access_token: ds.accessToken,
      token_type: 'Bearer',
      expires_in: 900,
      audience: ds.audience,
    })
  })

  app.post('/api/mcp/exchange', (req, res) => {
    const header = String(req.headers.authorization || '')
    const raw = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''
    const pat = database.getMcpPatByRawToken(raw)
    if (!pat || !req.authUser || pat.userId !== req.authUser.id) {
      fail(res, 401, Err.UNAUTH, '个人令牌无效', req)
      return
    }
    const ds = issueMcpDownstreamToken({ userId: pat.userId, patId: pat.id })
    res.json({ success: true, data: ds })
  })

  app.post('/api/mcp/selector-snapshot', (req, res) => {
    const body = (req.body || {}) as Record<string, unknown>
    log({
      level: 'info',
      type: 'security',
      message: 'MCP public selector snapshot',
      action: 'mcp.selector.snapshot',
      userId: req.authUser?.id,
      context: { before: body.before, after: body.after || body.selector },
    })
    res.json({ success: true, data: { ok: true } })
  })

  // —— 公开投影（白名单）——
  app.get('/api/public/mcp/memos', (req, res) => {
    if (!isMcpPublicTrackEnabled()) {
      fail(res, 404, Err.NOT_FOUND, '资源不存在', req)
      return
    }
    const page = Number(req.query.page || 1)
    const pageSize = Number(req.query.pageSize || 20)
    const cfg = loadMcpPublicConfig()
    const sel = getMemoPublicSelector(cfg)
    const tenantRootId = tryResolveTenantFromRequest(req)
    const pool = tenantRootId
      ? (sel.requireFlag ? database.listMcpPublicMemosByTenant(tenantRootId) : database.listActiveMemosByTenant(tenantRootId))
      : (sel.requireFlag ? database.listMcpPublicMemos() : database.listActiveMemos())
    const all = pool.filter((m) => matchMemoSelector(m, sel))
    const { items, total } = pageSlice(all, page, pageSize)
    res.json({
      success: true,
      data: {
        items: items.map((m) => ({
          id: m.id,
          title: m.title,
          tags: m.tags,
          createdAt: m.createdAt,
          updatedAt: m.updatedAt,
          mcpPublic: Boolean(m.mcpPublic),
        })),
        total,
        selectorMode: sel.mode,
      },
    })
  })

  app.get('/api/public/mcp/memos/:id', (req, res) => {
    if (!isMcpPublicTrackEnabled()) {
      fail(res, 404, Err.NOT_FOUND, '资源不存在', req)
      return
    }
    const cfg = loadMcpPublicConfig()
    const sel = getMemoPublicSelector(cfg)
    const memo = database.getMemoById(req.params.id)
    if (!memo || memo.deletedAt || !matchMemoSelector(memo, sel)) {
      fail(res, 404, Err.NOT_FOUND, '资源不存在', req)
      return
    }
    // 租户隔离：带 token 时只允许访问同租户的公开备忘录
    const tenantRootId = tryResolveTenantFromRequest(req)
    if (tenantRootId) {
      const owner = database.getUserById(memo.userId)
      if (!owner || owner.tenantRootId !== tenantRootId) {
        fail(res, 404, Err.NOT_FOUND, '资源不存在', req)
        return
      }
    }
    const layerRaw = String(req.query.layer || 'summary').toLowerCase()
    const layer: 'title' | 'summary' | 'full' =
      layerRaw === 'title' || layerRaw === 'full' ? layerRaw : 'summary'
    const order = { title: 0, summary: 1, full: 2 } as const
    const publicMax = getPublicMaxLayer()
    if (order[layer] > order[publicMax]) {
      // O6：超公开最高层按不存在处理，防枚举
      fail(res, 404, Err.NOT_FOUND, '资源不存在', req)
      return
    }
    const purpose = buildPublicPurposeSummary({
      title: memo.title,
      tags: memo.tags,
      contentHint: memo.content,
    })
    const data: Record<string, unknown> = {
      id: memo.id,
      title: memo.title,
      tags: memo.tags,
      createdAt: memo.createdAt,
      updatedAt: memo.updatedAt,
      mcpPublic: Boolean(memo.mcpPublic),
      publicMaxLayer: publicMax,
    }
    if (layer !== 'title') {
      data.summary = purpose.summary
      data.summary_truncated = purpose.summary_truncated
    }
    // 仅当公开最高层允许 full 且显式请求时才回传正文（默认 summary 永不带 content）
    if (layer === 'full' && publicMax === 'full') {
      data.content = memo.content
    }
    res.json({ success: true, data })
  })

  app.get('/api/public/mcp/files', (req, res) => {
    if (!isMcpPublicTrackEnabled()) {
      fail(res, 404, Err.NOT_FOUND, '资源不存在', req)
      return
    }
    const page = Number(req.query.page || 1)
    const pageSize = Number(req.query.pageSize || 20)
    const cfg = loadMcpPublicConfig()
    const sel = getFilePublicSelector(cfg)
    const tenantRootId = tryResolveTenantFromRequest(req)
    const pool = tenantRootId
      ? (sel.requireFlag ? database.listMcpPublicFilesByTenant(tenantRootId) : database.listAllFiles().filter(f => {
          const u = database.getUserById(f.userId)
          return u?.tenantRootId === tenantRootId
        }))
      : (sel.requireFlag ? database.listMcpPublicFiles() : database.listAllFiles())
    const all = pool.filter((f) => matchFileSelector(f, sel))
    const { items, total } = pageSlice(all, page, pageSize)
    res.json({
      success: true,
      data: {
        items: items.map((f) => ({
          id: f.id,
          filename: f.filename,
          size: f.size,
          type: f.mimeType,
          uploadedAt: f.createdAt,
          mcpPublic: Boolean(f.mcpPublic),
        })),
        total,
        selectorMode: sel.mode,
      },
    })
  })

  app.get('/api/public/mcp/files/:id', (req, res) => {
    if (!isMcpPublicTrackEnabled()) {
      fail(res, 404, Err.NOT_FOUND, '资源不存在', req)
      return
    }
    const cfg = loadMcpPublicConfig()
    const sel = getFilePublicSelector(cfg)
    const file = database.getFileById(req.params.id)
    if (!file || !matchFileSelector(file, sel)) {
      fail(res, 404, Err.NOT_FOUND, '资源不存在', req)
      return
    }
    // 租户隔离：带 token 时只允许访问同租户的公开文件
    const tenantRootId = tryResolveTenantFromRequest(req)
    if (tenantRootId) {
      const owner = database.getUserById(file.userId)
      if (!owner || owner.tenantRootId !== tenantRootId) {
        fail(res, 404, Err.NOT_FOUND, '资源不存在', req)
        return
      }
    }
    const layerRaw = String(req.query.layer || 'summary').toLowerCase()
    const layer: 'title' | 'summary' | 'full' =
      layerRaw === 'title' || layerRaw === 'full' ? layerRaw : 'summary'
    const order = { title: 0, summary: 1, full: 2 } as const
    const publicMax = getPublicMaxLayer()
    if (order[layer] > order[publicMax]) {
      fail(res, 404, Err.NOT_FOUND, '资源不存在', req)
      return
    }
    const purpose = buildPublicPurposeSummary({
      title: file.filename,
      tags: [],
      contentHint: file.filename,
    })
    const data: Record<string, unknown> = {
      id: file.id,
      filename: file.filename,
      size: file.size,
      type: file.mimeType,
      mimeType: file.mimeType,
      uploadedAt: file.createdAt,
      createdAt: file.createdAt,
      mcpPublic: true,
      publicMaxLayer: publicMax,
    }
    if (layer !== 'title') {
      data.summary = purpose.summary
      data.summary_truncated = purpose.summary_truncated
    }
    res.json({ success: true, data })
  })

  app.get('/api/public/mcp/files/:id/blob', (req, res) => {
    if (!isMcpPublicTrackEnabled()) {
      fail(res, 404, Err.NOT_FOUND, '资源不存在', req)
      return
    }
    const cfg = loadMcpPublicConfig()
    const sel = getFilePublicSelector(cfg)
    const file = database.getFileById(req.params.id)
    if (!file || !matchFileSelector(file, sel)) {
      fail(res, 404, Err.NOT_FOUND, '资源不存在', req)
      return
    }
    // 租户隔离：带 token 时只允许访问同租户的公开文件
    const tenantRootId = tryResolveTenantFromRequest(req)
    if (tenantRootId) {
      const owner = database.getUserById(file.userId)
      if (!owner || owner.tenantRootId !== tenantRootId) {
        fail(res, 404, Err.NOT_FOUND, '资源不存在', req)
        return
      }
    }
    // O5：公开最高层默认 summary，blob=全文层；未开公开 full 则 404（防旁路分段）
    if (getPublicMaxLayer() !== 'full') {
      fail(res, 404, Err.NOT_FOUND, '资源不存在', req)
      return
    }
    const abs = path.isAbsolute(file.path) ? file.path : path.join(getUploadRoot(), path.basename(file.path))
    if (!fs.existsSync(abs)) {
      fail(res, 404, Err.NOT_FOUND, '文件不存在', req)
      return
    }
    res.setHeader('Content-Type', file.mimeType || 'application/octet-stream')
    fs.createReadStream(abs).pipe(res)
  })

  // —— 公开投影配置（设计 10.3 / A8c）——
  app.get(
    '/api/mcp/public-config',
    requireAnyPermission('memo_manage', 'memo_data', 'attachment_manage', 'settings_manage'),
    (_req, res) => {
      const cfg = loadMcpPublicConfig()
      res.json({
        success: true,
        data: {
          maxLayer: cfg.maxLayer,
          memoSelectorMode: cfg.memoSelectorMode,
          fileSelectorMode: cfg.fileSelectorMode,
          memoSelectorTags: cfg.memoSelectorTags,
          memoSelectorIds: cfg.memoSelectorIds,
          fileSelectorTags: cfg.fileSelectorTags,
          fileSelectorIds: cfg.fileSelectorIds,
          requireFlag: cfg.requireFlag,
          updatedAt: cfg.updatedAt,
          note: 'flag：勾选公开；tag/ids：填白名单且默认仍须勾选（requireFlag）',
        },
      })
    }
  )

  app.put(
    '/api/mcp/public-config',
    requireAnyPermission('memo_manage', 'attachment_manage', 'settings_manage'),
    (req, res) => {
      const body = (req.body || {}) as {
        maxLayer?: string
        memoSelectorMode?: string
        fileSelectorMode?: string
        memoSelectorTags?: string[] | string
        memoSelectorIds?: string[] | string
        fileSelectorTags?: string[] | string
        fileSelectorIds?: string[] | string
        requireFlag?: boolean
      }
      const saved = saveMcpPublicConfig(
        {
          maxLayer: body.maxLayer as PublicMaxLayer | undefined,
          memoSelectorMode: body.memoSelectorMode as never,
          fileSelectorMode: body.fileSelectorMode as never,
          memoSelectorTags: body.memoSelectorTags as never,
          memoSelectorIds: body.memoSelectorIds as never,
          fileSelectorTags: body.fileSelectorTags as never,
          fileSelectorIds: body.fileSelectorIds as never,
          requireFlag: body.requireFlag,
        },
        req.authUser?.id
      )
      res.json({ success: true, data: saved })
    }
  )

  // —— 能力开关矩阵（设计 6.1）——
  app.get(
    '/api/mcp/cap-config',
    requireAnyPermission('memo_manage', 'memo_data', 'attachment_manage', 'settings_manage'),
    (_req, res) => {
      const cfg = loadMcpCapConfig()
      res.json({
        success: true,
        data: {
          ...cfg,
          note: '写能力默认关闭；旁路热叠读本配置，写能力新开时通知 list_changed。关闭分段/诚实报告仅建议本机调试。',
        },
      })
    }
  )

  app.put(
    '/api/mcp/cap-config',
    requireAnyPermission('memo_manage', 'attachment_manage', 'settings_manage'),
    (req, res) => {
      const body = (req.body || {}) as Record<string, unknown>
      const saved = saveMcpCapConfig(
        {
          enabled: body.enabled as boolean | undefined,
          query: body.query as boolean | undefined,
          memoWrite: body.memoWrite as boolean | undefined,
          fileWrite: body.fileWrite as boolean | undefined,
          requireSegmentedRead: body.requireSegmentedRead as boolean | undefined,
          requireHonestyReport: body.requireHonestyReport as boolean | undefined,
          publicEnabled: body.publicEnabled as boolean | undefined,
          connectorAllow: body.connectorAllow as boolean | undefined,
          connectorRequireName: body.connectorRequireName as boolean | undefined,
        },
        req.authUser?.id
      )
      res.json({ success: true, data: saved })
    }
  )

  // —— PAT ——
  app.post('/api/mcp/pat', requireAnyPermission('memo_manage', 'memo_data'), (req, res) => {
    const user = req.authUser!
    const label = String((req.body || {}).label || 'mcp').slice(0, 64)
    const raw = `cypmcp_${crypto.randomBytes(24).toString('hex')}`
    const tokenHash = crypto.createHash('sha256').update(raw).digest('hex')
    const expiresAt = new Date(Date.now() + PAT_TTL_MS).toISOString()
    const id = database.createMcpPat({
      userId: user.id,
      tokenHash,
      tokenPrefix: raw.slice(0, 12),
      label,
      expiresAt,
    })
    log({
      level: 'info',
      type: 'security',
      message: 'MCP PAT issued',
      action: 'mcp.pat.create',
      userId: user.id,
      context: { patId: id, prefix: raw.slice(0, 12), expiresAt },
    })
    res.json({
      success: true,
      data: { id, token: raw, tokenPrefix: raw.slice(0, 12), label, expiresAt },
    })
  })

  app.get('/api/mcp/pat', requireAnyPermission('memo_manage', 'memo_data'), (req, res) => {
    const rows = database.listMcpPatsByUserId(req.authUser!.id)
    res.json({
      success: true,
      data: rows.map((r) => ({
        id: r.id,
        label: r.label,
        tokenPrefix: r.tokenPrefix,
        expiresAt: r.expiresAt,
        createdAt: r.createdAt,
        revokedAt: r.revokedAt,
      })),
    })
  })

  app.delete('/api/mcp/pat/:id', requireAnyPermission('memo_manage', 'memo_data'), (req, res) => {
    const ok = database.revokeMcpPat(req.params.id, req.authUser!.id)
    if (!ok) {
      fail(res, 404, Err.NOT_FOUND, 'PAT 不存在', req)
      return
    }
    log({
      level: 'info',
      type: 'security',
      message: 'MCP PAT revoked',
      action: 'mcp.pat.revoke',
      userId: req.authUser!.id,
      context: { patId: req.params.id },
    })
    res.json({ success: true, data: { ok: true } })
  })

  /** 轮换：吊销旧令牌并签发同标签新令牌（高敏 ≤30 天 · 设计 10.1） */
  app.post('/api/mcp/pat/:id/rotate', requireAnyPermission('memo_manage', 'memo_data'), (req, res) => {
    const user = req.authUser!
    const old = database.getMcpPatById(req.params.id)
    if (!old || old.userId !== user.id) {
      fail(res, 404, Err.NOT_FOUND, 'PAT 不存在', req)
      return
    }
    if (old.revokedAt) {
      fail(res, 400, Err.BAD_REQUEST, '已吊销的令牌不可轮换', req)
      return
    }
    const revoked = database.revokeMcpPat(old.id, user.id)
    if (!revoked) {
      fail(res, 404, Err.NOT_FOUND, 'PAT 不存在', req)
      return
    }
    const label = String(old.label || 'mcp').slice(0, 64)
    const raw = `cypmcp_${crypto.randomBytes(24).toString('hex')}`
    const tokenHash = crypto.createHash('sha256').update(raw).digest('hex')
    const expiresAt = new Date(Date.now() + PAT_TTL_MS).toISOString()
    const id = database.createMcpPat({
      userId: user.id,
      tokenHash,
      tokenPrefix: raw.slice(0, 12),
      label,
      expiresAt,
    })
    log({
      level: 'info',
      type: 'security',
      message: 'MCP PAT rotated',
      action: 'mcp.pat.rotate',
      userId: user.id,
      context: {
        oldPatId: old.id,
        newPatId: id,
        prefix: raw.slice(0, 12),
        expiresAt,
        ttlDays: 30,
      },
    })
    res.json({
      success: true,
      data: {
        id,
        token: raw,
        tokenPrefix: raw.slice(0, 12),
        label,
        expiresAt,
        rotatedFrom: old.id,
        ttlDays: 30,
      },
    })
  })

  app.get('/api/mcp/pat/me', (req, res) => {
    // authenticate 已解析会话或 PAT
    if (!req.authUser) {
      fail(res, 401, Err.UNAUTH, '未认证', req)
      return
    }
    res.json({
      success: true,
      data: {
        userId: req.authUser.id,
        digitalId: req.authUser.digitalId,
        username: req.authUser.username,
      },
    })
  })

  // —— 审核回传（观测）——
  app.post('/api/mcp/audit', (req, res) => {
    const body = (req.body || {}) as Record<string, unknown>
    const userId = req.authUser?.id
    const resultCode = String(body.resultCode || '')
    const auditCtx = {
      tier: body.tier,
      tool: body.tool,
      subject: body.subject,
      resourceIds: body.resourceIds,
      resultCode: body.resultCode,
      layers: body.layers,
      tokenFingerprint: body.tokenFingerprint,
      connectorId: body.connectorId,
      clientName: body.clientName,
      detail: body.detail,
    }
    log({
      level: (['error', 'warn', 'info', 'debug'].includes(String(body.level || '').toLowerCase())
        ? String(body.level).toLowerCase()
        : 'info') as 'info' | 'warn' | 'error' | 'debug',
      type: 'security',
      message: `MCP ${String(body.tool || 'unknown')} ${resultCode}`,
      action: 'mcp.audit',
      userId,
      context: auditCtx,
    })
    try {
      appendMcpAuditJsonl({
        ts: new Date().toISOString(),
        userId: userId || null,
        ...auditCtx,
        level: body.level || 'info',
      })
    } catch {
      /* JSONL 失败不阻断 */
    }
    if (
      resultCode === 'MCP_READ_LAYER_SKIP' ||
      resultCode === 'MCP_AUTH' ||
      resultCode === 'MCP_AUDIT_REJECT' ||
      resultCode === 'MCP_DISABLED'
    ) {
      gradeAndEmitAlertCandidate({
        signal: resultCode,
        source: 'mcp',
        title: `MCP ${String(body.tool || 'unknown')} ${resultCode}`,
        detail: String(body.subject || ''),
        grade: resultCode === 'MCP_AUDIT_REJECT' ? 'critical' : 'warn',
      })
    }
    try {
      purgeOldMcpAuditJsonl(path.join(getConfig().dataDir, 'logs', 'mcp'))
    } catch {
      /* ignore */
    }
    res.json({ success: true, data: { ok: true } })
  })

  // —— 审核流水检索（产品壳 / 运维可视 · 设计 10.4–10.6）——
  app.get(
    '/api/mcp/audit',
    requireAnyPermission(
      'memo_manage',
      'memo_data',
      'attachment_manage',
      'settings_manage',
      'tenant_logs',
      'tenant_monitor'
    ),
    (req, res) => {
      const qLimitRaw = typeof req.query.limit === 'string' ? Number(req.query.limit) : NaN
      const limit = Math.min(500, Math.max(1, Number.isFinite(qLimitRaw) ? qLimitRaw : 100))
      const tierQ = typeof req.query.tier === 'string' ? req.query.tier.trim() : ''
      const resultQ = typeof req.query.resultCode === 'string' ? req.query.resultCode.trim() : ''
      const levelQ = typeof req.query.level === 'string' ? req.query.level.trim().toLowerCase() : ''
      const toolQ = typeof req.query.tool === 'string' ? req.query.tool.trim() : ''

      const raw = isObservabilityStoreReady()
        ? listObservabilityLogsByAction('mcp.audit', Math.min(2000, limit * 4))
        : []
      let items = raw.map(mapMcpAuditRow)
      if (tierQ) items = items.filter((r) => r.tier === tierQ)
      if (resultQ) items = items.filter((r) => r.resultCode === resultQ)
      if (levelQ) items = items.filter((r) => r.level === levelQ)
      if (toolQ) items = items.filter((r) => r.tool.includes(toolQ))
      items = items.slice(0, limit)

      const alerts = listAlertTickets({ status: 'active', limit: 50 }).filter(
        (t) => t.source === 'mcp' || /^MCP\b/i.test(t.title)
      )

      res.json({
        success: true,
        data: {
          items,
          total: items.length,
          alerts: alerts.map((t) => ({
            id: t.id,
            severity: t.severity,
            source: t.source,
            title: t.title,
            detail: t.detail || '',
            status: t.status,
            createdAt: t.createdAt,
          })),
          retentionDays: 180,
          note: '观测库 action=mcp.audit；异常会进 source=mcp 告警工单',
        },
      })
    }
  )

  // —— 全功能文件列表 ——
  app.get('/api/mcp/files', requirePermission('attachment_manage'), (req, res) => {
    const scope = resolveVisibleUserIds(req, 'attachment')
    const files = database.getFilesByUserIds(scope)
    res.json({
      success: true,
      data: {
        items: files.map((f) => ({
          id: f.id,
          filename: f.filename,
          size: f.size,
          type: f.mimeType,
          uploadedAt: f.createdAt,
          mcpPublic: Boolean(f.mcpPublic),
          userId: f.userId,
        })),
      },
    })
  })

  app.patch('/api/files/:id/metadata', requirePermission('attachment_manage'), (req, res) => {
    if (!guardFileAccess(req, res, req.params.id)) return
    const body = (req.body || {}) as { filename?: string; mcpPublic?: boolean }
    const updates: { filename?: string; mcpPublic?: boolean } = {}
    if (typeof body.filename === 'string' && body.filename.trim()) updates.filename = body.filename.trim()
    if (typeof body.mcpPublic === 'boolean') updates.mcpPublic = body.mcpPublic
    database.updateFileMcpMeta(req.params.id, updates)
    res.json({ success: true, data: database.getFileById(req.params.id) })
  })

  app.post('/api/mcp/files/upload-b64', requirePermission('attachment_manage'), (req, res) => {
    try {
      const body = (req.body || {}) as {
        filename?: string
        contentBase64?: string
        mimeType?: string
        memoId?: string
        mcpPublic?: boolean
      }
      if (!body.filename || !body.contentBase64) {
        fail(res, 400, Err.BAD_REQUEST, '缺少 filename 或 contentBase64', req)
        return
      }
      if (body.memoId && !guardMemoAccess(req, res, body.memoId)) return
      const buf = Buffer.from(body.contentBase64, 'base64')
      const uploadRoot = getUploadRoot()
      const safeName = `${Date.now()}_${body.filename.replace(/[^\w.\-]+/g, '_')}`
      const abs = path.join(uploadRoot, safeName)
      fs.writeFileSync(abs, buf)
      const id = uuidv4()
      createFileViaBase({
        id,
        userId: req.authUser!.id,
        memoId: body.memoId || null,
        filename: body.filename,
        mimeType: body.mimeType || 'application/octet-stream',
        size: buf.length,
        path: abs,
        createdAt: new Date().toISOString(),
      })
      if (body.mcpPublic) {
        database.updateFileMcpMeta(id, { mcpPublic: true })
      }
      res.json({ success: true, data: { id, filename: body.filename, size: buf.length } })
    } catch (err) {
      fail(res, 500, Err.INTERNAL, '上传失败', req)
    }
  })

  // 备忘录公开标记（走既有 PATCH；此处保证 mcpPublic 可写）
  app.patch('/api/memos/:id/mcp-public', requirePermission('memo_manage'), (req, res) => {
    if (!guardMemoAccess(req, res, req.params.id)) return
    const flag = Boolean((req.body || {}).mcpPublic)
    updateMemoViaBase(req.params.id, { mcpPublic: flag } as never, req.authUser!.id)
    res.json({ success: true, data: { id: req.params.id, mcpPublic: flag } })
  })
}
