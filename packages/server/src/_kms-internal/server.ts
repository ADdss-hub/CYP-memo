/**
 * CYP-memo KMS 密钥保险箱 · 独立 HTTP 服务端
 * 监听 127.0.0.1:12000（基础设施服务段 12000-12999）
 * 提供加密/解密/密钥轮换等核心 KMS 能力的 REST 接口
 * 所有请求须携带 East-West Token 认证
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import http from 'http'
import {
  initKms,
  resetKms,
  getKmsState,
  isKmsReady,
  putSecret,
  resolveCipherRef,
  resolveSecret,
  rotateSecret,
  rollbackSecret,
  kmsPerfection,
  ready_rb_l1_mgmt_kms_01,
  ensureWorkloadTrustAnchor,
  getWorkloadTrustAnchor,
  isWorkloadTrustAnchorReady,
  type KmsState,
  type CipherRef,
} from '../runtime-base/l1/mgmt/kms/ready.js'

/** East-West Token 认证结果 */
interface AuthResult {
  ok: boolean
  reason?: string
}

/**
 * East-West Token 认证中间件
 * 校验 Authorization: Bearer <token> 头部
 * Token 来源：KMS_AUTH_TOKEN 环境变量（共享密钥模式）
 * 未来可扩展为 SPIFFE mTLS 证书认证
 */
function validateAuthToken(req: http.IncomingMessage): AuthResult {
  const authHeader = req.headers['authorization']
  if (!authHeader) {
    return { ok: false, reason: 'missing_authorization_header' }
  }
  const parts = authHeader.split(' ')
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return { ok: false, reason: 'invalid_authorization_format' }
  }
  const token = parts[1]
  const expectedToken = process.env.KMS_AUTH_TOKEN || ''
  if (!expectedToken) {
    return { ok: false, reason: 'kms_auth_token_not_configured' }
  }
  // 恒定时间比较，防止时序攻击
  const a = Buffer.from(token)
  const b = Buffer.from(expectedToken)
  if (a.length !== b.length) {
    return { ok: false, reason: 'invalid_token' }
  }
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i]
  }
  if (diff !== 0) {
    return { ok: false, reason: 'invalid_token' }
  }
  return { ok: true }
}

/** 统一 JSON 响应 */
function sendJson(res: http.ServerResponse, statusCode: number, body: Record<string, unknown>): void {
  const data = JSON.stringify(body)
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
  })
  res.end(data)
}

/** 读取请求体（JSON） */
function readBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let total = 0
    const MAX_BODY = 1024 * 1024 // 1MB 上限
    req.on('data', (chunk: Buffer) => {
      total += chunk.length
      if (total > MAX_BODY) {
        reject(new Error('request_body_too_large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8')
        if (!raw) {
          resolve({})
          return
        }
        const parsed = JSON.parse(raw)
        resolve(parsed)
      } catch {
        reject(new Error('invalid_json_body'))
      }
    })
    req.on('error', reject)
  })
}

/**
 * 创建 KMS HTTP 服务
 * @param opts.dataDir 数据目录
 * @param opts.port 监听端口（默认 12000）
 * @param opts.host 监听地址（默认 127.0.0.1）
 */
