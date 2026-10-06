/**
 * MCP 工具注册（查询默认开 · 写默认关）
 */

import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/server'
import type { McpConfig } from '../config.js'
import { ApiClient, ApiError } from '../api-client.js'
import { McpAudit } from '../audit/logger.js'
import { assertLayerAllowed, type RequestContext } from '../auth/context.js'
import { matchMemoSelector, matchFileSelector, assertPublicSelected } from '../public/selector.js'
import { mcpError, McpBizError, toolErrorPayload } from '../errors.js'
import { buildPurposeSummary } from '../summary/purpose.js'
import { extractTextFromBuffer } from '../extract/text.js'
import { SegmentSessionStore, type ResourceType } from '../session/store.js'

type JsonOk<T> = { success: boolean; data: T }

function textResult(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  }
}

async function resolveFullSubject(api: ApiClient, ctx: RequestContext): Promise<RequestContext> {
  if (ctx.track !== 'full' || !ctx.token) return ctx
  if (ctx.subject !== 'pending') return ctx
  const res = await api.withToken(ctx.token).json<JsonOk<{ userId: string; digitalId?: string; username?: string }>>(
    'GET',
    '/mcp/pat/me'
  )
  return {
    ...ctx,
    subject: res.data.digitalId || res.data.userId,
  }
}

function mapApiError(err: unknown): never {
  if (err instanceof McpBizError) throw err
  if (err instanceof ApiError) {
    if (err.status === 401) throw mcpError('MCP_AUTH')
    if (err.status === 403) throw mcpError('MCP_FORBIDDEN')
    if (err.status === 404) throw mcpError('MCP_NOT_FOUND')
    throw mcpError('MCP_FORBIDDEN', `upstream ${err.status}`)
  }
  if (err instanceof Error && err.message === 'LAYER_SKIP') {
    throw mcpError('MCP_READ_LAYER_SKIP')
  }
  throw err
}

/** 工具层统一：业务错误进 isError + JSON reason（验收 A4/A6/A10 可读 data.reason） */
function toolCatch(err: unknown) {
  try {
    mapApiError(err)
  } catch (e) {
    if (e instanceof McpBizError) {
      return toolErrorPayload(e.reason, e.message, e.extra)
    }
    throw e
  }
}

export interface ToolRuntime {
  config: McpConfig
  api: ApiClient
  audit: McpAudit
  sessions: SegmentSessionStore
  /** 当前连接上下文（stdio/http 注入） */
  getContext: () => RequestContext
}

export function registerTools(server: McpServer, rt: ToolRuntime): void {
  const { config, api, audit, sessions } = rt

  if (!config.enabled) {
    server.registerTool(
      'cypmemo_ping',
      {
        title: 'Ping (disabled)',
        description: 'MCP is disabled; returns MCP_DISABLED',
        annotations: { readOnlyHint: true },
      },
      async () => {
        throw mcpError('MCP_DISABLED')
      }
    )
    return
  }

  if (config.cap.query) {
    registerQueryTools(server, rt)
  }

  if (config.cap.memoWrite) {
    registerMemoWriteTools(server, rt)
  }

  if (config.cap.fileWrite) {
    registerFileWriteTools(server, rt)
  }

  // 总开时至少有探活
  if (!config.cap.query && !config.cap.memoWrite && !config.cap.fileWrite) {
    server.registerTool(
      'cypmemo_ping',
      {
        title: 'Ping',
        description: 'MCP probe when all caps off',
        annotations: { readOnlyHint: true },
      },
      async () => textResult({ ok: true, enabled: true, caps: config.cap })
    )
  }

  void api
  void audit
  void sessions
}

