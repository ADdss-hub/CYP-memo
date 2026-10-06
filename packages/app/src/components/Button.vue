<!--
  Button 按钮组件（统一样式）
  Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
-->
<template>
  <button
    :type="htmlType"
    :class="[
      'btn',
      `btn-${type}`,
      `btn-${size}`,
      {
        'btn-disabled': disabled,
        'btn-loading': loading,
        'btn-block': block,
      },
    ]"
    :disabled="disabled || loading"
    :title="title || (loading ? '加载中...' : '')"
    :aria-label="ariaLabel || (slot ? undefined : '按钮')"
    @click="handleClick"
  >
    <span v-if="loading" class="btn-loading-icon" aria-hidden="true">
      <div class="spinner" />
    </span>
    <span v-if="icon && !loading" class="btn-icon" aria-hidden="true">
      <component :is="icon" />
    </span>
    <span class="btn-content">
      <slot />
    </span>
  </button>
</template>

<script setup lang="ts">
import type { Component } from 'vue'
import { useSlots } from 'vue'

export interface ButtonProps {
  type?: 'primary' | 'success' | 'warning' | 'danger' | 'default' | 'text' | 'secondary'
  size?: 'small' | 'medium' | 'large'
  disabled?: boolean
  loading?: boolean
  block?: boolean
  icon?: Component
  htmlType?: 'button' | 'submit' | 'reset'
  title?: string
  ariaLabel?: string
}

const props = withDefaults(defineProps<ButtonProps>(), {
  type: 'default',
  size: 'medium',
  disabled: false,
  loading: false,
  block: false,
  htmlType: 'button',
})

const slots = useSlots()
const slot = slots.default

const emit = defineEmits<{
  click: [event: MouseEvent]
}>()

const handleClick = (event: MouseEvent) => {
  emit('click', event)
}
</script>

<style scoped>
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 16px;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.5;
  border: 1px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  -webkit-user-select: none;
  -moz-user-select: none;
  user-select: none;
  white-space: nowrap;
  min-height: 44px;
  min-width: 44px;
  -webkit-appearance: none;
  appearance: none;
}

.btn:active {
  transform: scale(0.98);
}

/* 按钮内容 */
.btn-content {
  display: inline;
}

/* 尺寸 */
.btn-small {
  padding: 6px 12px;
  font-size: 12px;
  min-height: 32px;
  min-width: 32px;
}

.btn-medium {
  padding: 8px 16px;
  font-size: 14px;
  min-height: 44px;
  min-width: 44px;
}

.btn-large {
  padding: 12px 20px;
  font-size: 16px;
  min-height: 48px;
  min-width: 48px;
}

/* 类型 */
.btn-primary {
  background: var(--cyp-brand);
  color: var(--cyp-text);
  border-color: var(--cyp-brand);
  font-weight: 600;
}

.btn-primary:hover:not(.btn-disabled):not(.btn-loading) {
  background: var(--cyp-brand-soft);
  border-color: var(--cyp-brand-soft);
}

.btn-success {
  background: var(--cyp-success);
  color: var(--cyp-text);
  border-color: var(--cyp-success);
  font-weight: 600;
}

.btn-success:hover:not(.btn-disabled):not(.btn-loading) {
  background: var(--cyp-success-hover);
  border-color: var(--cyp-success-hover);
}

.btn-warning {
  background: var(--cyp-warning);
  color: var(--cyp-text);
  border-color: var(--cyp-warning);
  font-weight: 600;
}

.btn-warning:hover:not(.btn-disabled):not(.btn-loading) {
  background: var(--cyp-warning-hover);
  border-color: var(--cyp-warning-hover);
}

.btn-danger {
  background: var(--cyp-danger);
  color: #fff;
  border-color: var(--cyp-danger);
  font-weight: 600;
}

.btn-danger:hover:not(.btn-disabled):not(.btn-loading) {
  background: var(--cyp-danger-hover);
  border-color: var(--cyp-danger-hover);
  color: #fff;
}

.btn-default {
  background: var(--cyp-bg-muted);
  color: var(--cyp-text-secondary);
  border-color: var(--cyp-border);
}

.btn-default:hover:not(.btn-disabled):not(.btn-loading) {
  color: var(--cyp-brand);
  border-color: var(--cyp-brand);
  background: var(--cyp-brand-tint);
}

.btn-text {
  background: transparent;
  color: var(--cyp-brand);
  border-color: transparent;
}

.btn-text:hover:not(.btn-disabled):not(.btn-loading) {
  color: var(--cyp-brand-soft);
  background: var(--cyp-brand-tint);
}

.btn-secondary {
  background: var(--cyp-bg-muted);
  color: var(--cyp-text-secondary);
  border-color: var(--cyp-border);
}

.btn-secondary:hover:not(.btn-disabled):not(.btn-loading) {
  color: var(--cyp-brand);
  border-color: var(--cyp-brand);
  background: var(--cyp-brand-tint);
}

/* 状态 */
.btn-disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.btn-loading {
  cursor: wait;
  opacity: 0.8;
}

.btn-block {
  display: flex;
  width: 100%;
}

/* 图标和加载 */
.btn-icon,
.btn-loading-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.2em;
}

.spinner {
  width: 14px;
  height: 14px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
