/**
 * 全面功能链（HTTPS）：注册→登录→备忘录 CRUD→公开 MCP→PAT→统计/文件→鉴权
 * 打印 BIZ_CHAIN_PASS / BIZ_CHAIN_FAIL
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = process.env.NODE_TLS_REJECT_UNAUTHORIZED || '0'

const API = process.env.CYP_MCP_API_BASE || 'https://127.0.0.1:5170/api'
const out: { pass: { name: string; detail: unknown }[]; fail: { name: string; detail: unknown }[] } = {
  pass: [],
  fail: [],
}

function ok(name: string, cond: unknown, detail?: unknown): void {
  ;(cond ? out.pass : out.fail).push({ name, detail: detail ?? true })
}

async function api(
  method: string,
  p: string,
  body?: unknown,
  token?: string
): Promise<{ status: number; json: any }> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`
  if (method !== 'GET' && method !== 'HEAD') {
    headers['Idempotency-Key'] = `ft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  }
  const res = await fetch(`${API.replace(/\/$/, '')}${p}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => null)
  return { status: res.status, json }
}

async function main(): Promise<void> {
  const uname = `ft-full-${Date.now().toString(36)}`
  const pass = `Ft${Date.now().toString(36)}9A`

  const reg = await api('POST', '/auth/register', {
    username: uname,
    password: pass,
    securityQuestion: { question: 'q', answer: 'a' },
  })
  ok('register', reg.status === 200 && reg.json?.success, reg.status)
  const token = reg.json?.data?.accessToken as string | undefined
  const userId = reg.json?.data?.user?.id as string | undefined
  ok('token', !!token)
  ok('user_id', !!userId)

  const login = await api('POST', '/auth/login', { username: uname, password: pass })
  ok('login', login.status === 200 && login.json?.data?.accessToken, login.status)
  const tok2 = (login.json?.data?.accessToken as string) || token!

  const me = await api('GET', `/users/${userId}`, undefined, tok2)
  ok('me', me.status === 200 && me.json?.data?.username === uname, me.status)

  const memo = await api(
    'POST',
    '/memos',
    { title: '全面测试备忘', content: '<p>正文内容用于全面功能测试</p>', tags: ['ft', 'full'] },
    tok2
  )
  ok('memo_create', memo.status === 200 && memo.json?.data?.id, memo.status)
  const mid = memo.json?.data?.id as string

  const list = await api('GET', '/memos?page=1&pageSize=20', undefined, tok2)
  const items = list.json?.data?.items || list.json?.data
  ok('memo_list', list.status === 200 && Array.isArray(items), list.status)

  const get1 = await api('GET', `/memos/${mid}`, undefined, tok2)
  ok('memo_get', get1.status === 200 && get1.json?.data?.id === mid, get1.status)

  const patch = await api(
    'PATCH',
    `/memos/${mid}`,
    { title: '全面测试备忘-已改', content: '<p>更新后</p>' },
    tok2
  )
  ok('memo_patch', patch.status === 200, patch.status)

  const pub = await api('PATCH', `/memos/${mid}/mcp-public`, { mcpPublic: true }, tok2)
  ok('mcp_public_flag', pub.status === 200, pub.status)

  const pubList = await api('GET', '/public/mcp/memos')
  ok('public_mcp_list', pubList.status === 200, pubList.status)
  const pubHit = (pubList.json?.data?.items || []).some((m: { id: string }) => m.id === mid)
  ok('public_mcp_hit', pubHit)

  const pat = await api('POST', '/mcp/pat', { label: 'ft' }, tok2)
  ok('mcp_pat', pat.status === 200 && String(pat.json?.data?.token || '').startsWith('cypmcp_'), pat.status)

  const noAuth = await api('GET', '/memos')
  ok('auth_required', noAuth.status === 401, noAuth.status)

  const stats = await api('GET', '/data/statistics', undefined, tok2)
  if (stats.status !== 200) {
    await new Promise((r) => setTimeout(r, 500))
    const stats2 = await api('GET', '/data/statistics', undefined, tok2)
    ok(
      'statistics',
      stats2.status === 200 && stats2.json?.success,
      `retry status=${stats2.status} first=${stats.status} body=${JSON.stringify(stats2.json)?.slice(0, 120)}`
    )
  } else {
    ok('statistics', stats.json?.success, stats.status)
  }

  const files = await api('GET', `/users/${userId}/files`, undefined, tok2)
  ok('files_list', files.status === 200, files.status)

  const share = await api('POST', '/shares', { memoId: mid, userId }, tok2)
  ok('share_create', share.status === 200 && share.json?.data?.id, share.status)
  const shareId = share.json?.data?.id as string | undefined
  if (shareId) {
    const shareGet = await api('GET', `/shares/${shareId}`, undefined, tok2)
    ok('share_get', shareGet.status === 200, shareGet.status)
  }

  const del = await api('DELETE', `/memos/${mid}`, undefined, tok2)
  ok('memo_delete', del.status === 200, del.status)

  const gone = await api('GET', `/memos/${mid}`, undefined, tok2)
  ok(
    'memo_gone',
    gone.status === 404 || !!gone.json?.data?.deletedAt || gone.json?.success === false,
    gone.status
  )

  console.log('BIZ_CHAIN', JSON.stringify(out, null, 2))
  if (out.fail.length) {
    console.error('BIZ_CHAIN_FAIL')
    process.exit(1)
  }
  console.log('BIZ_CHAIN_PASS')
}

main().catch((e) => {
  console.error('BIZ_CHAIN_FAIL', e)
  process.exit(1)
})
