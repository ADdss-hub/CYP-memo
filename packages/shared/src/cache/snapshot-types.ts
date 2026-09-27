/**
 * CYP-memo cache snapshot contract (shared · SIX-CACHE surface)
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 *
 * Authoritative runtime: packages/server/src/cache/embedded-cache.ts
 * desktop CacheManager = client offline encrypted cache; does NOT implement this protocol
 * and must NOT impersonate the cache component.
 *
 * Types only — server inlines the same shape to avoid Dexie dependency.
 */

export interface CacheSnapshotEntry {
  value: unknown
  /** null = no expiry */
  expiresAt: number | null
  createdAt: number
}

export interface CacheSnapshot {
  version: 1
  label: string
  exportedAt: number
  entries: Record<string, CacheSnapshotEntry>
}
