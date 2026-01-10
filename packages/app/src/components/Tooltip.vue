<!--
  CYP-memo 工具提示组件
  Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
-->

<template>
  <div
    class="tooltip-wrapper"
    @mouseenter="showTooltip"
    @mouseleave="hideTooltip"
    @focus="showTooltip"
    @blur="hideTooltip"
  >
    <!-- 触发元素 -->
    <slot />

    <!-- 提示内容 -->
    <Teleport to="body">
      <Transition name="tooltip-fade">
        <div
          v-if="isVisible"
          ref="tooltipRef"
          class="tooltip"
          :class="[`tooltip-${position}`, { 'tooltip-dark': dark }]"
          :style="tooltipStyle"
          role="tooltip"
        >
          <div class="tooltip-content">
            <div v-if="title" class="tooltip-title">
              {{ title }}
            </div>
            <div class="tooltip-text">
              {{ content }}
            </div>
          </div>
          <div class="tooltip-arrow" :class="`arrow-${position}`" />
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue'

/**
 * 组件属性
 */
interface Props {
  content: string
  title?: string
  position?: 'top' | 'bottom' | 'left' | 'right'
  delay?: number
  dark?: boolean
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  position: 'top',
  delay: 200,
  dark: false,
  disabled: false,
})

// 状态
const isVisible = ref(false)
const tooltipRef = ref<HTMLElement | null>(null)
const triggerRef = ref<HTMLElement | null>(null)
const tooltipStyle = ref<Record<string, string>>({})
let showTimer: number | null = null
let hideTimer: number | null = null

/**
 * 显示提示
 */
function showTooltip(event: Event) {
  if (props.disabled) return

  // 清除隐藏定时器
  if (hideTimer) {
    clearTimeout(hideTimer)
    hideTimer = null
  }

  // 设置显示定时器
  showTimer = window.setTimeout(() => {
    isVisible.value = true
    triggerRef.value = event.currentTarget as HTMLElement
    nextTick(() => {
      updatePosition()
    })
  }, props.delay)
}

/**
 * 隐藏提示
 */
function hideTooltip() {
  // 清除显示定时器
  if (showTimer) {
    clearTimeout(showTimer)
    showTimer = null
  }

  // 设置隐藏定时器
  hideTimer = window.setTimeout(() => {
    isVisible.value = false
  }, 100)
}

/**
 * 更新提示位置
 */
function updatePosition() {
  if (!tooltipRef.value || !triggerRef.value) return

  const trigger = triggerRef.value.getBoundingClientRect()
  const tooltip = tooltipRef.value.getBoundingClientRect()
  const spacing = 8 // 间距

  let top = 0
  let left = 0

  switch (props.position) {
    case 'top':
      top = trigger.top - tooltip.height - spacing
      left = trigger.left + (trigger.width - tooltip.width) / 2
      break
    case 'bottom':
      top = trigger.bottom + spacing
      left = trigger.left + (trigger.width - tooltip.width) / 2
      break
    case 'left':
      top = trigger.top + (trigger.height - tooltip.height) / 2
      left = trigger.left - tooltip.width - spacing
      break
    case 'right':
      top = trigger.top + (trigger.height - tooltip.height) / 2
      left = trigger.right + spacing
      break
  }

  // 边界检测和调整
  const viewport = {
    width: window.innerWidth,
    height: window.innerHeight,
  }

  // 水平边界检测
  if (left < spacing) {
    left = spacing
  } else if (left + tooltip.width > viewport.width - spacing) {
    left = viewport.width - tooltip.width - spacing
  }

  // 垂直边界检测
  if (top < spacing) {
    top = spacing
  } else if (top + tooltip.height > viewport.height - spacing) {
    top = viewport.height - tooltip.height - spacing
  }

  tooltipStyle.value = {
    top: `${top}px`,
    left: `${left}px`,
  }
}

/**
 * 处理窗口大小变化
 */
function handleResize() {
  if (isVisible.value) {
    updatePosition()
  }
}

/**
 * 处理滚动
 */
function handleScroll() {
  if (isVisible.value) {
    hideTooltip()
  }
}

// 生命周期
onMounted(() => {
  window.addEventListener('resize', handleResize)
  window.addEventListener('scroll', handleScroll, true)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  window.removeEventListener('scroll', handleScroll, true)

  if (showTimer) {
    clearTimeout(showTimer)
  }
  if (hideTimer) {
    clearTimeout(hideTimer)
  }
})
</script>

<style scoped>
.tooltip-wrapper {
  display: inline-block;
}

.tooltip {
  position: fixed;
  z-index: 9999;
  max-width: 300px;
  padding: 0;
  background: white;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  pointer-events: none;
}

.tooltip-dark {
  background: #1f2937;
  color: white;
}

.tooltip-content {
  padding: 0.75rem 1rem;
}

.tooltip-title {
  font-weight: 600;
  font-size: 0.875rem;
  margin-bottom: 0.25rem;
  color: #111827;
}

.tooltip-dark .tooltip-title {
  color: #f9fafb;
}

.tooltip-text {
  font-size: 0.875rem;
  line-height: 1.5;
  color: #6b7280;
}

.tooltip-dark .tooltip-text {
  color: #d1d5db;
}

/* 箭头 */
.tooltip-arrow {
  position: absolute;
  width: 0;
  height: 0;
  border-style: solid;
}

.tooltip-top .tooltip-arrow {
  bottom: -6px;
  left: 50%;
  transform: translateX(-50%);
  border-width: 6px 6px 0 6px;
  border-color: white transparent transparent transparent;
}

.tooltip-dark.tooltip-top .tooltip-arrow {
  border-color: #1f2937 transparent transparent transparent;
}

.tooltip-bottom .tooltip-arrow {
  top: -6px;
  left: 50%;
  transform: translateX(-50%);
  border-width: 0 6px 6px 6px;
  border-color: transparent transparent white transparent;
}

.tooltip-dark.tooltip-bottom .tooltip-arrow {
  border-color: transparent transparent #1f2937 transparent;
}

.tooltip-left .tooltip-arrow {
  right: -6px;
  top: 50%;
  transform: translateY(-50%);
  border-width: 6px 0 6px 6px;
  border-color: transparent transparent transparent white;
}

.tooltip-dark.tooltip-left .tooltip-arrow {
  border-color: transparent transparent transparent #1f2937;
}

.tooltip-right .tooltip-arrow {
  left: -6px;
  top: 50%;
  transform: translateY(-50%);
  border-width: 6px 6px 6px 0;
  border-color: transparent white transparent transparent;
}

.tooltip-dark.tooltip-right .tooltip-arrow {
  border-color: transparent #1f2937 transparent transparent;
}

/* 过渡动画 */
.tooltip-fade-enter-active,
.tooltip-fade-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.tooltip-fade-enter-from,
.tooltip-fade-leave-to {
  opacity: 0;
  transform: scale(0.95);
}

/* 响应式设计 */
@media (max-width: 768px) {
  .tooltip {
    max-width: 250px;
  }

  .tooltip-content {
    padding: 0.5rem 0.75rem;
  }

  .tooltip-title,
  .tooltip-text {
    font-size: 0.8125rem;
  }
}
</style>
