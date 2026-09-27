/**
 * 客户端 API 基址解析（CFG-SYS-07）
 * 禁止在 app/admin/desktop 各自硬编码「真相端口」；
 * 默认相对路径 `/api`，由 Vite 代理 / 同域反代接到服务端权威端口。
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

export interface ApiBaseEnv {
  /** 显式覆盖，如 `http://192.168.1.10:5170/api` 或 `/api` */
  VITE_API_BASE?: string
  /** Vite: import.meta.env.PROD */
  PROD?: boolean
}

/**
 * 归一化为以 `/api` 结尾、无尾斜杠重复的基址
 */
export function normalizeApiBase(raw: string): string {
  let s = raw.trim().replace(/\/+$/, '')
  if (!s) return '/api'
  if (s.endsWith('/api')) return s
  return `${s}/api`
}

/**
 * 解析客户端应使用的 API 基址（只读消费，不发明第二真相端口）
 *
 * 优先级：
 * 1. `VITE_API_BASE`（CI01 / .env 注入）
 * 2. 相对路径 `/api`（联调靠 Vite proxy；生产靠同域）
 */
export function resolveApiBaseUrl(env: ApiBaseEnv = {}): string {
  const fromEnv = (env.VITE_API_BASE || '').trim()
  if (fromEnv) return normalizeApiBase(fromEnv)
  return '/api'
}

/**
 * 从 apiUrl 推导 `/healthz/ready`（与 InitManager 探针约定一致）
 */
export function resolveReadyProbeUrl(apiUrl: string): string {
  const trimmed = apiUrl.replace(/\/+$/, '')
  const origin = trimmed.endsWith('/api') ? trimmed.slice(0, -'/api'.length) : trimmed
  // 相对 `/api` → `/healthz/ready`；绝对则换同源
  if (!origin || origin === '') return '/healthz/ready'
  return `${origin}/healthz/ready`
}
