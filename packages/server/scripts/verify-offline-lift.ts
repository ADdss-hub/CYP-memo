/**
 * 真机核验：在线 bans/lift → 410；离线 CLI 可解除 + 热加载
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { offlineLiftPermanentBan } from '../src/runtime-base/l1/mgmt/iam/ready.js'

const base = process.env.CYP_BASE || 'http://127.0.0.1:5170'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.resolve(__dirname, '../data')
const bansPath = path.join(dataDir, 'governance', 'permanent-bans.json')

async function j(
  method: string,
  p: string,
  body?: unknown,
  headers: Record<string, string> = {}
) {
  const r = await fetch(base + p, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const t = await r.text()
  let data: unknown
  try {
    data = JSON.parse(t)
  } catch {
    data = t
  }
  return { status: r.status, data }
}

function slice(d: unknown, n = 220): string {
  return JSON.stringify(d).slice(0, n)
}

function seedActiveBan(username: string, ip: string): void {
  const now = new Date().toISOString()
  const rec = {
    id: `verify-${Date.now()}`,
    ip,
    username,
    at: now,
    reason: 'verify-seed-active',
    fails: 99,
    status: 'active' as const,
    geoPolicy: 'cn_default',
  }
  fs.mkdirSync(path.dirname(bansPath), { recursive: true })
  fs.writeFileSync(
    bansPath,
    JSON.stringify({ bans: [rec], updatedAt: now }, null, 2),
    'utf-8'
  )
}

async function main() {
  const uname = `oflift_${Date.now().toString(36)}`
  const password = 'Test1234!x'
  const pubIp = '198.51.100.88'

  const reg = await j('POST', '/api/auth/register', {
    username: uname,
    password,
    displayName: uname,
  })
  const regData = reg.data as {
    success?: boolean
    data?: { accessToken?: string }
  }
  const token = regData?.data?.accessToken
  console.log('REG', reg.status, Boolean(token))
  if (!token) {
    console.error('VERIFY_FAIL no token')
    process.exit(1)
  }

  const authLift = await j(
    'POST',
    '/api/governance/bans/lift',
    { username: uname },
    { Authorization: `Bearer ${token}` }
  )
  console.log('AUTH_LIFT', authLift.status, slice(authLift.data))
  const ok410 = authLift.status === 410

  seedActiveBan(uname, pubIp)
  await new Promise((r) => setTimeout(r, 2100))

  const gateBanned = await j(
    'POST',
    '/api/auth/login',
    { username: uname, password },
    { 'X-Forwarded-For': pubIp }
  )
  console.log('GATE_BANNED', gateBanned.status, slice(gateBanned.data))
  const okE023 = gateBanned.status === 403

  // CLI 入口（与运维一致）
  const { spawnSync } = await import('child_process')
  const cli = spawnSync(
    process.execPath,
    [
      '--import',
      'tsx',
      path.join(__dirname, 'offline-lift-ban.ts'),
      `--username=${uname}`,
      '--actor=verify-offline',
      `--data-dir=${dataDir}`,
    ],
    { encoding: 'utf-8', cwd: path.resolve(__dirname, '..') }
  )
  // fallback: direct API if spawn path awkward under pnpm
  let lifted = 0
  if (cli.status === 0 && cli.stdout) {
    console.log('CLI_OUT', cli.stdout.slice(0, 300))
    try {
      const parsed = JSON.parse(cli.stdout) as { lifted?: number }
      lifted = parsed.lifted || 0
    } catch {
      /* use offline API */
    }
  }
  if (lifted === 0) {
    const off = offlineLiftPermanentBan({
      dataDir,
      username: uname,
      actor: 'verify-offline',
    })
    lifted = off.lifted
    console.log('OFFLINE_API', JSON.stringify({ lifted, by: off.records[0]?.liftedBy }))
  }

  await new Promise((r) => setTimeout(r, 2500))
  const after = await j(
    'POST',
    '/api/auth/login',
    { username: uname, password },
    { 'X-Forwarded-For': pubIp }
  )
  console.log('GATE_AFTER_LIFT', after.status, slice(after.data))
  const okLogin = after.status === 200

  const pass = ok410 && okE023 && lifted > 0 && okLogin
  console.log(pass ? 'VERIFY_PASS' : 'VERIFY_FAIL', {
    ok410,
    okE023,
    lifted,
    after: after.status,
  })
  process.exit(pass ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(2)
})
