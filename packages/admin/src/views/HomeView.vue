<template>
  <div class="home">
    <h1>CYP-memo 管理员端</h1>
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
}
</style>
