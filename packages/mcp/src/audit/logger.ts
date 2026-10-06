/**
 * MCP 审核/观测写入（R-015：不打业务库）
 * 旁路进程：写本地 JSONL + 可选 POST 服务端 /api/mcp/audit（观测）
 */

import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import type { ApiClient } from '../api-client.js'

export type AuditTier = 'public_query' | 'private_query' | 'write' | 'reject'

export interface AuditEvent {
  tier: AuditTier
  level: 'ERROR' | 'WARN' | 'INFO' | 'DEBUG'
  tool: string
  subject: string
  resourceIds?: string[]
  resultCode: string
  layers?: string[]
  tokenFingerprint?: string
  connectorId?: string
  clientName?: string
  detail?: Record<string, unknown>
}

function fingerprint(token: string | null | undefined): string | undefined {
  if (!token) return undefined
  return createHash('sha256').update(token).digest('hex').slice(0, 16)
}

function defaultLogDir(): string {
  return process.env.CYP_MCP_AUDIT_DIR || path.join(process.cwd(), 'logs', 'mcp')
}

export class McpAudit {
  private readonly dir: string

  constructor(
    private api: ApiClient,
    dir?: string
  ) {
    this.dir = dir || defaultLogDir()
    try {
      fs.mkdirSync(this.dir, { recursive: true })
    } catch {
      /* ignore */
    }
  }

  tokenFp(token: string | null | undefined): string | undefined {
    return fingerprint(token)
  }

  async record(ev: AuditEvent): Promise<void> {
    const row = {
      ...ev,
      ts: new Date().toISOString(),
    }
    const line = JSON.stringify(row) + '\n'
    const day = row.ts.slice(0, 10)
    const file = path.join(this.dir, `mcp-audit-${day}.jsonl`)
    try {
      fs.appendFileSync(file, line, 'utf8')
    } catch {
      /* ignore local write failure */
    }
    this.purgeOld(180)
    // 回传服务端观测（失败不阻断工具）
    try {
      await this.api.json('POST', '/mcp/audit', {
        ...row,
        // 禁止明文令牌
        token: undefined,
      })
    } catch {
      /* optional */
    }
  }

  private purgeOld(days: number): void {
    try {
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
      for (const name of fs.readdirSync(this.dir)) {
        const m = /^mcp-audit-(\d{4}-\d{2}-\d{2})\.jsonl$/.exec(name)
        if (!m) continue
        const t = Date.parse(`${m[1]}T00:00:00Z`)
        if (!Number.isFinite(t) || t >= cutoff) continue
        fs.unlinkSync(path.join(this.dir, name))
      }
    } catch {
      /* ignore */
    }
  }
}
