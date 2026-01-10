<template>
  <div id="app">
    <router-view />
    <TermsDialog />
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { VERSION } from '@shared/config/version'
import { logManager } from '@cyp-memo/shared'
import TermsDialog from './components/TermsDialog.vue'

console.log(`CYP-memo Admin v${VERSION.full}`)
console.log(VERSION.copyright)

/**
 * 设置全局错误处理
 */
onMounted(() => {
  // 捕获未处理的错误
  window.addEventListener('error', (event) => {
    logManager.error(event.error || new Error(event.message), {
      source: 'window.error',
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    })
  })

  // 捕获未处理的 Promise 拒绝
  window.addEventListener('unhandledrejection', (event) => {
    logManager.error(new Error(event.reason), {
      source: 'unhandledrejection',
    })
  })
})
</script>

<style>
#app {
  font-family:
    'Helvetica Neue', Helvetica, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', '微软雅黑',
    Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  margin: 0;
  padding: 0;
}
</style>
