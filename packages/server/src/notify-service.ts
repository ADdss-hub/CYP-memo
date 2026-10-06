/**
 * CYP-memo · ⑫ 通知与交互（用户触达钩子 · 与⑦运维告警分流）
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import fs from 'fs'
import path from 'path'
import { publishDomainEvent, subscribeDomainEvent } from './runtime-base/l1/col/evt/ready.js'

export interface NotifyInboxItem {
  id: string
  channel: string
  templateId: string
  userId: string
  title: string
  body: string
  link?: string
  dedupeKey?: string
  at: string
  result: string
  readAt?: string | null
}

interface NotifyWaiter {
  since: string
  resolve: (items: NotifyInboxItem[]) => void
  timer: ReturnType<typeof setTimeout>
}

let dataDirRef: string | null = null
let ready = false
const waiters = new Map<string, NotifyWaiter[]>()

export function initNotify(opts: { dataDir: string }): void {
  dataDirRef = opts.dataDir
  const dir = path.join(opts.dataDir, 'notify')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  outboxCache = null
  ready = true
  readOutbox()
}

export function isNotifyReady(): boolean {
  return ready
}

export interface NotifyChannelDef {
  id: string
  name: string
  /** 必建渠道：缺一则渠道登记未就绪 */
  mandatory: boolean
  description: string
}

/** 系统通知渠道闭集（站内触达；运维告警可进站内，但 channel/template 须可区分，禁止冒充业务评论） */
export const NOTIFY_CHANNELS: readonly NotifyChannelDef[] = [
  {
    id: 'in_app',
    name: '站内通知',
    mandatory: true,
    description: '顶栏铃铛 / 站内收件箱（业务用户）',
  },
  {
    id: 'ops_alert',
    name: '运维告警站内',
    mandatory: true,
    description: '⑦ 告警投递后站内触达（有运行监控权的用户）',
  },
  {
    id: 'update',
    name: '客户端更新',
    mandatory: true,
    description: '版本驳回与升级引导',
  },
  {
    id: 'email',
    name: '邮件',
    mandatory: false,
    description: '可选；密码重置等邮件触达',
  },
] as const

export function listNotifyChannels(): NotifyChannelDef[] {
  return [...NOTIFY_CHANNELS]
}

export function isNotifyChannelRegistryReady(): boolean {
  if (!ready) return false
  return NOTIFY_CHANNELS.filter((c) => c.mandatory).every((c) => Boolean(c.id && c.name))
}

export function resetNotify(): void {
  ready = false
  dataDirRef = null
  for (const list of waiters.values()) {
    for (const w of list) {
      clearTimeout(w.timer)
      w.resolve([])
    }
  }
  waiters.clear()
}

/** 铃铛只展示最近几十条；超出部分不再每次整文件解析 */
const MAX_OUTBOX = 200
let outboxCache: NotifyInboxItem[] | null = null

function outboxPath(): string {
  return path.join(dataDirRef || '.', 'notify', 'outbox.jsonl')
}

function persistOutbox(rows: NotifyInboxItem[]): void {
  const file = outboxPath()
  const dir = path.dirname(file)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(file, rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''), 'utf-8')
}

function readOutbox(): NotifyInboxItem[] {
  if (outboxCache) return outboxCache
  const file = outboxPath()
  if (!fs.existsSync(file)) {
    outboxCache = []
    return outboxCache
  }
  const text = fs.readFileSync(file, 'utf-8')
  const rows: NotifyInboxItem[] = []
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim()
    if (!t) continue
    try {
      const row = JSON.parse(t) as NotifyInboxItem
      if (row && row.id && row.userId) rows.push(row)
    } catch {
      /* skip bad line */
    }
  }
  rows.sort((a, b) => String(a.at).localeCompare(String(b.at)))
  const trimmed = rows.length > MAX_OUTBOX ? rows.slice(rows.length - MAX_OUTBOX) : rows
  outboxCache = trimmed
  if (trimmed.length !== rows.length) persistOutbox(trimmed)
  return outboxCache
}

function writeOutbox(rows: NotifyInboxItem[]): void {
  const next = rows.length > MAX_OUTBOX ? rows.slice(rows.length - MAX_OUTBOX) : rows
  outboxCache = next
  persistOutbox(next)
}

/** 界面默认简体中文（P2 #19）：禁止把模板机读键直接当标题 */
const ENTITY_TYPE_ZH: Record<string, string> = {
  memo: '备忘录',
  file: '文件',
  user: '账号',
  share: '分享',
  setting: '系统设置',
  memo_history: '备忘录历史',
  share_comment: '分享评论',
}

const OP_ZH: Record<string, string> = {
  create: '已创建',
  update: '已更新',
  delete: '已删除',
  changed: '已变更',
}

const TEMPLATE_TITLE_ZH: Record<string, string> = {
  entity_create: '数据已创建',
  entity_update: '数据已更新',
  entity_delete: '数据已删除',
  entity_changed: '数据已变更',
  memo_created: '备忘录已创建',
  client_upgrade_required: '需要升级客户端',
  session_expired: '会话已过期',
  share_comment_received: '收到分享评论',
  ops_alert: '运维告警',
}

