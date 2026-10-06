<!--
  站内通知铃铛（⑫ 通知与交互 · 长轮询近实时）
  Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
-->
<template>
  <div v-if="authStore.isAuthenticated" class="notify-bell" ref="rootRef">
    <button
      type="button"
      class="notify-trigger"
      :aria-label="unreadCount > 0 ? `有 ${unreadCount} 条未读通知` : '系统通知'"
      :title="unreadCount > 0 ? `${unreadCount} 条未读` : '系统通知'"
      @click="togglePanel"
    >
      <span class="bell-icon" aria-hidden="true">🔔</span>
      <span v-if="unreadCount > 0" class="bell-badge">{{ unreadCount > 99 ? '99+' : unreadCount }}</span>
    </button>

    <div v-if="open" class="notify-panel" role="dialog" aria-label="系统通知">
      <div class="notify-panel-head">
        <strong>系统通知</strong>
        <button
          v-if="unreadCount > 0"
          type="button"
          class="mark-all"
          @click="handleMarkAll"
        >
          全部已读
        </button>
      </div>
      <ul v-if="items.length > 0" class="notify-list">
        <li
          v-for="n in items"
          :key="n.id"
          class="notify-item"
          :class="{ unread: !n.readAt, 'is-ops': isOpsAlert(n) }"
          @click="handleOpen(n)"
        >
          <div class="notify-title">
            <span v-if="isOpsAlert(n)" class="notify-kind">运维</span>
            {{ displayTitle(n) }}
          </div>
          <div v-if="displayBody(n)" class="notify-body">{{ displayBody(n) }}</div>
          <time class="notify-time">{{ formatTime(n.at) }}</time>
        </li>
      </ul>
      <p v-else class="notify-empty">暂无通知。分享评论与运维告警会出现在这里。</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { shareManager } from '@cyp-memo/shared'
import { useAuthStore } from '../stores/auth'

interface NotifyItem {
  id: string
  channel?: string
  templateId?: string
  title: string
  body: string
  link?: string
  at: string
  readAt?: string | null
}

const authStore = useAuthStore()
const router = useRouter()

const open = ref(false)
const items = ref<NotifyItem[]>([])
const unreadCount = ref(0)
const rootRef = ref<HTMLElement | null>(null)

let alive = false
let sinceCursor = '1970-01-01T00:00:00.000Z'
let loopGen = 0

function isOpsAlert(n: NotifyItem): boolean {
  return n.channel === 'ops_alert' || n.templateId === 'ops_alert'
}

