/**
 * 上传文件名 / 扩展名 / MIME / 魔数门禁（清单 5.3）。
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import path from 'path'

const ALLOWED_EXT = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.ico',
  '.bmp',
  '.pdf',
  '.txt',
  '.md',
  '.csv',
  '.json',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.zip',
  '.mp3',
  '.wav',
  '.mp4',
  '.webm',
])

const BLOCKED_EXT = new Set([
  '.exe',
  '.dll',
  '.bat',
  '.cmd',
  '.ps1',
  '.sh',
  '.js',
  '.mjs',
  '.cjs',
  '.html',
  '.htm',
  '.svg',
  '.php',
  '.asp',
  '.aspx',
  '.com',
  '.scr',
  '.vbs',
])

export function sanitizeUploadFilename(original: string): string {
  const base = path.basename(String(original || '').replace(/\\/g, '/'))
  const cleaned = base.replace(/[<>:"|?*\u0000-\u001f]/g, '_').replace(/^\.+/, '').trim()
  if (!cleaned || cleaned === '.' || cleaned === '..') return 'unnamed'
  return cleaned.length > 180 ? cleaned.slice(0, 180) : cleaned
}

export function extOf(filename: string): string {
  const ext = path.extname(sanitizeUploadFilename(filename)).toLowerCase()
  return ext
}

export function isAllowedUploadName(filename: string, mime?: string): boolean {
  const ext = extOf(filename)
  if (!ext || BLOCKED_EXT.has(ext)) return false
  if (!ALLOWED_EXT.has(ext)) return false
  const m = String(mime || '').toLowerCase()
  if (m.includes('javascript') || m.includes('html') || m === 'image/svg+xml') return false
  return true
}

export function magicOk(buf: Buffer, filename: string): boolean {
  const ext = extOf(filename)
  if (buf.length < 4) {
    return ext === '.txt' || ext === '.md' || ext === '.csv' || ext === '.json'
  }
  if (ext === '.jpg' || ext === '.jpeg') return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff
  if (ext === '.png') return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47
  if (ext === '.gif') return buf.slice(0, 4).toString('ascii') === 'GIF8'
  if (ext === '.webp') return buf.slice(0, 4).toString('ascii') === 'RIFF'
  if (ext === '.pdf') return buf.slice(0, 4).toString('ascii') === '%PDF'
  if (ext === '.zip' || ext === '.docx' || ext === '.xlsx' || ext === '.pptx') {
    return buf[0] === 0x50 && buf[1] === 0x4b
  }
  if (ext === '.txt' || ext === '.md' || ext === '.csv' || ext === '.json') return true
  return true
}
