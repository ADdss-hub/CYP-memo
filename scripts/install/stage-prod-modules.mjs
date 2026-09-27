/**
 * 把本机已安装的服务端生产依赖解成真实文件，放到 .server-prod。
 * 目标平台只复制这份目录并配置，不再 npm/pnpm install。
 */
import { createRequire } from 'module'
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'fs'
import { spawnSync } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const destRoot = path.join(repo, '.server-prod')
const destModules = path.join(destRoot, 'node_modules')
const serverPkgPath = path.join(repo, 'packages', 'server', 'package.json')
const sharedSrc = path.join(repo, 'packages', 'shared')

if (!existsSync(path.join(sharedSrc, 'dist', 'index.js'))) {
  const built = spawnSync('pnpm', ['--filter', '@cyp-memo/shared', 'build'], {
    cwd: repo,
    stdio: 'inherit',
    shell: true,
  })
  if (built.status !== 0) process.exit(built.status ?? 1)
}

function copyReal(src, dest, stack = new Set()) {
  const stat = lstatSync(src)
  const real = stat.isSymbolicLink() ? realpathSync(src) : src
  if (stack.has(real)) return
  const realStat = lstatSync(real)
  if (realStat.isSymbolicLink()) {
    copyReal(realpathSync(real), dest, stack)
    return
  }
  if (realStat.isDirectory()) {
    stack.add(real)
    mkdirSync(dest, { recursive: true })
    for (const name of readdirSync(real)) {
      if (name === '.bin' || name === 'node_modules') continue
      copyReal(path.join(real, name), path.join(dest, name), stack)
    }
    stack.delete(real)
    return
  }
  mkdirSync(path.dirname(dest), { recursive: true })
  copyFileSync(real, dest)
}

rmSync(destRoot, { recursive: true, force: true })
mkdirSync(destModules, { recursive: true })

const serverPkg = JSON.parse(readFileSync(serverPkgPath, 'utf8'))
const requireFromServer = createRequire(serverPkgPath)
const placed = new Map()

function copyDep(name, fromPkgJson, parentDest) {
  const resolvedFrom = createRequire(fromPkgJson)
  let pkgJson
  try {
    pkgJson = resolvedFrom.resolve(`${name}/package.json`)
  } catch (error) {
    if (name.startsWith('@cyp-memo/')) throw error
    try {
      pkgJson = requireFromServer.resolve(`${name}/package.json`)
    } catch {
      return
    }
  }
  const srcRoot = path.dirname(pkgJson)
  const real = realpathSync(srcRoot)
  const flat = path.join(destModules, ...name.split('/'))
  let dest = flat
  if (placed.get(name) === real) return
  if (existsSync(flat) && placed.get(name) && placed.get(name) !== real) {
    dest = path.join(parentDest, 'node_modules', ...name.split('/'))
  }
  if (placed.get(`${name}@${real}`)) return
  placed.set(name, real)
  placed.set(`${name}@${real}`, dest)
  if (!existsSync(path.join(dest, 'package.json'))) copyReal(srcRoot, dest)
  const pkg = JSON.parse(readFileSync(pkgJson, 'utf8'))
  const childNames = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.optionalDependencies || {}),
  ]
  for (const child of childNames) copyDep(child, pkgJson, dest)
}

for (const name of Object.keys(serverPkg.dependencies || {})) {
  if (name === '@cyp-memo/shared') {
    const sharedDest = path.join(destModules, '@cyp-memo', 'shared')
    mkdirSync(sharedDest, { recursive: true })
    copyFileSync(path.join(sharedSrc, 'package.json'), path.join(sharedDest, 'package.json'))
    copyReal(path.join(sharedSrc, 'dist'), path.join(sharedDest, 'dist'))
    const sharedPkg = JSON.parse(readFileSync(path.join(sharedSrc, 'package.json'), 'utf8'))
    for (const child of Object.keys(sharedPkg.dependencies || {})) {
      copyDep(child, serverPkgPath, sharedDest)
    }
    continue
  }
  copyDep(name, serverPkgPath, destModules)
}

const stagedPkg = {
  ...serverPkg,
  scripts: { start: 'node --conditions=cyp-node dist/index.js' },
}
delete stagedPkg.devDependencies
writeFileSync(path.join(destRoot, 'package.json'), `${JSON.stringify(stagedPkg, null, 2)}\n`)

const wasm = path.join(destModules, 'sql.js', 'dist', 'sql-wasm.wasm')
const sharedEntry = path.join(destModules, '@cyp-memo', 'shared', 'dist', 'index.js')
if (!existsSync(wasm) || !existsSync(sharedEntry)) {
  console.error('[stage-prod-modules] 本机依赖复制后缺少 sql-wasm.wasm 或 shared/dist/index.js')
  process.exit(1)
}
if (lstatSync(path.join(destModules, 'sql.js')).isSymbolicLink()) {
  console.error('[stage-prod-modules] sql.js 仍是联接，不能原样搬到目标平台')
  process.exit(1)
}
console.log('[stage-prod-modules] 已从本机依赖复制到', destRoot)
