/**
 * 真实 API 核验：备忘录 ↔ 文件库双向删除同步
 * - 文件库删文件：备忘录保留，仅去掉 attachments
 * - 备忘录去掉独占附件：文件库删文件
 * - 多备忘录共用：从一条去掉后文件仍保留
 * - PATCH memoId=null：解绑保留文件
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
  const json = await res.json().catch(() => ({}))
  return { status: res.status, ...json }
}

async function uploadOrphan(token: string, uid: string, name: string) {
  const fileId = crypto.randomUUID()
  const form = new FormData()
  form.append(
    'metadata',
    JSON.stringify({
      id: fileId,
      userId: uid,
      filename: name,
      type: 'text/plain',
      size: 8,
      uploadedAt: new Date().toISOString(),
    })
  )
  form.append('file', new Blob(['library!'], { type: 'text/plain' }), name)
  const upload = await req('POST', '/api/files', { token, form })
  if (!upload.success) throw new Error(`upload ${name}: ${JSON.stringify(upload)}`)
  return (upload.data?.id as string) || fileId
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

  // —— 1) 关联到 A，再独占从 A 清空 attachments → 文件库应删除 ——
  const fidExclusive = await uploadOrphan(token, uid, 'exclusive-drop.txt')
  const patchEx = await req('PATCH', `/api/files/${fidExclusive}`, {
    token,
    body: { memoId: idA },
  })
  if (!patchEx.success) throw new Error(`patchEx: ${JSON.stringify(patchEx)}`)
  const clearA = await req('PATCH', `/api/memos/${idA}`, {
    token,
    body: { attachments: [] },
  })
  if (!clearA.success) throw new Error(`clearA: ${JSON.stringify(clearA)}`)
  const metaGone = await req('GET', `/api/files/${fidExclusive}/metadata`, { token })
  const afterAEx = await req('GET', `/api/memos/${idA}`, { token })
  const exclusiveDropOk =
    metaGone.status === 404 ||
    metaGone.success === false ||
    !metaGone.data ||
    (!(afterAEx.data?.attachments || []).includes(fidExclusive) &&
      !metaGone.data?.id)

  // —— 2) 同一文件挂 A+B，从 A 去掉 → 文件保留且仍在 B ——
  const fidShared = await uploadOrphan(token, uid, 'shared-keep.txt')
  await req('PATCH', `/api/files/${fidShared}`, {
    token,
    body: { linkedMemoIds: [idA, idB] },
  })
  const afterLink = await req('GET', `/api/memos/${idA}`, { token })
  const afterLinkB = await req('GET', `/api/memos/${idB}`, { token })
  const linkedBoth =
    (afterLink.data?.attachments || []).includes(fidShared) &&
    (afterLinkB.data?.attachments || []).includes(fidShared)

  await req('PATCH', `/api/memos/${idA}`, {
    token,
    body: {
      title: 'link-a',
      content: 'a',
      tags: [],
      attachments: (afterLink.data?.attachments || []).filter(
        (x: string) => x !== fidShared
      ),
    },
  })
  const metaShared = await req('GET', `/api/files/${fidShared}/metadata`, { token })
  const afterAShared = await req('GET', `/api/memos/${idA}`, { token })
  const afterBShared = await req('GET', `/api/memos/${idB}`, { token })
  const sharedKeepOk =
    linkedBoth &&
    !!metaShared.data?.id &&
    !(afterAShared.data?.attachments || []).includes(fidShared) &&
    (afterBShared.data?.attachments || []).includes(fidShared)

  // —— 3) 文件库 DELETE：备忘录保留，attachments 去掉 ——
  const fidLib = await uploadOrphan(token, uid, 'lib-delete.txt')
  await req('PATCH', `/api/files/${fidLib}`, { token, body: { memoId: idB } })
  const beforeDel = await req('GET', `/api/memos/${idB}`, { token })
  const delLib = await req('DELETE', `/api/files/${fidLib}`, { token })
  if (!delLib.success) throw new Error(`delLib: ${JSON.stringify(delLib)}`)
  const afterDelB = await req('GET', `/api/memos/${idB}`, { token })
  const memoStill = await req('GET', `/api/memos/${idB}`, { token })
  const libDeleteOk =
    (beforeDel.data?.attachments || []).includes(fidLib) &&
    !(afterDelB.data?.attachments || []).includes(fidLib) &&
    !!memoStill.data?.id &&
    !memoStill.data?.deletedAt

  // —— 4) PATCH memoId=null 解绑（保留文件，不删库） ——
  const fidUnlink = await uploadOrphan(token, uid, 'unlink-keep.txt')
  await req('PATCH', `/api/files/${fidUnlink}`, { token, body: { memoId: idA } })
  const unlink = await req('PATCH', `/api/files/${fidUnlink}`, {
    token,
    body: { memoId: null },
  })
  if (!unlink.success) throw new Error(`unlink: ${JSON.stringify(unlink)}`)
  const metaU = await req('GET', `/api/files/${fidUnlink}/metadata`, { token })
  const afterAU = await req('GET', `/api/memos/${idA}`, { token })
  const unlinkOk =
    !!metaU.data?.id &&
    !metaU.data?.memoId &&
    !(afterAU.data?.attachments || []).includes(fidUnlink)

  // 清理
  await req('DELETE', `/api/files/${fidShared}`, { token })
  await req('DELETE', `/api/files/${fidUnlink}`, { token })
  await req('DELETE', `/api/memos/${idA}`, { token })
  await req('DELETE', `/api/memos/${idB}`, { token })

  const passAll = exclusiveDropOk && sharedKeepOk && libDeleteOk && unlinkOk
  console.log(
    JSON.stringify(
      {
        ok: passAll,
        exclusiveDropOk,
        sharedKeepOk,
        libDeleteOk,
        unlinkOk,
        path:
          'exclusive drop→delete file | shared keep | lib DELETE→memo kept | PATCH null keep file',
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
