/**
 * 产品 TLS 签发 SSOT（R-TLS-001 / R-010 / NR-15）
 * 正规优先，否则私有 CA / ECDSA 自签 / RSA 回退；叶子 {dataDir}/tls/leaf
 * 本文件不从 shared 桶入口再导出，避免打进浏览器包。
 */

import 'reflect-metadata'
import { execFileSync } from 'node:child_process'
import { X509Certificate, createPrivateKey, createPublicKey, webcrypto as nodeWebcrypto } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import * as x509 from '@peculiar/x509'
import {
  CYP_TLS_CA_DIR_NAME,
  CYP_TLS_CA_SUBJECT,
  CYP_TLS_LEAF_DIR_NAME,
  CYP_TLS_LEAF_SUBJECT,
  CYP_TLS_LEGACY_LEAF_DIRS,
  CYP_TLS_OFFICIAL_DIR_NAME,
  CYP_TLS_OPENSSL_LEAF_SUBJ,
  CYP_TLS_PRODUCT,
  isCurrentProductLeafSubject,
  isCypProductTlsCaIssuer,
} from './identity.js'

const webCrypto = nodeWebcrypto as unknown as Crypto
x509.cryptoProvider.set(webCrypto)

const EC_ALG = {
  name: 'ECDSA',
  namedCurve: 'P-256',
  hash: 'SHA-256',
} as const

export type ProductTlsSource = 'official' | 'private-ca' | 'selfsigned'

export interface ProductTlsMaterial {
  key: string
  cert: string
  dir: string
  fingerprint256: string
  source: ProductTlsSource
}

export function nicIpv4Addresses(): string[] {
  const out: string[] = []
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs || []) {
      const fam = String(a.family)
      if (fam === 'IPv4' || fam === '4') out.push(a.address)
    }
  }
  return [...new Set(out)]
}

function sanNeeded(): { dns: string[]; ips: string[] } {
  const ips = nicIpv4Addresses()
  if (!ips.includes('127.0.0.1')) ips.unshift('127.0.0.1')
  return { dns: ['localhost'], ips }
}

function certCoversSan(pem: string, needed: { dns: string[]; ips: string[] }): boolean {
  try {
    const x = new X509Certificate(pem)
    const until = Date.parse(x.validTo)
    if (!Number.isFinite(until) || until - Date.now() < 7 * 24 * 60 * 60 * 1000) return false
    const alt = String(x.subjectAltName || '')
    for (const d of needed.dns) {
      if (!alt.includes(`DNS:${d}`)) return false
    }
    for (const ip of needed.ips) {
      if (!alt.includes(`IP Address:${ip}`) && !alt.includes(`IP:${ip}`)) return false
    }
    return true
  } catch {
    return false
  }
}

function opensslSanExt(needed: { dns: string[]; ips: string[] }): string {
  const parts = [...needed.dns.map((d) => `DNS:${d}`), ...needed.ips.map((ip) => `IP:${ip}`)]
  return parts.join(',')
}

function opensslBins(): string[] {
  return process.platform === 'win32' ? ['openssl.exe', 'openssl'] : ['openssl']
}

function runOpenSsl(args: string[]): boolean {
  for (const bin of opensslBins()) {
    try {
      execFileSync(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] })
      return true
    } catch {
      /* try next */
    }
  }
  return false
}

function chmodKey(p: string): void {
  try {
    fs.chmodSync(p, 0o600)
  } catch {
    /* Windows 可忽略 */
  }
}

function tryLoadOfficial(dataDir: string): ProductTlsMaterial | null {
  const dir = path.join(dataDir, 'tls', CYP_TLS_OFFICIAL_DIR_NAME)
  const keyPath = path.join(dir, 'key.pem')
  const certPath = path.join(dir, 'cert.pem')
  if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) return null
  try {
    const key = fs.readFileSync(keyPath, 'utf8')
    const cert = fs.readFileSync(certPath, 'utf8')
    const x = new X509Certificate(cert)
    if (!Number.isFinite(Date.parse(x.validTo)) || Date.parse(x.validTo) <= Date.now()) return null
    return { key, cert, dir, fingerprint256: x.fingerprint256, source: 'official' }
  } catch {
    return null
  }
}

