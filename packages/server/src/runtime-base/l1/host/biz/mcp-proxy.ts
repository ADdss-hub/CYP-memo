/**
 * 运行底座网关中心 · MCP 协议入站反代（旁路仅环回，局域网走唯一产品端口）
 * 不把 MCP Server 嵌入本进程（embeddedInServer 仍为 false）。
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import https from 'node:https'
import type { Request, Response, NextFunction, RequestHandler } from 'express'
import { evaluatePublicAccess, isRequestSecure } from '../../pub/acc/ready.js'
import { resolveClientIpFromHeaders } from './admission.js'

export function getMcpSidecarTarget(): { host: '127.0.0.1'; port: number } {
  const n = Number(process.env.CYP_MCP_HTTP_PORT || 13175)
  const port = Number.isFinite(n) && n > 0 ? Math.floor(n) : 13175
  return { host: '127.0.0.1', port }
}

export function isMcpProtocolIngress(
  method: string,
  path: string,
  headers: Request['headers']
): boolean {
  const p = String(path || '').split('?')[0]
  const m = String(method || 'GET').toUpperCase()
  if (p === '/mcp/discover' || p === '/mcp/healthz') return true
  if (p !== '/mcp') return false
  if (m === 'POST' || m === 'DELETE' || m === 'PUT') return true
  if (m === 'GET') {
    const proto = String(headers['mcp-protocol-version'] || '').trim()
    const accept = String(headers.accept || '').toLowerCase()
    return Boolean(proto) || accept.includes('text/event-stream')
  }
  return false
}

function sidecarPath(frontPath: string, url: string): string {
  const q = url.includes('?') ? url.slice(url.indexOf('?')) : ''
  if (frontPath === '/mcp/discover') return `/discover${q}`
  if (frontPath === '/mcp/healthz') return `/healthz${q}`
  return `/mcp${q}`
}

export function proxyMcpToSidecar(req: Request, res: Response): void {
  const { host, port } = getMcpSidecarTarget()
  const front = String(req.path || '').split('?')[0]
  const destPath = sidecarPath(front, req.originalUrl || req.url || front)
  const headers: Record<string, string | string[] | undefined> = { ...req.headers }
  headers.host = `${host}:${port}`
  delete headers.connection

  const proxy = https.request(
    {
      hostname: host,
      port,
      path: destPath,
      method: req.method,
      headers,
      rejectUnauthorized: false,
      minVersion: 'TLSv1.2',
    },
    (up) => {
      res.statusCode = up.statusCode || 502
      for (const [k, v] of Object.entries(up.headers)) {
        if (v == null) continue
        const lk = k.toLowerCase()
        if (lk === 'connection') continue
        res.setHeader(k, v)
      }
      res.setHeader('X-CYP-Mcp-Ingress', 'gateway-proxy')
      up.pipe(res)
    }
  )
  proxy.on('error', () => {
    if (res.headersSent) return
    res.status(502).json({
      error: {
        code: -32053,
        message: 'MCP sidecar unavailable',
        data: { reason: 'MCP_SIDECAR_DOWN' },
      },
    })
  })
  req.pipe(proxy)
}

export function assertMcpProtocolPublicAccess(req: Request, res: Response): boolean {
  const resolved = resolveClientIpFromHeaders({
    xForwardedFor:
      typeof req.headers['x-forwarded-for'] === 'string' ? req.headers['x-forwarded-for'] : undefined,
    fallbackIp: req.ip || req.socket?.remoteAddress || 'unknown',
  })
  const verdict = evaluatePublicAccess({
    path: '/api/public/mcp/',
    clientIp: resolved.ip,
    secure: isRequestSecure(req),
  })
  if (verdict.ok) return true
  res.status(403).json({
    error: {
      code: -32007,
      message: verdict.reason === 'tls_required' ? 'TLS required' : 'Origin address denied',
      data: { reason: 'MCP_FORBIDDEN', deny: verdict.reason },
    },
  })
  return false
}

/** 须挂在 express.json 之前。门面上限流在 index 里先走 gatewayIngress。 */
export function mcpGatewayProxyMiddleware(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!isMcpProtocolIngress(req.method, req.path, req.headers)) return next()
    if (!assertMcpProtocolPublicAccess(req, res)) return
    proxyMcpToSidecar(req, res)
  }
}
