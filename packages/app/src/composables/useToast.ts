/**
 * Toast 提示 Composable
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { createApp, h } from 'vue'
import Toast, { type ToastProps } from '../components/Toast.vue'

export function useToast() {
  const show = (options: ToastProps) => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    const app = createApp({
      render() {
        return h(Toast, {
          ...options,
          onClose: () => {
            options.onClose?.()
            setTimeout(() => {
              app.unmount()
              document.body.removeChild(container)
            }, 300)
          },
        })
      },
    })

    app.mount(container)
  }

  const success = (message: string, title?: string) => {
    show({ type: 'success', message, title })
  }

  const error = (message: string, title?: string) => {
    show({ type: 'error', message, title })
  }

  const warning = (message: string, title?: string) => {
    show({ type: 'warning', message, title })
  }

  const info = (message: string, title?: string) => {
    show({ type: 'info', message, title })
  }

  return {
    show,
    success,
    error,
    warning,
    info,
  }
}
