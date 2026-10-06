/**
 * CYP-memo MCP 配置（设计报告 6.1 默认值）
 * 空 env 不得自动全开写（R-018）
 * 公开投影：优先叠 `{dataDir}/mcp-public-config.json`（与产品壳 A8c 同 SSOT）
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export type PublicMaxLayer = 'title' | 'summary' | 'full'
export type SelectorMode = 'tag' | 'ids' | 'flag' | 'none'

export interface PublicSelector {
  mode: SelectorMode
  tags: string[]
  ids: string[]
  requireFlag: boolean
}

export interface McpConfig {
  enabled: boolean
  cap: {
    query: boolean
    memoWrite: boolean
    fileWrite: boolean
    requireSegmentedRead: boolean
    requireHonestyReport: boolean
  }
  public: {
    enabled: boolean
    maxLayer: PublicMaxLayer
    memoSelector: PublicSelector
    fileSelector: PublicSelector
  }
  connector: {
    allow: boolean
    requireName: boolean
  }
  transport: {
    /** 环回 Streamable HTTP 端口；0 = 不启 HTTP */
    httpPort: number
    /**
     * 旁路 Streamable HTTP 永远只绑 127.0.0.1。
     * 局域网走产品入口反代，不在此端口绑 0.0.0.0（R-PROD-004 / 运行底座网关中心门面）。
     * allowLan 仅兼容旧配置键，不再改变监听面。
     */
    allowLan: boolean
    /**
     * 独立旧 HTTP+SSE 端点（2024-11-05）——产品明示永不启用。
     * SSE 仅作 Streamable HTTP 内可选流式通道（设计 11.1 / 军械库传输 4.4）。
     */
    sseLegacyIndependent: false
    /**
     * 嵌入 packages/server 同进程 MCP Server——产品明示不做（现行 VERSION）。
     * 协议面仅旁路 `packages/mcp`；业务 REST 适配（PAT/公开投影等）仍在 server。
     */
    embeddedInServer: false
  }
  api: {
    /** 业务 REST 基址（本机） */
    baseUrl: string
  }
  session: {
    ttlMs: number
    maxEntries: number
  }
  protocolVersion: string
  /** 允许的 MCP-Protocol-Version（产品基线 + 官方 SDK 协商版本） */
  acceptedProtocolVersions: string[]
}

function envBool(key: string, fallback: boolean): boolean {
  const v = process.env[key]
  if (v === undefined || v === '') return fallback
  return v === '1' || v.toLowerCase() === 'true' || v === 'yes'
}

