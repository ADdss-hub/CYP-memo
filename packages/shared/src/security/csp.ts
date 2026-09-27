/**
 * CYP-memo · CSP 指令唯一构建（前端安全防护 / AUD-S05）
 * 服务端 Express 与桌面 SecurityManager 必须共用，禁止平行自建策略串。
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

/**
 * @param isLocalTooling 本机联调 HMR 放宽 eval / ws；已打包默认收紧
 * @param remoteServerUrl 可选远程 API 源（禁止用裸 https: 放行全网）
 */
export function buildAppCsp(isLocalTooling: boolean, remoteServerUrl?: string): string {
  const directives: string[] = []
  directives.push("default-src 'self'")
  if (isLocalTooling) {
    directives.push("script-src 'self' 'unsafe-inline' 'unsafe-eval'")
  } else {
    directives.push("script-src 'self' 'unsafe-inline'")
  }
  directives.push("style-src 'self' 'unsafe-inline'")
  directives.push("img-src 'self' data: blob:")
  directives.push("font-src 'self' data:")

  const connectSources = [
    "'self'",
    'http://localhost:*',
    'http://127.0.0.1:*',
    'ws://localhost:*',
    'ws://127.0.0.1:*',
  ]
  if (remoteServerUrl) {
    connectSources.push(remoteServerUrl)
  }
  directives.push(`connect-src ${connectSources.join(' ')}`)

  directives.push("media-src 'self'")
  directives.push("object-src 'none'")
  directives.push("frame-src 'none'")
  directives.push("base-uri 'self'")
  directives.push("form-action 'self'")
  directives.push("frame-ancestors 'none'")
  return directives.join('; ')
}
