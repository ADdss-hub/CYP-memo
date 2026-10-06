/**
 * 请求上下文：公开轨 vs 全功能轨
 */

import type { McpConfig, PublicMaxLayer } from '../config.js'
import { mcpError } from '../errors.js'

export type AuthTrack = 'public' | 'full'

export interface RequestContext {
  track: AuthTrack
  /** public | digitalId | userId */
  subject: string
  token: string | null
  clientName?: string
  connectorId?: string
  maxLayer: PublicMaxLayer
}

export function resolveContext(
  config: McpConfig,
  headers: Record<string, string | string[] | undefined>,
  meta?: { clientName?: string; connectorId?: string; token?: string | null }
): RequestContext {
  const authHeader = String(headers['authorization'] || headers['Authorization'] || '')
  let token: string | null = meta?.token ?? null
  if (!token && authHeader.toLowerCase().startsWith('bearer ')) {
    token = authHeader.slice(7).trim() || null
  }
  // STDIO 密钥通道
  if (!token && process.env.CYP_MCP_PAT) {
    token = process.env.CYP_MCP_PAT
  }

  const clientName = meta?.clientName || process.env.CYP_MCP_CLIENT_NAME
  const connectorId = meta?.connectorId || process.env.CYP_MCP_CONNECTOR_ID

  if (config.connector.requireName && connectorId && !clientName) {
    throw mcpError('MCP_FORBIDDEN', 'MCP connector client name required')
  }
  if (!config.connector.allow && connectorId) {
    throw mcpError('MCP_FORBIDDEN', 'MCP connector connections are disabled')
  }

  if (token) {
    return {
      track: 'full',
      subject: 'pending', // 由 PAT 校验后填
      token,
      clientName,
      connectorId,
      maxLayer: 'full',
    }
  }

  if (!config.public.enabled) {
    throw mcpError('MCP_AUTH', 'Public query disabled; personal token required')
  }

  return {
    track: 'public',
    subject: 'public',
    token: null,
    clientName,
    connectorId,
    maxLayer: config.public.maxLayer,
  }
}

export function assertLayerAllowed(ctx: RequestContext, layer: PublicMaxLayer): void {
  const order: PublicMaxLayer[] = ['title', 'summary', 'full']
  if (order.indexOf(layer) > order.indexOf(ctx.maxLayer)) {
    // O6：防枚举用 NOT_FOUND
    throw mcpError('MCP_NOT_FOUND')
  }
}
