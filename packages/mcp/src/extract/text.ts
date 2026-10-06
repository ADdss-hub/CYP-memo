/**
 * 文件文本抽取（设计报告 §9.3 · O1）
 * 首期：txt/md/csv/json + PDF 尽力；其余 not_extractable
 */

export interface ExtractResult {
  extractable: boolean
  text?: string
  reason?: string
  truncated?: boolean
}

const TEXT_EXT = new Set(['.txt', '.md', '.markdown', '.csv', '.json', '.log', '.xml', '.html', '.htm', '.yml', '.yaml'])

function extOf(filename: string): string {
  const i = filename.lastIndexOf('.')
  return i >= 0 ? filename.slice(i).toLowerCase() : ''
}

export function canLikelyExtract(filename: string, mimeType?: string): boolean {
  const ext = extOf(filename)
  if (TEXT_EXT.has(ext) || ext === '.pdf') return true
  const mt = (mimeType || '').toLowerCase()
  if (mt.startsWith('text/')) return true
  if (mt === 'application/json' || mt === 'application/pdf') return true
  return false
}

/** 从 Buffer 抽取文本；过大时按 offset/limit 切片（字符） */
export function extractTextFromBuffer(
  buf: Buffer,
  filename: string,
  mimeType: string | undefined,
  opts?: { offset?: number; limit?: number }
): ExtractResult {
  if (!canLikelyExtract(filename, mimeType)) {
    return { extractable: false, reason: 'unsupported binary or unknown type' }
  }
  const ext = extOf(filename)
  const mt = (mimeType || '').toLowerCase()

  if (ext === '.pdf' || mt === 'application/pdf') {
    return extractPdfBestEffort(buf, opts)
  }

  let raw: string
  try {
    raw = buf.toString('utf8')
  } catch {
    return { extractable: false, reason: 'utf8 decode failed' }
  }
  // 粗检二进制
  if (raw.includes('\u0000')) {
    return { extractable: false, reason: 'contains null bytes; not plain text' }
  }
  return sliceText(raw, opts)
}

function sliceText(raw: string, opts?: { offset?: number; limit?: number }): ExtractResult {
  const offset = Math.max(0, opts?.offset ?? 0)
  const limit = opts?.limit ?? 50_000
  const chars = [...raw]
  const slice = chars.slice(offset, offset + limit).join('')
  return {
    extractable: true,
    text: slice,
    truncated: offset + limit < chars.length,
  }
}

/** PDF 尽力：抽取可读 ASCII/UTF-8 流中的括号字符串；失败则 not_extractable */
function extractPdfBestEffort(buf: Buffer, opts?: { offset?: number; limit?: number }): ExtractResult {
  const asLatin = buf.toString('latin1')
  const parts: string[] = []
  const re = /\((?:\\.|[^\\)]){2,200}\)/g
  let m: RegExpExecArray | null
  let guard = 0
  while ((m = re.exec(asLatin)) && guard++ < 2000) {
    const inner = m[0]
      .slice(1, -1)
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '')
      .replace(/\\t/g, '\t')
      .replace(/\\\(/g, '(')
      .replace(/\\\)/g, ')')
      .replace(/\\\\/g, '\\')
    if (/[\x20-\x7E\u4e00-\u9fff]{2,}/.test(inner)) {
      parts.push(inner)
    }
  }
  if (parts.length === 0) {
    return { extractable: false, reason: 'pdf text streams not found' }
  }
  return sliceText(parts.join('\n'), opts)
}
