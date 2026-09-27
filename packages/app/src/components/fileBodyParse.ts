/**
 * 将文件原文写入备忘录正文：文本保持原文，表格保持单元格，图片保持图像。
 * 只有确实提不出文字或像素时才留下说明，不用摘要替代原文。
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

export const BODY_PARSE_MAX_BYTES = 8 * 1024 * 1024

export type BodyParseResult =
  | { kind: 'image'; dataUrl: string; alt: string }
  | { kind: 'text'; text: string }
  | { kind: 'html'; html: string }

const TEXT_EXT = new Set([
  'txt', 'md', 'markdown', 'json', 'xml', 'csv', 'tsv', 'html', 'htm', 'css',
  'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'vue', 'py', 'java', 'c', 'cpp', 'h',
  'hpp', 'cs', 'go', 'rs', 'rb', 'php', 'yml', 'yaml', 'log', 'sql', 'sh', 'bash',
  'bat', 'cmd', 'ps1', 'ini', 'conf', 'toml', 'env', 'rtf', 'tex', 'rst', 'adoc',
  'properties', 'gradle', 'kt', 'swift', 'lua', 'pl', 'r', 'scala', 'cfg',
])

const SPREADSHEET_EXT = new Set(['xlsx', 'xls', 'xlsb', 'ods'])
const DOCX_EXT = new Set(['docx'])
const PPTX_EXT = new Set(['pptx'])
const ODT_EXT = new Set(['odt'])
const PDF_EXT = new Set(['pdf'])

const IMAGE_EXT = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'avif', 'svg', 'apng',
])

const BINARY_EXT = new Set([
  'doc', 'ppt', 'zip', 'rar', '7z', 'gz', 'tgz', 'tar',
  'bz2', 'xz', 'exe', 'dll', 'bin', 'iso', 'dmg', 'mp3', 'mp4', 'avi', 'mov',
  'mkv', 'wav', 'flac', 'aac', 'ogg', 'webm', 'woff', 'woff2', 'ttf', 'otf',
  'eot', 'apk', 'ipa', 'deb', 'rpm', 'class', 'jar', 'wasm', 'sqlite', 'db',
])

export function formatByteSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** index
  const rounded = index === 0 ? Math.round(value) : Math.round(value * 100) / 100
  return `${rounded} ${units[index]}`
}

function extensionOf(name: string): string {
  const base = name.trim().toLowerCase()
  const dot = base.lastIndexOf('.')
  if (dot <= 0 || dot === base.length - 1) return ''
  return base.slice(dot + 1)
}

function isImageFile(file: File): boolean {
  if (file.type.toLowerCase().startsWith('image/')) return true
  return IMAGE_EXT.has(extensionOf(file.name))
}

function isSpreadsheet(file: File): boolean {
  if (SPREADSHEET_EXT.has(extensionOf(file.name))) return true
  const mime = file.type.toLowerCase()
  return mime.includes('spreadsheet') || mime.includes('excel') || mime === 'application/vnd.ms-excel'
}

function isDeclaredText(file: File): boolean {
  const mime = file.type.toLowerCase()
  if (mime.startsWith('text/')) return true
  if (TEXT_EXT.has(extensionOf(file.name))) return true
  return (
    mime === 'application/json' ||
    mime === 'application/xml' ||
    mime === 'application/javascript' ||
    mime === 'application/x-javascript' ||
    mime === 'application/typescript' ||
    mime === 'application/xhtml+xml' ||
    mime.endsWith('+json') ||
    mime.endsWith('+xml')
  )
}

function sniffImageMime(buf: ArrayBuffer): string | null {
  const bytes = new Uint8Array(buf.slice(0, 12))
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'image/png'
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return 'image/gif'
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return 'image/webp'
  }
  return null
}

function isPdfMagic(buf: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buf.slice(0, 5))
  return bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46
}

function hasBinaryMagic(buf: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buf.slice(0, 8))
  if (isPdfMagic(buf)) return true
  if (bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b) return true
  if (bytes.length >= 4 && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) {
    return true
  }
  if (bytes.length >= 2 && bytes[0] === 0x4d && bytes[1] === 0x5a) return true
  return false
}

function isProbablyText(buf: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buf.byteLength > 4096 ? buf.slice(0, 4096) : buf)
  if (bytes.length === 0 || bytes.includes(0)) return false
  let printable = 0
  for (const byte of bytes) {
    if (byte === 9 || byte === 10 || byte === 13 || (byte >= 32 && byte < 127) || byte >= 128) {
      printable += 1
    }
  }
  return printable / bytes.length > 0.9
}

function decodeText(buf: ArrayBuffer): string {
  const bom = new Uint8Array(buf.slice(0, 3))
  if (bom.length >= 3 && bom[0] === 0xef && bom[1] === 0xbb && bom[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(buf.slice(3))
  }
  if (bom.length >= 2 && bom[0] === 0xff && bom[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(buf)
  }
  if (bom.length >= 2 && bom[0] === 0xfe && bom[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(buf)
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(buf)
}

function keptAsAttachment(file: File, reason: string): BodyParseResult {
  return { kind: 'text', text: `「${file.name}」${reason}，已加入文件库。` }
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error ?? new Error('读取文件失败'))
    reader.readAsDataURL(file)
  })
}

function readAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(reader.error ?? new Error('读取文件失败'))
    reader.readAsArrayBuffer(file)
  })
}

function bufferToDataUrl(buffer: ArrayBuffer, mime: string): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const size = 0x2000
  for (let i = 0; i < bytes.length; i += size) {
    binary += String.fromCharCode(...bytes.subarray(i, i + size))
  }
  return `data:${mime};base64,${btoa(binary)}`
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function cellHtml(value: unknown): string {
  const text = value == null ? '' : String(value)
  const safe = escapeHtml(text).replace(/\r\n/g, '\n').replace(/\n/g, '<br>')
  return `<td><p>${safe || '<br>'}</p></td>`
}

function u16(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! | (bytes[offset + 1]! << 8)
}

function u32(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset]! |
      (bytes[offset + 1]! << 8) |
      (bytes[offset + 2]! << 16) |
      (bytes[offset + 3]! << 24)) >>>
    0
  )
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(data)
      controller.close()
    },
  })
  const inflated = source.pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(inflated).arrayBuffer())
}

type ZipEntry = { name: string; method: number; comp: Uint8Array }

function listZipEntries(buffer: ArrayBuffer): ZipEntry[] {
  const bytes = new Uint8Array(buffer)
  let eocd = -1
  const min = Math.max(0, bytes.length - 22 - 65535)
  for (let i = bytes.length - 22; i >= min; i -= 1) {
    if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06) {
      eocd = i
      break
    }
  }
  if (eocd < 0) return []
  const count = u16(bytes, eocd + 10)
  let cursor = u32(bytes, eocd + 16)
  const entries: ZipEntry[] = []
  for (let n = 0; n < count; n += 1) {
    if (u32(bytes, cursor) !== 0x02014b50) break
    const method = u16(bytes, cursor + 10)
    const compSize = u32(bytes, cursor + 20)
    const nameLen = u16(bytes, cursor + 28)
    const extraLen = u16(bytes, cursor + 30)
    const commentLen = u16(bytes, cursor + 32)
    const localOff = u32(bytes, cursor + 42)
    const name = new TextDecoder().decode(bytes.subarray(cursor + 46, cursor + 46 + nameLen))
    const localNameLen = u16(bytes, localOff + 26)
    const localExtraLen = u16(bytes, localOff + 28)
    const dataOff = localOff + 30 + localNameLen + localExtraLen
    entries.push({ name, method, comp: bytes.subarray(dataOff, dataOff + compSize) })
    cursor += 46 + nameLen + extraLen + commentLen
  }
  return entries
}

async function unzipText(buffer: ArrayBuffer, name: string): Promise<string | null> {
  const entry = listZipEntries(buffer).find((item) => item.name === name)
  if (!entry || (entry.method !== 0 && entry.method !== 8)) return null
  const raw = entry.method === 0 ? entry.comp : await inflateRaw(entry.comp)
  return new TextDecoder('utf-8').decode(raw)
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function docxXmlToText(xml: string): string {
  return xml
    .split(/<\/w:p>/)
    .map((part) => {
      const start = part.lastIndexOf('<w:p')
      const chunk = start >= 0 ? part.slice(start) : part
      if (!chunk.includes('<w:t')) return null
      const marked = chunk.replace(/<w:tab\/>/g, '\t').replace(/<w:br\/>/g, '\n')
      let line = ''
      const re = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g
      let match: RegExpExecArray | null
      while ((match = re.exec(marked))) line += decodeXml(match[1] || '')
      return line
    })
    .filter((line): line is string => line !== null)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function taggedText(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([^<]*)</${tag}>`, 'g')
  const lines: string[] = []
  let match: RegExpExecArray | null
  while ((match = re.exec(xml))) lines.push(decodeXml(match[1] || ''))
  return lines.join('\n').trim()
}

async function spreadsheetToHtml(file: File): Promise<string> {
  const XLSX = await import('xlsx')
  const workbook = XLSX.read(await readAsArrayBuffer(file), { type: 'array', cellDates: true })
  const parts: string[] = []
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name]
    if (!sheet) continue
    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: false,
      defval: '',
      blankrows: true,
    }) as unknown[][]
    if (workbook.SheetNames.length > 1) parts.push(`<p>${escapeHtml(name)}</p>`)
    const width = rows.reduce((max, row) => Math.max(max, Array.isArray(row) ? row.length : 0), 0)
    if (!rows.length || width === 0) continue
    const body = rows
      .map((row) => {
        const cells: string[] = []
        const source = Array.isArray(row) ? row : []
        for (let col = 0; col < width; col += 1) cells.push(cellHtml(source[col]))
        return `<tr>${cells.join('')}</tr>`
      })
      .join('')
    parts.push(`<table><tbody>${body}</tbody></table>`)
  }
  return parts.join('')
}

async function officeZipToText(file: File, kind: 'docx' | 'pptx' | 'odt'): Promise<string> {
  const buffer = await readAsArrayBuffer(file)
  if (kind === 'docx') {
    const xml = await unzipText(buffer, 'word/document.xml')
    return xml ? docxXmlToText(xml) : ''
  }
  if (kind === 'odt') {
    const xml = await unzipText(buffer, 'content.xml')
    return xml ? taggedText(xml, 'text:p') : ''
  }
  const slides = listZipEntries(buffer)
    .map((entry) => entry.name)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
  const pages: string[] = []
  for (const name of slides) {
    const xml = await unzipText(buffer, name)
    if (!xml) continue
    const text = taggedText(xml, 'a:t')
    if (text) pages.push(text)
  }
  return pages.join('\n\n')
}

async function resolvePdfResourceUrls(): Promise<{
  cMapUrl: string
  standardFontDataUrl: string
}> {
  if (typeof window !== 'undefined') {
    const base = import.meta.env.BASE_URL || '/'
    const prefix = base.endsWith('/') ? base : `${base}/`
    return {
      cMapUrl: `${prefix}pdfjs/cmaps/`,
      standardFontDataUrl: `${prefix}pdfjs/standard_fonts/`,
    }
  }
  const { createRequire } = await import('node:module')
  const { pathToFileURL } = await import('node:url')
  const path = await import('node:path')
  const require = createRequire(import.meta.url)
  const root = path.dirname(require.resolve('pdfjs-dist/package.json'))
  return {
    cMapUrl: pathToFileURL(path.join(root, 'cmaps') + path.sep).href,
    standardFontDataUrl: pathToFileURL(path.join(root, 'standard_fonts') + path.sep).href,
  }
}

async function configurePdfWorker(pdfjs: { GlobalWorkerOptions: { workerSrc: string } }): Promise<void> {
  if (pdfjs.GlobalWorkerOptions.workerSrc) return
  if (typeof window !== 'undefined') {
    const worker = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')
    pdfjs.GlobalWorkerOptions.workerSrc = String(
      (worker as { default?: string }).default || worker
    )
    return
  }
  const { createRequire } = await import('node:module')
  const { pathToFileURL } = await import('node:url')
  const require = createRequire(import.meta.url)
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
    require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')
  ).href
}

function scaleRgb24(
  width: number,
  height: number,
  rgb: Uint8Array,
  maxEdge: number
): { width: number; height: number; data: Uint8Array } {
  const edge = Math.max(width, height)
  const scale = edge > maxEdge ? maxEdge / edge : 1
  if (scale >= 0.999) return { width, height, data: rgb }
  const w = Math.max(1, Math.floor(width * scale))
  const h = Math.max(1, Math.floor(height * scale))
  const out = new Uint8Array(w * h * 3)
  for (let y = 0; y < h; y += 1) {
    const sy = Math.min(height - 1, Math.floor(y / scale))
    for (let x = 0; x < w; x += 1) {
      const sx = Math.min(width - 1, Math.floor(x / scale))
      const si = (sy * width + sx) * 3
      const di = (y * w + x) * 3
      out[di] = rgb[si] ?? 0
      out[di + 1] = rgb[si + 1] ?? 0
      out[di + 2] = rgb[si + 2] ?? 0
    }
  }
  return { width: w, height: h, data: out }
}

function rgb24ToBmpDataUrl(width: number, height: number, rgb: Uint8Array): string {
  const rowSize = (width * 3 + 3) & ~3
  const pixelSize = rowSize * height
  const fileSize = 54 + pixelSize
  const buf = new ArrayBuffer(fileSize)
  const view = new DataView(buf)
  const bytes = new Uint8Array(buf)
  bytes[0] = 0x42
  bytes[1] = 0x4d
  view.setUint32(2, fileSize, true)
  view.setUint32(10, 54, true)
  view.setUint32(14, 40, true)
  view.setInt32(18, width, true)
  view.setInt32(22, height, true)
  view.setUint16(26, 1, true)
  view.setUint16(28, 24, true)
  view.setUint32(34, pixelSize, true)
  for (let y = 0; y < height; y += 1) {
    const srcY = height - 1 - y
    const destRow = 54 + y * rowSize
    for (let x = 0; x < width; x += 1) {
      const si = (srcY * width + x) * 3
      const di = destRow + x * 3
      bytes[di] = rgb[si + 2] ?? 0
      bytes[di + 1] = rgb[si + 1] ?? 0
      bytes[di + 2] = rgb[si] ?? 0
    }
  }
  return bufferToDataUrl(buf, 'image/bmp')
}

function pdfImageToDataUrl(img: {
  width: number
  height: number
  data?: Uint8ClampedArray | Uint8Array
  kind?: number
}): string | null {
  if (!img?.width || !img?.height || !img.data) return null
  const kind = img.kind ?? 2
  let rgb: Uint8Array
  if (kind === 2) {
    rgb = img.data instanceof Uint8Array ? img.data : new Uint8Array(img.data)
  } else if (kind === 3) {
    const src = img.data
    rgb = new Uint8Array(img.width * img.height * 3)
    for (let i = 0, j = 0; i < src.length; i += 4, j += 3) {
      rgb[j] = src[i] ?? 0
      rgb[j + 1] = src[i + 1] ?? 0
      rgb[j + 2] = src[i + 2] ?? 0
    }
  } else if (kind === 1) {
    const src = img.data
    rgb = new Uint8Array(img.width * img.height * 3)
    for (let i = 0; i < img.width * img.height; i += 1) {
      const v = src[i] ?? 0
      rgb[i * 3] = v
      rgb[i * 3 + 1] = v
      rgb[i * 3 + 2] = v
    }
  } else {
    return null
  }
  const scaled = scaleRgb24(img.width, img.height, rgb, 1600)
  const isJsdom =
    typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent || '')
  if (typeof document !== 'undefined' && !isJsdom) {
    try {
      const canvas = document.createElement('canvas')
      // jsdom 会在 getContext 时抛 not-implemented；真实浏览器才走 JPEG
      if (typeof (canvas as HTMLCanvasElement).getContext !== 'function') {
        return rgb24ToBmpDataUrl(scaled.width, scaled.height, scaled.data)
      }
      let ctx: CanvasRenderingContext2D | null = null
      try {
        ctx = canvas.getContext('2d')
      } catch {
        ctx = null
      }
      if (ctx) {
        canvas.width = scaled.width
        canvas.height = scaled.height
        const imageData = ctx.createImageData(scaled.width, scaled.height)
        for (let i = 0, j = 0; i < scaled.data.length; i += 3, j += 4) {
          imageData.data[j] = scaled.data[i] ?? 0
          imageData.data[j + 1] = scaled.data[i + 1] ?? 0
          imageData.data[j + 2] = scaled.data[i + 2] ?? 0
          imageData.data[j + 3] = 255
        }
        ctx.putImageData(imageData, 0, 0)
        try {
          return canvas.toDataURL('image/jpeg', 0.85)
        } catch {
          /* fall through to bmp */
        }
      }
    } catch {
      /* ignore */
    }
  }
  return rgb24ToBmpDataUrl(scaled.width, scaled.height, scaled.data)
}

