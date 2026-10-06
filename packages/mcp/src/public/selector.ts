/**
 * 公开轨选择器（设计 §10.3）
 * mode=flag：依赖服务端 mcpPublic；mode=tag/ids/none 在 MCP 侧再过滤
 */

import type { PublicSelector } from '../config.js'
import { mcpError } from '../errors.js'

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
    // 文件无 tags：文件名包含任一 tag 子串（首期近似）
    if (!sel.tags.length) return false
    const hit = sel.tags.some((t) => name.includes(t))
    if (!hit) return false
    return sel.requireFlag ? flagged : true
  }
  return false
}

export function assertPublicSelected(
  kind: 'memo' | 'file',
  item: Record<string, unknown> | null | undefined,
  sel: PublicSelector
): void {
  if (!item) throw mcpError('MCP_NOT_FOUND')
  const ok = kind === 'memo' ? matchMemoSelector(item, sel) : matchFileSelector(item, sel)
  if (!ok) throw mcpError('MCP_NOT_FOUND')
}
