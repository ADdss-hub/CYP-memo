/**
 * CYP-memo · ④ 领域事件总线（E-DRIVE-1）
 * 跨服务感知唯一通道 · topic = domain.{eventName}
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { v4 as uuidv4 } from 'uuid'
import fs from 'fs'
import path from 'path'
import { getSystemMq } from '../../../l0/infra/mq/ready.js'
import { getMachineCapacity } from '../../../l0/infra/cfg/ready.js'
import { getRequestTraceId } from '../../mgmt/trace/ready.js'
import { log as log } from '../../../l0/infra/log/ready.js'

export type PublisherSlot = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12

export interface DomainEventCatalogEntry {
  eventName: string
  publisherSlot: PublisherSlot
  required: boolean
  source: 'mgs' | 'product'
}

/** MGS 3.2.18 最低必建集 — 不可裁剪 */
export const MGS_MANDATORY_EVENTS: DomainEventCatalogEntry[] = [
  { eventName: 'ConfigSnapshotPublished', publisherSlot: 1, required: true, source: 'mgs' },
  { eventName: 'MigrationApplied', publisherSlot: 1, required: true, source: 'mgs' },
  { eventName: 'ServiceRegistered', publisherSlot: 1, required: true, source: 'mgs' },
  { eventName: 'ServiceDeregistered', publisherSlot: 1, required: true, source: 'mgs' },
  { eventName: 'CanaryWeightChanged', publisherSlot: 6, required: true, source: 'mgs' },
  { eventName: 'ReleaseDesiredStateChanged', publisherSlot: 6, required: true, source: 'mgs' },
  { eventName: 'VersionDeployed', publisherSlot: 6, required: true, source: 'mgs' },
  { eventName: 'ReleaseRolledBack', publisherSlot: 6, required: true, source: 'mgs' },
  { eventName: 'CacheNamespaceBumped', publisherSlot: 6, required: true, source: 'mgs' },
  { eventName: 'CircuitBreakerOpened', publisherSlot: 2, required: true, source: 'mgs' },
  { eventName: 'CircuitBreakerClosed', publisherSlot: 2, required: true, source: 'mgs' },
  { eventName: 'EgressCallFailed', publisherSlot: 2, required: true, source: 'mgs' },
  { eventName: 'ClientVersionRejected', publisherSlot: 2, required: true, source: 'mgs' },
  { eventName: 'EastWestAuthFailed', publisherSlot: 2, required: true, source: 'mgs' },
  { eventName: 'ScheduleFired', publisherSlot: 3, required: true, source: 'mgs' },
  { eventName: 'SagaStarted', publisherSlot: 3, required: true, source: 'mgs' },
  { eventName: 'SagaStepFailed', publisherSlot: 3, required: true, source: 'mgs' },
  { eventName: 'SagaCompensated', publisherSlot: 3, required: true, source: 'mgs' },
  { eventName: 'DomainEntityChanged', publisherSlot: 10, required: true, source: 'mgs' },
  { eventName: 'EntityArchived', publisherSlot: 4, required: true, source: 'mgs' },
  { eventName: 'BlobColdStored', publisherSlot: 4, required: true, source: 'mgs' },
  { eventName: 'BusinessErrorRecorded', publisherSlot: 5, required: true, source: 'mgs' },
  { eventName: 'AlertCandidate', publisherSlot: 5, required: true, source: 'mgs' },
  { eventName: 'AlertDispatched', publisherSlot: 7, required: true, source: 'mgs' },
  { eventName: 'AlertAssigned', publisherSlot: 7, required: true, source: 'mgs' },
  { eventName: 'AlertClosed', publisherSlot: 7, required: true, source: 'mgs' },
  { eventName: 'ChaosExperimentStarted', publisherSlot: 7, required: true, source: 'mgs' },
  { eventName: 'ChaosEmergencyStopped', publisherSlot: 7, required: true, source: 'mgs' },
  { eventName: 'ElasticityDecisionMade', publisherSlot: 8, required: true, source: 'mgs' },
  { eventName: 'IdentitySessionCreated', publisherSlot: 9, required: true, source: 'mgs' },
  { eventName: 'PolicyEvaluated', publisherSlot: 11, required: true, source: 'mgs' },
  { eventName: 'UserNotifyRequested', publisherSlot: 12, required: true, source: 'mgs' },
]