/** 界面默认简体中文：机读模板键不得直接展示 */
const NOTIFY_TITLE_ZH: Record<string, string> = {
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

function isMachineKey(text: string): boolean {
  return /^[a-z][a-z0-9_]*$/i.test(text)
}

function displayTitle(n: NotifyItem): string {
  const raw = String(n.title || '').trim()
  const tid = String(n.templateId || '').trim()
  if (raw && !isMachineKey(raw) && raw !== tid) return raw
  if (raw && NOTIFY_TITLE_ZH[raw]) return NOTIFY_TITLE_ZH[raw]
  if (tid && NOTIFY_TITLE_ZH[tid]) return NOTIFY_TITLE_ZH[tid]
  if (tid.startsWith('entity_')) {
    const op = tid.slice('entity_'.length)
    const opZh =
      op === 'create' ? '已创建' : op === 'delete' ? '已删除' : op === 'changed' ? '已变更' : '已更新'
    return `数据${opZh}`
  }
  return raw || '系统通知'
}

function displayBody(n: NotifyItem): string {
  const body = String(n.body || '').trim()
  if (body) return body
  const tid = String(n.templateId || '').trim()
  if (tid.startsWith('entity_')) return '系统已记录此项变更'
  return ''
}

async function refreshList() {
  const userId = authStore.currentUser?.id
  if (!userId) {
    items.value = []
    unreadCount.value = 0
    return
  }
  try {
    const data = await shareManager.listNotifications(userId)
    items.value = data.items.slice(0, 30)
    unreadCount.value = data.unreadCount
    if (data.items[0]?.at && data.items[0].at > sinceCursor) {
      sinceCursor = data.items[0].at
    }
  } catch (err) {
    console.warn('[NotifyBell] 拉取通知失败', err)
  }
}

function applyArrived(
  arrived: NotifyItem[],
  nextUnread: number
) {
  if (arrived.length === 0) {
    unreadCount.value = nextUnread
    return
  }
  const known = new Set(items.value.map((i) => i.id))
  const fresh = arrived.filter((n) => !known.has(n.id))
  if (fresh.length > 0) {
    items.value = [...fresh, ...items.value].slice(0, 30)
    const latest = fresh[fresh.length - 1]
    if (latest?.at && latest.at > sinceCursor) sinceCursor = latest.at
  }
  unreadCount.value = nextUnread
}

async function longPollLoop(gen: number) {
  while (alive && gen === loopGen) {
    const userId = authStore.currentUser?.id
    if (!userId) {
      await sleep(1500)
      continue
    }
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      await sleep(2000)
      continue
    }
    try {
      const data = await shareManager.waitNotifications(userId, sinceCursor, 25000)
      if (!alive || gen !== loopGen) return
      if (data.items.length > 0) {
        const last = data.items[data.items.length - 1]
        if (last?.at) sinceCursor = last.at
        applyArrived(data.items, data.unreadCount)
        // 有新消息时立刻再拉全量，保证已读状态一致
        await refreshList()
      } else {
        unreadCount.value = data.unreadCount
      }
    } catch (err) {
      console.warn('[NotifyBell] 长轮询中断，稍后重试', err)
      await sleep(2000)
    }
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function startLoop() {
  loopGen += 1
  const gen = loopGen
  void longPollLoop(gen)
}

function togglePanel() {
  open.value = !open.value
  if (open.value) void refreshList()
}

async function handleOpen(n: NotifyItem) {
  const userId = authStore.currentUser?.id
  if (userId && !n.readAt) {
    try {
      await shareManager.markNotificationRead(userId, n.id)
      n.readAt = new Date().toISOString()
      unreadCount.value = Math.max(0, unreadCount.value - 1)
    } catch {
      /* ignore */
    }
  }
  open.value = false
  if (n.link) {
    await router.push(n.link)
  }
}

async function handleMarkAll() {
  const userId = authStore.currentUser?.id
  if (!userId) return
  try {
    await shareManager.markAllNotificationsRead(userId)
    await refreshList()
  } catch (err) {
    console.warn('[NotifyBell] 全部已读失败', err)
  }
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${m}-${day} ${h}:${min}`
}

function onDocClick(e: MouseEvent) {
  if (!open.value || !rootRef.value) return
  if (!rootRef.value.contains(e.target as Node)) open.value = false
}

function onVisibility() {
  if (document.visibilityState === 'visible') {
    void refreshList()
    startLoop()
  }
}

onMounted(() => {
  alive = true
  void refreshList().then(() => startLoop())
  document.addEventListener('click', onDocClick)
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('focus', onVisibility)
})

onUnmounted(() => {
  alive = false
  loopGen += 1
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('visibilitychange', onVisibility)
  window.removeEventListener('focus', onVisibility)
})

watch(
  () => authStore.currentUser?.id,
  () => {
    sinceCursor = '1970-01-01T00:00:00.000Z'
    void refreshList().then(() => startLoop())
  }
)
</script>

<style scoped>
.notify-bell {
  position: relative;
  margin-right: 8px;
}

.notify-trigger {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--cyp-text);
  cursor: pointer;
}

.notify-trigger:hover {
  background: var(--cyp-bg-muted);
}

.bell-icon {
  font-size: 16px;
  line-height: 1;
}

.bell-badge {
  position: absolute;
  top: 2px;
  right: 2px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 8px;
  background: var(--cyp-danger);
  color: #ffffff;
  font-size: 10px;
  font-weight: 700;
  line-height: 16px;
  text-align: center;
}

.notify-panel {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: min(360px, 86vw);
  max-height: 420px;
  overflow: auto;
  background: var(--cyp-chrome-bg-panel);
  border: 1px solid var(--cyp-chrome-border);
  border-radius: 12px;
  box-shadow: var(--cyp-chrome-shadow), 0 12px 32px rgba(0, 0, 0, 0.28);
  backdrop-filter: blur(var(--cyp-chrome-blur));
  -webkit-backdrop-filter: blur(var(--cyp-chrome-blur));
  z-index: 40;
}

.notify-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid var(--cyp-border);
}

.mark-all {
  border: none;
  background: transparent;
  color: var(--cyp-brand, #0099ff);
  font-size: 12px;
  cursor: pointer;
}

.notify-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.notify-item {
  padding: 12px 14px;
  border-bottom: 1px solid var(--cyp-border);
  cursor: pointer;
}

.notify-item:hover {
  background: var(--cyp-bg-muted);
}

.notify-item.unread {
  background: var(--cyp-brand-tint);
}

.notify-item.is-ops.unread {
  background: color-mix(in srgb, var(--cyp-danger) 10%, transparent);
}

.notify-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--cyp-text);
  margin-bottom: 4px;
}

.notify-kind {
  display: inline-block;
  margin-right: 6px;
  padding: 0 5px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--cyp-danger) 14%, transparent);
  color: var(--cyp-danger);
  font-size: 11px;
  font-weight: 700;
  line-height: 18px;
  vertical-align: middle;
}

.notify-body {
  font-size: 12px;
  color: var(--cyp-text-secondary, var(--cyp-text-muted));
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
}

.notify-time {
  display: block;
  margin-top: 6px;
  font-size: 11px;
  color: var(--cyp-text-muted);
}

.notify-empty {
  margin: 0;
  padding: 24px 16px;
  font-size: 13px;
  color: var(--cyp-text-muted);
  text-align: center;
}
</style>