function tryLoadLeafDir(
  dir: string,
  needed: { dns: string[]; ips: string[] }
): ProductTlsMaterial | null {
  const keyPath = path.join(dir, 'key.pem')
  const certPath = path.join(dir, 'cert.pem')
  if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) return null
  try {
    const key = fs.readFileSync(keyPath, 'utf8')
    const cert = fs.readFileSync(certPath, 'utf8')
    if (!certCoversSan(cert, needed)) return null
    const x = new X509Certificate(cert)
    if (!isCurrentProductLeafSubject(String(x.subject || ''))) return null
    const source: ProductTlsSource = isCypProductTlsCaIssuer(String(x.issuer || ''))
      ? 'private-ca'
      : 'selfsigned'
    return { key, cert, dir, fingerprint256: x.fingerprint256, source }
  } catch {
    return null
  }
}

function randomSerialHex(): string {
  const b = Buffer.alloc(16)
  for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256)
  b[0] = (b[0] || 1) & 0x7f
  return b.toString('hex')
}

async function pkcs8Pem(privateKey: CryptoKey): Promise<string> {
  const pkcs8 = await webCrypto.subtle.exportKey('pkcs8', privateKey)
  const b64 = Buffer.from(pkcs8).toString('base64')
  return `-----BEGIN PRIVATE KEY-----\n${b64.match(/.{1,64}/g)?.join('\n')}\n-----END PRIVATE KEY-----\n`
}

function buildSanNames(needed: { dns: string[]; ips: string[] }): Array<{ type: 'dns' | 'ip'; value: string }> {
  return [
    ...needed.dns.map((value) => ({ type: 'dns' as const, value })),
    ...needed.ips.map((value) => ({ type: 'ip' as const, value })),
  ]
}

async function ensurePrivateCa(dataDir: string): Promise<{
  caCert: x509.X509Certificate
  caKeys: CryptoKeyPair
  caCrtPem: string
  caKeyPem: string
}> {
  const caDir = path.join(dataDir, 'tls', CYP_TLS_CA_DIR_NAME)
  fs.mkdirSync(caDir, { recursive: true })
  const caKeyPath = path.join(caDir, 'ca.key')
  const caCrtPath = path.join(caDir, 'ca.crt')

  if (fs.existsSync(caKeyPath) && fs.existsSync(caCrtPath)) {
    try {
      const caCrtPem = fs.readFileSync(caCrtPath, 'utf8')
      const caKeyPem = fs.readFileSync(caKeyPath, 'utf8')
      const x = new X509Certificate(caCrtPem)
      const subjectOk =
        /CN\s*=\s*CYP-memo\s+TLS\s+CA/i.test(String(x.subject || '')) && !/mcp/i.test(String(x.subject || ''))
      if (subjectOk && Date.parse(x.validTo) > Date.now() + 7 * 24 * 60 * 60 * 1000) {
        const caCert = new x509.X509Certificate(caCrtPem)
        const nodePriv = createPrivateKey(caKeyPem)
        const nodePub = createPublicKey(nodePriv)
        const caKeys: CryptoKeyPair = {
          privateKey: await webCrypto.subtle.importKey(
            'pkcs8',
            nodePriv.export({ type: 'pkcs8', format: 'der' }),
            EC_ALG,
            true,
            ['sign']
          ),
          publicKey: await webCrypto.subtle.importKey(
            'spki',
            nodePub.export({ type: 'spki', format: 'der' }),
            EC_ALG,
            true,
            ['verify']
          ),
        }
        return { caCert, caKeys, caCrtPem, caKeyPem }
      }
    } catch {
      /* 重签 CA */
    }
  }

  const caKeys = (await webCrypto.subtle.generateKey(EC_ALG, true, ['sign', 'verify'])) as CryptoKeyPair
  const caCert = await x509.X509CertificateGenerator.createSelfSigned({
    serialNumber: randomSerialHex(),
    name: CYP_TLS_CA_SUBJECT,
    notBefore: new Date(Date.now() - 60_000),
    notAfter: new Date(Date.now() + 3650 * 24 * 60 * 60 * 1000),
    signingAlgorithm: EC_ALG,
    keys: caKeys,
    extensions: [
      new x509.BasicConstraintsExtension(true, undefined, true),
      new x509.KeyUsagesExtension(
        x509.KeyUsageFlags.keyCertSign | x509.KeyUsageFlags.cRLSign | x509.KeyUsageFlags.digitalSignature,
        true
      ),
      await x509.SubjectKeyIdentifierExtension.create(caKeys.publicKey),
    ],
  })

  const caCrtPem = caCert.toString('pem')
  const caKeyPem = await pkcs8Pem(caKeys.privateKey)
  fs.writeFileSync(caCrtPath, caCrtPem, { mode: 0o644 })
  fs.writeFileSync(caKeyPath, caKeyPem, { mode: 0o600 })
  chmodKey(caKeyPath)
  return { caCert, caKeys, caCrtPem, caKeyPem }
}

