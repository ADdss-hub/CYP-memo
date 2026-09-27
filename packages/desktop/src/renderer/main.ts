/**
 * CYP-memo 桌面客户端渲染进程入口
 * Renderer process entry point for the Electron desktop client
 *
 * 需求 10.1: 桌面客户端应在每个平台上提供原生外观和体验
 * 需求 7: 桌面应用与网页应用功能一致，需要服务器登录后使用
 *
 * INIT-SYS-10：禁止本地建管理员；只注入 readyProbe 问服务端 /healthz/ready
 */

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import '@app/styles/theme.css'
import App from './App.vue'
import router from './router'
import {
  logManager,
  cleanupManager,
  storageManager,
  initManager,
  resolveApiBaseUrl,
  resolveReadyProbeUrl,
  installClientErrorReporting,
  reportVueError,
  type SystemReadyStatus,
} from '@cyp-memo/shared'
import { ElMessage } from 'element-plus'
import { getElectronAPI } from './composables'

// 检查是否在 Electron 环境中运行
const isElectron = !!(window as Window & { electronAPI?: unknown }).electronAPI
const electronEnv = (window as Window & { electronEnv?: { platform: string; arch: string } }).electronEnv

console.log('╔════════════════════════════════════════╗')
console.log('║     CYP-memo Desktop Client            ║')
console.log('╠════════════════════════════════════════╣')
console.log(`║ Environment: ${isElectron ? 'Electron' : 'Web Browser'}`.padEnd(41) + '║')
if (electronEnv) {
  console.log(`║ Platform: ${electronEnv.platform}`.padEnd(41) + '║')
  console.log(`║ Architecture: ${electronEnv.arch}`.padEnd(41) + '║')
}
console.log('╚════════════════════════════════════════╝')

// 创建 Vue 应用
const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)
app.use(ElementPlus, { locale: zhCn })

/** SIX-LOG：渲染进程错误上报（基址在 getApiUrl 后刷新） */
let desktopApiBase = resolveApiBaseUrl({
  VITE_API_BASE: import.meta.env.VITE_API_BASE as string | undefined,
  PROD: import.meta.env.PROD,
})
installClientErrorReporting({
  getApiBase: () => desktopApiBase,
  source: 'desktop-renderer',
})

/**
 * 获取服务器 API 地址
 * embedded/remote 消费主进程运行时配置；默认走相对 /api（CFG-SYS-07）
 */
async function getApiUrl(): Promise<string> {
  const api = getElectronAPI()

  if (api) {
    try {
      const config = await api.server.getConfig()

      if (config.connectionMode === 'embedded') {
        const status = await api.server.getStatus()
        // 运行时端口来自 EmbeddedServer（系统注入），非前端硬编码真相
        return `http://127.0.0.1:${status.port}/api`
      } else if (config.serverUrl) {
        return `${config.serverUrl.replace(/\/+$/, '')}/api`
      }
    } catch (err) {
      console.error('获取服务器配置失败:', err)
    }
  }

  return resolveApiBaseUrl({
    VITE_API_BASE: import.meta.env.VITE_API_BASE as string | undefined,
    PROD: import.meta.env.PROD,
  })
}

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
  console.log('📍 ready 探针:', readyUrl)
}

/**
 * 初始化存储管理器
 */
async function initializeStorage(): Promise<boolean> {
  try {
    const apiUrl = await getApiUrl()
    desktopApiBase = apiUrl
    installReadyProbe(apiUrl)

    await storageManager.initialize({
      mode: 'remote',
      apiUrl
    })
    console.log('✅ 存储管理器初始化成功 - 使用服务器端存储')
    console.log('📍 API 地址:', apiUrl)
    return true
  } catch (err) {
    console.error('❌ 无法连接到服务器:', err)
    return false
  }
}

/**
 * 初始化应用
 */
async function initializeApp() {
  const api = getElectronAPI()
  
  // 检查是否首次启动
  let isFirstLaunch = false
  if (api) {
    try {
      isFirstLaunch = await api.server.isFirstLaunch()
    } catch (err) {
      console.error('检查首次启动状态失败:', err)
    }
  }
  
  // 首次启动也可能已有 serverUrl / 内置端口：尽量先挂 ready 探针
  try {
    const earlyApi = await getApiUrl()
    desktopApiBase = earlyApi
    installReadyProbe(earlyApi)
  } catch (err) {
    console.warn('ready 探针预注入跳过:', err)
  }

  // 如果不是首次启动，尝试初始化存储
  if (!isFirstLaunch) {
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
  }

  // Vue 错误处理
  app.config.errorHandler = (err, instance, info) => {
    console.error('[Vue Error]', err)
    console.error('[Component]', instance?.$options.name || 'Unknown')
    console.error('[Info]', info)

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
      console.warn('[Vue Warning]', msg)
      if (trace) {
        console.warn('[Trace]', trace)
      }
    }
  }

  // 挂载应用
  app.mount('#app')

  // 通知主进程渲染进程已就绪
  if (isElectron) {
    console.log('[Renderer] Application mounted, ready for IPC communication')
  }
}

// 启动应用
initializeApp()

/**
 * 导出重新初始化存储的方法，供设置完成后调用
 */
export { initializeStorage }
