/**
 * 简易焦点陷阱：模态打开时 Tab 循环；Esc 回调；关闭后恢复焦点
 */
import { watch, nextTick, type Ref, onUnmounted } from 'vue'

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'

export function useFocusTrap(
  active: Ref<boolean>,
  containerRef: Ref<HTMLElement | null | undefined>,
  options?: { onEscape?: () => void; initialFocus?: boolean }
) {
  let previous: HTMLElement | null = null

  const onKeydown = (e: KeyboardEvent) => {
    if (!active.value) return
    if (e.key === 'Escape') {
      e.stopPropagation()
      options?.onEscape?.()
      return
    }
    if (e.key !== 'Tab') return
    const root = containerRef.value
    if (!root) return
    const nodes = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => !el.hasAttribute('disabled') && el.offsetParent !== null
    )
    if (nodes.length === 0) {
      e.preventDefault()
      return
    }
    const first = nodes[0]
    const last = nodes[nodes.length - 1]
    const current = document.activeElement as HTMLElement | null
    if (e.shiftKey) {
      if (current === first || !root.contains(current)) {
        e.preventDefault()
        last.focus()
      }
    } else if (current === last || !root.contains(current)) {
      e.preventDefault()
      first.focus()
    }
  }

  watch(
    active,
    async (isActive) => {
      if (isActive) {
        previous = document.activeElement as HTMLElement | null
        document.addEventListener('keydown', onKeydown, true)
        if (options?.initialFocus !== false) {
          await nextTick()
          const root = containerRef.value
          if (!root) return
          const first = root.querySelector<HTMLElement>(FOCUSABLE)
          ;(first || root).focus()
        }
      } else {
        document.removeEventListener('keydown', onKeydown, true)
        if (previous && typeof previous.focus === 'function') {
          previous.focus()
        }
        previous = null
      }
    },
    { immediate: true }
  )

  onUnmounted(() => {
    document.removeEventListener('keydown', onKeydown, true)
  })
}
