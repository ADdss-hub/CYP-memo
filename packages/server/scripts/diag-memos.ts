/**
 * 诊断：admin123 租户的用户数/备忘录数，并对列表路径的两个重查询（用户表、备忘录表）做 in-process 计时。
 * 只读快照，不写盘。
 */
import initSqlJs from 'sql.js'
import { createRequire } from 'module'
import path from 'path'
import fs from 'fs'

const req = createRequire(path.join(process.cwd(), 'package.json'))
const SQL = await initSqlJs({
  locateFile: (file: string) =>
    req.resolve(file === 'sql-wasm.wasm' ? 'sql.js/dist/sql-wasm.wasm' : `sql.js/dist/${file}`),
})
const dbPath = path.resolve(process.cwd(), 'data/database.sqlite')
const buf = fs.readFileSync(dbPath)
const db = new SQL.Database(buf)

const u0 = db.exec("SELECT id, tenantRootId FROM users WHERE username='admin123' AND token IS NOT NULL LIMIT 1")
const [adminId, tenantRootId] = u0[0].values[0] as string[]
console.log('tenantRootId=', tenantRootId)

const users = db.exec('SELECT * FROM users WHERE tenantRootId = ?', [tenantRootId])
console.log('tenant users count =', users[0]?.values.length ?? 0)

const userIds = (users[0]?.values.map((r) => r[0]) as string[]) ?? []
const ph = userIds.map(() => '?').join(',')
const memos = db.exec(
  `SELECT id FROM memos WHERE userId IN (${ph}) AND deletedAt IS NULL`,
  userIds,
)
console.log('tenant memos (non-deleted) count =', memos[0]?.values.length ?? 0)

function timeExec(label: string, sql: string, params: unknown[] = [], n = 50) {
  for (let i = 0; i < 5; i++) db.exec(sql, params) // warmup
  const t0 = performance.now()
  for (let i = 0; i < n; i++) db.exec(sql, params)
  const el = (performance.now() - t0) / n
  console.log(`${label}: ${el.toFixed(2)}ms/iter  (n=${n})`)
}

timeExec('users query (SELECT * FROM users WHERE tenantRootId=?)', 'SELECT * FROM users WHERE tenantRootId = ?', [tenantRootId])
timeExec(
  'memos list projection+sort',
  `SELECT id, userId, title,
        CASE WHEN length(content) > ? THEN substr(content, 1, ?) ELSE content END AS content,
        CASE WHEN length(content) > ? THEN 1 ELSE 0 END AS _contentTruncated,
        tags, priority, attachments, deletedAt, createdAt, updatedAt
       FROM memos WHERE userId IN (${ph}) AND deletedAt IS NULL ORDER BY updatedAt DESC`,
  [256, 256, 256, ...userIds],
)

db.close()
