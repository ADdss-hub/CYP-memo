/**
 * 真实 API 核验：软删备忘录同步清理附件
 * 用法：pnpm exec tsx scripts/verify-memo-delete-api.ts
 */
const base = process.env.CYP_API || 'http://127.0.0.1:5170'

function idem() {
  return crypto.randomUUID().replace(/-/g, '')
}

async function req(method: string, path: string, opts: { token?: string; body?: unknown; form?: FormData } = {}) {
  const headers: Record<string, string> = { 'Idempotency-Key': idem() }
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`
  let body: BodyInit | undefined
  if (opts.form) {
    body = opts.form
  } else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(opts.body)
  }
  const res = await fetch(`${base}${path}`, { method, headers, body })
  const json = await res.json()
  return json
}

async function main() {
  const uname = `delchk_${Date.now()}`
  const pass = 'DelCheck#2026'
  const reg = await req('POST', '/api/auth/register', {
    body: { username: uname, password: pass, confirmPassword: pass },
  })
  if (!reg.success) throw new Error(`register failed: ${JSON.stringify(reg)}`)
  const token = reg.data.accessToken as string
  const uid = reg.data.user.id as string

  const memo = await req('POST', '/api/memos', {
    token,
    body: { title: 'del-attach-test', content: 'x', tags: [], attachments: [] },
  })
  if (!memo.success) throw new Error(`memo failed: ${JSON.stringify(memo)}`)
  const memoId = memo.data.id as string

  const fileId = crypto.randomUUID()
  const blob = new Blob(['delete-me'], { type: 'text/plain' })
  const form = new FormData()
  form.append(
    'metadata',
    JSON.stringify({
      id: fileId,
      userId: uid,
      memoId,
      filename: 'delchk.txt',
      type: 'text/plain',
      size: 9,
      uploadedAt: new Date().toISOString(),
    })
  )
  form.append('file', blob, 'delchk.txt')

  const upload = await req('POST', '/api/files', { token, form })
  console.log('upload', JSON.stringify(upload))
  if (!upload.success) throw new Error(`upload failed: ${JSON.stringify(upload)}`)
  const fid = (upload.data.id as string) || fileId

  await req('PATCH', `/api/memos/${memoId}`, { token, body: { attachments: [fid] } })

  const before = await req('GET', `/api/users/${uid}/files`, { token })
  const beforeCount = (before.data || []).length
  console.log('beforeCount', beforeCount)

  const soft = await req('PATCH', `/api/memos/${memoId}`, {
    token,
    body: { deletedAt: new Date().toISOString() },
  })
  if (!soft.success) throw new Error(`soft delete failed: ${JSON.stringify(soft)}`)

  const after = await req('GET', `/api/users/${uid}/files`, { token })
  const afterIds = (after.data || []).map((f: { id: string }) => f.id)
  console.log('afterIds', afterIds)

  if (afterIds.includes(fid)) {
    console.error('FAIL: file remains after soft delete')
    process.exit(1)
  }
  console.log('PASS_SOFT_DELETE_CLEARS_FILES')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
