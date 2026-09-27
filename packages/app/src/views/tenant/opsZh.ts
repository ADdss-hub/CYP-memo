/**
 * 运维界面中文显示（码值 → 简体中文）
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

export const LEVEL_ZH: Record<string, string> = {
  debug: '调试',
  info: '信息',
  warn: '警告',
  error: '错误',
}

export const ACTION_ZH: Record<string, string> = {
  auth_login: '登录成功',
  auth_login_failed: '登录失败',
  auth_register: '注册成功',
  auth_logout: '注销',
  auth_change_password: '修改密码',
  auth_recover_verify_failed: '密保验证失败',
  auth_recover_reset_failed: '密保重置失败',
  auth_recover_reset: '密保重置成功',
  auth_recover_reset_by_token: '令牌重置密码',
  token_revoke_on_perm_change: '权限变更吊销会话',
  user_delete: '删除用户',
  user_create: '创建用户',
  user_update: '更新用户',
  server_start: '服务启动',
  server_shutdown: '服务停止',
  server_start_failed: '服务启动失败',
  log_cleanup: '日志清理',
  cleanup_all: '全量清理',
  g06_registry_ready: '数据源登记就绪',
  g06_source_rejected: '数据源拒绝',
  memo_soft_delete_files_fail: '备忘录软删附件失败',
  memo_delete_files_fail: '备忘录删除附件失败',
  public_access_deny: '公开访问拒绝',
  bootstrap_ready: '底座就绪',
  log_ready: '日志服务就绪',
  'bootstrap.audit_ready': '审计服务就绪',
  'release.register': '版本登记',
  open_collab_ready: '开放协作就绪',
  open_collab_subscribe_approve: '开放协作订阅批准',
  export: '导出',
  import: '导入',
  write: '写入',
  read: '读取',
  delete: '删除',
  update: '更新',
  create: '创建',
}

export const SOURCE_ZH: Record<string, string> = {
  sqlite: '嵌入式数据库',
  cache: '嵌入式缓存',
  pipeline: '数据管道',
  export: '数据导出',
  test: '本地核验',
  http_response: 'HTTP 响应',
  tenant_bundle: '本范围数据包',
}

export const LOG_TYPE_ZH: Record<string, string> = {
  audit: '审计',
  security: '安全',
  business: '业务',
  runtime: '运行',
  error: '错误',
  perf: '性能',
  access: '访问',
}

export function zhLevel(level: unknown): string {
  const k = String(level || '').toLowerCase()
  return LEVEL_ZH[k] || (k ? k : '—')
}

export function zhAction(action: unknown, fallback?: unknown): string {
  const raw = String(action || '').trim()
  if (raw && ACTION_ZH[raw]) return ACTION_ZH[raw]
  const msg = String(fallback || '').trim()
  if (msg && /[\u4e00-\u9fff]/.test(msg)) return msg
  if (raw) return ACTION_ZH[raw] || raw.replace(/[._]/g, ' ')
  return msg || '—'
}

export function zhSource(source: unknown): string {
  const k = String(source || '').trim()
  return SOURCE_ZH[k] || k || '—'
}

export function zhType(type: unknown): string {
  const k = String(type || '').trim()
  return LOG_TYPE_ZH[k] || k || '—'
}

export function formatTs(v: unknown): string {
  if (!v) return '—'
  try {
    const d = v instanceof Date ? v : new Date(String(v))
    if (Number.isNaN(d.getTime())) return String(v)
    return d.toLocaleString('zh-CN')
  } catch {
    return String(v)
  }
}
