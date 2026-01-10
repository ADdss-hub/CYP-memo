<template>
  <div class="home">
    <h1>CYP-memo 用户端</h1>
    <p>版本: {{ version }}</p>
    <p>作者: {{ author }}</p>
  </div>
</template>

<script setup lang="ts">
import { VERSION } from '@shared/config/version'

const version = VERSION.full
const author = VERSION.author
</script>

<style scoped>
.home {
  padding: 20px;
  text-align: center;
  color: #303133;
}

.home h1 {
  color: #303133;
}

.home p {
  color: #606266;
}

/* 深色主题支持 */
[data-theme='dark'] .home {
  color: #e5eaf3;
}

[data-theme='dark'] .home h1 {
  color: #e5eaf3;
}

[data-theme='dark'] .home p {
  color: #cfd3dc;
}
</style>
