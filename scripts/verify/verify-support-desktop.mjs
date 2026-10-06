/**
 * 默认声明集 Desktop：桌面进程嵌入同一服务端。
 * 静态核验 EmbeddedServer + SUPPORT_MATRIX；实机核验 /healthz/ready；
 * 嵌入冒烟：按 EmbeddedServer 同参 spawn（dist 或 tsx src）。
 * CYP_SKIP_EMBED_SMOKE=1 时跳过嵌入冒烟（供 cutin 嵌套调用）。
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { spawn } from 'child_process'
import os from 'os'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8')
const fails = []

const plt = read('packages/server/src/runtime-base/l0/coord/plt/ready.ts')
if (!plt.includes("const SUPPORT_PLATFORMS = ['Server', 'Desktop']")) {
  fails.push('SUPPORT_PLATFORMS missing Desktop')
}
if (!/SUPPORT_PLATFORMS\.flatMap/.test(plt) && !plt.includes("platform: 'Desktop'")) {
  fails.push('SUPPORT_MATRIX does not declare Desktop rows')
}

const emb = read('packages/desktop/src/main/EmbeddedServer.ts')
for (const need of [
  "APP_ENV: 'prod'",
  "NODE_ENV: 'production'",
  '/healthz/ready',
  'resolveServerLaunch',
  'getServerPath',
  'DATA_DIR:',
  "path.join(process.cwd(), '..', 'server', 'dist', 'index.js')",
  'Falling back to tsx src',
  'resolveNodeBinary',
]) {
  if (!emb.includes(need)) fails.push(`EmbeddedServer missing ${need}`)
}
if (/系统缓存中心|十二中心|质量门禁|完成态|业务模块/.test(emb)) {
  fails.push('EmbeddedServer still uses banned module names')
}

const pkg = JSON.parse(read('packages/desktop/package.json'))
const mainRel = String(pkg.main || '')
if (mainRel !== 'dist/main/main/index.js') {
  fails.push(`desktop package.json main=${mainRel} want dist/main/main/index.js`)
}

const localJs = read('packages/desktop/scripts/local.js')
if (!localJs.includes("APP_ENV: 'prod'") || !localJs.includes("NODE_ENV: 'production'")) {
  fails.push('desktop local.js not prod baseline')
}
if (!localJs.includes('dist/main/main/index.js')) {
  fails.push('desktop local.js main path must match package.json main')
}

const cache = read('packages/desktop/src/main/CacheManager.ts')
if (/缓存中心|系统缓存中心/.test(cache)) {
  fails.push('CacheManager still uses 缓存中心')
}
if (!cache.includes('不冒充')) {
  fails.push('CacheManager missing non-impersonation boundary note')
}

function resolveEmbedLaunch() {
  const dist = path.join(root, 'packages/server/dist/index.js')
  const src = path.join(root, 'packages/server/src/index.ts')
  const tsxCli = [
    path.join(root, 'packages/server/node_modules/tsx/dist/cli.mjs'),
    path.join(root, 'node_modules/tsx/dist/cli.mjs'),
  ].find((p) => fs.existsSync(p))
  // dist 须含 HTTPS（R-TLS-001）；陈旧 HTTP dist 会导致探针 https 永远超时
  const distOk =
    fs.existsSync(dist) &&
    /ensureApiTlsMaterial|createHttpsServer/.test(fs.readFileSync(dist, 'utf8'))
  if (distOk) {
    return {
      command: process.execPath,
      args: ['--conditions=cyp-node', dist],
      cwd: path.dirname(dist),
      mode: 'dist',
    }
  }
  if (src && tsxCli && fs.existsSync(src)) {
    return {
      command: process.execPath,
      args: [tsxCli, src],
      cwd: path.join(root, 'packages/server'),
      mode: 'tsx-src',
    }
  }
  return null
}

const launch = resolveEmbedLaunch()
if (!launch) {
  fails.push('embed launch unresolved (need server dist or tsx+src)')
}

process.env.NODE_TLS_REJECT_UNAUTHORIZED = process.env.NODE_TLS_REJECT_UNAUTHORIZED || '0'
const readyUrl = (() => {
  const raw = (process.env.CYP_READY_URL || 'https://127.0.0.1:5170/healthz/ready').trim()
  if (/\/healthz\/ready\/?$/.test(raw)) return raw.replace(/\/$/, '')
  return `${raw.replace(/\/$/, '')}/healthz/ready`
})()
let liveOk = false
try {
  const res = await fetch(readyUrl)
  const body = await res.json()
  const rb = body?.data?.runtimeBase
  const items = rb?.items || {}
  const ids = Object.keys(items)
  if (ids.length !== 35) fails.push(`live items=${ids.length} want 35`)
  if (rb?.completeForm !== true) fails.push('live completeForm not true')
  if (rb?.modules) fails.push('live still has modules')
  if (body?.data?.twelveCenters) fails.push('live still has twelveCenters')
  liveOk = ids.length === 35 && rb?.completeForm === true
} catch (e) {
  fails.push(`live ready failed: ${e?.message || e}`)
}

let embedSmoke = 'skip'
if (launch && fails.length === 0 && process.env.CYP_SKIP_EMBED_SMOKE !== '1') {
  const port = Number(process.env.CYP_EMBED_SMOKE_PORT || 5197)
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyp-embed-smoke-'))
  const child = spawn(launch.command, launch.args, {
    env: {
      ...process.env,
      PORT: String(port),
      DATA_DIR: dataDir,
      APP_ENV: 'prod',
      NODE_ENV: 'production',
      LOG_LEVEL: 'error',
      NODE_TLS_REJECT_UNAUTHORIZED: process.env.NODE_TLS_REJECT_UNAUTHORIZED || '0',
      CYP_EMBED_START_TIMEOUT_MS: process.env.CYP_EMBED_START_TIMEOUT_MS || '120000',
    },
    cwd: launch.cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stderr = ''
  child.stderr?.on('data', (d) => {
    stderr += String(d)
  })
  const deadline = Date.now() + Number(process.env.CYP_EMBED_SMOKE_DEADLINE_MS || 120000)
  try {
    while (Date.now() < deadline) {
      if (child.exitCode != null) {
        fails.push(`embed smoke exited early code=${child.exitCode} ${stderr.slice(0, 240)}`)
        break
      }
      try {
        const res = await fetch(`https://127.0.0.1:${port}/healthz/ready`)
        if (res.ok) {
          const body = await res.json()
          const rb = body?.data?.runtimeBase
          const n = Object.keys(rb?.items || {}).length
          if (n === 35 && rb?.completeForm === true) {
            embedSmoke = `ok:${launch.mode}`
            break
          }
          fails.push(`embed smoke ready malformed items=${n} completeForm=${rb?.completeForm}`)
          break
        }
      } catch {
        /* wait */
      }
      await new Promise((r) => setTimeout(r, 400))
    }
    if (!String(embedSmoke).startsWith('ok') && !fails.some((f) => String(f).startsWith('embed smoke'))) {
      fails.push(`embed smoke timeout waiting /healthz/ready ${stderr.slice(0, 240)}`)
    }
  } finally {
    try {
      child.kill('SIGTERM')
    } catch {
      /* ignore */
    }
    await new Promise((r) => setTimeout(r, 800))
    try {
      child.kill('SIGKILL')
    } catch {
      /* ignore */
    }
  }
} else if (process.env.CYP_SKIP_EMBED_SMOKE === '1') {
  embedSmoke = 'skipped'
}

if (fails.length) {
  console.error('FAIL_SUPPORT_DESKTOP')
  for (const f of fails) console.error(f)
  process.exit(1)
}
console.log('PASS_SUPPORT_DESKTOP')
console.log(
  `live=${liveOk ? 'ok' : 'skip'} embedSmoke=${embedSmoke} platforms=Server+Desktop embed=same-server`
)
