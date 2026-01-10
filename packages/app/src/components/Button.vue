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
  background: #409eff;
  color: #ffffff;
  border-color: #409eff;
  font-weight: 600;
}

.btn-primary:hover:not(.btn-disabled):not(.btn-loading) {
  background: #66b1ff;
  border-color: #66b1ff;
}

.btn-success {
  background: #67c23a;
  color: #ffffff;
  border-color: #67c23a;
  font-weight: 600;
}

.btn-success:hover:not(.btn-disabled):not(.btn-loading) {
  background: #85ce61;
  border-color: #85ce61;
}

.btn-warning {
  background: #e6a23c;
  color: #ffffff;
  border-color: #e6a23c;
  font-weight: 600;
}

.btn-warning:hover:not(.btn-disabled):not(.btn-loading) {
  background: #ebb563;
  border-color: #ebb563;
}

.btn-danger {
  background: #f56c6c;
  color: #ffffff;
  border-color: #f56c6c;
  font-weight: 600;
}

.btn-danger:hover:not(.btn-disabled):not(.btn-loading) {
  background: #f78989;
  border-color: #f78989;
}

.btn-default {
  background: white;
  color: #606266;
  border-color: #dcdfe6;
}

.btn-default:hover:not(.btn-disabled):not(.btn-loading) {
  color: #409eff;
  border-color: #c6e2ff;
  background: #ecf5ff;
}

.btn-text {
  background: transparent;
  color: #409eff;
  border-color: transparent;
}

.btn-text:hover:not(.btn-disabled):not(.btn-loading) {
  color: #66b1ff;
  background: rgba(64, 158, 255, 0.1);
}

.btn-secondary {
  background: #f5f7fa;
  color: #606266;
  border-color: #dcdfe6;
}

.btn-secondary:hover:not(.btn-disabled):not(.btn-loading) {
  color: #409eff;
  border-color: #c6e2ff;
  background: #ecf5ff;
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

/* 深色主题支持 */
[data-theme='dark'] .btn-default {
  background: #262727;
  color: #cfd3dc;
  border-color: #414243;
}

[data-theme='dark'] .btn-default:hover:not(.btn-disabled):not(.btn-loading) {
  color: #409eff;
  border-color: #337ecc;
  background: #1a1d1f;
}

[data-theme='dark'] .btn-text {
  color: #409eff;
}

[data-theme='dark'] .btn-text:hover:not(.btn-disabled):not(.btn-loading) {
  color: #66b1ff;
  background: rgba(64, 158, 255, 0.1);
}

[data-theme='dark'] .btn-secondary {
  background: #262727;
  color: #cfd3dc;
  border-color: #414243;
}

[data-theme='dark'] .btn-secondary:hover:not(.btn-disabled):not(.btn-loading) {
  color: #409eff;
  border-color: #337ecc;
  background: #1a1d1f;
}
</style>
