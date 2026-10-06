/**
 * MCP Server 工厂（capabilities 仅 tools/resources listChanged）
 * 支持运行时打开写能力并 sendToolListChanged（验收 A3）
 */

import { McpServer, ResourceTemplate } from '@modelcontextprotocol/server'
import { loadMcpConfig, reloadProductOverlays, type McpConfig } from './config.js'
import { ApiClient } from './api-client.js'
import { McpAudit } from './audit/logger.js'
import { resolveContext, type RequestContext } from './auth/context.js'
import { SegmentSessionStore } from './session/store.js'
import {
  registerTools,
  registerMemoWriteTools,
  registerFileWriteTools,
  type ToolRuntime,
} from './tools/register.js'
import { mcpError } from './errors.js'

export interface CypMemoMcpHandle {
  config: McpConfig
  createServer: () => McpServer
  setContext: (ctx: RequestContext) => void
  getContext: () => RequestContext
  runtime: ToolRuntime
  /** 运行时打开写能力并通知 list_changed（须已 connect） */
  enableWriteCaps: (opts?: { memo?: boolean; file?: boolean }) => void
  /** 热叠读产品壳 JSON；写能力新开则注册工具并 list_changed */
  syncFromProductFiles: () => {
    before: import('./config.js').ProductOverlaySnapshot
    after: import('./config.js').ProductOverlaySnapshot
    changed: boolean
  }
  getActiveServer: () => McpServer | null
}