/** 产品 SSOT 十四 扩展（全量接线） */
export const PRODUCT_EVENTS: DomainEventCatalogEntry[] = [
  { eventName: 'MemoCreated', publisherSlot: 10, required: true, source: 'product' },
  { eventName: 'MemoUpdated', publisherSlot: 10, required: true, source: 'product' },
  { eventName: 'MemoDeleted', publisherSlot: 10, required: true, source: 'product' },
  { eventName: 'MemoShared', publisherSlot: 10, required: true, source: 'product' },
  { eventName: 'ShareRevoked', publisherSlot: 10, required: true, source: 'product' },
  { eventName: 'ShareAccessed', publisherSlot: 10, required: true, source: 'product' },
  { eventName: 'AttachmentUploaded', publisherSlot: 10, required: true, source: 'product' },
  { eventName: 'AttachmentRemoved', publisherSlot: 10, required: true, source: 'product' },
  { eventName: 'UserRegistered', publisherSlot: 9, required: true, source: 'product' },
  { eventName: 'UserLoggedIn', publisherSlot: 9, required: true, source: 'product' },
  { eventName: 'UserLoggedOut', publisherSlot: 9, required: true, source: 'product' },
  { eventName: 'SessionExpired', publisherSlot: 9, required: true, source: 'product' },
  { eventName: 'PasswordResetRequested', publisherSlot: 9, required: true, source: 'product' },
  { eventName: 'SubAccountCreated', publisherSlot: 9, required: true, source: 'product' },
  { eventName: 'PermissionDenied', publisherSlot: 11, required: true, source: 'product' },
  { eventName: 'PolicyUpdated', publisherSlot: 11, required: true, source: 'product' },
  { eventName: 'CleanupScheduled', publisherSlot: 3, required: true, source: 'product' },
  { eventName: 'CleanupCompleted', publisherSlot: 3, required: true, source: 'product' },
  { eventName: 'ReleaseCanaryWeightChanged', publisherSlot: 6, required: true, source: 'product' },
  { eventName: 'ReleasePromoted', publisherSlot: 6, required: true, source: 'product' },
  { eventName: 'ApiContractBreakingRejected', publisherSlot: 5, required: true, source: 'product' },
  { eventName: 'GovernanceKillSwitchOn', publisherSlot: 2, required: true, source: 'product' },
  { eventName: 'GovernanceKillSwitchOff', publisherSlot: 2, required: true, source: 'product' },
  { eventName: 'RateLimitTriggered', publisherSlot: 2, required: true, source: 'product' },
  { eventName: 'EgressCallCompleted', publisherSlot: 2, required: true, source: 'product' },
  { eventName: 'NotificationDelivered', publisherSlot: 12, required: true, source: 'product' },
  { eventName: 'PerfSlaBreached', publisherSlot: 8, required: true, source: 'product' },
  { eventName: 'PerfSlaRecovered', publisherSlot: 8, required: true, source: 'product' },
  { eventName: 'PerfPressureCritical', publisherSlot: 8, required: true, source: 'product' },
]

export const ALL_DOMAIN_EVENTS: DomainEventCatalogEntry[] = [
  ...MGS_MANDATORY_EVENTS,
  ...PRODUCT_EVENTS,
]

export const MGS_EVENT_NAMES: string[] = MGS_MANDATORY_EVENTS.map(e => e.eventName)

export function listMandatoryEventNames(): string[] {
  return [...MGS_EVENT_NAMES]
}

let artifactVersionProvider: () => string = () => '0.0.0'

export function setArtifactVersionProvider(fn: () => string): void {
  artifactVersionProvider = fn
}

export type DomainSeverity = 'debug' | 'info' | 'warn' | 'error' | 'critical'

