<!--
  404 页面未找到
  Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
-->
<template>
  <div class="not-found-view">
    <div class="not-found-content">
      <div class="error-code">404</div>
      <h1>页面未找到</h1>
      <p>抱歉，您访问的页面不存在。</p>
      <el-button type="primary" @click="goHome"> 返回首页 </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()

function goHome() {
  router.push('/')
}
</script>

<style scoped>
.not-found-view {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.not-found-content {
  text-align: center;
  color: white;
}

.error-code {
  font-size: 120px;
  font-weight: 700;
  line-height: 1;
  margin-bottom: 24px;
  text-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
}

h1 {
  font-size: 32px;
  font-weight: 600;
  margin-bottom: 16px;
}

p {
  font-size: 18px;
  margin-bottom: 32px;
  opacity: 0.9;
}
</style>
