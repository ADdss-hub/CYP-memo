/**
 * 独立观测库（R-015 · 规则 24.18）
 * - 路径：`{dataDir}/logs/observability.sqlite`（与核心业务 `database.sqlite` 分离）
 * - 职责：runtime / error / business（非领域事件总线）等运维可检索流水
 * - 不承载：账号/备忘录/文件元数据（核心业务）；附件 blob（`uploads` 对象存储）；可丢缓存
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'
import { randomUUID } from 'crypto'
import initSqlJs, { Database as SqlJsDatabase } from 'sql.js'
import type { CreateLogParams, LogEntry } from '../../../../types.js'

const SAVE_DEBOUNCE_MS = 2000

let db: SqlJsDatabase | null = null
let dbPath: string | null = null
let saveTimer: NodeJS.Timeout | null = null
let ready = false

function scheduleSave(): void {
  if (!db || !dbPath) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    if (!db || !dbPath) return
    try {
      const data = db.export()
      fs.writeFileSync(dbPath, Buffer.from(data))
    } catch (err) {
      console.error(
        '[obs-store] save failed',
        err instanceof Error ? err.message : String(err)
      )
    }
  }, SAVE_DEBOUNCE_MS)
}

function rowsToObjects(result: ReturnType<SqlJsDatabase['exec']>): Record<string, unknown>[] {
  if (!result.length) return []
  const { columns, values } = result[0]
  return values.map((row) => {
    const obj: Record<string, unknown> = {}
    columns.forEach((col, i) => {
      obj[col] = row[i]
    })
    return obj
  })
}

function toLogEntry(row: Record<string, unknown>): LogEntry {
  return {
    id: String(row.id),
    level: String(row.level) as LogEntry['level'],
    message: String(row.message),
    userId: row.userId != null ? String(row.userId) : null,
    action: row.action != null ? String(row.action) : null,
    details: row.details != null ? String(row.details) : null,
    traceId: row.traceId != null ? String(row.traceId) : null,
    createdAt: String(row.createdAt),
  }
}

export function isObservabilityStoreReady(): boolean {
  return ready && db !== null
}

export function getObservabilityDbPath(): string | null {
  return dbPath
}

/** 初始化独立观测库；须在日志服务登记时 await */
export async function initObservabilityStore(logsRoot: string): Promise<{ dbPath: string }> {
  if (!fs.existsSync(logsRoot)) fs.mkdirSync(logsRoot, { recursive: true })
  dbPath = path.join(logsRoot, 'observability.sqlite')

  const require = createRequire(import.meta.url)
  const SQL = await initSqlJs({
    locateFile: (file: string) =>
      require.resolve(file === 'sql-wasm.wasm' ? 'sql.js/dist/sql-wasm.wasm' : `sql.js/dist/${file}`),
  })

  if (fs.existsSync(dbPath)) {
    db = new SQL.Database(fs.readFileSync(dbPath))
  } else {
    db = new SQL.Database()
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS obs_logs (
      id TEXT PRIMARY KEY,
      level TEXT NOT NULL,
      message TEXT NOT NULL,
      userId TEXT,
      action TEXT,
      details TEXT,
      traceId TEXT,
      createdAt TEXT NOT NULL
    )
  `)
  db.run(`CREATE INDEX IF NOT EXISTS idx_obs_logs_createdAt ON obs_logs(createdAt)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_obs_logs_traceId ON obs_logs(traceId)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_obs_logs_level ON obs_logs(level)`)
  scheduleSave()
  ready = true
  return { dbPath }
}

export function appendObservabilityLog(row: CreateLogParams & { traceId?: string | null }): string {
  if (!db) return ''
  const id = row.id || randomUUID()
  db.run(
    `INSERT INTO obs_logs (id, level, message, userId, action, details, traceId, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      row.level,
      row.message,
      row.userId ?? null,
      row.action ?? null,
      row.details ?? null,
      row.traceId ?? null,
      row.createdAt || new Date().toISOString(),
    ]
  )
  scheduleSave()
  return id
}

export function listObservabilityLogs(limit = 1000): LogEntry[] {
  if (!db) return []
  const n = Math.min(Math.max(Math.floor(limit), 1), 2000)
  const result = db.exec(
    `SELECT * FROM obs_logs ORDER BY createdAt DESC LIMIT ${n}`
  )
  return rowsToObjects(result).map(toLogEntry)
}

export function listObservabilityLogsByTrace(traceId: string, limit = 1000): LogEntry[] {
  if (!db || !traceId) return []
  const n = Math.min(Math.max(Math.floor(limit), 1), 2000)
  const result = db.exec(
    `SELECT * FROM obs_logs WHERE traceId = ? ORDER BY createdAt DESC LIMIT ${n}`,
    [traceId]
  )
  return rowsToObjects(result).map(toLogEntry)
}

export function listObservabilityLogsByLevel(level: string, limit = 1000): LogEntry[] {
  if (!db) return []
  const n = Math.min(Math.max(Math.floor(limit), 1), 2000)
  const result = db.exec(
    `SELECT * FROM obs_logs WHERE level = ? ORDER BY createdAt DESC LIMIT ${n}`,
    [level]
  )
  return rowsToObjects(result).map(toLogEntry)
}

export function flushObservabilityStore(): void {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  if (!db || !dbPath) return
  const data = db.export()
  fs.writeFileSync(dbPath, Buffer.from(data))
}

export function resetObservabilityStore(): void {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  if (db) {
    try {
      db.close()
    } catch {
      /* ignore */
    }
  }
  db = null
  dbPath = null
  ready = false
}
