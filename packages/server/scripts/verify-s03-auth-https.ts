/**
 * S-03 九类流程核验（HTTPS · Node，规避 PS5.1 自签 RestMethod 失败）
 * 打印 S03_AUTH_PASS / S03_AUTH_FAIL
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = process.env.NODE_TLS_REJECT_UNAUTHORIZED || '0'
const API = (process.env.CYP_API || 'https://127.0.0.1:5170').replace(/\/$/, '')
const out: { pass: string[]; fail: string[] } = { pass: [], fail: [] }
function ok(id: string, msg: string) {
  out.pass.push(`${id}: ${msg}`)
  console.log('OK  ', id, msg)
}
function fail(id: string, msg: string) {
  out.fail.push(`${id}: ${msg}`)
  console.log('FAIL', id, msg)
}
async function api(method: string, path: string, body?: unknown, token?: string) {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`
  if (method !== 'GET' && method !== 'HEAD') {
    headers['Idempotency-Key'] = `s03-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  }
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => null)
  return { status: res.status, json }
}

async function main() {
  const rdy = await api('GET', '/healthz/ready')
  const hl = await api('GET', '/api/health')
  if (rdy.status === 200 && rdy.json?.success && hl.status === 200 && hl.json?.success) ok('S03-1-smoke', 'ready+health')
  else fail('S03-1-smoke', `ready=${rdy.status} health=${hl.status}`)

  const ts = Date.now()
  const u = `s03n_${ts}`
  const pw = 'S03Test!23456'
  const reg = await api('POST', '/api/auth/register', { username: u, password: pw })
  const tok = reg.json?.data?.accessToken as string
  const owner = reg.json?.data?.user
  const perms = owner?.permissions || []
  if (reg.status === 200 && owner?.role === 'owner' && perms.length >= 10 && tok) ok('S03-2-register', `perms=${perms.length}`)
  else fail('S03-2-register', `status=${reg.status}`)

  const login = await api('POST', '/api/auth/login', { username: u, password: pw })
  if (login.status === 200 && login.json?.data?.accessToken) ok('S03-2-login', 'token')
  else fail('S03-2-login', `status=${login.status}`)

  const memo = await api('POST', '/api/memos', { title: `s03-${ts}`, content: 's03-body' }, tok)
  const mid = memo.json?.data?.id as string
  const got = await api('GET', `/api/memos/${mid}`, undefined, tok)
  if (memo.status === 200 && got.status === 200 && got.json?.data?.id === mid) ok('S03-2-memo', mid)
  else fail('S03-2-memo', `c=${memo.status} g=${got.status}`)

  const cfg = await api('GET', '/api/config', undefined, tok)
  const users = await api('GET', '/api/users', undefined, tok)
  if (cfg.status === 200 && cfg.json?.data?.appEnv && users.status === 200) ok('S03-3-data', `env=${cfg.json.data.appEnv}`)
  else fail('S03-3-data', `cfg=${cfg.status} users=${users.status}`)

  const unauth = await api('GET', '/api/users')
  if (unauth.status === 401 && String(JSON.stringify(unauth.json)).includes('E020')) ok('S03-4-unauth', 'E020')
  else fail('S03-4-unauth', `status=${unauth.status} body=${JSON.stringify(unauth.json)?.slice(0, 80)}`)

  const bad = await api('POST', '/api/auth/login', { username: u, password: 'WrongPass!999' })
  if (bad.status === 401 && String(JSON.stringify(bad.json)).includes('E022')) ok('S03-4-badpass', 'E022')
  else fail('S03-4-badpass', `status=${bad.status}`)

  const gone = await api('POST', '/api/admins/login', {})
  if ((gone.status === 404 || gone.status === 410) && String(JSON.stringify(gone.json)).includes('E410')) ok('S03-4-gone', 'E410')
  else fail('S03-4-gone', `status=${gone.status} body=${JSON.stringify(gone.json)?.slice(0, 80)}`)

  if (cfg.json?.data?.appEnv === 'prod') ok('S03-5-shell', 'appEnv=prod')
  else fail('S03-5-shell', String(cfg.json?.data?.appEnv))

  const member = await api(
    'POST',
    '/api/users',
    {
      username: `sub_${u}`,
      password: 'SubPass9Aa!',
      role: 'member',
      permissions: ['memo_manage', 'profile_self'],
    },
    tok
  )
  if (member.status === 200 && member.json?.data?.id) ok('S03-6-member', member.json.data.id)
  else fail('S03-6-member', `status=${member.status} body=${JSON.stringify(member.json)?.slice(0, 120)}`)

  console.log(JSON.stringify(out, null, 2))
  if (out.fail.length) {
    console.error('S03_AUTH_FAIL')
    process.exit(1)
  }
  console.log('S03_AUTH_PASS')
}

main().catch((e) => {
  console.error('S03_AUTH_FAIL', e)
  process.exit(1)
})