export function createCypMemoMcp(config = loadMcpConfig()): CypMemoMcpHandle {
  let currentCtx: RequestContext
  try {
    currentCtx = resolveContext(config, {}, {})
  } catch {
    currentCtx = {
      track: 'public',
      subject: 'public',
      token: null,
      maxLayer: config.public.maxLayer,
    }
  }

  const api = new ApiClient({ baseUrl: config.api.baseUrl })
  const audit = new McpAudit(api)
  const sessions = new SegmentSessionStore({
    ttlMs: config.session.ttlMs,
    maxEntries: config.session.maxEntries,
  })

  const runtime: ToolRuntime = {
    config,
    api,
    audit,
    sessions,
    getContext: () => currentCtx,
  }

  let activeServer: McpServer | null = null
  let memoWriteRegistered = Boolean(config.cap.memoWrite)
  let fileWriteRegistered = Boolean(config.cap.fileWrite)

  const createServer = (): McpServer => {
    const server = new McpServer(
      {
        name: 'cyp-memo',
        version: '2.0.0',
      },
      {
        capabilities: {
          tools: { listChanged: true },
          resources: { listChanged: true },
        },
      }
    )
    registerTools(server, runtime)
    memoWriteRegistered = Boolean(config.cap.memoWrite)
    fileWriteRegistered = Boolean(config.cap.fileWrite)

    server.registerResource(
      'memo-layers',
      new ResourceTemplate('cypmemo://memo/{id}/{layer}', { list: undefined }),
      {
        description: 'Segmented memo read RFC6570; same gates as cypmemo_get_memo_* tools',
        mimeType: 'application/json',
      },
      async (uri, vars) => {
        const id = String(vars.id || '')
        const layer = String(vars.layer || 'title')
        if (!['title', 'summary', 'full'].includes(layer)) {
          throw mcpError('MCP_NOT_FOUND')
        }
        const { getContext, api, sessions, config: cfg } = runtime
        const { assertLayerAllowed } = await import('./auth/context.js')
        let ctx = getContext()
        if (ctx.track === 'full' && ctx.token && ctx.subject === 'pending') {
          const res = await api.withToken(ctx.token).json<{ success: boolean; data: { userId: string; digitalId?: string } }>(
            'GET',
            '/mcp/pat/me'
          )
          ctx = { ...ctx, subject: res.data.digitalId || res.data.userId }
        }
        assertLayerAllowed(ctx, layer as 'title' | 'summary' | 'full')
        const path =
          ctx.track === 'public' ? `/public/mcp/memos/${id}?layer=${layer}` : `/memos/${id}`
        const client = ctx.token ? api.withToken(ctx.token) : api
        const res = await client.json<{ success: boolean; data: Record<string, unknown> }>('GET', path)
        const data = res.data
        if (ctx.track === 'public') {
          const { assertPublicSelected } = await import('./public/selector.js')
          assertPublicSelected('memo', data, cfg.public.memoSelector)
        }
        if (cfg.cap.requireSegmentedRead) {
          try {
            sessions.advance(ctx.subject, 'memo', id, layer as 'title' | 'summary' | 'full')
          } catch {
            throw mcpError('MCP_READ_LAYER_SKIP')
          }
        }
        const body =
          layer === 'title'
            ? { id: data.id, title: data.title, tags: data.tags, content_untrusted: true }
            : layer === 'summary'
              ? { id: data.id, title: data.title, summary: data.summary, content_untrusted: true }
              : { id: data.id, title: data.title, content: data.content, content_untrusted: true }
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify(body),
            },
          ],
        }
      }
    )

    server.registerResource(
      'file-layers',
      new ResourceTemplate('cypmemo://file/{id}/{layer}', { list: undefined }),
      {
        description: 'Segmented file read RFC6570; same gates as cypmemo_get_file_* tools',
        mimeType: 'application/json',
      },
      async (uri, vars) => {
        const id = String(vars.id || '')
        const layer = String(vars.layer || 'title')
        if (!['title', 'summary', 'full'].includes(layer)) {
          throw mcpError('MCP_NOT_FOUND')
        }
        const { getContext, api, sessions, config: cfg } = runtime
        const { assertLayerAllowed } = await import('./auth/context.js')
        const { assertPublicSelected } = await import('./public/selector.js')
        const { buildPurposeSummary } = await import('./summary/purpose.js')
        const { extractTextFromBuffer } = await import('./extract/text.js')
        let ctx = getContext()
        if (ctx.track === 'full' && ctx.token && ctx.subject === 'pending') {
          const me = await api.withToken(ctx.token).json<{ success: boolean; data: { userId: string; digitalId?: string } }>(
            'GET',
            '/mcp/pat/me'
          )
          ctx = { ...ctx, subject: me.data.digitalId || me.data.userId }
        }
        assertLayerAllowed(ctx, layer as 'title' | 'summary' | 'full')
        const client = ctx.token ? api.withToken(ctx.token) : api
        const metaPath =
          ctx.track === 'public'
            ? `/public/mcp/files/${id}?layer=${layer}`
            : `/files/${id}/metadata`
        const metaRes = await client.json<{ success: boolean; data: Record<string, unknown> }>('GET', metaPath)
        const data = metaRes.data
        if (ctx.track === 'public') {
          assertPublicSelected('file', data, cfg.public.fileSelector)
        }
        if (cfg.cap.requireSegmentedRead) {
          try {
            sessions.advance(ctx.subject, 'file', id, layer as 'title' | 'summary' | 'full')
          } catch {
            throw mcpError('MCP_READ_LAYER_SKIP')
          }
        }
        if (layer === 'title') {
          return {
            contents: [
              {
                uri: uri.href,
                mimeType: 'application/json',
                text: JSON.stringify({
                  id: data.id,
                  filename: data.filename,
                  size: data.size,
                  type: data.type || data.mimeType,
                  content_untrusted: true,
                }),
              },
            ],
          }
        }
        if (layer === 'summary') {
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
          return {
            contents: [
              {
                uri: uri.href,
                mimeType: 'application/json',
                text: JSON.stringify({
                  id: data.id,
                  filename: data.filename,
                  summary: purpose.summary,
                  summary_truncated: purpose.summary_truncated,
                  content_untrusted: true,
                }),
              },
            ],
          }
        }
        if (cfg.cap.requireHonestyReport) {
          sessions.markIncomplete(ctx.subject, 'file', id)
        }
        const blobPath =
          ctx.track === 'public' ? `/public/mcp/files/${id}/blob` : `/files/${id}/blob`
        const { buf, contentType } = await client.getBlob(blobPath)
        const extracted = extractTextFromBuffer(buf, String(data.filename || 'file'), contentType)
        if (!extracted.extractable) {
          throw mcpError('MCP_NOT_EXTRACTABLE', extracted.reason)
        }
        const purpose = buildPurposeSummary({ filename: String(data.filename || '') })
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify({
                id: data.id,
                filename: data.filename,
                summary: purpose.summary,
                extractable: true,
                text: extracted.text,
                truncated: extracted.truncated,
                content_untrusted: true,
              }),
            },
          ],
        }
      }
    )

    activeServer = server
    return server
  }

  return {
    config,
    createServer,
    setContext: (ctx) => {
      currentCtx = ctx
    },
    getContext: () => currentCtx,
    runtime,
    getActiveServer: () => activeServer,
    enableWriteCaps: (opts = { memo: true, file: false }) => {
      if (!activeServer) {
        throw new Error('MCP server not created/connected')
      }
      if (opts.memo && !memoWriteRegistered) {
        config.cap.memoWrite = true
        registerMemoWriteTools(activeServer, runtime)
        memoWriteRegistered = true
      }
      if (opts.file && !fileWriteRegistered) {
        config.cap.fileWrite = true
        registerFileWriteTools(activeServer, runtime)
        fileWriteRegistered = true
      }
      activeServer.sendToolListChanged()
    },
    syncFromProductFiles: () => {
      const info = reloadProductOverlays(config)
      if (currentCtx.track === 'public') {
        currentCtx = {
          ...currentCtx,
          maxLayer: config.public.maxLayer,
        }
      }
      if (!info.changed) return info
      if (activeServer) {
        if (config.cap.memoWrite && !memoWriteRegistered) {
          registerMemoWriteTools(activeServer, runtime)
          memoWriteRegistered = true
        }
        if (config.cap.fileWrite && !fileWriteRegistered) {
          registerFileWriteTools(activeServer, runtime)
          fileWriteRegistered = true
        }
        try {
          activeServer.sendToolListChanged()
        } catch {
          /* 未连接会话时忽略 */
        }
      }
      console.error(
        `[cyp-memo-mcp] product config hot-reload changed memoWrite=${config.cap.memoWrite} fileWrite=${config.cap.fileWrite} maxLayer=${config.public.maxLayer}`
      )
      return info
    },
  }
}

export function assertEnabled(config: McpConfig): void {
  if (!config.enabled) throw mcpError('MCP_DISABLED')
}
