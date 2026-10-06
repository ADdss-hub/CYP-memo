/**
 * MCP 公开投影运行时配置（产品壳可改 · 落 dataDir · 对齐设计 10.3 / O5 / A8c）
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import fs from 'fs'
import path from 'path'
import { getConfig } from './runtime-base/l0/infra/cfg/ready.js'
import { log } from './runtime-base/l0/infra/log/ready.js'

export type PublicMaxLayer = 'title' | 'summary' | 'full'
export type SelectorMode = 'flag' | 'tag' | 'ids' | 'none'

/** 与 packages/mcp PublicSelector 同形，供 REST 公开轨复用 */
export interface PublicSelector {
  mode: SelectorMode
  tags: string[]
  ids: string[]
  /** 默认 true：tag/ids 仍须 mcpPublic（对齐旁路 O7） */
  requireFlag: boolean
}

export interface McpPublicConfig {
  maxLayer: PublicMaxLayer
  memoSelectorMode: SelectorMode
  fileSelectorMode: SelectorMode
  memoSelectorTags: string[]
  memoSelectorIds: string[]
  fileSelectorTags: string[]
  fileSelectorIds: string[]
  requireFlag: boolean
  updatedAt: string
}

const DEFAULTS: McpPublicConfig = {
  maxLayer: 'summary',
  memoSelectorMode: 'flag',
  fileSelectorMode: 'flag',
  memoSelectorTags: [],
  memoSelectorIds: [],
  fileSelectorTags: [],
  fileSelectorIds: [],
  requireFlag: true,
  updatedAt: new Date(0).toISOString(),
}

let cache: McpPublicConfig | null = null

function configPath(): string {
  return path.join(getConfig().dataDir, 'mcp-public-config.json')
}

function normalizeLayer(raw: unknown): PublicMaxLayer {
  const s = String(raw || '').toLowerCase()
  if (s === 'title' || s === 'full') return s
  return 'summary'
}

function normalizeMode(raw: unknown): SelectorMode {
  const s = String(raw || '').toLowerCase()
  if (s === 'tag' || s === 'ids' || s === 'none' || s === 'flag') return s
  return 'flag'
}

function normalizeStringList(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return [...new Set(raw.map((x) => String(x || '').trim()).filter(Boolean))]
  }
  if (typeof raw === 'string') {
    return [
      ...new Set(
        raw
          .split(/[,;\s]+/)
          .map((s) => s.trim())
          .filter(Boolean)
      ),
    ]
  }
  return []
}

function normalizeBool(raw: unknown, fallback: boolean): boolean {
  if (typeof raw === 'boolean') return raw
  if (raw === 1 || raw === '1' || raw === 'true') return true
  if (raw === 0 || raw === '0' || raw === 'false') return false
  return fallback
}

export function loadMcpPublicConfig(): McpPublicConfig {
  if (cache) return cache
  const p = configPath()
  try {
    if (fs.existsSync(p)) {
      const raw = JSON.parse(fs.readFileSync(p, 'utf8')) as Partial<McpPublicConfig>
      cache = {
        maxLayer: normalizeLayer(raw.maxLayer),
        memoSelectorMode: normalizeMode(raw.memoSelectorMode),
        fileSelectorMode: normalizeMode(raw.fileSelectorMode),
        memoSelectorTags: normalizeStringList(raw.memoSelectorTags),
        memoSelectorIds: normalizeStringList(raw.memoSelectorIds),
        fileSelectorTags: normalizeStringList(raw.fileSelectorTags),
        fileSelectorIds: normalizeStringList(raw.fileSelectorIds),
        requireFlag: normalizeBool(raw.requireFlag, true),
        updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : DEFAULTS.updatedAt,
      }
      return cache
    }
  } catch (err) {
    log({
      level: 'warn',
      type: 'runtime',
      message: 'load mcp-public-config failed; using defaults',
      context: { err: err instanceof Error ? err.message : String(err) },
    })
  }
  cache = { ...DEFAULTS, memoSelectorTags: [], memoSelectorIds: [], fileSelectorTags: [], fileSelectorIds: [] }
  return cache
}

export function getPublicMaxLayer(): PublicMaxLayer {
  return loadMcpPublicConfig().maxLayer
}

export function getMemoPublicSelector(cfg?: McpPublicConfig): PublicSelector {
  const c = cfg || loadMcpPublicConfig()
  return {
    mode: c.memoSelectorMode,
    tags: c.memoSelectorTags,
    ids: c.memoSelectorIds,
    requireFlag: c.requireFlag,
  }
}

