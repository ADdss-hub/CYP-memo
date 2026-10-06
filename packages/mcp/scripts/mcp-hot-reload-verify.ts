/**
 * 实机核验：产品壳 JSON 热叠读 + 写能力变化后 list_changed
 * 使用临时 DATA_DIR，不写产品 packages/server/data
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createCypMemoMcp } from '../src/server.js'
import { loadMcpConfig } from '../src/config.js'
import { startProductConfigWatcher } from '../src/product-config-watch.js'

function writeJson(file: string, data: unknown) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8')
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms))
}

async function main() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyp-mcp-hot-'))
  process.env.DATA_DIR = dataDir
  process.env.CYP_DATA_DIR = dataDir

  const capPath = path.join(dataDir, 'mcp-cap-config.json')
  const pubPath = path.join(dataDir, 'mcp-public-config.json')

  writeJson(capPath, {
    enabled: true,
    query: true,
    memoWrite: false,
    fileWrite: false,
    requireSegmentedRead: true,
    requireHonestyReport: true,
    publicEnabled: true,
    connectorAllow: true,
    connectorRequireName: false,
  })
  writeJson(pubPath, {
    maxLayer: 'summary',
    memoSelectorMode: 'flag',
    fileSelectorMode: 'flag',
    memoSelectorTags: [],
    memoSelectorIds: [],
    fileSelectorTags: [],
    fileSelectorIds: [],
    requireFlag: true,
  })

  const handle = createCypMemoMcp(loadMcpConfig())
  if (handle.config.cap.memoWrite) throw new Error('expected memoWrite=false after load')
  if (handle.config.public.maxLayer !== 'summary') throw new Error('expected maxLayer=summary')

  const server = handle.createServer()
  let listChanged = 0
  const orig = server.sendToolListChanged.bind(server)
  server.sendToolListChanged = (() => {
    listChanged += 1
    return orig()
  }) as typeof server.sendToolListChanged

  writeJson(capPath, {
    enabled: true,
    query: true,
    memoWrite: true,
    fileWrite: false,
    requireSegmentedRead: true,
    requireHonestyReport: true,
    publicEnabled: true,
    connectorAllow: true,
    connectorRequireName: false,
  })
  const sync1 = handle.syncFromProductFiles()
  if (!sync1.changed) throw new Error('sync1 expected changed')
  if (!handle.config.cap.memoWrite) throw new Error('memoWrite not hot-applied')
  if (listChanged < 1) throw new Error('expected sendToolListChanged after memoWrite on')

  writeJson(pubPath, {
    maxLayer: 'full',
    memoSelectorMode: 'ids',
    fileSelectorMode: 'flag',
    memoSelectorTags: [],
    memoSelectorIds: ['m1'],
    fileSelectorTags: [],
    fileSelectorIds: [],
    requireFlag: true,
  })
  const sync2 = handle.syncFromProductFiles()
  if (!sync2.changed) throw new Error('sync2 expected changed')
  if (handle.config.public.maxLayer !== 'full') throw new Error('maxLayer not hot-applied')
  if (handle.config.public.memoSelector.mode !== 'ids') throw new Error('memo mode not hot-applied')

  // 关写：标志应变 false（工具若仍列出则调用受 MCP_CAP_OFF）
  writeJson(capPath, {
    enabled: true,
    query: true,
    memoWrite: false,
    fileWrite: false,
    requireSegmentedRead: true,
    requireHonestyReport: true,
    publicEnabled: true,
    connectorAllow: true,
    connectorRequireName: false,
  })
  const sync3 = handle.syncFromProductFiles()
  if (!sync3.changed) throw new Error('sync3 expected changed')
  if (handle.config.cap.memoWrite) throw new Error('memoWrite should be false after off')

  // 监视器路径：再开写，等 debounce
  let watchFired = false
  const stop = startProductConfigWatcher(handle.config, () => {
    const info = handle.syncFromProductFiles()
    if (info.changed) watchFired = true
  })
  writeJson(capPath, {
    enabled: true,
    query: true,
    memoWrite: true,
    fileWrite: true,
    requireSegmentedRead: true,
    requireHonestyReport: true,
    publicEnabled: true,
    connectorAllow: true,
    connectorRequireName: false,
  })
  for (let i = 0; i < 20 && !watchFired; i++) await sleep(100)
  stop()
  if (!watchFired) throw new Error('watcher did not hot-reload within 2s')
  if (!handle.config.cap.memoWrite || !handle.config.cap.fileWrite) {
    throw new Error('watcher hot-reload did not apply write caps')
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        dataDir,
        listChanged,
        after: {
          memoWrite: handle.config.cap.memoWrite,
          fileWrite: handle.config.cap.fileWrite,
          maxLayer: handle.config.public.maxLayer,
          memoMode: handle.config.public.memoSelector.mode,
        },
      },
      null,
      2
    )
  )

  try {
    fs.rmSync(dataDir, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
}

main().catch((err) => {
  console.error('[mcp-hot-reload-verify] FAIL', err)
  process.exit(1)
})
