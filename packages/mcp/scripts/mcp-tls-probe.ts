/**
 * 实机：无正规证书则私有 CA 自签 HTTPS；有 official 则优先；明文拒绝
 */
import { X509Certificate } from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import os from 'node:os'
import path from 'node:path'
import { createCypMemoMcp } from '../src/server.js'
import { loadMcpConfig } from '../src/config.js'
import { startHttp } from '../src/transport/http.js'
import { ensureMcpTlsMaterial, nicIpv4Addresses } from '../src/tls/material.js'

function httpsGet(hostname: string, port: number, urlPath: string): Promise<{ status: number; body: string; proto: string }> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      {
        hostname,
        port,
        path: urlPath,
        rejectUnauthorized: false,
        minVersion: 'TLSv1.2',
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c) => chunks.push(c as Buffer))
        res.on('end', () => {
          resolve({
            status: res.statusCode || 0,
            body: Buffer.concat(chunks).toString('utf8'),
            proto: String(res.socket && 'getProtocol' in res.socket ? (res.socket as { getProtocol?: () => string }).getProtocol?.() : ''),
          })
        })
      }
    )
    req.on('error', reject)
    req.setTimeout(8000, () => {
      req.destroy(new Error('https timeout'))
    })
  })
}

function httpGetShouldFail(hostname: string, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = http.get({ hostname, port, path: '/healthz', timeout: 3000 }, (res) => {
      res.resume()
      reject(new Error(`plaintext HTTP unexpectedly ${res.statusCode}`))
    })
    req.on('error', () => resolve())
    req.on('timeout', () => {
      req.destroy()
      resolve()
    })
  })
}

async function main() {
  const isolated = path.join(os.tmpdir(), `cyp-memo-tls-probe-${Date.now()}`)
  fs.mkdirSync(isolated, { recursive: true })
  process.env.DATA_DIR = isolated
  process.env.CYP_MCP_ALLOW_LAN = '1'
  process.env.CYP_MCP_HTTP_PORT = '5193'

  const h = createCypMemoMcp(loadMcpConfig())
  await startHttp(h)
  await new Promise((r) => setTimeout(r, 400))

  const loop = await httpsGet('127.0.0.1', 5193, '/healthz')
  if (loop.status !== 200 || !loop.body.includes('"tls":true')) {
    throw new Error(`loop https healthz ${loop.status} ${loop.body}`)
  }
  if (!loop.body.includes('"certSource":"private-ca"') && !loop.body.includes('"certSource":"selfsigned"')) {
    throw new Error(`expected auto cert source ${loop.body}`)
  }
  if (!loop.body.includes('private-ca')) {
    console.warn('WARN_NOT_PRIVATE_CA', loop.body)
  }
  console.log('TLS_LOOPBACK', loop.status, loop.proto || 'ok', loop.body)

  await httpGetShouldFail('127.0.0.1', 5193)
  console.log('PLAINTEXT_LOOPBACK_REFUSED', true)

  const nic = nicIpv4Addresses().find((ip) => ip !== '127.0.0.1')
  if (nic) {
    let lanOk = false
    try {
      const lan = await httpsGet(nic, 5193, '/healthz')
      if (lan.status === 200) lanOk = true
    } catch {
      lanOk = false
    }
    if (lanOk) throw new Error(`sidecar must not serve LAN ${nic}:5193`)
    console.log('TLS_LAN_SIDECAR_REFUSED', nic)
  } else {
    console.log('TLS_LAN_SKIP', 'no nic ipv4')
  }

  const certPath = path.join(isolated, 'tls', 'leaf', 'cert.pem')
  if (!fs.existsSync(certPath)) throw new Error(`cert missing ${certPath}`)
  const x = new X509Certificate(fs.readFileSync(certPath))
  if (!String(x.subjectAltName || '').includes('127.0.0.1')) throw new Error(`SAN missing loopback ${x.subjectAltName}`)
  if (!/CN\s*=\s*CYP-memo(?!\s+TLS)/i.test(String(x.subject || '')) || /mcp/i.test(String(x.subject || ''))) {
    throw new Error(`leaf subject must be CYP-memo without MCP: ${x.subject}`)
  }
  if (x.publicKey.asymmetricKeyType !== 'ec') {
    throw new Error(`expected ECDSA leaf, got ${x.publicKey.asymmetricKeyType}`)
  }
  console.log('CERT_SUBJECT', x.subject)
  console.log('CERT_ISSUER', x.issuer)
  console.log('CERT_SAN', x.subjectAltName)
  console.log('CERT_ALGO', x.publicKey.asymmetricKeyType)

  const offDir = path.join(isolated, 'tls', 'official')
  fs.mkdirSync(offDir, { recursive: true })
  fs.copyFileSync(certPath, path.join(offDir, 'cert.pem'))
  fs.copyFileSync(path.join(isolated, 'tls', 'leaf', 'key.pem'), path.join(offDir, 'key.pem'))
  const official = await ensureMcpTlsMaterial(loadMcpConfig().api.baseUrl)
  if (official.source !== 'official') throw new Error(`official not preferred ${official.source}`)
  console.log('OFFICIAL_PREFERRED', official.source)
  console.log('TLS_PROBE_PASS')
  process.exit(0)
}

main().catch((e) => {
  console.error('TLS_PROBE_FAIL', e)
  process.exit(1)
})
