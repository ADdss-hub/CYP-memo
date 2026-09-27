/**
 * Electron 嵌入实启入口（仅机检）：启动 EmbeddedServer → 等 /healthz/ready → 退出。
 * 由 verify-electron-embed.mjs 以 electron 加载本文件。
 */
import { app } from 'electron'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const port = Number(process.env.CYP_EMBED_SMOKE_PORT || 5198)
const deadlineMs = Number(process.env.CYP_EMBED_SMOKE_DEADLINE_MS || 60000)

async function waitReady(base) {
  const end = Date.now() + deadlineMs
  while (Date.now() < end) {
    try {
      const res = await fetch(`${base}/healthz/ready`)
      if (res.ok) {
        const body = await res.json()
        const rb = body?.data?.runtimeBase
        const n = Object.keys(rb?.items || {}).length
        if (n === 35 && rb?.completeForm === true) return body
      }
    } catch {
      /* wait */
    }
    await new Promise((r) => setTimeout(r, 400))
  }
  throw new Error('electron embed smoke timeout waiting /healthz/ready')
}

app.whenReady().then(async () => {
  try {
    const modPath = path.join(__dirname, '../dist/main/main/EmbeddedServer.js')
    const mod = await import(pathToFileURL(modPath).href)
    const embedded = mod.getEmbeddedServer()
    const used = await embedded.start(port)
    const base = `http://127.0.0.1:${used}`
    await waitReady(base)
    console.log(`PASS_ELECTRON_EMBED port=${used} items=35 completeForm=true`)
    await embedded.stop()
    app.exit(0)
  } catch (e) {
    console.error('FAIL_ELECTRON_EMBED', e?.message || e)
    app.exit(1)
  }
})

app.on('window-all-closed', (e) => {
  e.preventDefault()
})
