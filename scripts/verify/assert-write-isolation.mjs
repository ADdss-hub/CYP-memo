#!/usr/bin/env node
/**
 * 可写探针对产品库隔离（R-026 同口径）。
 * CYP_LOAD_ISOLATED=1 + CYP_LOAD_EXPECT_DATA_DIR（绝对路径且 ≠ 产品 data）+ CYP_API_BASE
 * 并对 /api/config 的 dataDir 核对。自签 HTTPS 仅用于环回探针。
 */
import fs from 'node:fs'
import https from 'node:https'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
export const productDataDir = () => path.resolve(repoRoot, 'packages/server/data')

export function tlsRequest(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const lib = u.protocol === 'https:' ? https : http
    const headers = { ...(opts.headers || {}) }
    const body = opts.body
    if (body && !headers['Content-Length']) {
      headers['Content-Length'] = Buffer.byteLength(body)
    }
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: `${u.pathname}${u.search}`,
        method: opts.method || 'GET',
        headers,
        timeout: opts.timeout || 15_000,
        rejectUnauthorized: false,
      },
      (res) => {
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          resolve({ status: res.statusCode || 0, text })
        })
      }
    )
    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('timeout'))
    })
    if (body) req.write(body)
    req.end()
  })
}

function getJson(url) {
  return tlsRequest(url).then(({ status, text }) => {
    if (status >= 400) throw new Error(`HTTP ${status}`)
    return JSON.parse(text)
  })
}

export async function assertWriteIsolation(scriptName = 'write-probe') {
  const product = productDataDir()
  if (process.env.CYP_LOAD_ISOLATED !== '1') {
    throw new Error(
      `[${scriptName}] REFUSE: 禁止写入产品业务库。须 CYP_LOAD_ISOLATED=1 并另起专用 DATA_DIR。产品 dataDir=${product}`
    )
  }
  const expectRaw = String(process.env.CYP_LOAD_EXPECT_DATA_DIR || '').trim()
  if (!expectRaw) {
    throw new Error(`[${scriptName}] REFUSE: 须 CYP_LOAD_EXPECT_DATA_DIR=专用绝对路径`)
  }
  const expectDataDir = path.resolve(expectRaw)
  if (expectDataDir === product) {
    throw new Error(`[${scriptName}] REFUSE: CYP_LOAD_EXPECT_DATA_DIR 不能等于产品库 ${product}`)
  }
  const apiBase = String(process.env.CYP_API_BASE || '').replace(/\/$/, '')
  if (!apiBase) {
    throw new Error(`[${scriptName}] REFUSE: 须 CYP_API_BASE 指向专用实例（禁止默认打产品口）`)
  }
  if (!fs.existsSync(expectDataDir)) fs.mkdirSync(expectDataDir, { recursive: true })

  const json = await getJson(`${apiBase}/api/config`)
  const d = json?.data?.dataDir || json?.dataDir
  if (typeof d !== 'string' || !d.trim()) {
    throw new Error(`[${scriptName}] REFUSE: /api/config 未返回 dataDir`)
  }
  const serverDataDir = path.resolve(d.trim())
  if (serverDataDir === product) {
    throw new Error(`[${scriptName}] REFUSE: 目标实例仍是产品库 ${product}`)
  }
  if (serverDataDir !== expectDataDir) {
    throw new Error(
      `[${scriptName}] REFUSE: 实例 dataDir=${serverDataDir} 与 EXPECT=${expectDataDir} 不一致`
    )
  }
  return { expectDataDir, apiBase, serverDataDir }
}
