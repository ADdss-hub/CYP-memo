/**
 * 实机：配置完整形态（logLevel + infoSample + retention + rollback + completeForm）
 */
const Base = process.env.CYP_BASE_URL || 'http://127.0.0.1:5170'

async function req(method, path, { token, body, idem } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  if (idem || method !== 'GET') headers['Idempotency-Key'] = idem || `cfg-${crypto.randomUUID()}`
  const res = await fetch(`${Base}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    /* ignore */
  }
  return { res, json, headers: res.headers }
}

function fail(msg) {
  console.error('FAIL', msg)
  process.exit(1)
}

const suffix = Math.floor(Math.random() * 1e6)
const user = `cfgform_${suffix}`
const passw = 'Test1234!'

await req('POST', '/api/auth/register', {
  body: { username: user, password: passw, displayName: 'CfgForm' },
})
const login = await req('POST', '/api/auth/login', {
  body: { username: user, password: passw },
})
const tok = login.json?.data?.accessToken || login.json?.data?.token
if (!tok) fail('no token')

const before = await req('GET', '/api/config/revisions', { token: tok })
const from = Number(before.json?.data?.current)
if (!(from >= 1)) fail(`revision missing ${JSON.stringify(before.json)}`)
const hotKeys = before.json?.data?.hotKeys || []
for (const k of ['logLevel', 'infoSamplePercent', 'retentionDays', 'riskThresholds', 'perfSla']) {
  if (!hotKeys.includes(k)) fail(`hotKeys missing ${k}`)
}

const hot = await req('POST', '/api/config/hot', {
  token: tok,
  body: {
    logLevel: 'warn',
    infoSamplePercent: 50,
    retentionDays: { runtime: 5 },
    riskThresholds: { errorStorm5xx: 40 },
    perfSla: { requestMs: 800, p95Ms: 400, errorRate: 0.008, alertAfterBreaches: 2 },
  },
})
if (hot.json?.data?.action !== 'hot' || hot.json?.data?.logLevel !== 'warn') {
  fail(`hot ${JSON.stringify(hot.json)}`)
}
if (Number(hot.json.data.infoSamplePercent) !== 50) fail('hot sample')
if (Number(hot.json.data.retentionDays?.runtime) !== 5) fail('hot retention')
if (Number(hot.json.data.riskThresholds?.errorStorm5xx) !== 40) fail('hot riskThresholds')
if (Number(hot.json.data.perfSla?.p95Ms) !== 400) fail('hot perfSla')

const perfSt = await req('GET', '/api/perf/status', { token: tok })
if (Number(perfSt.json?.data?.sla?.p95Ms) !== 400) fail('perf status sla not applied')

const pub = await req('GET', '/api/config')
if (pub.json?.data?.logLevel !== 'warn') fail('public logLevel')
if (Number(pub.json?.data?.infoSamplePercent) !== 50) fail('public sample')

const back = await req('POST', '/api/config/rollback', {
  token: tok,
  body: { version: from },
})
if (back.json?.data?.action !== 'rollback') fail(`rollback ${JSON.stringify(back.json)}`)

const hot2 = await req('POST', '/api/config/hot', {
  token: tok,
  body: { logLevel: 'info', infoSamplePercent: 100 },
})
const hostedRaw = hot2.headers.get('x-cyp-hosted-service') || ''
const hosted = decodeURIComponent(hostedRaw)
if (hosted !== '版本变更发布') fail(`hosted=${hosted}`)

const ready = await req('GET', '/healthz/ready')
if (ready.json?.data?.runtimeBase?.completeForm !== true) fail('ready.completeForm')
const ctrl = ready.json?.data?.runtimeBase?.['管控子平台']
if (ctrl?.['配置管控'] !== true) fail('配置管控 projection')

console.log(
  `PASS_CONFIG_COMPLETE_FORM from=${from} hot=${hot.json.data.version} rollback=${back.json.data.version} completeForm=true`
)
process.exit(0)
