<!--
  品牌大图标（单一资源）
  源：reports/P2/assets/legacy-brand/legacy-brand-2.png
-->
<template>
  <img
    class="BrandMark"
    :class="`BrandMark--${size}`"
    :src="src"
    :width="px"
    :height="px"
    :alt="alt"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    size?: 'sm' | 'md' | 'lg' | 'xl'
    alt?: string
  }>(),
  {
    size: 'lg',
    alt: 'CYP-memo',
  }
)

const srcMap = {
  sm: '/assets/images/logo/logo-64.png',
  md: '/assets/images/logo/logo-256.png',
  lg: '/assets/images/logo/logo-512.png',
  xl: '/assets/images/logo/logo-512.png',
} as const

const pxMap = {
  sm: 28,
  md: 56,
  lg: 88,
  xl: 112,
} as const

const src = computed(() => srcMap[props.size])
const px = computed(() => pxMap[props.size])
</script>
