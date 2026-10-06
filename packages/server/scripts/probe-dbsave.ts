/**
 * 探测：对当前 41MB database.sqlite 做一次 export()+writeFileSync 的同步阻塞耗时。
 * 只读加载，落盘到临时文件后立即删除，不污染原库。
 */
import initSqlJs from 'sql.js'
import { createRequire } from 'module'
import path from 'path'
import fs from 'fs'
import os from 'os'

const req = createRequire(path.join(process.cwd(), 'package.json'))
const SQL = await initSqlJs({
  locateFile: (file: string) =>
    req.resolve(file === 'sql-wasm.wasm' ? 'sql.js/dist/sql-wasm.wasm' : `sql.js/dist/${file}`),
})
const dbPath = path.resolve(process.cwd(), 'data/database.sqlite')
const buf = fs.readFileSync(dbPath)
const db = new SQL.Database(buf)

function timeIt(label: string, fn: () => void, n = 5) {
  for (let i = 0; i < 2; i++) fn() // warmup
  const t0 = performance.now()
  for (let i = 0; i < n; i++) fn()
  const el = (performance.now() - t0) / n
  console.log(`${label}: ${el.toFixed(1)}ms/iter (n=${n})`)
}

timeIt('db.export() [纯内存序列化]', () => {
  const d = db.export()
  void d
})

const tmp = path.join(os.tmpdir(), `cyp-dbprobe-${Date.now()}.sqlite`)
timeIt('db.export() + fs.writeFileSync [完整落盘阻塞]', () => {
  const data = db.export()
  fs.writeFileSync(tmp, Buffer.from(data))
})
try { fs.unlinkSync(tmp) } catch {}
db.close()
console.log('probe done')