function isMachineNotifyKey(text: string): boolean {
  return /^[a-z][a-z0-9_]*$/i.test(text)
}

function titleFromEntityOp(entityType: string, op: string): string {
  const entityZh = ENTITY_TYPE_ZH[entityType] || '数据'
  const opZh = OP_ZH[op] || '已变更'
  return `${entityZh}${opZh}`
}

function resolveNotifyTitle(row: Pick<NotifyInboxItem, 'title' | 'templateId'>): string {
  const raw = String(row.title || '').trim()
  const tid = String(row.templateId || '').trim()
  if (raw && !isMachineNotifyKey(raw) && raw !== tid) return raw
  if (raw && TEMPLATE_TITLE_ZH[raw]) return TEMPLATE_TITLE_ZH[raw]
  if (tid && TEMPLATE_TITLE_ZH[tid]) return TEMPLATE_TITLE_ZH[tid]
  if (tid.startsWith('entity_')) {
    const op = tid.slice('entity_'.length)
    const opZh = OP_ZH[op] || '已变更'
    return `数据${opZh}`
  }
  if (raw) return raw
  return '系统通知'
}

function resolveNotifyBody(row: Pick<NotifyInboxItem, 'body' | 'templateId' | 'title'>): string {
  const body = String(row.body || '').trim()
  if (body) return body
  const tid = String(row.templateId || '').trim()
  if (tid.startsWith('entity_')) return '系统已记录此项变更'
  if (tid === 'memo_created') return '新备忘录已保存'
  if (tid === 'session_expired') return '请重新登录'
  if (tid === 'client_upgrade_required') return '当前客户端版本过旧，请升级后继续使用'
  return ''
}

/** 读出时中文化展示；不改写 outbox 落盘 */
function presentNotifyForUi(row: NotifyInboxItem): NotifyInboxItem {
  const title = resolveNotifyTitle(row)
  const body = resolveNotifyBody(row)
  if (title === row.title && body === (row.body || '')) return row
  return { ...row, title, body }
}

function newerThan(userId: string, since: string): NotifyInboxItem[] {
  return readOutbox()
    .filter((r) => r.userId === userId && String(r.at) > since)
    .sort((a, b) => String(a.at).localeCompare(String(b.at)))
    .map(presentNotifyForUi)
}

function wakeWaiters(userId: string, item: NotifyInboxItem): void {
  const list = waiters.get(userId)
  if (!list || list.length === 0) return
  const remain: NotifyWaiter[] = []
  const presented = presentNotifyForUi(item)
  for (const w of list) {
    if (String(item.at) > w.since) {
      clearTimeout(w.timer)
      w.resolve([presented])
    } else {
      remain.push(w)
    }
  }
  if (remain.length) waiters.set(userId, remain)
  else waiters.delete(userId)
}

/**
 * 长轮询：有 since 之后的新通知立即返回；否则挂起至超时
 */
export function waitUserNotifications(
  userId: string,
  since: string,
  timeoutMs = 25000
): Promise<NotifyInboxItem[]> {
  const immediate = newerThan(userId, since)
  if (immediate.length > 0) return Promise.resolve(immediate)

  const wait = Math.min(Math.max(timeoutMs, 1000), 55000)
  return new Promise((resolve) => {
    const entry: NotifyWaiter = {
      since,
      resolve: (items) => resolve(items.map(presentNotifyForUi)),
      timer: setTimeout(() => {
        const list = waiters.get(userId) || []
        waiters.set(
          userId,
          list.filter((w) => w !== entry)
        )
        resolve([])
      }, wait),
    }
    const list = waiters.get(userId) || []
    list.push(entry)
    waiters.set(userId, list)
  })
}

