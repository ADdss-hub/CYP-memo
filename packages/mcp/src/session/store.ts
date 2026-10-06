/**
 * 分段阅读会话 LRU（设计报告 §7.3）
 * 键：authSubjectId + resourceType + resourceId
 */

export type ResourceType = 'memo' | 'file'
export type SessionState =
  | 'none'
  | 'title_done'
  | 'summary_done'
  | 'full_done'
  | 'report_submitted'
  | 'expired'
  | 'incomplete'

export type ReadLayer = 'title' | 'summary' | 'full'

interface SessionEntry {
  state: SessionState
  layers: ReadLayer[]
  updatedAt: number
}

export class SegmentSessionStore {
  private readonly map = new Map<string, SessionEntry>()
  private readonly ttlMs: number
  private readonly maxEntries: number

  constructor(opts: { ttlMs: number; maxEntries: number }) {
    this.ttlMs = opts.ttlMs
    this.maxEntries = opts.maxEntries
  }

  private key(subject: string, type: ResourceType, id: string): string {
    return `${subject}::${type}::${id}`
  }

  private purgeExpired(): void {
    const now = Date.now()
    for (const [k, v] of this.map) {
      if (now - v.updatedAt > this.ttlMs) {
        this.map.delete(k)
      }
    }
    while (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next().value
      if (oldest === undefined) break
      this.map.delete(oldest)
    }
  }

  get(subject: string, type: ResourceType, id: string): SessionEntry {
    this.purgeExpired()
    const k = this.key(subject, type, id)
    const cur = this.map.get(k)
    if (!cur) return { state: 'none', layers: [], updatedAt: Date.now() }
    if (Date.now() - cur.updatedAt > this.ttlMs) {
      this.map.delete(k)
      return { state: 'expired', layers: [], updatedAt: Date.now() }
    }
    return cur
  }

  /** 推进到指定层；跳层抛出由调用方转 MCP_READ_LAYER_SKIP */
  advance(subject: string, type: ResourceType, id: string, layer: ReadLayer): SessionEntry {
    this.purgeExpired()
    const cur = this.get(subject, type, id)
    const order: ReadLayer[] = ['title', 'summary', 'full']
    const want = order.indexOf(layer)
    const have = cur.layers.length === 0 ? -1 : order.indexOf(cur.layers[cur.layers.length - 1])

    if (want === 0) {
      // title 可重复取
    } else if (want > have + 1) {
      throw new Error('LAYER_SKIP')
    } else if (want === have + 1) {
      // ok advance
    }
    // same or re-read lower/same ok

    const layers = [...new Set([...cur.layers, ...order.slice(0, want + 1)])] as ReadLayer[]
    const stateMap: Record<ReadLayer, SessionState> = {
      title: 'title_done',
      summary: 'summary_done',
      full: 'full_done',
    }
    const next: SessionEntry = {
      state: stateMap[layer],
      layers,
      updatedAt: Date.now(),
    }
    this.map.set(this.key(subject, type, id), next)
    return next
  }

  markReport(subject: string, type: ResourceType, id: string): SessionEntry {
    const cur = this.get(subject, type, id)
    const next: SessionEntry = {
      state: 'report_submitted',
      layers: cur.layers,
      updatedAt: Date.now(),
    }
    this.map.set(this.key(subject, type, id), next)
    return next
  }

  markIncomplete(subject: string, type: ResourceType, id: string): void {
    const cur = this.get(subject, type, id)
    if (cur.state === 'full_done') {
      this.map.set(this.key(subject, type, id), {
        ...cur,
        state: 'incomplete',
        updatedAt: Date.now(),
      })
    }
  }
}
