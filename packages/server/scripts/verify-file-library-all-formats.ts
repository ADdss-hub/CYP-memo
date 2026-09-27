/**
 * 真实 API：文件库全格式上传烟测
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
  const health = await fetch(`${base}/api/health`).catch(() => null)
  if (!health?.ok) {
    console.error('FAIL: server down')
    process.exit(2)
  }

  const uname = `fmt_${Date.now()}`
  const reg = await req('POST', '/api/auth/register', {
    body: { username: uname, password: 'Fmt#2026', confirmPassword: 'Fmt#2026' },
  })
  if (!reg.success) throw new Error(JSON.stringify(reg))
  const token = reg.data.accessToken as string
  const uid = reg.data.user.id as string

  const samples: Array<[string, string, string]> = [
    ['weird.xyz', '', 'bin-data'],
    ['clip.mp4', 'video/mp4', 'fake-video'],
    ['song.flac', 'audio/flac', 'fake-audio'],
    ['arch.7z', 'application/x-7z-compressed', '7zdata'],
  ]

  const ids: string[] = []
  for (const [name, type, content] of samples) {
    const id = crypto.randomUUID()
    const form = new FormData()
    form.append(
      'metadata',
      JSON.stringify({
        id,
        userId: uid,
        filename: name,
        type: type || 'application/octet-stream',
        size: content.length,
        uploadedAt: new Date().toISOString(),
      })
    )
    form.append(
      'file',
      new Blob([content], { type: type || 'application/octet-stream' }),
      name
    )
    const up = await req('POST', '/api/files', { token, form })
    if (!up.success) throw new Error(`${name}: ${JSON.stringify(up)}`)
    ids.push((up.data?.id as string) || id)
  }

  const list = await req('GET', `/api/users/${uid}/files`, { token })
  const files = (list.data || []) as Array<{ id: string; filename: string; type: string }>
  const matched = files.filter((f) => ids.includes(f.id))
  const ok = matched.length === 4

  console.log(
    JSON.stringify(
      {
        ok,
        uploaded: matched.map((f) => `${f.filename}:${f.type}`),
      },
      null,
      2
    )
  )

  for (const id of ids) await req('DELETE', `/api/files/${id}`, { token })
  process.exit(ok ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
