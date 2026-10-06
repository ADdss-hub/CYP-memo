/**
 * 唯一产品入口采证：HTTPS :5170 同域。禁止默认打产品库（R-026 / R-PROD-004）。
 * 须 CYP_LOAD_ISOLATED=1、CYP_LOAD_EXPECT_DATA_DIR、CYP_API_BASE（专用实例）。
 */
import { chromium } from 'playwright'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { assertWriteIsolation, tlsRequest } from './assert-write-isolation.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const shotRoot = path.join(root, 'screenshots')

async function main() {
  const iso = await assertWriteIsolation('capture-p6-shots')
  const origin = iso.apiBase
  const u = `shotpw_${Date.now()}`
  const pw = 'ShotTest23456'

  const regRes = await tlsRequest(`${origin}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: u, password: pw }),
  })
  const reg = JSON.parse(regRes.text)
  if (!reg?.success) throw new Error('register failed ' + JSON.stringify(reg))
  const tok = reg.data.accessToken
  const user = reg.data.user
  await tlsRequest(`${origin}/api/memos`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tok}`,
    },
    body: JSON.stringify({
      title: 'P4真实截图备忘录',
      content: '列表与壳首页采证',
      tags: ['p4-shot'],
    }),
  })

  const edge =
    process.env.EDGE_PATH ||
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'

  const browser = await chromium.launch({
    headless: true,
    executablePath: fs.existsSync(edge) ? edge : undefined,
  })
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
    ignoreHTTPSErrors: true,
  })

  await page.goto(`${origin}/__shot_prep.html?next=/login`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(
    ({ tok, user }) => {
      localStorage.setItem('cyp-memo-terms-accepted', 'true')
      localStorage.setItem('cyp-memo-terms-accepted-date', new Date().toISOString())
      localStorage.setItem(
        'cyp-memo-storage-config',
        JSON.stringify({ mode: 'remote', apiUrl: '/api', apiKey: tok })
      )
      localStorage.setItem(
        'cyp-memo-auth',
        JSON.stringify({
          userId: user.id,
          username: user.username,
          loginType: 'password',
          timestamp: Date.now(),
        })
      )
    },
    { tok, user }
  )

  await page.goto(`${origin}/memos`, { waitUntil: 'networkidle', timeout: 60000 })
  if (page.url().includes('/welcome')) {
    for (const label of ['跳过引导', '跳过', '完成', '开始使用', '下一步']) {
      const b = page.getByRole('button', { name: label })
      if (await b.count()) {
        await b.first().click().catch(() => {})
        await page.waitForTimeout(600)
      }
    }
    await page.goto(`${origin}/memos`, { waitUntil: 'networkidle' })
  }

  fs.mkdirSync(path.join(shotRoot, 'memo'), { recursive: true })
  fs.mkdirSync(path.join(shotRoot, 'shell'), { recursive: true })
  fs.mkdirSync(path.join(shotRoot, 'login'), { recursive: true })

  await page.waitForTimeout(1200)
  await page.screenshot({
    path: path.join(shotRoot, 'memo', 'memo-list-desktop.png'),
    fullPage: true,
  })
  await page.screenshot({
    path: path.join(shotRoot, 'shell', 'shell-home-desktop.png'),
    fullPage: true,
  })

  await page.goto(`${origin}/__shot_prep.html?next=/login`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => {
    localStorage.removeItem('cyp-memo-auth')
    localStorage.removeItem('cyp-memo-storage-config')
  })
  await page.goto(`${origin}/login`, { waitUntil: 'networkidle' })
  await page.waitForSelector('#username')
  await page.screenshot({ path: path.join(shotRoot, 'login', 'login-desktop.png') })
  await page.screenshot({ path: path.join(shotRoot, 'shell', 'shell-footer-login.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: path.join(shotRoot, 'login', 'login-mobile.png') })

  await browser.close()
  console.log('OK', u, 'path=', page.url())
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
