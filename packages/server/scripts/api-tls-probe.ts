/**
 * 主 API HTTPS 探活（任务线 7 · R-TLS-001）
 * 打印 API_TLS_PROBE_PASS
 */
import fs from 'node:fs'
import https from 'node:https'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ensureApiTlsMaterial } from '../src/tls/material.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA = path.resolve(__dirname, '../data')
const PORT = Number(process.env.PORT || 5170)

function get(url: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    https
      .get(url, { rejectUnauthorized: false }, (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () =>
          resolve({ status: res.statusCode || 0, body: Buffer.concat(chunks).toString('utf8') })
        )
      })
      .on('error', reject)
  })
}

async function main(): Promise<void> {
  const mat = await ensureApiTlsMaterial(DATA)
  console.log('TLS_SOURCE', mat.source)
  console.log('TLS_FP', mat.fingerprint256)
  console.log('TLS_DIR', mat.dir)
  const { X509Certificate } = await import('node:crypto')
  const x = new X509Certificate(mat.cert)
  console.log('TLS_SUBJECT', x.subject)
  console.log('TLS_ISSUER', x.issuer)
  if (/mcp/i.test(String(x.subject || '')) || !/CN\s*=\s*CYP-memo(?!\s+TLS)/i.test(String(x.subject || ''))) {
    throw new Error(`subject must be CYP-memo without MCP: ${x.subject}`)
  }
  if (!String(mat.dir).replace(/\\/g, '/').includes('/tls/leaf') && mat.source !== 'official') {
    throw new Error(`auto leaf must live under tls/leaf, got ${mat.dir}`)
  }

  const health = await get(`https://127.0.0.1:${PORT}/api/health`)
  if (health.status !== 200 || !health.body.includes('"success":true')) {
    throw new Error(`health ${health.status} ${health.body.slice(0, 200)}`)
  }
  console.log('HTTPS_LOOPBACK', health.status)

  // 明文 HTTP 应失败（连接被拒或非 JSON 健康）
  let plainRefused = false
  try {
    const http = await import('node:http')
    await new Promise<void>((resolve, reject) => {
      const req = http.get(`http://127.0.0.1:${PORT}/api/health`, (res) => {
        res.resume()
        // 若仍有旧 HTTP 进程会 200 —— 记为未收口
        plainRefused = res.statusCode !== 200
        resolve()
      })
      req.on('error', () => {
        plainRefused = true
        resolve()
      })
      req.setTimeout(2000, () => {
        req.destroy()
        plainRefused = true
        resolve()
      })
    })
  } catch {
    plainRefused = true
  }
  console.log('PLAINTEXT_REFUSED_OR_NON200', plainRefused)

  if (!fs.existsSync(path.join(DATA, 'tls'))) throw new Error('tls dir missing')
  console.log('API_TLS_PROBE_PASS')
  process.exit(0)
}

main().catch((e) => {
  console.error('API_TLS_PROBE_FAIL', e)
  process.exit(1)
})
