/**
 * MCP 监听面 TLS：解析产品 dataDir 后走 shared 签发 SSOT（禁止第二套签发逻辑）
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ensureProductTlsMaterial,
  nicIpv4Addresses,
  type ProductTlsMaterial,
  type ProductTlsSource,
} from '../../../shared/src/tls/issue.js'

export { nicIpv4Addresses }
export type McpTlsSource = ProductTlsSource
export type McpTlsMaterial = ProductTlsMaterial

function walkMcpPackageRoot(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url))
  for (let i = 0; i < 12; i++) {
    const pkgPath = path.join(dir, 'package.json')
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { name?: string }
        if (pkg?.name === '@cyp-memo/mcp') return dir
      } catch {
        /* keep walking */
      }
    }
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  throw new Error('MCP package root not found')
}

function defaultProductDataDir(): string {
  return path.resolve(walkMcpPackageRoot(), '..', 'server', 'data')
}

async function resolveProductDataDir(apiBase: string): Promise<string> {
  const envDir = String(process.env.DATA_DIR || '').trim()
  if (envDir) return path.resolve(envDir)
  try {
    const url = `${apiBase.replace(/\/$/, '')}/config`
    const res = await fetch(url, { signal: AbortSignal.timeout(1500) })
    const body = (await res.json()) as { data?: { dataDir?: string } }
    const d = String(body?.data?.dataDir || '').trim()
    if (d) return d
  } catch {
    /* API 未就绪则用产品默认 dataDir */
  }
  return defaultProductDataDir()
}

export async function ensureMcpTlsMaterial(apiBase: string): Promise<McpTlsMaterial> {
  const dataDir = await resolveProductDataDir(apiBase)
  return ensureProductTlsMaterial(dataDir)
}
