<!--
  Modal 对话框组件
  Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
-->
<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div v-if="modelValue" class="modal-overlay" @click="handleOverlayClick">
        <Transition name="modal-slide">
          <div v-if="modelValue" class="modal-container" :style="{ width: width }" @click.stop>
            <div class="modal-header">
              <h3 class="modal-title">
                {{ title }}
              </h3>
              <button v-if="closable" class="modal-close" @click="handleClose">
                <Close />
              </button>
            </div>
            <div class="modal-body">
              <slot />
            </div>
            <div v-if="showFooter" class="modal-footer">
              <slot name="footer">
                <Button v-if="showCancel" type="default" @click="handleCancel">
                  {{ cancelText }}
                </Button>
                <Button v-if="showConfirm" type="primary" @click="handleConfirm">
                  {{ confirmText }}
                </Button>
              </slot>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { Close } from '@element-plus/icons-vue'
import Button from './Button.vue'

export interface ModalProps {
  modelValue: boolean
  title?: string
  width?: string
  closable?: boolean
  closeOnClickOverlay?: boolean
  showFooter?: boolean
  showCancel?: boolean
  showConfirm?: boolean
  cancelText?: string
  confirmText?: string
}

const props = withDefaults(defineProps<ModalProps>(), {
  title: '提示',
  width: '500px',
  closable: true,
  closeOnClickOverlay: true,
  showFooter: true,
  showCancel: true,
  showConfirm: true,
  cancelText: '取消',
  confirmText: '确定',
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  close: []
  cancel: []
  confirm: []
}>()

const handleClose = () => {
  emit('update:modelValue', false)
  emit('close')
}

const handleOverlayClick = () => {
  if (props.closeOnClickOverlay) {
    handleClose()
  }
}

const handleCancel = () => {
  emit('cancel')
  handleClose()
}

const handleConfirm = () => {
  emit('confirm')
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9998;
}

.modal-container {
  background: white;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  max-width: 90vw;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
}

.modal-header {
  padding: 20px 24px;
  border-bottom: 1px solid #e4e7ed;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.modal-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #303133;
}

.modal-close {
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  font-size: 18px;
  color: #909399;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.2s;
}

.modal-close:hover {
  background: #f5f7fa;
  color: #606266;
}

.modal-body {
  padding: 24px;
  flex: 1;
  overflow-y: auto;
  color: #606266;
  font-size: 14px;
  line-height: 1.6;
}

.modal-footer {
  padding: 16px 24px;
  border-top: 1px solid #e4e7ed;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
}

.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.3s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.modal-slide-enter-active,
.modal-slide-leave-active {
  transition: all 0.3s ease;
}

.modal-slide-enter-from {
  opacity: 0;
  transform: scale(0.9) translateY(-20px);
}

.modal-slide-leave-to {
  opacity: 0;
  transform: scale(0.9) translateY(20px);
}

/* 深色主题支持 */
[data-theme='dark'] .modal-container {
  background: #1d1e1f;
}

[data-theme='dark'] .modal-header {
  border-bottom-color: #414243;
}

[data-theme='dark'] .modal-title {
  color: #e5eaf3;
}

[data-theme='dark'] .modal-close:hover {
  background: #262727;
  color: #cfd3dc;
}

[data-theme='dark'] .modal-body {
  color: #cfd3dc;
}

[data-theme='dark'] .modal-footer {
  border-top-color: #414243;
}
</style>