export function createKmsServer(opts: {
  dataDir: string
  port?: number
  host?: string
  masterKey?: string | null
}): http.Server {
  const port = opts.port ?? (Number(process.env.KMS_PORT) || 12000)
  const host = opts.host ?? '127.0.0.1'

  // 初始化 KMS 核心
  resetKms()
  initKms({ dataDir: opts.dataDir, masterKey: opts.masterKey ?? (process.env.CYP_KMS_MASTER_KEY || null) })

  // 确保信任锚存在（SPIFFE 工作负载身份）
  ensureWorkloadTrustAnchor(opts.dataDir)

  const server = http.createServer(async (req, res) => {
    // 仅处理 /kms/v1/* 路径
    const url = req.url || '/'
    const method = req.method || 'GET'

    // CORS（仅环回，严格限制）
    res.setHeader('X-Frame-Options', 'DENY')
    res.setHeader('X-Content-Type-Options', 'nosniff')

    // 健康检查（免认证，供启动脚本探测）
    if (method === 'GET' && url === '/kms/v1/health') {
      sendJson(res, 200, {
        status: 'ok',
        service: 'kms-vault',
        timestamp: new Date().toISOString(),
      })
      return
    }

    // 就绪检查（免认证，供启动脚本探测）
    if (method === 'GET' && url === '/kms/v1/ready') {
      const ready = isKmsReady() && ready_rb_l1_mgmt_kms_01()
      sendJson(res, ready ? 200 : 503, {
        ready,
        service: 'kms-vault',
        timestamp: new Date().toISOString(),
      })
      return
    }

    // East-West Token 认证（除 health/ready 外所有接口必须认证）
    const auth = validateAuthToken(req)
    if (!auth.ok) {
      sendJson(res, 401, {
        success: false,
        code: 'UNAUTHORIZED',
        message: `East-West token 认证失败: ${auth.reason}`,
        timestamp: new Date().toISOString(),
      })
      return
    }

    try {
      // POST /kms/v1/encrypt — 加密并存储密钥（putSecret）
      if (method === 'POST' && url === '/kms/v1/encrypt') {
        const body = await readBody(req)
        const plain = String(body.plain || '')
        const id = body.id ? String(body.id) : undefined
        const result = putSecret(plain, id ? { id } : undefined)
        sendJson(res, 200, {
          success: true,
          data: result,
          timestamp: new Date().toISOString(),
        })
        return
      }

      // POST /kms/v1/decrypt — 解密密钥（resolveCipherRef）
      if (method === 'POST' && url === '/kms/v1/decrypt') {
        const body = await readBody(req)
        const ref = body.ref as CipherRef | string
        const plaintext = resolveCipherRef(ref)
        sendJson(res, 200, {
          success: true,
          data: plaintext,
          timestamp: new Date().toISOString(),
        })
        return
      }

      // POST /kms/v1/rotate — 密钥轮换（rotateSecret）
      if (method === 'POST' && url === '/kms/v1/rotate') {
        const body = await readBody(req)
        const ref = body.ref as CipherRef | string
        const newPlain = String(body.newPlain || '')
        const newId = Boolean(body.newId)
        const result = rotateSecret(ref, newPlain, newId ? { newId: true } : undefined)
        sendJson(res, 200, {
          success: true,
          data: result,
          timestamp: new Date().toISOString(),
        })
        return
      }

      // POST /kms/v1/rollback — 密钥回滚（rollbackSecret）
      if (method === 'POST' && url === '/kms/v1/rollback') {
        const body = await readBody(req)
        const ref = body.ref as CipherRef | string
        const result = rollbackSecret(ref)
        sendJson(res, 200, {
          success: true,
          data: result,
          timestamp: new Date().toISOString(),
        })
        return
      }

      // GET /kms/v1/state — KMS 状态
      if (method === 'GET' && url === '/kms/v1/state') {
        const state = getKmsState()
        sendJson(res, 200, {
          success: true,
          data: state,
          timestamp: new Date().toISOString(),
        })
        return
      }

      // GET /kms/v1/perfection — KMS 完备性校验
      if (method === 'GET' && url === '/kms/v1/perfection') {
        const perfection = kmsPerfection()
        sendJson(res, 200, {
          success: true,
          data: perfection,
          timestamp: new Date().toISOString(),
        })
        return
      }

      // GET /kms/v1/trust-anchor — 工作负载信任锚信息
      if (method === 'GET' && url === '/kms/v1/trust-anchor') {
        const anchor = getWorkloadTrustAnchor()
        const ready = isWorkloadTrustAnchorReady()
        sendJson(res, 200, {
          success: true,
          data: { anchor, ready },
          timestamp: new Date().toISOString(),
        })
        return
      }

      // 404
      sendJson(res, 404, {
        success: false,
        code: 'NOT_FOUND',
        message: `KMS endpoint not found: ${method} ${url}`,
        timestamp: new Date().toISOString(),
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      // 区分已知错误类型
      let statusCode = 500
      let code = 'INTERNAL_ERROR'
      if (message.includes('kms service not ready')) {
        statusCode = 503
        code = 'KMS_NOT_READY'
      } else if (message.includes('kms secret not found')) {
        statusCode = 404
        code = 'SECRET_NOT_FOUND'
      } else if (message.includes('kms rollback blocked')) {
        statusCode = 409
        code = 'ROLLBACK_BLOCKED'
      } else if (message.includes('invalid kms sealed blob')) {
        statusCode = 400
        code = 'INVALID_SEALED_BLOB'
      } else if (message.includes('putSecret requires') || message.includes('rotateSecret requires')) {
        statusCode = 400
        code = 'BAD_REQUEST'
      }
      sendJson(res, statusCode, {
        success: false,
        code,
        message,
        timestamp: new Date().toISOString(),
      })
    }
  })

  // 启动监听
  server.listen(port, host, () => {
    const state = getKmsState()
    console.log(`[KMS] 密钥保险箱服务启动于 http://${host}:${port}`)
    console.log(`[KMS] 就绪状态: ${isKmsReady()}`)
    console.log(`[KMS] 密钥数量: ${state.secretCount}`)
    console.log(`[KMS] 信任锚就绪: ${isWorkloadTrustAnchorReady()}`)
  })

  return server
}

export default createKmsServer
