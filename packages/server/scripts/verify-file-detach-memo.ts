/**
 * 真实 API 核验：附件管理删除后同步从备忘录 attachments 移除
 */
const base = process.env.CYP_API || 'http://127.0.0.1:5170'

function idem() {
  return crypto.randomUUID().replace(/-/g, '')
}

async function req(
  method: string,
  path: string,
  opts: { token?: string; body?: unknown; form?: FormData } = {}
) {
  const headers: Record<string, string> = { 'Idempotency-Key': idem() }
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`
  let body: BodyInit | undefined
  if (opts.form) body = opts.form
  else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(opts.body)
  }
  return (await fetch(`${base}${path}`, { method, headers, body })).json()
}

async function main() {
  const uname = `detach_${Date.now()}`
  const pass = 'Detach#2026'
  const reg = await req('POST', '/api/auth/register', {
    body: { username: uname, password: pass, confirmPassword: pass },
  })
  if (!reg.success) throw new Error(`register: ${JSON.stringify(reg)}`)
  const token = reg.data.accessToken as string
  const uid = reg.data.user.id as string

  const memo = await req('POST', '/api/memos', {
    token,
    body: { title: 'detach-test', content: 'x', tags: [], attachments: [] },
  })
  const memoId = memo.data.id as string

  const fileId = crypto.randomUUID()
  const form = new FormData()
  form.append(
    'metadata',
    JSON.stringify({
      id: fileId,
      userId: uid,
      memoId,
      filename: 'detach.txt',
      type: 'text/plain',
      size: 4,
      uploadedAt: new Date().toISOString(),
    })
  )
  form.append('file', new Blob(['sync'], { type: 'text/plain' }), 'detach.txt')
  const upload = await req('POST', '/api/files', { token, form })
  if (!upload.success) throw new Error(`upload: ${JSON.stringify(upload)}`)
  const fid = (upload.data.id as string) || fileId

  await req('PATCH', `/api/memos/${memoId}`, { token, body: { attachments: [fid] } })

  const before = await req('GET', `/api/memos/${memoId}`, { token })
  const beforeAtt = before.data?.attachments || before.attachments || []
  console.log('beforeAttachments', beforeAtt)

  const del = await req('DELETE', `/api/files/${fid}`, { token })
  if (!del.success) throw new Error(`delete: ${JSON.stringify(del)}`)

  const after = await req('GET', `/api/memos/${memoId}`, { token })
  const afterAtt = after.data?.attachments || after.attachments || []
  console.log('afterAttachments', afterAtt)

  if (Array.isArray(afterAtt) && afterAtt.includes(fid)) {
    console.error('FAIL: memo still lists deleted file')
    process.exit(1)
  }
  console.log('PASS_FILE_DELETE_SYNCS_MEMO')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