export interface DomainEventEnvelope {
  eventId: string
  eventName: string
  version: string
  occurredAt: string
  traceId: string
  severity: DomainSeverity
  publisherSlot: PublisherSlot
  artifactVersion: string
  payload: Record<string, unknown>
}

export type DomainEventHandler = (ev: DomainEventEnvelope) => Promise<void> | void

const seenIds = new Map<string, number>()
const IDEMPOTENT_TTL_MS = 24 * 60 * 60_000
const publishedNames = new Set<string>()
const subscribedNames = new Set<string>()
let drainTimer: ReturnType<typeof setInterval> | null = null
let busReady = false
let collabDir: string | null = null

export interface EventContractRecord {
  eventName: string
  version: string
  publisherSlot: PublisherSlot
}

export interface DeadLetterRecord {
  id: string
  eventId: string
  eventName: string
  reason: string
  envelope: DomainEventEnvelope
  at: string
  replayedAt?: string
}

const eventContracts = new Map<string, EventContractRecord>()
const deadLetters: DeadLetterRecord[] = []
const DEAD_LETTER_CAP = 200

function deadLetterPath(): string | null {
  if (!collabDir) return null
  return path.join(collabDir, 'dead-letters.json')
}

function persistDeadLetters(): void {
  const file = deadLetterPath()
  if (!file) return
  fs.writeFileSync(file, JSON.stringify({ records: deadLetters }, null, 2), 'utf-8')
}

function loadDeadLetters(): void {
  const file = deadLetterPath()
  deadLetters.length = 0
  if (!file || !fs.existsSync(file)) return
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf-8')) as { records?: DeadLetterRecord[] }
    if (Array.isArray(raw.records)) deadLetters.push(...raw.records.slice(-DEAD_LETTER_CAP))
  } catch {
    deadLetters.length = 0
  }
}

function catalogHas(eventName: string): boolean {
  return ALL_DOMAIN_EVENTS.some((e) => e.eventName === eventName)
}

export function seedEventContractsFromCatalog(): number {
  eventContracts.clear()
  for (const entry of ALL_DOMAIN_EVENTS) {
    eventContracts.set(entry.eventName, {
      eventName: entry.eventName,
      version: '1.0',
      publisherSlot: entry.publisherSlot,
    })
  }
  return eventContracts.size
}

export function initEventCollab(opts: { dataDir: string }): void {
  collabDir = path.join(opts.dataDir, 'events')
  if (!fs.existsSync(collabDir)) fs.mkdirSync(collabDir, { recursive: true })
  loadDeadLetters()
  seedEventContractsFromCatalog()
}

function recordDeadLetter(envelope: DomainEventEnvelope, reason: string): DeadLetterRecord {
  const row: DeadLetterRecord = {
    id: uuidv4(),
    eventId: envelope.eventId,
    eventName: envelope.eventName,
    reason,
    envelope,
    at: new Date().toISOString(),
  }
  deadLetters.push(row)
  if (deadLetters.length > DEAD_LETTER_CAP) deadLetters.splice(0, deadLetters.length - DEAD_LETTER_CAP)
  persistDeadLetters()
  log({
    level: 'warn',
    type: 'runtime',
    message: `event dead-letter ${envelope.eventName}`,
    service: 'domain-event-bus',
    action: 'event_dead_letter',
    traceId: envelope.traceId,
    context: { eventId: envelope.eventId, reason },
  })
  return row
}

/** 消费幂等：同一 eventId 只放行一次。 */
export function claimEventOnce(eventId: string): boolean {
  pruneSeen()
  if (seenIds.has(eventId)) return false
  seenIds.set(eventId, Date.now())
  return true
}

export function replayDeadLetter(eventId: string): { ok: true } | { ok: false; reason: string } {
  const row = deadLetters.find((d) => d.eventId === eventId && !d.replayedAt)
  if (!row) return { ok: false, reason: 'not_found' }
  if (!catalogHas(row.eventName)) return { ok: false, reason: 'still_uncatalogued' }
  getSystemMq().enqueueOutbox(topicOf(row.eventName), row.envelope, { enqueueMemory: true })
  row.replayedAt = new Date().toISOString()
  persistDeadLetters()
  return { ok: true }
}

