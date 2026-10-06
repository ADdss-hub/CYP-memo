/**
 * Electron 主进程 SIX-LOG：控制台镜像 + 可选上报 client-error
 * 同一前缀格式；落控制台前脱敏；禁止另立无脱敏口令通道
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

type MainLogLevel = 'debug' | 'info' | 'warn' | 'error'

const LOG_ICONS: Record<MainLogLevel, string> = {
  debug: '🔍',
  info: '📋',
  warn: '⚠️',
  error: '❌',
}

const FULL_MASK_KEYS = new Set([
  'password',
  'passwd',
  'passwordhash',
  'secret',
  'apikey',
  'privatekey',
])

const TOKEN_LIKE_KEYS = new Set(['token', 'authorization', 'accesstoken', 'refreshtoken'])

function normalizeKey(key: string): string {
  return key.replace(/[_-]/g, '').toLowerCase()
}

function classifySensitive(key: string): 'full' | 'token' | null {
  const k = normalizeKey(key)
  if (FULL_MASK_KEYS.has(k)) return 'full'
  if (TOKEN_LIKE_KEYS.has(k)) return 'token'
  if (k.includes('password') || k.includes('passwd')) return 'full'
  if (k.includes('secret') || k.includes('apikey') || k.includes('privatekey')) return 'full'
  if (k.includes('token') && !k.includes('traceid')) return 'token'
  if (k.includes('authorization')) return 'token'
  return null
}

function redact(value: unknown, depth = 0): unknown {
  try {
    if (depth > 8) return '[MaxDepth]'
    if (value == null) return value
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return value
    }
    if (Array.isArray(value)) {
      return value.map((v) => redact(v, depth + 1))
    }
    if (typeof value === 'object') {
      const out: Record<string, unknown> = {}
      for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
        const kind = classifySensitive(key)
        if (kind === 'full') {
          out[key] = '***'
        } else if (kind === 'token') {
          const s = raw == null ? '' : String(raw)
          out[key] = s.length <= 4 ? '***' : `${s.slice(0, 4)}***`
        } else {
          out[key] = redact(raw, depth + 1)
        }
      }
      return out
    }
    return String(value)
  } catch {
    return { redactFailed: true }
  }
}

function formatLine(level: MainLogLevel, message: string, context?: Record<string, unknown>): string {
  const ts = new Date().toISOString()
  const icon = LOG_ICONS[level]
  const ctx = context ? ` ${JSON.stringify(context)}` : ''
  return `[${ts}] ${icon} [${level.toUpperCase()}] [desktop-main] ${message}${ctx}`
}

function resolveApiBase(): string {
  const port = String(process.env.PORT || '5170').trim() || '5170'
  return `http://127.0.0.1:${port}/api`
}

/** 静默上报主进程错误到全链路日志（失败忽略） */
function reportMainErrorToServer(
  level: 'error' | 'warn',
  message: string,
  context?: Record<string, unknown>
): void {
  try {
    const url = `${resolveApiBase()}/logs/client-error`
    const body = JSON.stringify({
      message: String(message).slice(0, 2000),
      level,
      source: 'desktop-main',
      action: 'desktop_main_error',
      context: context || {},
    })
    // Node 18+ fetch；不 await，避免阻塞主进程
    void fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    }).catch(() => undefined)
  } catch {
    // ignore
  }
}

/**
 * 主进程统一可读日志（脱敏后控制台）
 */
export function mainLog(
  level: MainLogLevel,
  message: string,
  context?: Record<string, unknown>
): void {
  const safe =
    context !== undefined ? (redact(context) as Record<string, unknown>) : undefined
  const line = formatLine(level, message, safe)
  switch (level) {
    case 'debug':
      console.debug(line)
      break
    case 'info':
      console.info(line)
      break
    case 'warn':
      console.warn(line)
      break
    case 'error':
      console.error(line)
      break
  }
  if (level === 'error' || level === 'warn') {
    reportMainErrorToServer(level, message, safe)
  }
}

/** 安装主进程未捕获异常 → SIX-LOG 前缀控制台 + client-error 桥接 */
export function installMainProcessErrorLogging(): void {
  process.on('uncaughtException', (err) => {
    mainLog('error', err.message || 'uncaughtException', {
      type: 'uncaughtException',
      stack: err.stack,
    })
  })
  process.on('unhandledRejection', (reason) => {
    const err = reason instanceof Error ? reason : new Error(String(reason))
    mainLog('error', err.message || 'unhandledRejection', {
      type: 'unhandledRejection',
      stack: err.stack,
    })
  })
}
