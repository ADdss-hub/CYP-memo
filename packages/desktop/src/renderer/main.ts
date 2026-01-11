/**
 * CYP-memo 桌面客户端渲染进程入口
 * Renderer process entry point for the Electron desktop client
 *
 * 需求 10.1: 桌面客户端应在每个平台上提供原生外观和体验
 */

import { createApp } from 'vue'
import App from './App.vue'

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

// 全局错误处理
app.config.errorHandler = (err, instance, info) => {
  console.error('[Vue Error]', err)
  console.error('[Component]', instance?.$options.name || 'Unknown')
  console.error('[Info]', info)
}

// 开发环境警告处理
if (import.meta.env.DEV) {
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