function getPdfObj(
  store: { get: (name: string, callback?: (v: unknown) => void) => unknown },
  name: string
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    try {
      const existing = store.get(name)
      if (existing) {
        resolve(existing)
        return
      }
    } catch {
      /* need async callback */
    }
    const timer = setTimeout(() => reject(new Error(`pdf obj timeout: ${name}`)), 15000)
    try {
      store.get(name, (value: unknown) => {
        clearTimeout(timer)
        resolve(value)
      })
    } catch (err) {
      clearTimeout(timer)
      reject(err)
    }
  })
}

async function pdfToBody(file: File): Promise<{ text: string; images: string[] }> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  await configurePdfWorker(pdfjs)
  const resources = await resolvePdfResourceUrls()
  const data = new Uint8Array(await readAsArrayBuffer(file))
  const doc = await pdfjs.getDocument({
    data,
    isEvalSupported: false,
    isOffscreenCanvasSupported: false,
    cMapUrl: resources.cMapUrl,
    cMapPacked: true,
    standardFontDataUrl: resources.standardFontDataUrl,
  }).promise

  const pages: string[] = []
  const images: string[] = []
  const seen = new Set<string>()
  const paintOps = new Set([
    pdfjs.OPS.paintImageXObject,
    pdfjs.OPS.paintInlineImageXObject,
    pdfjs.OPS.paintImageXObjectRepeat,
  ].filter((v) => typeof v === 'number'))

  for (let pageNo = 1; pageNo <= doc.numPages; pageNo += 1) {
    const page = await doc.getPage(pageNo)
    const content = await page.getTextContent()
    let line = ''
    for (const item of content.items) {
      if (!('str' in item)) continue
      const str = String(item.str || '')
      if (!str) continue
      line += str
      if ((item as { hasEOL?: boolean }).hasEOL) {
        pages.push(line)
        line = ''
      } else if (str && !/\s$/.test(str)) {
        // keep adjacent tokens readable for CJK/Latin mixes
      }
    }
    if (line) pages.push(line)
    if (doc.numPages > 1) pages.push('')

    const ops = await page.getOperatorList()
    for (let i = 0; i < ops.fnArray.length; i += 1) {
      const fn = ops.fnArray[i]
      if (!paintOps.has(fn)) continue
      const args = ops.argsArray[i]
      if (fn === pdfjs.OPS.paintInlineImageXObject) {
        const inline = Array.isArray(args) ? args[0] : null
        if (inline && typeof inline === 'object') {
          const dataUrl = pdfImageToDataUrl(inline as { width: number; height: number; data?: Uint8ClampedArray; kind?: number })
          if (dataUrl) images.push(dataUrl)
        }
        continue
      }
      const name = Array.isArray(args) ? String(args[0] || '') : ''
      if (!name || seen.has(name)) continue
      seen.add(name)
      try {
        const store = name.startsWith('g_') ? page.commonObjs : page.objs
        const img = await getPdfObj(store, name)
        const dataUrl = pdfImageToDataUrl(img as { width: number; height: number; data?: Uint8ClampedArray; kind?: number })
        if (dataUrl) images.push(dataUrl)
      } catch {
        /* skip undecodable image */
      }
    }
  }

  await doc.destroy()
  return {
    text: pages.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
    images,
  }
}

