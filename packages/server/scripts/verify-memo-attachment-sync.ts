/**
 * 真实 API 核验：备忘录 ↔ 附件库双向关联（选用 / 解绑 / updateMemo 反写）
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
  const res = await fetch(`${base}${path}`, { method, headers, body })
  const json = await res.json()
  return { status: res.status, ...json }
}

async function main() {
  const health = await fetch(`${base}/api/health`).catch(() => null)
  if (!health || !health.ok) {
    console.error('FAIL: server not reachable at', base)
    process.exit(2)
  }

  const uname = `link_${Date.now()}`
  const pass = 'LinkSync#2026'
  const reg = await req('POST', '/api/auth/register', {
    body: { username: uname, password: pass, confirmPassword: pass },
  })
  if (!reg.success) throw new Error(`register: ${JSON.stringify(reg)}`)
  const token = reg.data.accessToken as string
  const uid = reg.data.user.id as string

  const memoA = await req('POST', '/api/memos', {
    token,
    body: { title: 'link-a', content: 'a', tags: [], attachments: [] },
  })
  const memoB = await req('POST', '/api/memos', {
    token,
    body: { title: 'link-b', content: 'b', tags: [], attachments: [] },
  })
  if (!memoA.success || !memoB.success) throw new Error('create memo failed')
  const idA = memoA.data.id as string
  const idB = memoB.data.id as string

  // 上传孤儿文件（无 memoId）
  const fileId = crypto.randomUUID()
  const form = new FormData()
  form.append(
    'metadata',
    JSON.stringify({
      id: fileId,
      userId: uid,
      filename: 'library-pick.txt',
      type: 'text/plain',
      size: 8,
      uploadedAt: new Date().toISOString(),
    })
  )
  form.append('file', new Blob(['library!'], { type: 'text/plain' }), 'library-pick.txt')
  const upload = await req('POST', '/api/files', { token, form })
  if (!upload.success) throw new Error(`upload: ${JSON.stringify(upload)}`)
  const fid = (upload.data?.id as string) || fileId

  // 1) PATCH 关联到 A（服务端双向同步）
  const patchA = await req('PATCH', `/api/files/${fid}`, { token, body: { memoId: idA } })
  if (!patchA.success) throw new Error(`patchA: ${JSON.stringify(patchA)}`)
  const afterA = await req('GET', `/api/memos/${idA}`, { token })
  const metaA = await req('GET', `/api/files/${fid}/metadata`, { token })
  const attA = afterA.data?.attachments || []
  const linkOk = attA.includes(fid) && metaA.data?.memoId === idA

  // 2) updateMemo attachments 权威列表切到 B（一次写，反写 memoId）
  await req('PATCH', `/api/memos/${idA}`, { token, body: { attachments: [] } })
  await req('PATCH', `/api/memos/${idB}`, {
    token,
    body: { title: 'link-b', content: 'b', tags: [], attachments: [fid] },
  })
  const metaB = await req('GET', `/api/files/${fid}/metadata`, { token })
  const afterB = await req('GET', `/api/memos/${idB}`, { token })
  const afterA2 = await req('GET', `/api/memos/${idA}`, { token })
  const moveOk =
    metaB.data?.memoId === idB &&
    (afterB.data?.attachments || []).includes(fid) &&
    !(afterA2.data?.attachments || []).includes(fid)

  // 3) PATCH memoId=null 解绑（保留文件）
  const unlink = await req('PATCH', `/api/files/${fid}`, { token, body: { memoId: null } })
  if (!unlink.success) throw new Error(`unlink: ${JSON.stringify(unlink)}`)
  const metaU = await req('GET', `/api/files/${fid}/metadata`, { token })
  const afterBU = await req('GET', `/api/memos/${idB}`, { token })
  const unlinkOk =
    !metaU.data?.memoId && !(afterBU.data?.attachments || []).includes(fid)

  // 清理
  await req('DELETE', `/api/files/${fid}`, { token })
  await req('DELETE', `/api/memos/${idA}`, { token })
  await req('DELETE', `/api/memos/${idB}`, { token })

  const passAll = linkOk && moveOk && unlinkOk
  console.log(
    JSON.stringify(
      {
        ok: passAll,
        linkOk,
        moveOk,
        unlinkOk,
        path:
          'PATCH /api/files memoId → updateMemo attachments → PATCH memoId null',
      },
      null,
      2
    )
  )
  process.exit(passAll ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
