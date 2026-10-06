/**
 * 压测/负载脚本硬门禁：禁止写入产品业务 dataDir。
 *
 * 必须同时满足：
 * 1. CYP_LOAD_ISOLATED=1
 * 2. CYP_LOAD_EXPECT_DATA_DIR = 专用压测数据根（绝对路径）
 * 3. 该路径 ≠ packages/server/data（产品默认库）
 * 4. 目标实例 /api/config（或 health）报告的 dataDir 与 EXPECT 一致（可解析时）
 *
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** 产品默认业务库根（禁止压测写入） */
export function productDataDir(): string {
  return path.resolve(__dirname, '../data')
}

export type LoadIsolationResult = {
  ok: true
  expectDataDir: string
  apiBase: string
  serverDataDir?: string
}

/**
 * 未通过则抛错；通过则返回隔离信息。
 */
export async function assertLoadIsolation(opts?: {
  apiBase?: string
  scriptName?: string
}): Promise<LoadIsolationResult> {
  const scriptName = opts?.scriptName || 'load-script'
  const apiBase = (opts?.apiBase || process.env.CYP_API_BASE || '').replace(/\/$/, '')
  const product = productDataDir()

  if (process.env.CYP_LOAD_ISOLATED !== '1') {
    throw new Error(
      `[${scriptName}] REFUSE: 压测禁止写入业务核心库。` +
        `须设置 CYP_LOAD_ISOLATED=1，并另起专用实例（独立 DATA_DIR）。` +
        `产品 dataDir=${product}`
    )
  }

  const expectRaw = String(process.env.CYP_LOAD_EXPECT_DATA_DIR || '').trim()
  if (!expectRaw) {
    throw new Error(
      `[${scriptName}] REFUSE: 须设置 CYP_LOAD_EXPECT_DATA_DIR=专用压测 dataDir 绝对路径（不得为产品 packages/server/data）`
    )
  }

  const expectDataDir = path.resolve(expectRaw)
  if (expectDataDir === product) {
    throw new Error(
      `[${scriptName}] REFUSE: CYP_LOAD_EXPECT_DATA_DIR 不能等于产品业务库 ${product}`
    )
  }

  // 专用目录须已存在或可创建，避免误指空路径却打到默认库
  if (!fs.existsSync(expectDataDir)) {
    fs.mkdirSync(expectDataDir, { recursive: true })
  }

  let serverDataDir: string | undefined
  if (!apiBase) {
    throw new Error(
      `[${scriptName}] REFUSE: 须设置 CYP_API_BASE 指向专用压测实例（禁止默认打产品 :5170）`
    )
  }
  try {
    const res = await fetch(`${apiBase}/api/config`, { signal: AbortSignal.timeout(10_000) })
    if (!res.ok) {
      throw new Error(`[${scriptName}] REFUSE: GET ${apiBase}/api/config HTTP ${res.status}，无法核对 dataDir`)
    }
    const json = (await res.json()) as {
      data?: { dataDir?: string }
      dataDir?: string
    }
    const d = json?.data?.dataDir || json?.dataDir
    if (typeof d !== 'string' || !d.trim()) {
      throw new Error(`[${scriptName}] REFUSE: /api/config 未返回 dataDir`)
    }
    serverDataDir = path.resolve(d.trim())
    if (serverDataDir === product) {
      throw new Error(
        `[${scriptName}] REFUSE: 目标实例 dataDir 仍是产品库 ${product}。` +
          `请用 DATA_DIR=${expectDataDir} 启动专用压测服务后再打。`
      )
    }
    if (serverDataDir !== expectDataDir) {
      throw new Error(
        `[${scriptName}] REFUSE: 实例 dataDir=${serverDataDir} 与 CYP_LOAD_EXPECT_DATA_DIR=${expectDataDir} 不一致`
      )
    }
  } catch (e) {
    if (e instanceof Error && e.message.startsWith(`[${scriptName}] REFUSE`)) throw e
    throw new Error(
      `[${scriptName}] REFUSE: 无法核对专用实例 /api/config（${e instanceof Error ? e.message : String(e)}）`
    )
  }

  console.log(
    `[${scriptName}] load isolation OK · expectDataDir=${expectDataDir}` +
      (serverDataDir ? ` · serverDataDir=${serverDataDir}` : '') +
      (apiBase ? ` · api=${apiBase}` : '')
  )

  return { ok: true, expectDataDir, apiBase, serverDataDir }
}
