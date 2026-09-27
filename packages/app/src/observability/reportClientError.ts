/**
 * CYP-memo app · SIX-LOG 客户端错误上报入口
 * 挂 window / Vue；POST 到 server `/api/logs/client-error`
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import {
  installClientErrorReporting,
  reportVueError,
  reportClientError,
  configureClientErrorReporting,
  type ClientErrorReport,
} from '@cyp-memo/shared'
import { resolveApiBaseUrl } from '@cyp-memo/shared'
import type { App } from 'vue'

export { reportClientError, reportVueError, configureClientErrorReporting }
export type { ClientErrorReport }

function resolveAppApiBase(): string {
  return resolveApiBaseUrl({
    VITE_API_BASE: import.meta.env.VITE_API_BASE as string | undefined,
    PROD: import.meta.env.PROD,
  })
}

/**
 * 安装全局窗口错误上报（可在 storage 就绪前调用）
 */
export function installAppClientErrorReporting(): void {
  installClientErrorReporting({
    getApiBase: resolveAppApiBase,
    source: 'app',
  })
}

/**
 * 挂 Vue errorHandler：上报 + 不替代调用方 UI 提示
 */
export function attachVueClientErrorHandler(app: App, onAfter?: (err: unknown) => void): void {
  const prev = app.config.errorHandler
  app.config.errorHandler = (err, instance, info) => {
    reportVueError(
      err,
      info,
      instance?.$options.name || instance?.$options.__name
    )
    if (typeof prev === 'function') {
      prev(err, instance, info)
      return
    }
    onAfter?.(err)
  }
}
