/**
 * 真实环境核验：附件 memoId 关联修复（不依赖 MQ 底座）
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */
import { initDatabase, database } from '../src/runtime-base/l0/infra/db/ready.js'

async function main() {
  await initDatabase({ skipSeed: true })

  const files = database.getFiles()
  const memos = database.getMemos()
  const orphanedBefore = files.filter((f) => !f.memoId)

  const fileToMemo = new Map<string, string>()
  for (const memo of memos) {
    for (const fileId of memo.attachments || []) {
      if (fileId) fileToMemo.set(fileId, memo.id)
    }
  }

  let healed = 0
  for (const file of orphanedBefore) {
    const memoId = fileToMemo.get(file.id)
    if (!memoId) continue
    database.updateFile(file.id, { memoId })
    healed++
  }

  const probe = database.getFiles()[0]
  let roundTripOk = false
  if (probe) {
    const original = probe.memoId
    const tempMemoId = 'verify-temp-memo-id'
    database.updateFile(probe.id, { memoId: tempMemoId })
    const after = database.getFileById(probe.id)
    roundTripOk = after?.memoId === tempMemoId
    database.updateFile(probe.id, { memoId: original ?? null })
    const restored = database.getFileById(probe.id)
    roundTripOk = roundTripOk && (restored?.memoId ?? null) === (original ?? null)
  }

  const orphanedAfter = database.getFiles().filter((f) => !f.memoId)
  const healedFile = healed > 0 ? database.getFileById(orphanedBefore[0].id) : null

  console.log(
    JSON.stringify(
      {
        fileCount: files.length,
        orphanedBefore: orphanedBefore.length,
        healable: orphanedBefore.filter((f) => fileToMemo.has(f.id)).length,
        healed,
        orphanedAfter: orphanedAfter.length,
        roundTripOk,
        hasUpdateFile: typeof database.updateFile === 'function',
        healedFile: healedFile
          ? { id: healedFile.id, filename: healedFile.filename, memoId: healedFile.memoId }
          : null,
      },
      null,
      2
    )
  )

  if (!roundTripOk || typeof database.updateFile !== 'function') {
    process.exitCode = 1
    console.error('FAIL')
  } else {
    console.log('PASS')
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
