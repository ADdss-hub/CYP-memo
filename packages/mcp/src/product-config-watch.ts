/**
 * 监视产品壳 mcp-*-config.json，变更后热叠读（A8c / 设计 6.2 list_changed）
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import fs from 'node:fs'
import path from 'node:path'
import { listProductDataDirs, type McpConfig } from './config.js'

/**
 * 监视 dataDir 下公开/能力配置文件；防抖后回调（由 handle.syncFromProductFiles 叠读）。
 * 返回 stop()。
 */
export function startProductConfigWatcher(cfg: McpConfig, onChange: () => void): () => void {
  void cfg
  const dirs = listProductDataDirs()
  const watchers: fs.FSWatcher[] = []
  let timer: ReturnType<typeof setTimeout> | null = null

  const kick = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      try {
        onChange()
      } catch (err) {
        console.error(
          '[cyp-memo-mcp] product config reload failed',
          err instanceof Error ? err.message : String(err)
        )
      }
    }, 350)
  }

  for (const dir of dirs) {
    try {
      if (!fs.existsSync(dir)) continue
      const w = fs.watch(dir, { persistent: true }, (_event, filename) => {
        const name = String(filename || '')
        if (name === 'mcp-public-config.json' || name === 'mcp-cap-config.json') {
          kick()
        }
      })
      watchers.push(w)
      console.error(`[cyp-memo-mcp] watching product config dir ${path.resolve(dir)}`)
    } catch {
      /* 目录不可监视则跳过 */
    }
  }

  return () => {
    if (timer) clearTimeout(timer)
    for (const w of watchers) {
      try {
        w.close()
      } catch {
        /* ignore */
      }
    }
  }
}