function envInt(key: string, fallback: number): number {
  const v = process.env[key]
  if (v === undefined || v === '') return fallback
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function envLayer(key: string, fallback: PublicMaxLayer): PublicMaxLayer {
  const v = (process.env[key] || '').toLowerCase()
  if (v === 'title' || v === 'summary' || v === 'full') return v
  return fallback
}

function envMode(key: string, fallback: SelectorMode): SelectorMode {
  const v = (process.env[key] || '').toLowerCase()
  if (v === 'tag' || v === 'ids' || v === 'flag' || v === 'none') return v
  return fallback
}

function csv(key: string): string[] {
  const v = process.env[key]
  if (!v) return []
  return v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function asStringList(raw: unknown): string[] {
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

function asMode(raw: unknown, fallback: SelectorMode): SelectorMode {
  const s = String(raw || '').toLowerCase()
  if (s === 'tag' || s === 'ids' || s === 'flag' || s === 'none') return s
  return fallback
}

function asLayer(raw: unknown, fallback: PublicMaxLayer): PublicMaxLayer {
  const s = String(raw || '').toLowerCase()
  if (s === 'title' || s === 'summary' || s === 'full') return s
  return fallback
}

/** 解析可能存放产品公开配置的 dataDir 候选 */
function productDataDirs(): string[] {
  const dirs: string[] = []
  const envDir = String(process.env.DATA_DIR || process.env.CYP_DATA_DIR || '').trim()
  if (envDir) dirs.push(envDir)
  try {
    const here = path.dirname(fileURLToPath(import.meta.url))
    dirs.push(path.resolve(here, '../../server/data'))
    dirs.push(path.resolve(process.cwd(), 'packages/server/data'))
    dirs.push(path.resolve(process.cwd(), 'data'))
  } catch {
    /* ignore */
  }
  return [...new Set(dirs)]
}

function productPublicConfigPaths(): string[] {
  return productDataDirs().map((d) => path.join(d, 'mcp-public-config.json'))
}

function productCapConfigPaths(): string[] {
  return productDataDirs().map((d) => path.join(d, 'mcp-cap-config.json'))
}

/**
 * 产品壳写入的 mcp-public-config.json 覆盖公开轨（A8c SSOT）。
 * 无文件时保持 env 默认。
 */
function applyProductPublicOverlay(pub: McpConfig['public']): void {
  for (const file of productPublicConfigPaths()) {
    if (!fs.existsSync(file)) continue
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>
      if (raw.maxLayer !== undefined) pub.maxLayer = asLayer(raw.maxLayer, pub.maxLayer)
      if (raw.memoSelectorMode !== undefined) {
        pub.memoSelector.mode = asMode(raw.memoSelectorMode, pub.memoSelector.mode)
      }
      if (raw.fileSelectorMode !== undefined) {
        pub.fileSelector.mode = asMode(raw.fileSelectorMode, pub.fileSelector.mode)
      }
      if (raw.memoSelectorTags !== undefined) {
        pub.memoSelector.tags = asStringList(raw.memoSelectorTags)
      }
      if (raw.memoSelectorIds !== undefined) {
        pub.memoSelector.ids = asStringList(raw.memoSelectorIds)
      }
      if (raw.fileSelectorTags !== undefined) {
        pub.fileSelector.tags = asStringList(raw.fileSelectorTags)
      }
      if (raw.fileSelectorIds !== undefined) {
        pub.fileSelector.ids = asStringList(raw.fileSelectorIds)
      }
      if (raw.requireFlag !== undefined) {
        const rf =
          raw.requireFlag === true ||
          raw.requireFlag === 1 ||
          raw.requireFlag === '1' ||
          raw.requireFlag === 'true'
        pub.memoSelector.requireFlag = rf
        pub.fileSelector.requireFlag = rf
      }
      return
    } catch {
      /* 尝试下一候选 */
    }
  }
}

function asBool(raw: unknown, fallback: boolean): boolean {
  if (typeof raw === 'boolean') return raw
  if (raw === 1 || raw === '1' || raw === 'true') return true
  if (raw === 0 || raw === '0' || raw === 'false') return false
  return fallback
}

/**
 * 产品壳 mcp-cap-config.json 覆盖能力开关（设计 6.1）。
 * 无文件时保持 env 默认（写仍默认关）。
 */
function applyProductCapOverlay(cfg: McpConfig): void {
  for (const file of productCapConfigPaths()) {
    if (!fs.existsSync(file)) continue
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>
      if (raw.enabled !== undefined) cfg.enabled = asBool(raw.enabled, cfg.enabled)
      if (raw.query !== undefined) cfg.cap.query = asBool(raw.query, cfg.cap.query)
      if (raw.memoWrite !== undefined) cfg.cap.memoWrite = asBool(raw.memoWrite, false)
      if (raw.fileWrite !== undefined) cfg.cap.fileWrite = asBool(raw.fileWrite, false)
      if (raw.requireSegmentedRead !== undefined) {
        cfg.cap.requireSegmentedRead = asBool(raw.requireSegmentedRead, true)
      }
      if (raw.requireHonestyReport !== undefined) {
        cfg.cap.requireHonestyReport = asBool(raw.requireHonestyReport, true)
      }
      if (raw.publicEnabled !== undefined) {
        cfg.public.enabled = asBool(raw.publicEnabled, cfg.public.enabled)
      }
      if (raw.connectorAllow !== undefined) {
        cfg.connector.allow = asBool(raw.connectorAllow, cfg.connector.allow)
      }
      if (raw.connectorRequireName !== undefined) {
        cfg.connector.requireName = asBool(raw.connectorRequireName, cfg.connector.requireName)
      }
      return
    } catch {
      /* 尝试下一候选 */
    }
  }
}

/** 加载 MCP 配置；写能力默认 false，禁止空 env 全开写 */
export function loadMcpConfig(): McpConfig {
  // 产品明示：禁止独立旧 SSE 传输（任务线 3 收口）
  if (envBool('CYP_MCP_SSE_LEGACY', false)) {
    throw new Error(
      'CYP_MCP_SSE_LEGACY is refused: independent HTTP+SSE is not a product transport; use Streamable HTTP SSE channel on POST /mcp'
    )
  }
  // 产品明示：禁止嵌入 server 同进程 MCP Server（任务线 4 收口）
  if (envBool('CYP_MCP_EMBED_SERVER', false)) {
    throw new Error(
      'CYP_MCP_EMBED_SERVER is refused: MCP protocol server is sidecar-only (packages/mcp); business REST adapters stay on packages/server'
    )
  }
  const apiPort = envInt('CYP_MCP_API_PORT', envInt('PORT', 5170))
  const apiHost = process.env.CYP_MCP_API_HOST || '127.0.0.1'
  const cfg: McpConfig = {
    enabled: envBool('CYP_MCP_ENABLED', true),
    cap: {
      query: envBool('CYP_MCP_CAP_QUERY', true),
      memoWrite: envBool('CYP_MCP_CAP_MEMO_WRITE', false),
      fileWrite: envBool('CYP_MCP_CAP_FILE_WRITE', false),
      requireSegmentedRead: envBool('CYP_MCP_REQUIRE_SEGMENTED', true),
      requireHonestyReport: envBool('CYP_MCP_REQUIRE_HONESTY', true),
    },
    public: {
      enabled: envBool('CYP_MCP_PUBLIC_ENABLED', true),
      maxLayer: envLayer('CYP_MCP_PUBLIC_MAX_LAYER', 'summary'),
      memoSelector: {
        mode: envMode('CYP_MCP_MEMO_SELECTOR_MODE', 'flag'),
        tags: csv('CYP_MCP_MEMO_SELECTOR_TAGS'),
        ids: csv('CYP_MCP_MEMO_SELECTOR_IDS'),
        requireFlag: envBool('CYP_MCP_MEMO_REQUIRE_FLAG', true),
      },
      fileSelector: {
        mode: envMode('CYP_MCP_FILE_SELECTOR_MODE', 'flag'),
        tags: csv('CYP_MCP_FILE_SELECTOR_TAGS'),
        ids: csv('CYP_MCP_FILE_SELECTOR_IDS'),
        requireFlag: envBool('CYP_MCP_FILE_REQUIRE_FLAG', true),
      },
    },
    connector: {
      allow: envBool('CYP_MCP_CONNECTOR_ALLOW', true),
      requireName: envBool('CYP_MCP_CONNECTOR_REQUIRE_NAME', true),
    },
    transport: {
      httpPort: envInt('CYP_MCP_HTTP_PORT', 13175),
      // 监听面固定环回；CYP_MCP_ALLOW_LAN 不再扩大旁路绑定
      allowLan: envBool('CYP_MCP_ALLOW_LAN', false),
      sseLegacyIndependent: false,
      embeddedInServer: false,
    },
    api: {
      baseUrl: process.env.CYP_MCP_API_BASE || `https://${apiHost}:${apiPort}/api`,
    },
    session: {
      ttlMs: envInt('CYP_MCP_SESSION_TTL_MS', 2 * 60 * 60 * 1000),
      maxEntries: envInt('CYP_MCP_SESSION_MAX', 2000),
    },
    protocolVersion: process.env.CYP_MCP_PROTOCOL_VERSION || '2026-07-28',
    acceptedProtocolVersions: [
      process.env.CYP_MCP_PROTOCOL_VERSION || '2026-07-28',
      '2025-11-25',
      '2025-06-18',
    ].filter((v, i, a) => a.indexOf(v) === i),
  }
  applyProductPublicOverlay(cfg.public)
  applyProductCapOverlay(cfg)
  return cfg
}

export interface ProductOverlaySnapshot {
  enabled: boolean
  query: boolean
  memoWrite: boolean
  fileWrite: boolean
  requireSegmentedRead: boolean
  requireHonestyReport: boolean
  publicEnabled: boolean
  maxLayer: PublicMaxLayer
  memoSelectorMode: SelectorMode
  fileSelectorMode: SelectorMode
  memoTags: string[]
  memoIds: string[]
  fileTags: string[]
  fileIds: string[]
  requireFlag: boolean
  connectorAllow: boolean
  connectorRequireName: boolean
}

function snapshotOverlays(cfg: McpConfig): ProductOverlaySnapshot {
  return {
    enabled: cfg.enabled,
    query: cfg.cap.query,
    memoWrite: cfg.cap.memoWrite,
    fileWrite: cfg.cap.fileWrite,
    requireSegmentedRead: cfg.cap.requireSegmentedRead,
    requireHonestyReport: cfg.cap.requireHonestyReport,
    publicEnabled: cfg.public.enabled,
    maxLayer: cfg.public.maxLayer,
    memoSelectorMode: cfg.public.memoSelector.mode,
    fileSelectorMode: cfg.public.fileSelector.mode,
    memoTags: [...cfg.public.memoSelector.tags],
    memoIds: [...cfg.public.memoSelector.ids],
    fileTags: [...cfg.public.fileSelector.tags],
    fileIds: [...cfg.public.fileSelector.ids],
    requireFlag: cfg.public.memoSelector.requireFlag,
    connectorAllow: cfg.connector.allow,
    connectorRequireName: cfg.connector.requireName,
  }
}

/** 重新叠读产品壳 JSON（热更新 · 不改传输/API 基址） */
export function reloadProductOverlays(cfg: McpConfig): {
  before: ProductOverlaySnapshot
  after: ProductOverlaySnapshot
  changed: boolean
} {
  const before = snapshotOverlays(cfg)
  applyProductPublicOverlay(cfg.public)
  applyProductCapOverlay(cfg)
  const after = snapshotOverlays(cfg)
  return {
    before,
    after,
    changed: JSON.stringify(before) !== JSON.stringify(after),
  }
}

/** 候选 dataDir（供热更新 watch） */
export function listProductDataDirs(): string[] {
  return productDataDirs()
}

export function isAcceptedProtocolVersion(config: McpConfig, proto: string): boolean {
  return config.acceptedProtocolVersions.includes(proto)
}
