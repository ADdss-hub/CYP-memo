/**
 * 清理 U200 ladder / capacity 压测写入的备忘录夹具（u-ladder-*）。
 * 仅删除标题以 u-ladder 开头，或正文以 U-ladder / U200 ladder 开头的行；不动其余业务数据。
 *
 * 须在服务端停写或接受 sql.js 内存与磁盘短暂不一致风险下执行；建议先停 API 再跑。
 *
 *   pnpm --filter @cyp-memo/server exec tsx scripts/purge-u-ladder-fixtures.ts
 *
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
import initSqlJs from 'sql.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.resolve(__dirname, '../data')
const dbFile = path.join(dataDir, 'database.sqlite')

async function main() {
  if (!fs.existsSync(dbFile)) {
    throw new Error(`database missing: ${dbFile}`)
  }
  const require = createRequire(import.meta.url)
  const SQL = await initSqlJs({
    locateFile: (file: string) =>
      require.resolve(file === 'sql-wasm.wasm' ? 'sql.js/dist/sql-wasm.wasm' : `sql.js/dist/${file}`),
  })
  const db = new SQL.Database(fs.readFileSync(dbFile))

  const count = (sql: string): number => {
    const r = db.exec(sql)
    return Number(r[0]?.values?.[0]?.[0] ?? 0)
  }

  const beforeTotal = count('SELECT COUNT(*) FROM memos WHERE deletedAt IS NULL')
  const matchSql = `
    SELECT COUNT(*) FROM memos WHERE
      title LIKE 'u-ladder%'
      OR content LIKE 'U-ladder%'
      OR content LIKE 'U200 ladder%'
      OR (tags IS NOT NULL AND tags LIKE '%u-ladder%')
  `
  const matched = count(matchSql)
  console.log(
    JSON.stringify(
      {
        dbFile,
        beforeActive: beforeTotal,
        fixtureMatch: matched,
      },
      null,
      2
    )
  )

  if (matched === 0) {
    console.log('no u-ladder fixtures — nothing to purge')
    db.close()
    return
  }

  // 硬删除夹具（含已软删的同模式行），避免列表/回收站再看到
  db.run(`
    DELETE FROM memos WHERE
      title LIKE 'u-ladder%'
      OR content LIKE 'U-ladder%'
      OR content LIKE 'U200 ladder%'
      OR (tags IS NOT NULL AND tags LIKE '%u-ladder%')
  `)

  // 历史表若存在则清关联孤儿（无则忽略）
  try {
    db.run(`
      DELETE FROM memo_history WHERE memoId NOT IN (SELECT id FROM memos)
    `)
  } catch {
    /* table may not exist */
  }

  const afterActive = count('SELECT COUNT(*) FROM memos WHERE deletedAt IS NULL')
  const afterMatch = count(matchSql)
  const data = db.export()
  fs.writeFileSync(dbFile, Buffer.from(data))
  db.close()

  console.log(
    JSON.stringify(
      {
        purged: matched,
        afterActive,
        afterFixtureMatch: afterMatch,
        note: '若 API 进程仍在跑 sql.js 内存库，请重启服务端使磁盘清理生效',
      },
      null,
      2
    )
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