function registerQueryTools(server: McpServer, rt: ToolRuntime): void {
  const { config, api, audit, sessions, getContext } = rt

  const advance = (subject: string, type: ResourceType, id: string, layer: 'title' | 'summary' | 'full') => {
    if (!config.cap.requireSegmentedRead) return
    try {
      sessions.advance(subject, type, id, layer)
    } catch {
      throw mcpError('MCP_READ_LAYER_SKIP')
    }
  }

  server.registerTool(
    'cypmemo_list_memos',
    {
      title: 'List memos',
      description: 'List memo titles (no full content). Public track: public set only.',
      inputSchema: {
        page: z.number().int().min(1).optional(),
        pageSize: z.number().int().min(1).max(100).optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => {
      try {
        let ctx = getContext()
        ctx = await resolveFullSubject(api, ctx)
        const path =
          ctx.track === 'public'
            ? `/public/mcp/memos?page=${args.page || 1}&pageSize=${args.pageSize || 20}`
            : `/memos`
        const client = ctx.token ? api.withToken(ctx.token) : api
        const res = await client.json<JsonOk<unknown>>(ctx.track === 'public' ? 'GET' : 'GET', path)
        let items: unknown[] = []
        if (Array.isArray(res.data)) items = res.data
        else if (res.data && typeof res.data === 'object' && Array.isArray((res.data as { items?: unknown[] }).items)) {
          items = (res.data as { items: unknown[] }).items
        }
        const stripped = items
          .map((raw) => {
            const m = raw as Record<string, unknown>
            return {
              id: m.id,
              title: m.title,
              tags: m.tags,
              createdAt: m.createdAt,
              updatedAt: m.updatedAt,
              creatorName: m.creatorName,
              mcpPublic: m.mcpPublic,
            }
          })
          .filter((m) => (ctx.track === 'public' ? matchMemoSelector(m, config.public.memoSelector) : true))
        await audit.record({
          tier: ctx.track === 'public' ? 'public_query' : 'private_query',
          level: 'INFO',
          tool: 'cypmemo_list_memos',
          subject: ctx.subject,
          resultCode: 'ok',
          tokenFingerprint: audit.tokenFp(ctx.token),
          clientName: ctx.clientName,
          connectorId: ctx.connectorId,
        })
        return textResult({ items: stripped })
      } catch (e) { return toolCatch(e) }
    }
  )

  server.registerTool(
    'cypmemo_get_memo_title',
    {
      title: 'Get memo title',
      description: 'L1 title shell for a memo',
      inputSchema: { memo_id: z.string().min(1) },
      annotations: { readOnlyHint: true },
    },
    async ({ memo_id }) => {
      try {
        let ctx = await resolveFullSubject(api, getContext())
        assertLayerAllowed(ctx, 'title')
        const data = await fetchMemoShell(api, ctx, memo_id, 'title')
        if (ctx.track === 'public') assertPublicSelected('memo', data, config.public.memoSelector)
        advance(ctx.subject, 'memo', memo_id, 'title')
        await audit.record({
          tier: ctx.track === 'public' ? 'public_query' : 'private_query',
          level: 'INFO',
          tool: 'cypmemo_get_memo_title',
          subject: ctx.subject,
          resourceIds: [memo_id],
          resultCode: 'ok',
          layers: ['title'],
          tokenFingerprint: audit.tokenFp(ctx.token),
        })
        return textResult({
          id: data.id,
          title: data.title,
          tags: data.tags,
          updatedAt: data.updatedAt,
          creatorName: data.creatorName,
        })
      } catch (e) { return toolCatch(e) }
    }
  )

  server.registerTool(
    'cypmemo_get_memo_summary',
    {
      title: 'Get memo summary',
      description: 'L2 purpose summary (<=50 chars). Requires L1 in session.',
      inputSchema: { memo_id: z.string().min(1) },
      annotations: { readOnlyHint: true },
    },
    async ({ memo_id }) => {
      try {
        let ctx = await resolveFullSubject(api, getContext())
        assertLayerAllowed(ctx, 'summary')
        const data = await fetchMemoDetail(api, ctx, memo_id, 'summary')
        if (ctx.track === 'public') assertPublicSelected('memo', data, config.public.memoSelector)
        advance(ctx.subject, 'memo', memo_id, 'summary')
        const purpose =
          typeof data.summary === 'string' && data.summary
            ? {
                summary: String(data.summary),
                summary_truncated: Boolean(data.summary_truncated),
              }
            : buildPurposeSummary({
                title: String(data.title || ''),
                tags: (data.tags as string[]) || [],
                contentHint: String(data.content || ''),
              })
        await audit.record({
          tier: ctx.track === 'public' ? 'public_query' : 'private_query',
          level: 'INFO',
          tool: 'cypmemo_get_memo_summary',
          subject: ctx.subject,
          resourceIds: [memo_id],
          resultCode: 'ok',
          layers: ['title', 'summary'],
          tokenFingerprint: audit.tokenFp(ctx.token),
        })
        return textResult({
          id: data.id,
          title: data.title,
          tags: data.tags,
          summary: purpose.summary,
          summary_truncated: purpose.summary_truncated,
        })
      } catch (e) { return toolCatch(e) }
    }
  )

  server.registerTool(
    'cypmemo_get_memo_full',
    {
      title: 'Get memo full',
      description: 'L3 full content. Requires L2 in session.',
      inputSchema: { memo_id: z.string().min(1) },
      annotations: { readOnlyHint: true },
    },
    async ({ memo_id }) => {
      try {
        let ctx = await resolveFullSubject(api, getContext())
        assertLayerAllowed(ctx, 'full')
        const data = await fetchMemoDetail(api, ctx, memo_id, 'full')
        if (ctx.track === 'public') assertPublicSelected('memo', data, config.public.memoSelector)
        advance(ctx.subject, 'memo', memo_id, 'full')
        if (config.cap.requireHonestyReport) {
          sessions.markIncomplete(ctx.subject, 'memo', memo_id)
        }
        const purpose =
          typeof data.summary === 'string' && data.summary
            ? {
                summary: String(data.summary),
                summary_truncated: Boolean(data.summary_truncated),
              }
            : buildPurposeSummary({
                title: String(data.title || ''),
                tags: (data.tags as string[]) || [],
                contentHint: String(data.content || ''),
              })
        await audit.record({
          tier: ctx.track === 'public' ? 'public_query' : 'private_query',
          level: 'INFO',
          tool: 'cypmemo_get_memo_full',
          subject: ctx.subject,
          resourceIds: [memo_id],
          resultCode: 'ok',
          layers: ['title', 'summary', 'full'],
          tokenFingerprint: audit.tokenFp(ctx.token),
        })
        return textResult({
          id: data.id,
          title: data.title,
          tags: data.tags,
          summary: purpose.summary,
          content: data.content,
          content_untrusted: true,
        })
      } catch (e) { return toolCatch(e) }
    }
  )

  server.registerTool(
    'cypmemo_list_files',
    {
      title: 'List files',
      description: 'List file metadata (no blob). Public track: public set only.',
      inputSchema: {
        page: z.number().int().min(1).optional(),
        pageSize: z.number().int().min(1).max(100).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      try {
        let ctx = await resolveFullSubject(api, getContext())
        const client = ctx.token ? api.withToken(ctx.token) : api
        const path =
          ctx.track === 'public'
            ? `/public/mcp/files?page=${args.page || 1}&pageSize=${args.pageSize || 20}`
            : `/mcp/files`
        const res = await client.json<JsonOk<unknown>>('GET', path)
        const items = (
          Array.isArray(res.data) ? res.data : ((res.data as { items?: unknown[] })?.items || [])
        ).filter((raw) =>
          ctx.track === 'public'
            ? matchFileSelector(raw as Record<string, unknown>, config.public.fileSelector)
            : true
        )
        await audit.record({
          tier: ctx.track === 'public' ? 'public_query' : 'private_query',
          level: 'INFO',
          tool: 'cypmemo_list_files',
          subject: ctx.subject,
          resultCode: 'ok',
          tokenFingerprint: audit.tokenFp(ctx.token),
        })
        return textResult({ items })
      } catch (e) { return toolCatch(e) }
    }
  )

  server.registerTool(
    'cypmemo_get_file_title',
    {
      title: 'Get file title',
      description: 'L1 file shell (filename etc.)',
      inputSchema: { file_id: z.string().min(1) },
      annotations: { readOnlyHint: true },
    },
    async ({ file_id }) => {
      try {
        let ctx = await resolveFullSubject(api, getContext())
        assertLayerAllowed(ctx, 'title')
        const data = await fetchFileMeta(api, ctx, file_id, 'title')
        if (ctx.track === 'public') assertPublicSelected('file', data, config.public.fileSelector)
        advance(ctx.subject, 'file', file_id, 'title')
        await audit.record({
          tier: ctx.track === 'public' ? 'public_query' : 'private_query',
          level: 'INFO',
          tool: 'cypmemo_get_file_title',
          subject: ctx.subject,
          resourceIds: [file_id],
          resultCode: 'ok',
          layers: ['title'],
          tokenFingerprint: audit.tokenFp(ctx.token),
        })
        return textResult({
          id: data.id,
          filename: data.filename,
          size: data.size,
          type: data.type || data.mimeType,
          uploadedAt: data.uploadedAt || data.createdAt,
        })
      } catch (e) { return toolCatch(e) }
    }
  )

  server.registerTool(
    'cypmemo_get_file_summary',
    {
      title: 'Get file summary',
      description: 'L2 file purpose summary (<=50 chars)',
      inputSchema: { file_id: z.string().min(1) },
      annotations: { readOnlyHint: true },
    },
    async ({ file_id }) => {
      try {
        let ctx = await resolveFullSubject(api, getContext())
        assertLayerAllowed(ctx, 'summary')
        const data = await fetchFileMeta(api, ctx, file_id, 'summary')
        if (ctx.track === 'public') assertPublicSelected('file', data, config.public.fileSelector)
        advance(ctx.subject, 'file', file_id, 'summary')
        const purpose =
          typeof data.summary === 'string' && data.summary
            ? {
                summary: String(data.summary),
                summary_truncated: Boolean(data.summary_truncated),
              }
            : buildPurposeSummary({
                filename: String(data.filename || ''),
                title: String(data.filename || ''),
              })
        await audit.record({
          tier: ctx.track === 'public' ? 'public_query' : 'private_query',
          level: 'INFO',
          tool: 'cypmemo_get_file_summary',
          subject: ctx.subject,
          resourceIds: [file_id],
          resultCode: 'ok',
          layers: ['title', 'summary'],
          tokenFingerprint: audit.tokenFp(ctx.token),
        })
        return textResult({
          id: data.id,
          filename: data.filename,
          summary: purpose.summary,
          summary_truncated: purpose.summary_truncated,
        })
      } catch (e) { return toolCatch(e) }
    }
  )

  server.registerTool(
    'cypmemo_get_file_full',
    {
      title: 'Get file full text',
      description: 'L3 extractable text or MCP_NOT_EXTRACTABLE',
      inputSchema: {
        file_id: z.string().min(1),
        offset: z.number().int().min(0).optional(),
        limit: z.number().int().min(1).max(100000).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ file_id, offset, limit }) => {
      try {
        let ctx = await resolveFullSubject(api, getContext())
        assertLayerAllowed(ctx, 'full')
        const meta = await fetchFileMeta(api, ctx, file_id, 'full')
        if (ctx.track === 'public') assertPublicSelected('file', meta, config.public.fileSelector)
        advance(ctx.subject, 'file', file_id, 'full')
        if (config.cap.requireHonestyReport) {
          sessions.markIncomplete(ctx.subject, 'file', file_id)
        }
        const blobPath =
          ctx.track === 'public' ? `/public/mcp/files/${file_id}/blob` : `/files/${file_id}/blob`
        const client = ctx.token ? api.withToken(ctx.token) : api
        const { buf, contentType } = await client.getBlob(blobPath)
        const extracted = extractTextFromBuffer(buf, String(meta.filename || 'file'), contentType, {
          offset,
          limit,
        })
        if (!extracted.extractable) {
          await audit.record({
            tier: ctx.track === 'public' ? 'public_query' : 'private_query',
            level: 'WARN',
            tool: 'cypmemo_get_file_full',
            subject: ctx.subject,
            resourceIds: [file_id],
            resultCode: 'MCP_NOT_EXTRACTABLE',
            tokenFingerprint: audit.tokenFp(ctx.token),
          })
          return toolErrorPayload('MCP_NOT_EXTRACTABLE', extracted.reason, {
            extractable: false,
            reason: extracted.reason,
          })
        }
        const purpose = buildPurposeSummary({ filename: String(meta.filename || '') })
        await audit.record({
          tier: ctx.track === 'public' ? 'public_query' : 'private_query',
          level: 'INFO',
          tool: 'cypmemo_get_file_full',
          subject: ctx.subject,
          resourceIds: [file_id],
          resultCode: 'ok',
          layers: ['title', 'summary', 'full'],
          tokenFingerprint: audit.tokenFp(ctx.token),
        })
        return textResult({
          id: meta.id,
          filename: meta.filename,
          summary: purpose.summary,
          extractable: true,
          text: extracted.text,
          truncated: extracted.truncated,
        })
      } catch (e) { return toolCatch(e) }
    }
  )

  server.registerTool(
    'cypmemo_submit_read_honesty_report',
    {
      title: 'Submit read honesty report',
      description: 'Close segmented read loop with honesty report',
      inputSchema: {
        resource_type: z.enum(['memo', 'file']),
        resource_id: z.string().min(1),
        layers_read: z.array(z.enum(['title', 'summary', 'full'])),
        purpose_understood: z.string().min(1).max(200),
        claimed_complete: z.boolean(),
        unread_notes: z.string().optional(),
        client_name: z.string().optional(),
      },
      annotations: { readOnlyHint: false },
    },
    async (args) => {
      try {
        let ctx = await resolveFullSubject(api, getContext())
        const sess = sessions.get(ctx.subject, args.resource_type, args.resource_id)
        for (const layer of args.layers_read) {
          if (!sess.layers.includes(layer) && sess.state !== 'report_submitted') {
            // allow if session has progressed to that layer via order
            const order = ['title', 'summary', 'full'] as const
            const need = order.indexOf(layer)
            const have = Math.max(-1, ...sess.layers.map((l) => order.indexOf(l)))
            if (need > have) {
              throw mcpError('MCP_REPORT_MISMATCH')
            }
          }
        }
        if (args.claimed_complete) {
          if (!sess.layers.includes('full') && sess.state !== 'full_done' && sess.state !== 'incomplete') {
            if (!args.unread_notes) throw mcpError('MCP_REPORT_MISMATCH', 'claimed_complete requires full or unread_notes')
          }
        }
        const next = sessions.markReport(ctx.subject, args.resource_type, args.resource_id)
        await audit.record({
          tier: ctx.track === 'public' ? 'public_query' : 'private_query',
          level: 'INFO',
          tool: 'cypmemo_submit_read_honesty_report',
          subject: ctx.subject,
          resourceIds: [args.resource_id],
          resultCode: 'ok',
          layers: args.layers_read,
          tokenFingerprint: audit.tokenFp(ctx.token),
          clientName: args.client_name || ctx.clientName,
          detail: {
            purpose_understood: args.purpose_understood.slice(0, 50),
            claimed_complete: args.claimed_complete,
            unread_notes: args.unread_notes || '',
          },
        })
        return textResult({ ok: true, session_status: next.state })
      } catch (e) { return toolCatch(e) }
    }
  )
}

async function fetchMemoShell(
  api: ApiClient,
  ctx: RequestContext,
  memoId: string,
  layer: 'title' | 'summary' | 'full' = 'title'
): Promise<Record<string, unknown>> {
  const client = ctx.token ? api.withToken(ctx.token) : api
  if (ctx.track === 'public') {
    const res = await client.json<JsonOk<Record<string, unknown>>>(
      'GET',
      `/public/mcp/memos/${memoId}?layer=${layer}`
    )
    return res.data
  }
  const res = await client.json<JsonOk<Record<string, unknown>>>('GET', `/memos/${memoId}`)
  return res.data
}

async function fetchMemoDetail(
  api: ApiClient,
  ctx: RequestContext,
  memoId: string,
  layer: 'summary' | 'full' = 'summary'
): Promise<Record<string, unknown>> {
  return fetchMemoShell(api, ctx, memoId, layer)
}

async function fetchFileMeta(
  api: ApiClient,
  ctx: RequestContext,
  fileId: string,
  layer: 'title' | 'summary' | 'full' = 'title'
): Promise<Record<string, unknown>> {
  const client = ctx.token ? api.withToken(ctx.token) : api
  if (ctx.track === 'public') {
    const res = await client.json<JsonOk<Record<string, unknown>>>(
      'GET',
      `/public/mcp/files/${fileId}?layer=${layer}`
    )
    return res.data
  }
  const res = await client.json<JsonOk<Record<string, unknown>>>('GET', `/files/${fileId}/metadata`)
  return res.data
}

export function registerMemoWriteTools(server: McpServer, rt: ToolRuntime): void {
  const { api, audit, getContext, config } = rt

  server.registerTool(
    'cypmemo_create_memo',
    {
      title: 'Create memo',
      description: 'Create memo (requires PAT + memo_write cap)',
      inputSchema: {
        title: z.string().optional(),
        content: z.string().optional(),
        tags: z.array(z.string()).optional(),
        priority: z.enum(['low', 'medium', 'high']).optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async (args) => {
      try {
        if (!config.cap.memoWrite) throw mcpError('MCP_CAP_OFF')
        let ctx = await resolveFullSubject(api, getContext())
        if (ctx.track !== 'full' || !ctx.token) throw mcpError('MCP_AUTH')
        const res = await api.withToken(ctx.token).json<JsonOk<unknown>>('POST', '/memos', args)
        await audit.record({
          tier: 'write',
          level: 'INFO',
          tool: 'cypmemo_create_memo',
          subject: ctx.subject,
          resultCode: 'ok',
          tokenFingerprint: audit.tokenFp(ctx.token),
        })
        return textResult(res.data)
      } catch (e) { return toolCatch(e) }
    }
  )

  server.registerTool(
    'cypmemo_update_memo',
    {
      title: 'Update memo',
      description: 'Patch memo (requires PAT + memo_write)',
      inputSchema: {
        memo_id: z.string().min(1),
        title: z.string().optional(),
        content: z.string().optional(),
        tags: z.array(z.string()).optional(),
        priority: z.enum(['low', 'medium', 'high']).optional(),
        mcpPublic: z.boolean().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ memo_id, ...patch }) => {
      try {
        if (!config.cap.memoWrite) throw mcpError('MCP_CAP_OFF')
        let ctx = await resolveFullSubject(api, getContext())
        if (ctx.track !== 'full' || !ctx.token) throw mcpError('MCP_AUTH')
        const res = await api.withToken(ctx.token).json<JsonOk<unknown>>('PATCH', `/memos/${memo_id}`, patch)
        await audit.record({
          tier: 'write',
          level: 'INFO',
          tool: 'cypmemo_update_memo',
          subject: ctx.subject,
          resourceIds: [memo_id],
          resultCode: 'ok',
          tokenFingerprint: audit.tokenFp(ctx.token),
        })
        return textResult(res.data)
      } catch (e) { return toolCatch(e) }
    }
  )

  server.registerTool(
    'cypmemo_delete_memo',
    {
      title: 'Delete memo',
      description: 'Delete memo (requires PAT + memo_write)',
      inputSchema: { memo_id: z.string().min(1) },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async ({ memo_id }) => {
      try {
        if (!config.cap.memoWrite) throw mcpError('MCP_CAP_OFF')
        let ctx = await resolveFullSubject(api, getContext())
        if (ctx.track !== 'full' || !ctx.token) throw mcpError('MCP_AUTH')
        const res = await api.withToken(ctx.token).json<JsonOk<unknown>>('DELETE', `/memos/${memo_id}`)
        await audit.record({
          tier: 'write',
          level: 'INFO',
          tool: 'cypmemo_delete_memo',
          subject: ctx.subject,
          resourceIds: [memo_id],
          resultCode: 'ok',
          tokenFingerprint: audit.tokenFp(ctx.token),
        })
        return textResult(res.data ?? { ok: true })
      } catch (e) { return toolCatch(e) }
    }
  )
}

export function registerFileWriteTools(server: McpServer, rt: ToolRuntime): void {
  const { api, audit, getContext, config } = rt

  server.registerTool(
    'cypmemo_update_file_metadata',
    {
      title: 'Update file metadata',
      description: 'Patch file metadata / mcpPublic flag',
      inputSchema: {
        file_id: z.string().min(1),
        filename: z.string().optional(),
        mcpPublic: z.boolean().optional(),
      },
      annotations: { readOnlyHint: false },
    },
    async ({ file_id, ...patch }) => {
      try {
        if (!config.cap.fileWrite) throw mcpError('MCP_CAP_OFF')
        let ctx = await resolveFullSubject(api, getContext())
        if (ctx.track !== 'full' || !ctx.token) throw mcpError('MCP_AUTH')
        const res = await api
          .withToken(ctx.token)
          .json<JsonOk<unknown>>('PATCH', `/files/${file_id}/metadata`, patch)
        await audit.record({
          tier: 'write',
          level: 'INFO',
          tool: 'cypmemo_update_file_metadata',
          subject: ctx.subject,
          resourceIds: [file_id],
          resultCode: 'ok',
          tokenFingerprint: audit.tokenFp(ctx.token),
        })
        return textResult(res.data)
      } catch (e) { return toolCatch(e) }
    }
  )

  server.registerTool(
    'cypmemo_delete_file',
    {
      title: 'Delete file',
      description: 'Delete file (requires PAT + file_write)',
      inputSchema: { file_id: z.string().min(1) },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async ({ file_id }) => {
      try {
        if (!config.cap.fileWrite) throw mcpError('MCP_CAP_OFF')
        let ctx = await resolveFullSubject(api, getContext())
        if (ctx.track !== 'full' || !ctx.token) throw mcpError('MCP_AUTH')
        const res = await api.withToken(ctx.token).json<JsonOk<unknown>>('DELETE', `/files/${file_id}`)
        await audit.record({
          tier: 'write',
          level: 'INFO',
          tool: 'cypmemo_delete_file',
          subject: ctx.subject,
          resourceIds: [file_id],
          resultCode: 'ok',
          tokenFingerprint: audit.tokenFp(ctx.token),
        })
        return textResult(res.data ?? { ok: true })
      } catch (e) { return toolCatch(e) }
    }
  )

  // upload via base64 (MCP-friendly; aligns with REST multipart via dedicated endpoint)
  server.registerTool(
    'cypmemo_upload_file',
    {
      title: 'Upload file',
      description: 'Upload file as base64 (requires PAT + file_write)',
      inputSchema: {
        filename: z.string().min(1),
        content_base64: z.string().min(1),
        mime_type: z.string().optional(),
        memo_id: z.string().optional(),
        mcpPublic: z.boolean().optional(),
      },
      annotations: { readOnlyHint: false },
    },
    async (args) => {
      try {
        if (!config.cap.fileWrite) throw mcpError('MCP_CAP_OFF')
        let ctx = await resolveFullSubject(api, getContext())
        if (ctx.track !== 'full' || !ctx.token) throw mcpError('MCP_AUTH')
        const res = await api.withToken(ctx.token).json<JsonOk<unknown>>('POST', '/mcp/files/upload-b64', {
          filename: args.filename,
          contentBase64: args.content_base64,
          mimeType: args.mime_type,
          memoId: args.memo_id,
          mcpPublic: args.mcpPublic,
        })
        await audit.record({
          tier: 'write',
          level: 'INFO',
          tool: 'cypmemo_upload_file',
          subject: ctx.subject,
          resultCode: 'ok',
          tokenFingerprint: audit.tokenFp(ctx.token),
        })
        return textResult(res.data)
      } catch (e) { return toolCatch(e) }
    }
  )
}
