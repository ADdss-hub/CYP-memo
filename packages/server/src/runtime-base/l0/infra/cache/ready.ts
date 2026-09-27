/**
 * CYP-memo embedded cache (in-process · SIX-CACHE #25)
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 *
 * Form: in-process KV + optional snapshot; NOT a standalone Redis/Memcached service.
 *
 * Boundary vs sql.js hot path (reports/P2/CYP-memo-P2-后端缓存设计.md):
 * - Durable truth = database.sqlite; sql.js memory DB is the primary hot path
 * - This module accelerates non-DB ephemeral data (config digest, permission packs, snapshots)
 * - Write coalescing / debounced flush stays in sqlite-database.saveToFile
 * - desktop CacheManager (better-sqlite3) = client offline cache; NOT the cache component
 *
 * Constraints: C-CACHE-01..04 · critical failure does not degrade (bootstrap throws)
 */

/** Snapshot shape mirrors shared cache/snapshot-types (server avoids Dexie dep) */
export interface CacheSnapshotEntry {
  value: unknown
  expiresAt: number | null
  createdAt: number
}

export interface CacheSnapshot {
  version: 1
  label: string
  exportedAt: number
  entries: Record<string, CacheSnapshotEntry>
}

export interface EmbeddedCacheStats {
  size: number
  hits: number
  misses: number
  sets: number
  deletes: number
  registered: boolean
}

interface CacheEntry {
  value: unknown
  expiresAt: number | null
  createdAt: number
}

export interface EmbeddedCacheOptions {
  defaultTtlMs?: number
  maxEntries?: number
}

export class EmbeddedCache {
  private readonly store = new Map<string, CacheEntry>()
  private readonly defaultTtlMs: number
  private readonly maxEntries: number
  private hits = 0
  private misses = 0
  private sets = 0
  private deletes = 0
  private registered = false

  constructor(options?: EmbeddedCacheOptions) {
    this.defaultTtlMs = options?.defaultTtlMs ?? 0
    this.maxEntries = options?.maxEntries ?? 2048
  }

  markRegistered(): void {
    this.registered = true
  }

  isRegistered(): boolean {
    return this.registered
  }

  get<T = unknown>(key: string): T | undefined {
    return this.getRaw<T>(this.namespacedKey(key))
  }

  private getRaw<T = unknown>(key: string): T | undefined {
    const entry = this.store.get(key)
    if (!entry) {
      this.misses += 1
      return undefined
    }
    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this.store.delete(key)
      this.misses += 1
      return undefined
    }
    this.hits += 1
    return entry.value as T
  }

  set(key: string, value: unknown, ttlMs?: number): void {
    this.setRaw(this.namespacedKey(key), value, ttlMs)
  }

  private setRaw(key: string, value: unknown, ttlMs?: number): void {
    const ttl = ttlMs ?? this.defaultTtlMs
    if (this.store.size >= this.maxEntries && !this.store.has(key)) {
      const oldest = this.store.keys().next().value
      if (oldest !== undefined) this.store.delete(oldest)
    }
    this.store.set(key, {
      value,
      expiresAt: ttl > 0 ? Date.now() + ttl : null,
      createdAt: Date.now()
    })
    this.sets += 1
  }

  delete(key: string): boolean {
    const ok = this.store.delete(this.namespacedKey(key))
    if (ok) this.deletes += 1
    return ok
  }

  has(key: string): boolean {
    return this.get(key) !== undefined
  }

  clear(): void {
    this.store.clear()
  }

  private keyPrefix = ''

  setKeyPrefix(prefix: string): void {
    this.keyPrefix = String(prefix || '')
  }

  getKeyPrefix(): string {
    return this.keyPrefix
  }

  namespacedKey(key: string): string {
    if (!this.keyPrefix) return key
    if (key.startsWith(this.keyPrefix)) return key
    return `${this.keyPrefix}${key}`
  }

  invalidatePrefix(prefix: string): number {
    let n = 0
    for (const k of [...this.store.keys()]) {
      if (k.startsWith(prefix)) {
        this.store.delete(k)
        n += 1
        this.deletes += 1
      }
    }
    return n
  }

  exportSnapshot(label = 'default'): CacheSnapshot {
    const entries: CacheSnapshot['entries'] = {}
    const now = Date.now()
    for (const [key, entry] of this.store) {
      if (entry.expiresAt !== null && now > entry.expiresAt) continue
      entries[key] = {
        value: entry.value,
        expiresAt: entry.expiresAt,
        createdAt: entry.createdAt
      }
    }
    return { version: 1, label, exportedAt: now, entries }
  }

  importSnapshot(snapshot: CacheSnapshot): number {
    let n = 0
    const now = Date.now()
    for (const [key, e] of Object.entries(snapshot.entries)) {
      if (e.expiresAt !== null && now > e.expiresAt) continue
      this.store.set(key, {
        value: e.value,
        expiresAt: e.expiresAt,
        createdAt: e.createdAt
      })
      n += 1
    }
    return n
  }

  stats(): EmbeddedCacheStats {
    return {
      size: this.store.size,
      hits: this.hits,
      misses: this.misses,
      sets: this.sets,
      deletes: this.deletes,
      registered: this.registered
    }
  }
}

let singleton: EmbeddedCache | null = null

export function getSystemCache(): EmbeddedCache {
  if (!singleton) singleton = new EmbeddedCache()
  return singleton
}

export function resetSystemCache(): void {
  singleton = null
}

export function ready_rb_l0_infra_cache_01(): boolean {
  try {
    return getSystemCache().stats().registered === true
  } catch {
    return false
  }
}
