/**
 * CYP-memo 管理员端应用入口
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import App from './App.vue'
import router from './router'
import { logManager, cleanupManager, storageManager } from '@cyp-memo/shared'
import { ElMessage } from 'element-plus'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)
app.use(ElementPlus)

/**
 * 初始化存储管理器（仅使用服务器端远程 API）
 */
async function initializeStorage() {
  try {
    // 在生产模式下使用相对路径，开发模式下使用完整 URL
    const apiUrl = import.meta.env.PROD 
      ? '/api'  // 生产模式：相对路径，由同一服务器托管
      : 'http://localhost:5170/api'  // 开发模式：Vite 代理或直接访问
    
    await storageManager.initialize({
      mode: 'remote',
      apiUrl
    })
    console.log('✅ 存储管理器初始化成功 - 使用服务器端存储')
    console.log('📍 API 地址:', apiUrl)
    return true
  } catch (error) {
    console.error('❌ 无法连接到服务器，应用无法正常工作:', error)
    ElMessage.error({
      message: '无法连接到服务器，请确保服务器正在运行',
      duration: 0,
      showClose: true,
    })
    return false
  }
}

/**
 * 初始化应用
 */
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

    logManager
      .error(err as Error, {
        component: instance?.$options.name || instance?.$options.__name,
        info,
        type: 'vue_error',
        app: 'admin',
      })
      .catch(console.error)

    ElMessage.error({
      message: '管理端发生错误，请刷新页面重试',
      duration: 3000,
    })
  }

  // Vue 警告处理（开发环境）
  if (import.meta.env.DEV) {
    app.config.warnHandler = (msg, instance, trace) => {
      console.warn('Vue warning:', msg, trace)
    }
  }

  // 挂载应用
  app.mount('#app')
}

// 启动应用
initializeApp()
