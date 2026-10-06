/**
 * 业务 REST 客户端（本机环回；公开轨走 /public/mcp/*）
 * 个人令牌 PAT 仅用于 /mcp/exchange，业务调用一律下游令牌
 */

import { mcpFetch } from './tls/fetch-lan.js'

export interface ApiClientOptions {
  baseUrl: string
  /** 全功能轨 PAT 或已换发的下游令牌 */
  token?: string | null
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
    message?: string
  ) {
    super(message || `API ${status}`)
    this.name = 'ApiError'
  }
}

export class ApiClient {
  private downstream: string | null = null
  private static readonly exchanged = new Map<string, string>()

  constructor(private opts: ApiClientOptions) {}

  withToken(token: string | null | undefined): ApiClient {
    const next = new ApiClient({ ...this.opts, token })
    if (token && ApiClient.exchanged.has(token)) {
      next.downstream = ApiClient.exchanged.get(token) || null
    }
    return next
  }

  private headers(extra?: Record<string, string>, bearer?: string | null): Record<string, string> {
    const h: Record<string, string> = {
      Accept: 'application/json',
      ...(extra || {}),
    }
    if (bearer) h.Authorization = `Bearer ${bearer}`
    return h
  }

  private async resolveBearer(path: string): Promise<string | null> {
    const raw = this.opts.token || null
    if (!raw) return null
    if (raw.startsWith('cypmcpds_')) return raw
    if (!raw.startsWith('cypmcp_')) return raw
    if (path === '/mcp/exchange' || path.startsWith('/mcp/exchange?')) return raw
    if (this.downstream) return this.downstream
    const cached = ApiClient.exchanged.get(raw)
    if (cached) {
      this.downstream = cached
      return cached
    }
    const url = `${this.opts.baseUrl.replace(/\/$/, '')}/mcp/exchange`
    const res = await mcpFetch(url, {
      method: 'POST',
      headers: this.headers({ 'Content-Type': 'application/json', 'Idempotency-Key': `mcp-ex-${Date.now()}` }, raw),
      body: '{}',
    })
    const data = (await res.json().catch(() => null)) as { data?: { accessToken?: string } } | null
    const next = data?.data?.accessToken
    if (!res.ok || !next) {
      throw new ApiError(res.status, data, `API ${res.status} POST /mcp/exchange`)
    }
    this.downstream = next
    ApiClient.exchanged.set(raw, next)
    return next
  }

  async json<T>(
    method: string,
    path: string,
    body?: unknown,
    init?: { raw?: boolean }
  ): Promise<T> {
    const url = path.startsWith('http')
      ? path
      : `${this.opts.baseUrl.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`
    const mutating = method !== 'GET' && method !== 'HEAD'
    const bearer = await this.resolveBearer(path)
    const headers = this.headers(
      {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(mutating
          ? {
              'Idempotency-Key': `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
            }
          : {}),
      },
      bearer
    )
    const res = await mcpFetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    if (init?.raw) {
      return res as unknown as T
    }
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      throw new ApiError(res.status, data, `API ${res.status} ${method} ${path}`)
    }
    return data as T
  }

  async getBlob(path: string): Promise<{ buf: Buffer; contentType: string }> {
    const url = `${this.opts.baseUrl.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`
    const bearer = await this.resolveBearer(path)
    const res = await mcpFetch(url, { headers: this.headers(undefined, bearer) })
    if (!res.ok) {
      throw new ApiError(res.status, null, `blob ${res.status}`)
    }
    const ab = await res.arrayBuffer()
    return { buf: Buffer.from(ab), contentType: res.headers.get('content-type') || 'application/octet-stream' }
  }
}
