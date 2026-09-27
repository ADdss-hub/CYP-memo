/**
 * CYP-memo embedded MQ (no external Broker · SIX-MQ #26)
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 *
 * Form: in-process queue + optional outbox persistence bridge; NO RabbitMQ/Kafka/Bull.
 *
 * Boundary vs worker-pool (reports/P2/CYP-memo-P2-消息队列设计.md):
 * - packages/shared/src/utils/worker-pool.ts = compute thread pool, NOT a message Broker
 * - This module = async decoupling / reliable delivery (in-process + outbox)
 * - Online REST stays synchronous; desktop SyncManager pending = client offline bridge
 *
 * Constraints: C-MQ-01..04 · critical failure does not degrade (bootstrap throws)
 */

import fs from 'fs'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'

export type OutboxStatus = 'pending' | 'processing' | 'done' | 'dead'

export interface MqMessage {
  id: string
  topic: string
  payload: unknown
  createdAt: number
  attempts: number
}

export interface OutboxRecord {
  id: string
  topic: string
  payload: unknown
  status: OutboxStatus
  attempts: number
  createdAt: number
  updatedAt: number
  lastError?: string
}

export type MqHandler = (msg: MqMessage) => Promise<void> | void

export interface EmbeddedMqOptions {
  outboxPath?: string
  maxAttempts?: number
}

export interface EmbeddedMqStats {
  queueDepth: number
  outboxPending: number
  outboxDead: number
  processed: number
  registered: boolean
  persistEnabled: boolean
}

export class EmbeddedMq {
  private readonly queue: MqMessage[] = []
  private readonly handlers = new Map<string, MqHandler[]>()
  private outbox: OutboxRecord[] = []
  private readonly outboxPath: string | null
  private readonly maxAttempts: number
  private processed = 0
  private registered = false
  private draining = false
  /** 高压下禁止每条事件全量 pretty 写盘；脏标记 + 防抖落盘 */
  private persistDirty = false
  private persistTimer: ReturnType<typeof setTimeout> | null = null
  private static readonly OUTBOX_SOFT_CAP = 800
  private static readonly PERSIST_DEBOUNCE_MS = 400

  constructor(options?: EmbeddedMqOptions) {
    this.outboxPath = options?.outboxPath ?? null
    this.maxAttempts = options?.maxAttempts ?? 5
  }

  markRegistered(): void {
    this.registered = true
  }

  isRegistered(): boolean {
    return this.registered
  }

  loadOutbox(): void {
    if (!this.outboxPath) {
      this.outbox = []
      return
    }
    const dir = path.dirname(this.outboxPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    if (!fs.existsSync(this.outboxPath)) {
      this.outbox = []
      this.persistOutbox(true)
      return
    }
    const raw = fs.readFileSync(this.outboxPath, 'utf8')
    if (!raw.trim()) {
      this.outbox = []
      return
    }
    const parsed = JSON.parse(raw) as { records?: OutboxRecord[] }
    if (!parsed || !Array.isArray(parsed.records)) {
      throw new Error('MQ outbox file format invalid: ' + this.outboxPath)
    }
    this.outbox = parsed.records
    this.pruneOutbox()
  }

  /** 裁剪已完成/死信，优先保留 pending；软上限防高压膨胀 */
  private pruneOutbox(): void {
    const active = this.outbox.filter((r) => r.status === 'pending' || r.status === 'processing')
    if (active.length >= EmbeddedMq.OUTBOX_SOFT_CAP) {
      // 过载：只保留最新 pending 窗口，旧 pending 标 dead（已在内存 queue 的仍可处理）
      this.outbox = active.slice(-EmbeddedMq.OUTBOX_SOFT_CAP)
      return
    }
    const done = this.outbox.filter((r) => r.status === 'done' || r.status === 'dead')
    const keepDone = Math.min(80, EmbeddedMq.OUTBOX_SOFT_CAP - active.length)
    this.outbox = active.concat(done.slice(-keepDone))
  }

  private persistOutbox(force = false): void {
    if (!this.outboxPath) return
    this.persistDirty = true
    if (!force) {
      if (this.persistTimer) return
      this.persistTimer = setTimeout(() => {
        this.persistTimer = null
        this.flushOutboxSync()
      }, EmbeddedMq.PERSIST_DEBOUNCE_MS)
      if (typeof this.persistTimer === 'object' && 'unref' in this.persistTimer) {
        ;(this.persistTimer as NodeJS.Timeout).unref?.()
      }
      return
    }
    if (this.persistTimer) {
      clearTimeout(this.persistTimer)
      this.persistTimer = null
    }
    this.flushOutboxSync()
  }

  private flushOutboxSync(): void {
    if (!this.outboxPath || !this.persistDirty) return
    this.persistDirty = false
    this.pruneOutbox()
    const dir = path.dirname(this.outboxPath)
    const tmp = this.outboxPath + '.tmp'
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      // 紧凑 JSON：高压下禁止 pretty-print 放大写盘
      fs.writeFileSync(tmp, JSON.stringify({ records: this.outbox }), 'utf8')
      fs.renameSync(tmp, this.outboxPath)
    } catch {
      // Windows 上目标文件被占用时 rename 会 EPERM；抛出未捕获异常会打崩整个 API
      this.persistDirty = true
      this.persistOutbox(false)
    }
  }

