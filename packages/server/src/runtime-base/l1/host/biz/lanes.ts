/**
 * 运行底座网关中心 · 业务/系统网关子中心车道登记（SSOT）
 * 仅入站数据面分类；不处理控制面决策。
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

/** 业务网关子中心：user 车道路径根（含前缀匹配） */
export const USER_LANE_PATH_ROOTS: readonly string[] = [
  '/api/auth',
  '/api/memos',
  '/api/files',
  '/api/shares',
  '/api/public/shares',
  '/api/settings',
  '/api/users',
  '/mcp',
  '/api/mcp/pat',
  '/api/mcp/exchange',
  '/api/mcp/oauth',
  '/api/mcp/files',
  '/api/public/mcp',
] as const

/** 强制系统网关子中心（ops）的路径，即使落在 user 根下 */
export const OPS_LANE_FORCE_PATHS: readonly string[] = [
  '/api/files/storage/status',
  '/api/ops/snapshot',
  '/mcp/healthz',
] as const

/** 长轮询路径（独立信号量，不占 user 业务槽） */
export const LONGPOLL_PATH_SUFFIXES: readonly string[] = ['/notifications/wait'] as const

export type IngressDataLane = 'user' | 'ops'

/**
 * 判定入站数据面车道。
 * 业务网关子中心 = user；系统网关子中心 = ops。
 */
export function resolveIngressDataLane(_method: string, path: string): IngressDataLane {
  const p = (path || '').split('?')[0].toLowerCase()
  if (OPS_LANE_FORCE_PATHS.some((x) => p === x || p.startsWith(`${x}/`))) return 'ops'
  const user = USER_LANE_PATH_ROOTS.some((root) => p === root || p.startsWith(`${root}/`))
  return user ? 'user' : 'ops'
}

export function isUserBusinessRequest(method: string, path: string): boolean {
  return resolveIngressDataLane(method, path) === 'user'
}

/** 通知长轮询等：走 longpoll 信号量 */
export function isLongPollRequest(path: string): boolean {
  const p = (path || '').split('?')[0].toLowerCase()
  return LONGPOLL_PATH_SUFFIXES.some((suf) => p.endsWith(suf))
}
