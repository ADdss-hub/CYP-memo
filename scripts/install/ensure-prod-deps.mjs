/**
 * 核对发行包里已经复制好的依赖服务。目标平台不重新安装。
 *
 * 用法: node scripts/install/ensure-prod-deps.mjs <APP_ROOT>
 */
import { createRequire } from 'module'
import fs from 'fs'
import path from 'path'

const REQUIRED = ['express', 'cors', 'multer', 'bcryptjs', 'sql.js', 'uuid', 'dexie', '@cyp-memo/shared']

const appRootArg = process.argv.slice(2).find((arg) => !arg.startsWith('--'))
if (!appRootArg) {
  console.error('用法: node scripts/install/ensure-prod-deps.mjs <APP_ROOT>')
  process.exit(2)
}

const appRoot = path.resolve(appRootArg)
const serverDir = fs.existsSync(path.join(appRoot, 'packages', 'server', 'package.json'))
  ? path.join(appRoot, 'packages', 'server')
  : appRoot
const pkgPath = path.join(serverDir, 'package.json')
const require = createRequire(pkgPath)

const missing = []
for (const name of REQUIRED) {
  try {
    require.resolve(name === '@cyp-memo/shared' ? '@cyp-memo/shared/package.json' : name)
  } catch {
    missing.push(name)
  }
}

let wasm = ''
try {
  wasm = require.resolve('sql.js/dist/sql-wasm.wasm')
} catch {
  missing.push('sql.js/dist/sql-wasm.wasm')
}
if (wasm && (!fs.existsSync(wasm) || fs.statSync(wasm).size < 1000)) {
  missing.push('sql.js/dist/sql-wasm.wasm')
}

const sharedEntry = [
  path.join(serverDir, 'node_modules', '@cyp-memo', 'shared', 'dist', 'index.js'),
  path.join(appRoot, 'packages', 'shared', 'dist', 'index.js'),
].find((file) => {
  try {
    return fs.statSync(file).size > 100
  } catch {
    return false
  }
})
if (!sharedEntry) missing.push('@cyp-memo/shared/dist/index.js')

if (missing.length) {
  console.error('[ensure-prod-deps] 发行包未带上依赖，目标机不重新安装:', missing.join(', '))
  process.exit(1)
}
console.log('[ensure-prod-deps] 已复制的依赖可用，只做配置')