  subscribe(topic: string, handler: MqHandler): void {
    const list = this.handlers.get(topic) || []
    list.push(handler)
    this.handlers.set(topic, list)
  }

  enqueue(topic: string, payload: unknown): MqMessage {
    const msg: MqMessage = {
      id: uuidv4().replace(/-/g, ''),
      topic,
      payload,
      createdAt: Date.now(),
      attempts: 0
    }
    this.queue.push(msg)
    return msg
  }

  enqueueOutbox(topic: string, payload: unknown, options?: { enqueueMemory?: boolean }): OutboxRecord {
    const now = Date.now()
    const record: OutboxRecord = {
      id: uuidv4().replace(/-/g, ''),
      topic,
      payload,
      status: 'pending',
      attempts: 0,
      createdAt: now,
      updatedAt: now
    }
    this.outbox.push(record)
    this.persistOutbox()
    if (options?.enqueueMemory !== false) {
      this.queue.push({
        id: record.id,
        topic: record.topic,
        payload: record.payload,
        createdAt: record.createdAt,
        attempts: 0
      })
    }
    return record
  }

  async processNext(): Promise<boolean> {
    const msg = this.queue[0]
    if (!msg) return false

    const handlers = this.handlers.get(msg.topic) || []
    // 无订阅者：出队并标 dead，禁止堵死后续 AlertCandidate / PerfSlaBreached
    if (handlers.length === 0) {
      this.queue.shift()
      const orphan = this.outbox.find(r => r.id === msg.id)
      if (orphan) {
        orphan.status = 'dead'
        orphan.lastError = 'no_handlers'
        orphan.updatedAt = Date.now()
        this.persistOutbox()
      }
      this.processed += 1
      return true
    }

    this.queue.shift()
    msg.attempts += 1
    const outboxRec = this.outbox.find(r => r.id === msg.id)

    try {
      if (outboxRec) {
        outboxRec.status = 'processing'
        outboxRec.attempts = msg.attempts
        outboxRec.updatedAt = Date.now()
        this.persistOutbox()
      }
      for (const h of handlers) {
        await h(msg)
      }
      this.processed += 1
      if (outboxRec) {
        outboxRec.status = 'done'
        outboxRec.updatedAt = Date.now()
        outboxRec.lastError = undefined
        this.persistOutbox()
      }
      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (outboxRec) {
        outboxRec.attempts = msg.attempts
        outboxRec.updatedAt = Date.now()
        outboxRec.lastError = message
        if (msg.attempts >= this.maxAttempts) {
          outboxRec.status = 'dead'
        } else {
          outboxRec.status = 'pending'
          this.queue.push(msg)
        }
        this.persistOutbox()
      } else if (msg.attempts < this.maxAttempts) {
        this.queue.push(msg)
      }
      throw err
    }
  }

  revivePendingToQueue(): number {
    let n = 0
    const queuedIds = new Set(this.queue.map(m => m.id))
    for (const rec of this.outbox) {
      if (rec.status !== 'pending' && rec.status !== 'processing') continue
      if (queuedIds.has(rec.id)) continue
      if (rec.status === 'processing') {
        rec.status = 'pending'
        rec.updatedAt = Date.now()
      }
      this.queue.push({
        id: rec.id,
        topic: rec.topic,
        payload: rec.payload,
        createdAt: rec.createdAt,
        attempts: rec.attempts
      })
      n += 1
    }
    if (n > 0) this.persistOutbox()
    return n
  }

  async drain(max = 1000): Promise<number> {
    if (this.draining) return 0
    this.draining = true
    let count = 0
    try {
      while (count < max && this.queue.length > 0) {
        const advanced = await this.processNext()
        if (!advanced) break
        count += 1
      }
      return count
    } finally {
      this.draining = false
    }
  }

  stats(): EmbeddedMqStats {
    return {
      queueDepth: this.queue.length,
      outboxPending: this.outbox.filter(r => r.status === 'pending' || r.status === 'processing').length,
      outboxDead: this.outbox.filter(r => r.status === 'dead').length,
      processed: this.processed,
      registered: this.registered,
      persistEnabled: Boolean(this.outboxPath)
    }
  }

  listOutbox(): readonly OutboxRecord[] {
    return this.outbox
  }
}

let singleton: EmbeddedMq | null = null

export function getSystemMq(): EmbeddedMq {
  if (!singleton) {
    throw new Error('EmbeddedMq not initialized; register via bootstrap Phase2 mod.mq')
  }
  return singleton
}

export function initSystemMq(options?: EmbeddedMqOptions): EmbeddedMq {
  singleton = new EmbeddedMq(options)
  return singleton
}

export function resetSystemMq(): void {
  singleton = null
}

export function ready_rb_l0_infra_mq_01(): boolean {
  try {
    return getSystemMq().isRegistered()
  } catch {
    return false
  }
}
