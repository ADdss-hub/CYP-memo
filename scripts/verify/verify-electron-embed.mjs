/**
 * Desktop Electron 嵌入实启机检：编译主进程 → electron 加载 embed-smoke.mjs → ready×35。
 * 默认 PORT=5198，不与 5170 Server 声明集冲突。
 */
import { spawn, spawnSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const desk = path.join(root, 'packages/desktop')
const fails = []

const tsc = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['tsc', '-p', 'tsconfig.main.json'],
  { cwd: desk, encoding: 'utf8', shell: process.platform === 'win32' }
)
if (tsc.status !== 0) {
  fails.push(`desktop main compile failed: ${(tsc.stderr || tsc.stdout || '').slice(0, 400)}`)
}

const embJs = path.join(desk, 'dist/main/main/EmbeddedServer.js')
if (!fs.existsSync(embJs)) fails.push('EmbeddedServer.js missing after compile')

const smokeEntry = path.join(desk, 'scripts/embed-smoke.mjs')
if (!fs.existsSync(smokeEntry)) fails.push('embed-smoke.mjs missing')

let electronBin = ''
try {
  const req = createRequire(path.join(desk, 'package.json'))
  electronBin = req('electron')
} catch (e) {
  fails.push(`electron resolve failed: ${e?.message || e}`)
}

if (fails.length) {
  console.error('FAIL_ELECTRON_EMBED')
  for (const f of fails) console.error(f)
  process.exit(1)
}

const port = Number(process.env.CYP_EMBED_SMOKE_PORT || 5198)
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyp-electron-embed-'))
const child = spawn(electronBin, [smokeEntry], {
  cwd: desk,
  env: {
    ...process.env,
    PORT: String(port),
    CYP_EMBED_SMOKE_PORT: String(port),
    DATA_DIR: dataDir,
    APP_ENV: 'prod',
    NODE_ENV: 'production',
    ELECTRON_ENABLE_LOGGING: '1',
    NODE_TLS_REJECT_UNAUTHORIZED: process.env.NODE_TLS_REJECT_UNAUTHORIZED || '0',
    CYP_EMBED_START_TIMEOUT_MS: process.env.CYP_EMBED_START_TIMEOUT_MS || '120000',
    CYP_EMBED_SMOKE_DEADLINE_MS: process.env.CYP_EMBED_SMOKE_DEADLINE_MS || '120000',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let out = ''
child.stdout?.on('data', (d) => {
  out += String(d)
  process.stdout.write(d)
})
child.stderr?.on('data', (d) => {
  out += String(d)
  process.stderr.write(d)
})

const code = await new Promise((resolve) => {
  const t = setTimeout(() => {
    try {
      child.kill('SIGKILL')
    } catch {
      /* ignore */
    }
    resolve(124)
  }, Number(process.env.CYP_EMBED_SMOKE_DEADLINE_MS || 150000))
  child.on('exit', (c) => {
    clearTimeout(t)
    resolve(c ?? 1)
  })
})

if (code !== 0 || !out.includes('PASS_ELECTRON_EMBED')) {
  console.error('FAIL_ELECTRON_EMBED')
  console.error(`exit=${code}`)
  process.exit(1)
}
console.log('PASS_ELECTRON_EMBED')
console.log(`port=${port} dataDir=${dataDir}`)
