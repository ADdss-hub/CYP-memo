/**
 * CYP-memo 统一产品壳应用入口
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 *
 * INIT-SYS-10：禁止本地建管理员；只注入 readyProbe 问服务端 /healthz/ready
 */

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import './styles/theme.css'
import App from './App.vue'
import router from './router'
import {
  logManager,
  cleanupManager,
  storageManager,
  initManager,
  resolveApiBaseUrl,
  resolveReadyProbeUrl,
  type SystemReadyStatus,
} from '@cyp-memo/shared'
import { ElMessage } from 'element-plus'
import {
  installAppClientErrorReporting,
  reportVueError,
} from './observability/reportClientError'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)
app.use(ElementPlus, { locale: zhCn })

/** SIX-LOG：尽早挂窗口级错误上报（失败静默） */
installAppClientErrorReporting()

/** INIT-SYS-10：注入只读 ready 探针（不建种子） */
function installReadyProbe(apiUrl: string): void {
  const readyUrl = resolveReadyProbeUrl(apiUrl)
  initManager.setReadyProbe(async (): Promise<SystemReadyStatus> => {
    const res = await fetch(readyUrl, { method: 'GET', credentials: 'omit' })
    const json = (await res.json()) as {
      success?: boolean
      data?: {
        ready?: boolean
        trace_id?: string
        phases?: Array<{ phase: string; name: string; status: string }>
        error?: string | null
      }
    }
    const data = json.data
    const ready = Boolean(data?.ready)
    const lastPhase =
      data?.phases && data.phases.length > 0
        ? data.phases[data.phases.length - 1]
        : undefined
    return {
      ready,
      source: 'server_probe',
      message:
        (typeof data?.error === 'string' && data.error) ||
        (ready ? '服务端 bootstrap 已就绪' : `服务端未就绪 (HTTP ${res.status})`),
      hasOwnerSeed: ready,
      phase: lastPhase?.name ?? lastPhase?.phase,
      traceId: data?.trace_id,
    }
  })
  console.log('[ready] probe:', readyUrl)
}

/**
 * CFG-SYS-07：API 基址只读 VITE_API_BASE 或相对 /api（Vite 代理 → 服务端权威端口）
 */
function resolveApiUrl(): string {
  return resolveApiBaseUrl({
    VITE_API_BASE: import.meta.env.VITE_API_BASE as string | undefined,
    PROD: import.meta.env.PROD,
  })
}

// 初始化存储管理器（仅使用服务器端远程 API）
async function initializeStorage() {
  try {
    const apiUrl = resolveApiUrl()
    installReadyProbe(apiUrl)

  // 初始化存储：恢复 localStorage 中的 apiKey（截图/刷新后会话）
  let savedKey: string | undefined
  try {
    const raw = localStorage.getItem('cyp-memo-storage-config')
    if (raw) {
      const parsed = JSON.parse(raw) as { apiKey?: string }
      if (typeof parsed.apiKey === 'string' && parsed.apiKey) savedKey = parsed.apiKey
    }
  } catch {
    /* ignore */
  }

  await storageManager.initialize({
    mode: 'remote',
    apiUrl,
    ...(savedKey ? { apiKey: savedKey } : {}),
  })
  console.log('[storage] remote initialized')
  console.log('[storage] api:', apiUrl)
  return true
  } catch (err) {
    console.error('[storage] server unreachable:', err)
    ElMessage.error({
      message: '无法连接到服务器，请确保服务器正在运行',
      duration: 0,
      showClose: true,
    })
    return false
  }
}

// 初始化应用
async function initializeApp() {
  // 等待存储初始化完成
  const storageReady = await initializeStorage()
  
  if (storageReady) {
    // 设置全局错误处理
    logManager.setupGlobalErrorHandler()

    // 启动日志自动清理任务（保留 12 小时）
    logManager.startAutoCleanTask(12)

    // 配置并启动数据自动清理任务
    cleanupManager.setConfig({
      deletedMemoRetentionDays: 30,
      logRetentionHours: 12,
      shareCheckInterval: 60 * 60 * 1000,
      autoCleanInterval: 60 * 60 * 1000,
    })
    cleanupManager.startAutoCleanup()
  }

  // Vue 错误处理
  app.config.errorHandler = (err, instance, info) => {
    console.error('Vue error:', err)

    reportVueError(
      err,
      info,
      instance?.$options.name || instance?.$options.__name
    )

    logManager
      .error(err as Error, {
        component: instance?.$options.name || instance?.$options.__name,
        info,
        type: 'vue_error',
      })
      .catch(() => undefined)

    ElMessage.error({
      message: '应用发生错误，请刷新页面重试',
      duration: 3000,
    })
  }

  // Vue 警告处理（Vite 未打包联调工具链；配置仍为 prod）
  if (!import.meta.env.PROD) {
    app.config.warnHandler = (msg, instance, trace) => {
      console.warn('Vue warning:', msg, trace)
    }
  }

  // 挂载应用
  app.mount('#app')
}

// 启动应用
initializeApp()