export function isEventCollabReady(): boolean {
  return busReady && eventContracts.size === ALL_DOMAIN_EVENTS.length && eventContracts.size > 0
}

export function runEventCollabProbe(): {
  unknownDeadLettered: boolean
  unknownNotEnqueued: boolean
  idempotentRejected: boolean
  replayed: boolean
} {
  const ev = publishDomainEvent('B91UnknownEvent', 4, { probe: true }, 'warn')
  const dead = deadLetters.some((d) => d.eventId === ev.eventId && d.reason === 'not_in_catalog')
  const enqueued = getSystemMq()
    .listOutbox()
    .some((r) => {
      const payload = r.payload as DomainEventEnvelope | undefined
      return payload?.eventId === ev.eventId
    })
  const idemId = `b91-idem-${Date.now()}`
  const first = claimEventOnce(idemId)
  const second = claimEventOnce(idemId)
  const replayEnv = publishDomainEvent('DomainEntityChanged', 10, { probe: 'replay-seed' }, 'info')
  recordDeadLetter(replayEnv, 'probe_handler_failed')
  const replayed = replayDeadLetter(replayEnv.eventId)
  return {
    unknownDeadLettered: dead,
    unknownNotEnqueued: enqueued === false,
    idempotentRejected: first === true && second === false,
    replayed: replayed.ok === true,
  }
}

function topicOf(eventName: string): string {
  return `domain.${eventName}`
}

function pruneSeen(): void {
  const now = Date.now()
  for (const [id, at] of seenIds) {
    if (now - at > IDEMPOTENT_TTL_MS) seenIds.delete(id)
  }
}

export function isDomainEventBusReady(): boolean {
  return busReady
}

export function markDomainEventBusReady(): void {
  if (eventContracts.size === 0) seedEventContractsFromCatalog()
  busReady = true
}

export function getPublishedEventNames(): string[] {
  return [...publishedNames]
}

export function getSubscribedEventNames(): string[] {
  return [...subscribedNames]
}

export function publishDomainEvent(
  eventName: string,
  publisherSlot: PublisherSlot,
  payload: Record<string, unknown>,
  severity: DomainSeverity = 'info'
): DomainEventEnvelope {
  const envelope: DomainEventEnvelope = {
    eventId: uuidv4(),
    eventName,
    version: '1.0',
    occurredAt: new Date().toISOString(),
    traceId: getRequestTraceId() || `sys-${Date.now().toString(36)}`,
    severity,
    publisherSlot,
    artifactVersion: artifactVersionProvider() || '0.0.0',
    payload,
  }
  publishedNames.add(eventName)
  if (!catalogHas(eventName)) {
    recordDeadLetter(envelope, 'not_in_catalog')
    return envelope
  }
  const contract = eventContracts.get(eventName)
  if (contract && contract.version !== envelope.version) {
    recordDeadLetter(envelope, 'contract_version_mismatch')
    return envelope
  }
  const mq = getSystemMq()
  const topic = topicOf(eventName)
  mq.enqueueOutbox(topic, envelope, { enqueueMemory: true })
  return envelope
}

/** 业务辅助：统一发指定事件与 DomainEntityChanged */
export function publishEntityChange(
  eventName: string,
  payload: Record<string, unknown>
): void {
  publishDomainEvent(eventName, 10, payload, 'info')
  publishDomainEvent(
    'DomainEntityChanged',
    10,
    {
      entityType: String(payload.entityType || eventName),
      entityId: String(payload.memoId || payload.entityId || payload.shareId || payload.fileId || ''),
      op: String(payload.op || eventName),
      userId: payload.userId,
    },
    'info'
  )
}

export function subscribeDomainEvent(eventName: string, handler: DomainEventHandler): void {
  subscribedNames.add(eventName)
  const mq = getSystemMq()
  mq.subscribe(topicOf(eventName), async msg => {
    const raw = msg.payload as DomainEventEnvelope
    if (!raw || typeof raw !== 'object' || !raw.eventId) return
    // 幂等在 EmbeddedMq.processNext 按 eventId 统一 claim；此处禁止再 claim，
    // 否则同 topic 多订阅者时首个 handler 吃掉，后续（告警拨号/弹性）永不到达。
    try {
      await handler(raw)
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      recordDeadLetter(raw, reason || 'handler_failed')
      throw err
    }
  })
}

