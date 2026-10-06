/**
 * ≤50 字用途说明启发式（设计报告 §9.1）
 * 禁止把正文前 50 字直接当用途摘要
 */

import { createHash } from 'node:crypto'

const cache = new Map<string, { summary: string; truncated: boolean }>()

function clip(s: string, max: number): { text: string; truncated: boolean } {
  const chars = [...s]
  if (chars.length <= max) return { text: s, truncated: false }
  return { text: chars.slice(0, max).join(''), truncated: true }
}

function hashKey(parts: string[]): string {
  return createHash('sha256').update(parts.join('\0')).digest('hex')
}

/** 从标题/标签/线索归纳用途，非正文截取 */
export function buildPurposeSummary(input: {
  title?: string | null
  tags?: string[]
  filename?: string | null
  /** 正文仅作线索词提取，不得整段前缀冒充 */
  contentHint?: string | null
}): { summary: string; truncated: boolean; summary_truncated: boolean } {
  const key = hashKey([
    input.title || '',
    (input.tags || []).join(','),
    input.filename || '',
    (input.contentHint || '').slice(0, 200),
  ])
  const hit = cache.get(key)
  if (hit) return { ...hit, summary_truncated: hit.truncated }

  const tags = (input.tags || []).filter(Boolean).slice(0, 3)
  const title = (input.title || '').trim()
  const filename = (input.filename || '').trim()

  let purpose = ''
  if (title) {
    purpose = `用途：记录与「${title}」相关的备忘`
  } else if (filename) {
    purpose = `用途：存放文件「${filename}」供查阅`
  } else {
    purpose = '用途：备忘录条目，供后续查阅与引用'
  }
  if (tags.length) {
    purpose += `；标签 ${tags.join('、')}`
  }

  // 从正文抽 1 个短线索词（非前缀拷贝）
  const hint = (input.contentHint || '').replace(/\s+/g, ' ').trim()
  if (hint.length > 20) {
    const words = hint.split(/[，。；！？\s]+/).filter((w) => w.length >= 2 && w.length <= 8)
    if (words[0] && !purpose.includes(words[0])) {
      purpose += `；涉及${words[0]}`
    }
  }

  const { text, truncated } = clip(purpose, 50)
  const out = { summary: text, truncated }
  if (cache.size > 5000) cache.clear()
  cache.set(key, out)
  return { ...out, summary_truncated: truncated }
}