async function generatePrivateCaLeaf(
  dataDir: string,
  keyPath: string,
  certPath: string,
  needed: { dns: string[]; ips: string[] }
): Promise<boolean> {
  try {
    const { caCert, caKeys } = await ensurePrivateCa(dataDir)
    const leafKeys = (await webCrypto.subtle.generateKey(EC_ALG, true, ['sign', 'verify'])) as CryptoKeyPair
    const leaf = await x509.X509CertificateGenerator.create({
      serialNumber: randomSerialHex(),
      subject: CYP_TLS_LEAF_SUBJECT,
      issuer: caCert.subject,
      notBefore: new Date(Date.now() - 60_000),
      notAfter: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      signingAlgorithm: EC_ALG,
      publicKey: leafKeys.publicKey,
      signingKey: caKeys.privateKey,
      extensions: [
        new x509.BasicConstraintsExtension(false, undefined, true),
        new x509.KeyUsagesExtension(
          x509.KeyUsageFlags.digitalSignature | x509.KeyUsageFlags.keyEncipherment,
          true
        ),
        new x509.ExtendedKeyUsageExtension([x509.ExtendedKeyUsage.serverAuth], false),
        new x509.SubjectAlternativeNameExtension(buildSanNames(needed)),
        await x509.SubjectKeyIdentifierExtension.create(leafKeys.publicKey),
        await x509.AuthorityKeyIdentifierExtension.create(caCert),
      ],
    })

    const keyPem = await pkcs8Pem(leafKeys.privateKey)
    const certPem = `${leaf.toString('pem').trim()}\n${caCert.toString('pem').trim()}\n`
    fs.writeFileSync(keyPath, keyPem, { mode: 0o600 })
    fs.writeFileSync(certPath, certPem, { mode: 0o644 })
    chmodKey(keyPath)
    return fs.existsSync(keyPath) && fs.existsSync(certPath)
  } catch (err) {
    console.error('[CYP-memo] private-ca ECDSA leaf failed', err)
    return false
  }
}

function opensslLeafArgs(keyPath: string, certPath: string, needed: { dns: string[]; ips: string[] }, algo: 'ec' | 'rsa'): string[] {
  const san = opensslSanExt(needed)
  const base =
    algo === 'ec'
      ? (['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1'] as string[])
      : (['req', '-x509', '-newkey', 'rsa:2048'] as string[])
  return [
    ...base,
    '-sha256',
    '-days',
    '365',
    '-nodes',
    '-keyout',
    keyPath,
    '-out',
    certPath,
    '-subj',
    CYP_TLS_OPENSSL_LEAF_SUBJ,
    '-addext',
    `subjectAltName=${san}`,
    '-addext',
    'basicConstraints=critical,CA:FALSE',
    '-addext',
    'keyUsage=critical,digitalSignature,keyEncipherment',
    '-addext',
    'extendedKeyUsage=serverAuth',
  ]
}

function tryOpenSslEcdsaLeaf(keyPath: string, certPath: string, needed: { dns: string[]; ips: string[] }): boolean {
  const ok = runOpenSsl(opensslLeafArgs(keyPath, certPath, needed, 'ec'))
  if (ok) chmodKey(keyPath)
  return ok && fs.existsSync(keyPath) && fs.existsSync(certPath)
}

