/**
 * MCP 能力开关运行时配置（产品壳可改 · 落 dataDir · 对齐设计 6.1）
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 *
 * 默认：仅 query；写关闭（R-018 空 env 不得自动全开写）。
 */

import fs from 'fs'
import path from 'path'
import { getConfig } from './runtime-base/l0/infra/cfg/ready.js'
import { log } from './runtime-base/l0/infra/log/ready.js'

export interface McpCapConfig {
  /** mcp.enabled */
  enabled: boolean
  /** mcp.cap.query */
  query: boolean
  /** mcp.cap.memo_write */
  memoWrite: boolean
  /** mcp.cap.file_write */
  fileWrite: boolean
  /** mcp.cap.require_segmented_read */
  requireSegmentedRead: boolean
  /** mcp.cap.require_honesty_report */
  requireHonestyReport: boolean
  /** mcp.public.enabled */
  publicEnabled: boolean
  /** mcp.connector.allow */
  connectorAllow: boolean
  /** mcp.connector.require_name */
  connectorRequireName: boolean
  updatedAt: string
}

const DEFAULTS: McpCapConfig = {
  enabled: true,
  query: true,
  memoWrite: false,
  fileWrite: false,
  requireSegmentedRead: true,
  requireHonestyReport: true,
  publicEnabled: true,
  connectorAllow: true,
  connectorRequireName: true,
  updatedAt: new Date(0).toISOString(),
}

let cache: McpCapConfig | null = null

function configPath(): string {
  return path.join(getConfig().dataDir, 'mcp-cap-config.json')
}

function normalizeBool(raw: unknown, fallback: boolean): boolean {
  if (typeof raw === 'boolean') return raw
  if (raw === 1 || raw === '1' || raw === 'true') return true
  if (raw === 0 || raw === '0' || raw === 'false') return false
  return fallback
}

export function loadMcpCapConfig(): McpCapConfig {
  if (cache) return cache
  const p = configPath()
  try {
    if (fs.existsSync(p)) {
      const raw = JSON.parse(fs.readFileSync(p, 'utf8')) as Partial<McpCapConfig>
      cache = {
        enabled: normalizeBool(raw.enabled, DEFAULTS.enabled),
        query: normalizeBool(raw.query, DEFAULTS.query),
        memoWrite: normalizeBool(raw.memoWrite, DEFAULTS.memoWrite),
        fileWrite: normalizeBool(raw.fileWrite, DEFAULTS.fileWrite),
        requireSegmentedRead: normalizeBool(raw.requireSegmentedRead, DEFAULTS.requireSegmentedRead),
        requireHonestyReport: normalizeBool(raw.requireHonestyReport, DEFAULTS.requireHonestyReport),
        publicEnabled: normalizeBool(raw.publicEnabled, DEFAULTS.publicEnabled),
        connectorAllow: normalizeBool(raw.connectorAllow, DEFAULTS.connectorAllow),
        connectorRequireName: normalizeBool(raw.connectorRequireName, DEFAULTS.connectorRequireName),
        updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : DEFAULTS.updatedAt,
      }
      return cache
    }
  } catch (err) {
    log({
      level: 'warn',
      type: 'runtime',
      message: 'load mcp-cap-config failed; using defaults',
      context: { err: err instanceof Error ? err.message : String(err) },
    })
  }
  cache = { ...DEFAULTS }
  return cache
}

export type McpCapConfigPatch = Partial<Omit<McpCapConfig, 'updatedAt'>>

export function saveMcpCapConfig(patch: McpCapConfigPatch, actor?: string): McpCapConfig {
  const before = loadMcpCapConfig()
  const next: McpCapConfig = {
    enabled: patch.enabled !== undefined ? normalizeBool(patch.enabled, true) : before.enabled,
    query: patch.query !== undefined ? normalizeBool(patch.query, true) : before.query,
    memoWrite: patch.memoWrite !== undefined ? normalizeBool(patch.memoWrite, false) : before.memoWrite,
    fileWrite: patch.fileWrite !== undefined ? normalizeBool(patch.fileWrite, false) : before.fileWrite,
    requireSegmentedRead:
      patch.requireSegmentedRead !== undefined
        ? normalizeBool(patch.requireSegmentedRead, true)
        : before.requireSegmentedRead,
    requireHonestyReport:
      patch.requireHonestyReport !== undefined
        ? normalizeBool(patch.requireHonestyReport, true)
        : before.requireHonestyReport,
    publicEnabled:
      patch.publicEnabled !== undefined
        ? normalizeBool(patch.publicEnabled, true)
        : before.publicEnabled,
    connectorAllow:
      patch.connectorAllow !== undefined
        ? normalizeBool(patch.connectorAllow, true)
        : before.connectorAllow,
    connectorRequireName:
      patch.connectorRequireName !== undefined
        ? normalizeBool(patch.connectorRequireName, true)
        : before.connectorRequireName,
    updatedAt: new Date().toISOString(),
  }
  const p = configPath()
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, JSON.stringify(next, null, 2), 'utf8')
  cache = next
  log({
    level: 'info',
    type: 'security',
    message: 'MCP cap config updated',
    action: 'mcp.cap_config.update',
    userId: actor,
    context: { before, after: next },
  })
  return next
}

export function resetMcpCapConfigCache(): void {
  cache = null
}

export function isMcpPublicTrackEnabled(): boolean {
  const c = loadMcpCapConfig()
  return c.enabled && c.publicEnabled && c.query
}
