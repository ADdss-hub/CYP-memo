/**
 * 富文本展示净化（清单 4.1）：去脚本/嵌入/事件处理与 javascript: URL。
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

const BLOCKED_TAGS = new Set([
  'SCRIPT',
  'IFRAME',
  'OBJECT',
  'EMBED',
  'LINK',
  'META',
  'BASE',
  'FORM',
  'SVG',
  'MATH',
  'TEMPLATE',
  'NOSCRIPT',
  'FRAME',
  'FRAMESET',
])

function scrubElement(el: Element): void {
  const children = Array.from(el.children)
  for (const child of children) {
    if (BLOCKED_TAGS.has(child.tagName)) {
      child.remove()
      continue
    }
    for (const attr of Array.from(child.attributes)) {
      const name = attr.name.toLowerCase()
      const value = attr.value || ''
      if (name.startsWith('on') || name === 'srcdoc' || name === 'xlink:href') {
        child.removeAttribute(attr.name)
        continue
      }
      if (
        (name === 'href' || name === 'src' || name === 'action' || name === 'formaction') &&
        /^\s*(javascript|data|vbscript):/i.test(value)
      ) {
        child.removeAttribute(attr.name)
      }
    }
    scrubElement(child)
  }
}

export function sanitizeHtml(dirty: string): string {
  if (typeof dirty !== 'string' || !dirty) return ''
  if (typeof DOMParser === 'undefined') {
    return dirty.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
  }
  const doc = new DOMParser().parseFromString(`<div id="cyp-html-root">${dirty}</div>`, 'text/html')
  const root = doc.getElementById('cyp-html-root')
  if (!root) return ''
  scrubElement(root)
  return root.innerHTML
}