export async function parseFileForBody(file: File): Promise<BodyParseResult> {
  if (file.size > BODY_PARSE_MAX_BYTES) {
    return keptAsAttachment(file, `超过 ${formatByteSize(BODY_PARSE_MAX_BYTES)}，未解析到正文`)
  }
  if (file.size === 0) {
    return keptAsAttachment(file, '内容为空，未解析到正文')
  }
  if (isImageFile(file)) {
    return { kind: 'image', dataUrl: await readAsDataURL(file), alt: file.name }
  }

  const ext = extensionOf(file.name)
  if (isSpreadsheet(file)) {
    const html = (await spreadsheetToHtml(file)).trim()
    if (!html) return keptAsAttachment(file, '表格为空，未解析到正文')
    return { kind: 'html', html }
  }
  if (DOCX_EXT.has(ext) || PPTX_EXT.has(ext) || ODT_EXT.has(ext)) {
    const kind = DOCX_EXT.has(ext) ? 'docx' : PPTX_EXT.has(ext) ? 'pptx' : 'odt'
    const text = (await officeZipToText(file, kind)).trim()
    if (!text) return keptAsAttachment(file, '未提取到文字，未写入正文')
    return { kind: 'text', text }
  }

  const buffer = PDF_EXT.has(ext) ? null : await readAsArrayBuffer(file)
  if (PDF_EXT.has(ext) || (buffer && isPdfMagic(buffer))) {
    try {
      const parsed = await pdfToBody(file)
      if (parsed.text && parsed.images.length === 0) {
        return { kind: 'text', text: parsed.text }
      }
      if (!parsed.text && parsed.images.length === 1) {
        return { kind: 'image', dataUrl: parsed.images[0]!, alt: file.name }
      }
      if (parsed.text || parsed.images.length > 0) {
        const parts: string[] = []
        if (parsed.text) {
          for (const block of parsed.text.split(/\n{2,}/)) {
            const line = block.trim()
            if (!line) continue
            parts.push(`<p>${escapeHtml(line).replace(/\n/g, '<br>')}</p>`)
          }
        }
        for (const src of parsed.images) {
          parts.push(
            `<p><img src="${src}" alt="${escapeHtml(file.name)}" /></p>`
          )
        }
        return { kind: 'html', html: parts.join('') }
      }
      return keptAsAttachment(file, '未提取到文字层或页面图像，未写入正文')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return keptAsAttachment(file, `PDF 解析失败：${msg.slice(0, 120)}`)
    }
  }
  if (!buffer) return keptAsAttachment(file, '无法提取可读正文')
  if (BINARY_EXT.has(ext)) return keptAsAttachment(file, '无法提取可读正文')

  const sniffed = sniffImageMime(buffer)
  if (sniffed) {
    return { kind: 'image', dataUrl: bufferToDataUrl(buffer, sniffed), alt: file.name }
  }
  if (hasBinaryMagic(buffer) || (!isDeclaredText(file) && !isProbablyText(buffer))) {
    return keptAsAttachment(file, '无法提取可读正文')
  }
  return { kind: 'text', text: decodeText(buffer) }
}