export function requestUserNotify(input: {
  channel: string
  templateId: string
  userId: string
  title?: string
  body?: string
  link?: string
  dedupeKey?: string
}): NotifyInboxItem | null {
  if (!ready) return null
  const dedupeKey = input.dedupeKey || `${input.templateId}:${input.userId}`
  const existing = readOutbox()
  if (existing.some((r) => r.userId === input.userId && r.dedupeKey === dedupeKey && !r.readAt)) {
    return null
  }
  publishDomainEvent('UserNotifyRequested', 12, {
    channel: input.channel,
    templateId: input.templateId,
    userId: input.userId,
    dedupeKey,
  })
  const fallbackTitle = resolveNotifyTitle({
    title: input.title || '',
    templateId: input.templateId,
  })
  const row: NotifyInboxItem = {
    id: `N-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    channel: input.channel,
    templateId: input.templateId,
    userId: input.userId,
    title: input.title && !isMachineNotifyKey(input.title) ? input.title : fallbackTitle,
    body: input.body || resolveNotifyBody({ body: '', templateId: input.templateId, title: input.title || '' }),
    link: input.link,
    dedupeKey,
    at: new Date().toISOString(),
    result: 'queued',
    readAt: null,
  }
  const next = [...existing, row]
  if (next.length > MAX_OUTBOX) writeOutbox(next)
  else {
    outboxCache = next
    fs.appendFileSync(outboxPath(), `${JSON.stringify(row)}\n`, 'utf-8')
  }
  publishDomainEvent('NotificationDelivered', 12, {
    notificationId: row.id,
    channel: input.channel,
    result: 'queued',
  })
  wakeWaiters(input.userId, row)
  return row
}

/** 站内收件箱（按用户倒序） */
export function listUserNotifications(
  userId: string,
  opts?: { unreadOnly?: boolean; limit?: number }
): NotifyInboxItem[] {
  const limit = Math.min(Math.max(opts?.limit || 50, 1), 200)
  let rows = readOutbox()
    .filter((r) => r.userId === userId)
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))
  if (opts?.unreadOnly) {
    rows = rows.filter((r) => !r.readAt)
  }
  return rows.slice(0, limit).map(presentNotifyForUi)
}

export function markUserNotificationRead(
  userId: string,
  notificationId: string
): NotifyInboxItem | null {
  const rows = readOutbox()
  const idx = rows.findIndex((r) => r.id === notificationId && r.userId === userId)
  if (idx < 0) return null
  rows[idx] = { ...rows[idx], readAt: new Date().toISOString(), result: 'read' }
  writeOutbox(rows)
  return presentNotifyForUi(rows[idx])
}

export function markAllUserNotificationsRead(userId: string): number {
  const rows = readOutbox()
  let n = 0
  const now = new Date().toISOString()
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].userId === userId && !rows[i].readAt) {
      rows[i] = { ...rows[i], readAt: now, result: 'read' }
      n++
    }
  }
  if (n > 0) writeOutbox(rows)
  return n
}

export function getNotifyState(): {
  ready: boolean
  channelRegistryReady: boolean
  channels: NotifyChannelDef[]
  outboxCount: number
  unreadApprox: number
} {
  const rows = ready ? readOutbox() : []
  return {
    ready,
    channelRegistryReady: isNotifyChannelRegistryReady(),
    channels: listNotifyChannels(),
    outboxCount: rows.length,
    unreadApprox: rows.filter((r) => !r.readAt).length,
  }
}

export function wireNotifySubscriptions(): void {
  subscribeDomainEvent('DomainEntityChanged', async (ev) => {
    // 分享评论已在写服务内显式触达主人；此处跳过避免误投 system
    if (ev.payload?.entityType === 'share_comment') return
    const userId = String(ev.payload.userId || ev.payload.entityId || 'system')
    const entityType = String(ev.payload.entityType || '')
    const op = String(ev.payload.op || 'changed')
    requestUserNotify({
      channel: 'in_app',
      templateId: `entity_${op}`,
      userId,
      title: titleFromEntityOp(entityType, op),
      body: `系统已记录${ENTITY_TYPE_ZH[entityType] || '数据'}变更`,
    })
  })
  subscribeDomainEvent('ClientVersionRejected', async (ev) => {
    requestUserNotify({
      channel: 'update',
      templateId: 'client_upgrade_required',
      userId: String(ev.payload.userId || 'anonymous'),
      title: '需要升级客户端',
      body: '当前客户端版本过旧，请升级后继续使用',
      dedupeKey: `upgrade:${ev.payload.appVersion}`,
    })
  })
  subscribeDomainEvent('SessionExpired', async (ev) => {
    requestUserNotify({
      channel: 'in_app',
      templateId: 'session_expired',
      userId: String(ev.payload.userId || 'anonymous'),
      title: '会话已过期',
      body: '请重新登录',
    })
  })
  subscribeDomainEvent('MemoCreated', async (ev) => {
    requestUserNotify({
      channel: 'in_app',
      templateId: 'memo_created',
      userId: String(ev.payload.userId || 'anonymous'),
      title: '备忘录已创建',
      body: '新备忘录已保存',
    })
  })
  /** ⑦ 告警投递 → 站内触达（有运行监控权 / Owner）；标题标明运维告警，不冒充业务评论 */
  subscribeDomainEvent('AlertDispatched', async (ev) => {
    const alertId = String(ev.payload.alertId || '')
    if (!alertId) return
    const severity = String(ev.payload.severity || 'P1')
    const title = String(ev.payload.title || '运维告警')
    const detail = String(ev.payload.detail || '')
    const source = String(ev.payload.source || '')
    let recipients: string[] = []
    try {
      const { database } = await import('./runtime-base/l0/infra/db/ready.js')
      recipients = database
        .getUsers()
        .filter(
          (u) =>
            u.role === 'owner' ||
            (Array.isArray(u.permissions) && u.permissions.includes('tenant_monitor'))
        )
        .map((u) => u.id)
    } catch {
      return
    }
    const bodyParts = [detail, source ? `来源：${source}` : ''].filter(Boolean)
    for (const userId of recipients) {
      requestUserNotify({
        channel: 'ops_alert',
        templateId: 'ops_alert',
        userId,
        title: `【运维告警·${severity}】${title}`,
        body: bodyParts.join(' · ') || '请打开运行监控查看详情',
        link: '/tenant/monitor',
        dedupeKey: `ops_alert:${alertId}:${userId}`,
      })
    }
  })
}
