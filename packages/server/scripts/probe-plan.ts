/** 探测：列表查询的 EXPLAIN QUERY PLAN + 全库 memo 总量，判断是否为全表扫描。 */
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

const totalMemos = db.exec('SELECT COUNT(*) FROM memos')[0].values[0][0] as number
const totalUsers = db.exec('SELECT COUNT(*) FROM users')[0].values[0][0] as number
console.log('total memos in DB =', totalMemos, ' total users =', totalUsers)

const u0 = db.exec("SELECT id, tenantRootId FROM users WHERE username='admin123' AND token IS NOT NULL LIMIT 1")
const [, tenantRootId] = u0[0].values[0] as string[]
const userIds = (db.exec('SELECT id FROM users WHERE tenantRootId = ?', [tenantRootId])[0]?.values.map((r) => r[0]) as string[]) ?? []
const ph = userIds.map(() => '?').join(',')

const q = `SELECT id, userId, title,
        CASE WHEN length(content) > ? THEN substr(content, 1, ?) ELSE content END AS content,
        CASE WHEN length(content) > ? THEN 1 ELSE 0 END AS _contentTruncated,
        tags, priority, attachments, deletedAt, createdAt, updatedAt
       FROM memos WHERE userId IN (${ph}) AND deletedAt IS NULL ORDER BY updatedAt DESC`

console.log('--- EXPLAIN QUERY PLAN (list) ---')
const plan = db.exec('EXPLAIN QUERY PLAN ' + q, [256, 256, 256, ...userIds])
for (const row of plan[0].values) console.log(row.join(' | '))

console.log('--- EXPLAIN QUERY PLAN (single userId) ---')
const plan1 = db.exec('EXPLAIN QUERY PLAN SELECT id FROM memos WHERE userId = ? AND deletedAt IS NULL ORDER BY updatedAt DESC', [userIds[0]])
for (const row of plan1[0].values) console.log(row.join(' | '))

db.close()
