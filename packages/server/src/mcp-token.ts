/**
 * MCP 下游访问令牌（audience=cyp-memo-rest）
 * 禁止把个人令牌 PAT 原样转给业务 REST
 */

import crypto from 'crypto'
import { database } from './runtime-base/l0/infra/db/ready.js'
import type { User } from './types.js'

export const MCP_DS_PREFIX = 'cypmcpds_'
export const MCP_PAT_PREFIX = 'cypmcp_'
export const MCP_DS_AUDIENCE = 'cyp-memo-rest'
const DS_TTL_MS = 15 * 60 * 1000
const SECRET = process.env.CYP_SPI_SECRET || 'cyp-memo-spi-embedded'

function hmac(payload: string): string {
  return crypto.createHmac('sha256', SECRET).update(payload).digest('hex')
}

export function isMcpPatAllowedPath(method: string, apiPath: string): boolean {
  return method.toUpperCase() === 'POST' && apiPath === '/mcp/exchange'
}

export function issueMcpDownstreamToken(opts: { userId: string; patId: string; ttlMs?: number }): {
  accessToken: string
  expiresAt: string
  audience: string
} {
  const exp = Date.now() + (opts.ttlMs ?? DS_TTL_MS)
  const payload = `${opts.userId}|${opts.patId}|${MCP_DS_AUDIENCE}|${exp}`
  const token = `${MCP_DS_PREFIX}${payload}|${hmac(payload)}`
  return {
    accessToken: token,
    expiresAt: new Date(exp).toISOString(),
    audience: MCP_DS_AUDIENCE,
  }
}

export function getUserByMcpDownstreamToken(raw: string): User | undefined {
  if (!raw.startsWith(MCP_DS_PREFIX)) return undefined
  const body = raw.slice(MCP_DS_PREFIX.length)
  const parts = body.split('|')
  if (parts.length !== 5) return undefined
  const [userId, patId, aud, expStr, sig] = parts
  if (aud !== MCP_DS_AUDIENCE) return undefined
  const exp = Number(expStr)
  if (!Number.isFinite(exp) || Date.now() > exp) return undefined
  const payload = `${userId}|${patId}|${aud}|${exp}`
  if (hmac(payload) !== sig) return undefined
  const pat = database.getMcpPatById(patId)
  if (!pat || pat.userId !== userId || pat.revokedAt) return undefined
  if (pat.expiresAt && new Date(pat.expiresAt).getTime() < Date.now()) return undefined
  return database.getUserById(userId)
}
