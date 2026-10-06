/**
 * 局域网自签 HTTPS：仅本请求放宽校验，禁止改 NODE_TLS_REJECT_UNAUTHORIZED。
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { Agent } from 'undici'

let lanAgent: Agent | null = null

function isPrivateLanHost(host: string): boolean {
  return (
    host === '127.0.0.1' ||
    host === 'localhost' ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
  )
}

export function mcpFetch(url: string, init?: RequestInit): Promise<Response> {
  if (process.env.CYP_MCP_TLS_STRICT === '1' || !url.startsWith('https://')) {
    return fetch(url, init)
  }
  try {
    const host = new URL(url).hostname
    if (!isPrivateLanHost(host)) {
      return fetch(url, init)
    }
  } catch {
    return fetch(url, init)
  }
  if (!lanAgent) {
    lanAgent = new Agent({ connect: { rejectUnauthorized: false } })
  }
  return fetch(url, { ...(init || {}), dispatcher: lanAgent } as RequestInit)
}