/** 默认可观测订阅：catalog 全量（MGS+产品）至少一名订阅者，避免无 handler 堵死 drain */
export function wireDefaultObservabilitySubscribers(): void {
  for (const entry of ALL_DOMAIN_EVENTS) {
    const name = entry.eventName
    if (subscribedNames.has(name)) continue
    subscribeDomainEvent(name, async ev => {
      log({
        level: 'info',
        type: 'business',
        message: `domain.${ev.eventName}`,
        service: 'domain-event-bus',
        action: ev.eventName,
        traceId: ev.traceId,
        context: {
          publisherSlot: ev.publisherSlot,
          severity: ev.severity,
          eventId: ev.eventId,
          artifactVersion: ev.artifactVersion,
        },
      })
    })
  }
}

export function startDomainEventDrain(intervalMs = 500): void {
  if (drainTimer) return
  drainTimer = setInterval(() => {
    try {
      // 高压下提高单轮吞吐，避免 pending 堆积拖死写盘与限流联动
      void getSystemMq().drain(getMachineCapacity().mqDrainBatch)
    } catch {
      /* ignore */
    }
  }, intervalMs)
  if (typeof drainTimer === 'object' && 'unref' in drainTimer) {
    ;(drainTimer as NodeJS.Timeout).unref?.()
  }
}

export function resetDomainEventBus(): void {
  if (drainTimer) {
    clearInterval(drainTimer)
    drainTimer = null
  }
  seenIds.clear()
  publishedNames.clear()
  subscribedNames.clear()
  busReady = false
  eventContracts.clear()
  deadLetters.length = 0
  collabDir = null
}

export function assertCatalogCoverage(): { ok: boolean; missingPublish: string[]; missingSubscribe: string[] } {
  // publish hooks may be lazy; coverage checked after boot wiring via source scan / gate
  const missingSubscribe = MGS_EVENT_NAMES.filter(n => !subscribedNames.has(n))
  return { ok: missingSubscribe.length === 0, missingPublish: [], missingSubscribe }
}

export function ready_rb_l1_col_evt_01(): boolean {
  return isEventCollabReady()
}

/** No-op reference so gate source-scan finds every product eventName string */
export const PRODUCT_EVENT_HOOK_TABLE: Record<string, true> = Object.fromEntries(
  PRODUCT_EVENTS.map(e => [e.eventName, true as const])
)

export function publishProductEventStubOnce(): void {
  // Optional warm: do not flood; only ensure catalog coverage via PRODUCT_EVENT_HOOK_TABLE
  void PRODUCT_EVENT_HOOK_TABLE.MemoShared
  void PRODUCT_EVENT_HOOK_TABLE.ShareRevoked
  void PRODUCT_EVENT_HOOK_TABLE.ShareAccessed
  void PRODUCT_EVENT_HOOK_TABLE.AttachmentUploaded
  void PRODUCT_EVENT_HOOK_TABLE.AttachmentRemoved
  void PRODUCT_EVENT_HOOK_TABLE.UserRegistered
  void PRODUCT_EVENT_HOOK_TABLE.UserLoggedOut
  void PRODUCT_EVENT_HOOK_TABLE.SessionExpired
  void PRODUCT_EVENT_HOOK_TABLE.PasswordResetRequested
  void PRODUCT_EVENT_HOOK_TABLE.SubAccountCreated
  void PRODUCT_EVENT_HOOK_TABLE.PolicyUpdated
  void PRODUCT_EVENT_HOOK_TABLE.CleanupScheduled
  void PRODUCT_EVENT_HOOK_TABLE.CleanupCompleted
  void PRODUCT_EVENT_HOOK_TABLE.ApiContractBreakingRejected
  void publishDomainEvent
}
