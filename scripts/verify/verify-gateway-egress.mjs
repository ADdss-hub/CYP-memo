/**
 * 出站 half-open + 混沌实机核验（规则 24.20 · R-017 · 编制齐≠能力齐）
 * 短冷却仅本核验用；禁止 forceClose 冒充半开恢复。
 */
import { spawnSync } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const serverPkg = path.join(root, 'packages/server')
const env = {
  ...process.env,
  CYP_EGRESS_COOLDOWN_MS: process.env.CYP_EGRESS_COOLDOWN_MS || '400',
  CYP_EGRESS_HALF_SUCCESS: process.env.CYP_EGRESS_HALF_SUCCESS || '1',
}

function run(scriptRel) {
  const script = path.join(serverPkg, 'scripts', scriptRel)
  const r = spawnSync(
    process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
    ['exec', 'tsx', script],
    { cwd: serverPkg, env, encoding: 'utf8', shell: true }
  )
  if (r.stdout) process.stdout.write(r.stdout)
  if (r.stderr) process.stderr.write(r.stderr)
  if (r.status !== 0) {
    console.error(`[verify-gateway-egress] FAIL ${scriptRel} exit=${r.status}`)
    process.exit(r.status || 1)
  }
}

run('gateway-center-halfopen-verify.ts')
run('gateway-center-chaos-verify.ts')
console.log('[verify-gateway-egress] OK')
process.exit(0)