function tryOpenSslRsaLeaf(keyPath: string, certPath: string, needed: { dns: string[]; ips: string[] }): boolean {
  const ok = runOpenSsl(opensslLeafArgs(keyPath, certPath, needed, 'rsa'))
  if (ok) chmodKey(keyPath)
  return ok && fs.existsSync(keyPath) && fs.existsSync(certPath)
}

/** 末级回退：@peculiar/x509 ECDSA 自签（禁 node-forge/selfsigned） */
async function generatePeculiarSelfsigned(needed: {
  dns: string[]
  ips: string[]
}): Promise<{ key: string; cert: string }> {
  const keys = (await webCrypto.subtle.generateKey(EC_ALG, true, ['sign', 'verify'])) as CryptoKeyPair
  const cert = await x509.X509CertificateGenerator.createSelfSigned({
    serialNumber: randomSerialHex(),
    name: CYP_TLS_LEAF_SUBJECT,
    notBefore: new Date(Date.now() - 60_000),
    notAfter: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    signingAlgorithm: EC_ALG,
    keys,
    extensions: [
      new x509.BasicConstraintsExtension(false, undefined, true),
      new x509.KeyUsagesExtension(
        x509.KeyUsageFlags.digitalSignature | x509.KeyUsageFlags.keyEncipherment,
        true
      ),
      new x509.ExtendedKeyUsageExtension([x509.ExtendedKeyUsage.serverAuth], false),
      new x509.SubjectAlternativeNameExtension(buildSanNames(needed)),
      await x509.SubjectKeyIdentifierExtension.create(keys.publicKey),
    ],
  })
  return { key: await pkcs8Pem(keys.privateKey), cert: cert.toString('pem') }
}

export async function ensureProductTlsMaterial(dataDir: string): Promise<ProductTlsMaterial> {
  const official = tryLoadOfficial(dataDir)
  if (official) return official

  const needed = sanNeeded()
  const leafDir = path.join(dataDir, 'tls', CYP_TLS_LEAF_DIR_NAME)
  const existing = tryLoadLeafDir(leafDir, needed)
  if (existing) return existing

  for (const legacy of CYP_TLS_LEGACY_LEAF_DIRS) {
    const legacyMat = tryLoadLeafDir(path.join(dataDir, 'tls', legacy), needed)
    if (legacyMat) {
      fs.mkdirSync(leafDir, { recursive: true })
      fs.copyFileSync(path.join(legacyMat.dir, 'key.pem'), path.join(leafDir, 'key.pem'))
      fs.copyFileSync(path.join(legacyMat.dir, 'cert.pem'), path.join(leafDir, 'cert.pem'))
      chmodKey(path.join(leafDir, 'key.pem'))
      return { ...legacyMat, dir: leafDir }
    }
  }

  fs.mkdirSync(leafDir, { recursive: true })
  const keyPath = path.join(leafDir, 'key.pem')
  const certPath = path.join(leafDir, 'cert.pem')

  let source: ProductTlsSource = 'selfsigned'
  if (await generatePrivateCaLeaf(dataDir, keyPath, certPath, needed)) {
    source = 'private-ca'
  } else if (tryOpenSslEcdsaLeaf(keyPath, certPath, needed)) {
    source = 'selfsigned'
  } else if (tryOpenSslRsaLeaf(keyPath, certPath, needed)) {
    source = 'selfsigned'
  } else {
    const pems = await generatePeculiarSelfsigned(needed)
    fs.writeFileSync(keyPath, pems.key, { mode: 0o600 })
    fs.writeFileSync(certPath, pems.cert, { mode: 0o644 })
    chmodKey(keyPath)
  }

  const key = fs.readFileSync(keyPath, 'utf8')
  const cert = fs.readFileSync(certPath, 'utf8')
  const x = new X509Certificate(cert)
  if (!isCurrentProductLeafSubject(String(x.subject || ''))) {
    throw new Error(`TLS leaf subject must be ${CYP_TLS_PRODUCT}, got ${x.subject}`)
  }
  return { key, cert, dir: leafDir, fingerprint256: x.fingerprint256, source }
}
