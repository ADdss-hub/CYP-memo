/**
 * CYP-memo · SIX-LOG 客户端错误上报（轻量）
 * POST /api/logs/client-error · 脱敏 · 静默失败 · 带 Trace（若可得）
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { redactSensitive } from '../logging/log-envelope'
import { storageManager } from '../storage/StorageManager'

export interface ClientErrorReport {
  message: string
  level?: 'error' | 'warn'
  context?: Record<string, unknown>
  /** 客户端来源：app / desktop-renderer */
  source?: string
  traceId?: string
  action?: string
}

export interface ClientErrorReportingOptions {
  /** API 基址，须以 /api 结尾（resolveApiBaseUrl） */
  getApiBase: () => string
  /** 可选 Bearer；缺省时尝试 RemoteStorageAdapter */
  getBearer?: () => string | undefined
  source?: string
}

const MAX_MESSAGE = 2000
const MAX_CONTEXT_JSON = 8000

let installed = false
let options: ClientErrorReportingOptions | null = null
let lastTraceId: string | undefined

function newTraceId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '')
  }
  return `${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`
}

function tryBearerFromStorage(): string | undefined {
  try {
    if (!storageManager.isInitialized()) return undefined
    const adapter = storageManager.getAdapter() as { getAccessToken?: () => string | undefined }
    return adapter.getAccessToken?.()
  } catch {
    return undefined
  }
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return `${s.slice(0, max)}…`
}

/**
 * 配置上报（须在 install 前或同时调用）
 */
export function configureClientErrorReporting(opts: ClientErrorReportingOptions): void {
  options = opts
}

/**
 * 上报一条客户端错误（失败静默，不抛、不打断 UI）
 */
export async function reportClientError(report: ClientErrorReport): Promise<void> {
  try {
    if (!options?.getApiBase) return

    const apiBase = options.getApiBase().replace(/\/+$/, '')
    if (!apiBase) return

    let safeContext: Record<string, unknown> | undefined
    if (report.context !== undefined) {
      const redacted = redactSensitive(report.context)
      if (redacted === undefined) {
        safeContext = { redactFailed: true }
      } else {
        safeContext = redacted as Record<string, unknown>
      }
      const raw = JSON.stringify(safeContext)
      if (raw.length > MAX_CONTEXT_JSON) {
        safeContext = { truncated: true, preview: truncate(raw, 500) }
      }
    }

    const traceId = report.traceId || lastTraceId || newTraceId()
    lastTraceId = traceId

    const body = {
      level: report.level === 'warn' ? 'warn' : 'error',
      message: truncate(String(report.message || 'client error'), MAX_MESSAGE),
      action: report.action || 'client_error',
      source: report.source || options.source || 'app',
      traceId,
      context: safeContext,
      timestamp: new Date().toISOString(),
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Trace-Id': traceId,
      'X-Request-Id': traceId,
    }

    const bearer = options.getBearer?.() || tryBearerFromStorage()
    if (bearer) {
      headers.Authorization = `Bearer ${bearer}`
    }

    await fetch(`${apiBase}/logs/client-error`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      credentials: 'omit',
      keepalive: true,
    }).catch(() => undefined)
  } catch {
    // 静默：上报不得影响业务 UI
  }
}

/**
 * 挂 window error / unhandledrejection（addEventListener，避免覆盖 LogManager.onerror）
 */
export function installClientErrorReporting(opts?: ClientErrorReportingOptions): void {
  if (opts) configureClientErrorReporting(opts)
  if (installed) return
  if (typeof window === 'undefined') return
  installed = true

  window.addEventListener('error', (event) => {
    const error = event.error instanceof Error ? event.error : new Error(String(event.message || 'error'))
    void reportClientError({
      message: error.message,
      level: 'error',
      context: {
        type: 'window.error',
        source: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        stack: error.stack ? truncate(error.stack, 4000) : undefined,
      },
    })
  })

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason
    const err = reason instanceof Error ? reason : new Error(String(reason))
    void reportClientError({
      message: err.message,
      level: 'error',
      context: {
        type: 'unhandledrejection',
        stack: err.stack ? truncate(err.stack, 4000) : undefined,
      },
    })
  })
}

/**
 * Vue app.config.errorHandler 辅助（调用方自行挂）
 */
export function reportVueError(
  err: unknown,
  info?: string,
  componentName?: string
): void {
  const error = err instanceof Error ? err : new Error(String(err))
  void reportClientError({
    message: error.message,
    level: 'error',
    context: {
      type: 'vue_error',
      info,
      component: componentName,
      stack: error.stack ? truncate(error.stack, 4000) : undefined,
    },
  })
}
