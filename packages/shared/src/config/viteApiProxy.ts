/**
 * Vite 联调代理目标（CFG-SYS-07）
 * 端口/主机只从环境读取，禁止在业务入口硬编码真相端口。
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

/** 服务端代理目标：VITE_API_PROXY_TARGET > https://127.0.0.1:$PORT > 默认 5170 */
export function resolveViteApiProxyTarget(): string {
  const explicit = (process.env.VITE_API_PROXY_TARGET || '').trim()
  if (explicit) return explicit.replace(/\/+$/, '')
  const port = (process.env.PORT || '5170').trim() || '5170'
  const scheme = (process.env.VITE_API_PROXY_SCHEME || 'https').trim() || 'https'
  return `${scheme}://127.0.0.1:${port}`
}

/** 共用 /api + /healthz 代理块（自签证书 secure:false） */
export function createApiProxy() {
  const target = resolveViteApiProxyTarget()
  const secure = !target.startsWith('https://')
  return {
    '/api': { target, changeOrigin: true, secure },
    '/healthz': { target, changeOrigin: true, secure },
  }
}
