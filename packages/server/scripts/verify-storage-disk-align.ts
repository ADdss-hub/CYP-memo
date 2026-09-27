/**
 * 核验：存储空间 API 与 health.storageSpace 同一口径（对外正式名「存储空间」）
 */
const base = process.env.CYP_API || 'http://127.0.0.1:5170'

async function main() {
  const health = await (await fetch(`${base}/api/health`)).json()
  const disk = health.data?.storageSpace || health.data?.diskSpace || health.storageSpace || health.diskSpace
  if (!disk?.total) throw new Error('health.storageSpace missing: ' + JSON.stringify(health))
  if (!health.data?.storageSpace && !health.storageSpace) {
    throw new Error('health 须含正式字段 storageSpace')
  }

  const uname = `disk_${Date.now()}`
  const pass = 'DiskAlign#2026'
  const idem = () => crypto.randomUUID().replace(/-/g, '')
  const reg = await (
    await fetch(`${base}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idem() },
      body: JSON.stringify({ username: uname, password: pass, confirmPassword: pass }),
    })
  ).json()
  if (!reg.success) throw new Error(JSON.stringify(reg))
  const token = reg.data.accessToken as string
  const uid = reg.data.user.id as string

  const st = await (
    await fetch(`${base}/api/users/${uid}/storage`, {
      headers: { Authorization: `Bearer ${token}`, 'Idempotency-Key': idem() },
    })
  ).json()
  if (!st.success) throw new Error(JSON.stringify(st))

  const sameTotal = st.data.total === disk.total
  const sameAvail = st.data.available === disk.available
  const sameUsed = st.data.used === disk.used
  const hasAccount = typeof st.data.accountUsed === 'number'

  console.log(
    JSON.stringify(
      {
        ok: sameTotal && sameAvail && sameUsed && hasAccount,
        sameTotal,
        sameAvail,
        sameUsed,
        hasAccount,
        healthDisk: disk,
        storageApi: st.data,
      },
      null,
      2
    )
  )
  process.exit(sameTotal && sameAvail && sameUsed && hasAccount ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