export function getFilePublicSelector(cfg?: McpPublicConfig): PublicSelector {
  const c = cfg || loadMcpPublicConfig()
  return {
    mode: c.fileSelectorMode,
    tags: c.fileSelectorTags,
    ids: c.fileSelectorIds,
    requireFlag: c.requireFlag,
  }
}

export function matchMemoSelector(
  item: { id?: unknown; tags?: unknown; mcpPublic?: unknown },
  sel: PublicSelector
): boolean {
  if (sel.mode === 'none') return false
  const id = String(item.id || '')
  const tags = Array.isArray(item.tags) ? item.tags.map(String) : []
  const flagged = item.mcpPublic === true || item.mcpPublic === 1 || item.mcpPublic === '1'

  if (sel.mode === 'flag') {
    return sel.requireFlag ? flagged : true
  }
  if (sel.mode === 'ids') {
    if (!sel.ids.length) return false
    if (!sel.ids.includes(id)) return false
    return sel.requireFlag ? flagged : true
  }
  if (sel.mode === 'tag') {
    if (!sel.tags.length) return false
    const hit = sel.tags.some((t) => tags.includes(t))
    if (!hit) return false
    return sel.requireFlag ? flagged : true
  }
  return false
}

export function matchFileSelector(
  item: { id?: unknown; filename?: unknown; mcpPublic?: unknown },
  sel: PublicSelector
): boolean {
  if (sel.mode === 'none') return false
  const id = String(item.id || '')
  const name = String(item.filename || '')
  const flagged = item.mcpPublic === true || item.mcpPublic === 1 || item.mcpPublic === '1'

  if (sel.mode === 'flag') {
    return sel.requireFlag ? flagged : true
  }
  if (sel.mode === 'ids') {
    if (!sel.ids.length) return false
    if (!sel.ids.includes(id)) return false
    return sel.requireFlag ? flagged : true
  }
  if (sel.mode === 'tag') {
    // 文件无 tags：文件名包含任一 tag 子串（与旁路首期近似一致）
    if (!sel.tags.length) return false
    const hit = sel.tags.some((t) => name.includes(t))
    if (!hit) return false
    return sel.requireFlag ? flagged : true
  }
  return false
}

export type McpPublicConfigPatch = Partial<
  Pick<
    McpPublicConfig,
    | 'maxLayer'
    | 'memoSelectorMode'
    | 'fileSelectorMode'
    | 'memoSelectorTags'
    | 'memoSelectorIds'
    | 'fileSelectorTags'
    | 'fileSelectorIds'
    | 'requireFlag'
  >
>

export function saveMcpPublicConfig(patch: McpPublicConfigPatch, actor?: string): McpPublicConfig {
  const before = loadMcpPublicConfig()
  const next: McpPublicConfig = {
    maxLayer: patch.maxLayer !== undefined ? normalizeLayer(patch.maxLayer) : before.maxLayer,
    memoSelectorMode:
      patch.memoSelectorMode !== undefined
        ? normalizeMode(patch.memoSelectorMode)
        : before.memoSelectorMode,
    fileSelectorMode:
      patch.fileSelectorMode !== undefined
        ? normalizeMode(patch.fileSelectorMode)
        : before.fileSelectorMode,
    memoSelectorTags:
      patch.memoSelectorTags !== undefined
        ? normalizeStringList(patch.memoSelectorTags)
        : before.memoSelectorTags,
    memoSelectorIds:
      patch.memoSelectorIds !== undefined
        ? normalizeStringList(patch.memoSelectorIds)
        : before.memoSelectorIds,
    fileSelectorTags:
      patch.fileSelectorTags !== undefined
        ? normalizeStringList(patch.fileSelectorTags)
        : before.fileSelectorTags,
    fileSelectorIds:
      patch.fileSelectorIds !== undefined
        ? normalizeStringList(patch.fileSelectorIds)
        : before.fileSelectorIds,
    requireFlag:
      patch.requireFlag !== undefined ? normalizeBool(patch.requireFlag, true) : before.requireFlag,
    updatedAt: new Date().toISOString(),
  }
  const p = configPath()
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, JSON.stringify(next, null, 2), 'utf8')
  cache = next
  log({
    level: 'info',
    type: 'security',
    message: 'MCP public config updated',
    action: 'mcp.public_config.update',
    userId: actor,
    context: { before, after: next },
  })
  return next
}

export function resetMcpPublicConfigCache(): void {
  cache = null
}
