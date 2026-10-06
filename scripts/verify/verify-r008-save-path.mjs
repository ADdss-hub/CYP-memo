/**
 * R-008 保存路径静态整链核验（编辑保存：期望写相关 HTTP）
 * 编辑无新附件 → 1× PATCH；有附件 → 并行上传 + 1× PATCH（禁止串行五连）
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const fails = []
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8')

const edit = read('packages/app/src/views/memo/MemoEditView.vue')
if (!edit.includes('uploadPendingFiles') || !edit.includes('Promise.allSettled')) {
  fails.push('MemoEditView must parallel-upload pending files (R-008)')
}
const saveStart = edit.indexOf('const handleSave')
const saveBlock = edit.slice(saveStart, saveStart + 3500)
const editBranch = saveBlock.match(/if \(isEditMode\.value\) \{[\s\S]*?\} else \{/)
if (!editBranch) {
  fails.push('MemoEditView handleSave missing isEditMode branch')
} else {
  const updateCalls = editBranch[0].match(/memoStore\.updateMemo\(/g) || []
  if (updateCalls.length !== 1) {
    fails.push('MemoEditView edit save must call updateMemo once')
  }
  if (/createMemo/.test(editBranch[0])) {
    fails.push('edit branch must not createMemo')
  }
}
if (!/else \{[\s\S]*createMemo/.test(saveBlock)) {
  fails.push('create path should use createMemo once (new memo)')
}

const manager = read('packages/shared/src/managers/MemoManager.ts')
if (!manager.includes('await memoDAO.update(memoId, updateData)')) {
  fails.push('MemoManager.updateMemo must single DAO update')
}

const remote = read('packages/shared/src/storage/RemoteStorageAdapter.ts')
const upd = remote.match(/async updateMemo\([\s\S]*?\n  \}/)
if (!upd || !upd[0].includes("PATCH") || !upd[0].includes('/memos/')) {
  fails.push('RemoteStorageAdapter.updateMemo must be single PATCH /memos/:id')
}
if ((upd?.[0].match(/this\.request/g) || []).length !== 1) {
  fails.push('RemoteStorageAdapter.updateMemo must issue exactly one HTTP request')
}

const evid = JSON.parse(read('docs/perf/perf-evid.json'))
if (evid?.r008?.expected_write_http_no_new_files !== 1) {
  fails.push('perf-evid r008.expected_write_http_no_new_files must be 1')
}

if (fails.length) {
  console.error('FAIL_R008_SAVE_PATH')
  for (const f of fails) console.error('-', f)
  process.exit(1)
}

console.log('PASS_R008_SAVE_PATH', {
  edit: '1×PATCH (+ optional parallel uploads)',
  expected: evid.r008.expected_write_http_no_new_files,
})
process.exit(0)
