/**
 * 会话令牌 HttpOnly Cookie（清单 4.3）：禁止只靠 localStorage 持久化 Bearer。
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import type { Request, Response } from 'express'

export const ACCESS_COOKIE = 'cyp_at'

export function parseCookieHeader(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  if (!header) return out
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx < 0) continue
    const key = part.slice(0, idx).trim()
    if (!key) continue
    const raw = part.slice(idx + 1).trim()
    try {
      out[key] = decodeURIComponent(raw)
    } catch {
      out[key] = raw
    }
  }
  return out
}

export function readAccessCookie(req: Request): string | null {
  const v = parseCookieHeader(req.headers.cookie)[ACCESS_COOKIE]
  return v && v.trim() ? v.trim() : null
}

export function setAccessCookie(res: Response, token: string): void {
  const maxAge = 7 * 24 * 3600
  const parts = [
    `${ACCESS_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    'Secure',
    `Max-Age=${maxAge}`,
  ]
  res.append('Set-Cookie', parts.join('; '))
}

export function clearAccessCookie(res: Response): void {
  res.append(
    'Set-Cookie',
    `${ACCESS_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Secure; Max-Age=0`
  )
}
