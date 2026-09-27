/**
 * 真实 API 核验：同一文件可同时被多条备忘录使用，解除/删备忘录不抢走仍在用的文件
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
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
  const uname = `multi_${Date.now()}`
  const pass = 'MultiLink#2026'
  const reg = await req('POST', '/api/auth/register', {
    body: { username: uname, password: pass, confirmPassword: pass },
  })
  if (!reg.success) throw new Error(`register: ${JSON.stringify(reg)}`)
  const token = reg.data.accessToken as string
  const uid = reg.data.user.id as string

  const memoA = await req('POST', '/api/memos', {
    token,
    body: { title: 'memo-A', content: 'a', tags: ['tagA'], attachments: [] },
  })
  const memoB = await req('POST', '/api/memos', {
    token,
    body: { title: 'memo-B', content: 'b', tags: ['tagB'], attachments: [] },
  })
  const idA = memoA.data.id as string
  const idB = memoB.data.id as string

  const fileId = crypto.randomUUID()
  const form = new FormData()
  form.append(
    'metadata',
    JSON.stringify({
      id: fileId,
      userId: uid,
      filename: 'shared.txt',
      type: 'text/plain',
      size: 6,
      uploadedAt: new Date().toISOString(),
    })
  )
  form.append('file', new Blob(['shared'], { type: 'text/plain' }), 'shared.txt')
  const upload = await req('POST', '/api/files', { token, form })
  if (!upload.success) throw new Error(`upload: ${JSON.stringify(upload)}`)
  const fid = (upload.data.id as string) || fileId

  const link = await req('PATCH', `/api/files/${fid}`, {
    token,
    body: { linkedMemoIds: [idA, idB] },
  })
  if (!link.success) throw new Error(`link: ${JSON.stringify(link)}`)

  const afterA = await req('GET', `/api/memos/${idA}`, { token })
  const afterB = await req('GET', `/api/memos/${idB}`, { token })
  const attA = afterA.data?.attachments || []
  const attB = afterB.data?.attachments || []
  if (!attA.includes(fid) || !attB.includes(fid)) {
    throw new Error(`both memos should list file: A=${JSON.stringify(attA)} B=${JSON.stringify(attB)}`)
  }

  const files = await req('GET', `/api/users/${uid}/files`, { token })
  const row = (files.data || []).find((f: { id: string }) => f.id === fid)
  if (!row || !(row.linkedMemoIds || []).includes(idA) || !(row.linkedMemoIds || []).includes(idB)) {
    throw new Error(`list linkedMemoIds missing: ${JSON.stringify(row)}`)
  }

  // 备忘录 A 去掉该文件：B 仍应保留，文件不应被删
  await req('PATCH', `/api/memos/${idA}`, { token, body: { attachments: [] } })
  const stillB = await req('GET', `/api/memos/${idB}`, { token })
  if (!(stillB.data?.attachments || []).includes(fid)) {
    throw new Error('memo B lost shared file after A unlinked')
  }
  const meta = await req('GET', `/api/files/${fid}/metadata`, { token })
  if (!meta.success) throw new Error(`file gone after partial unlink: ${JSON.stringify(meta)}`)

  // 删备忘录 B：文件仍被 B 独占时应删除；先再挂回 A，再删 B，文件应保留给 A
  await req('PATCH', `/api/files/${fid}`, { token, body: { linkedMemoIds: [idA, idB] } })
  await req('DELETE', `/api/memos/${idB}`, { token })
  const keepA = await req('GET', `/api/memos/${idA}`, { token })
  if (!(keepA.data?.attachments || []).includes(fid)) {
    throw new Error('memo A lost shared file after deleting memo B')
  }
  const meta2 = await req('GET', `/api/files/${fid}/metadata`, { token })
  if (!meta2.success) throw new Error(`file deleted while still used by A: ${JSON.stringify(meta2)}`)

  console.log(
    JSON.stringify(
      {
        fileId: fid,
        linkedMemoIds: row.linkedMemoIds,
        keptAfterDeleteB: true,
      },
      null,
      2
    )
  )
  console.log('PASS_FILE_MULTI_MEMO_LINK')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
