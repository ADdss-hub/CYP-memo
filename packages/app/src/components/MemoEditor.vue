<!--
  备忘录编辑器组件 (基于 TipTap)
  Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
-->
<template>
  <div class="memo-editor-host" :class="{ 'is-fullscreen': isFullscreen }">
  <Teleport to="body" :disabled="!(isFullscreen && cssFallbackFs)">
  <div
    ref="editorRoot"
    :class="['memo-editor', { fullscreen: isFullscreen }]"
    :role="isFullscreen ? 'dialog' : 'region'"
    :aria-modal="isFullscreen ? true : undefined"
    :aria-label="isFullscreen ? '备忘录全屏编辑' : '备忘录编辑器'"
    :tabindex="isFullscreen ? -1 : undefined"
  >
    <div class="sr-only" role="status" aria-live="polite">{{ fsStatusText }}</div>
    <!-- 工具栏：分段连体 · 双行定版 -->
    <div class="editor-toolbar" role="toolbar" aria-label="编辑工具栏">
      <div class="toolbar-row toolbar-row-primary">
        <div class="toolbar-group" role="group" aria-label="历史">
          <button
            type="button"
            class="toolbar-btn"
            title="撤销 (Ctrl+Z)"
            aria-label="撤销"
            :disabled="!editor?.can().undo()"
            @click="editor?.chain().focus().undo().run()"
          >
            撤销
          </button>
          <button
            type="button"
            class="toolbar-btn"
            title="重做 (Ctrl+Y)"
            aria-label="重做"
            :disabled="!editor?.can().redo()"
            @click="editor?.chain().focus().redo().run()"
          >
            重做
          </button>
        </div>

        <div class="toolbar-group" role="group" aria-label="字符">
          <button
            type="button"
            class="toolbar-btn"
            :class="{ active: editor?.isActive('bold') }"
            title="加粗 (Ctrl+B)"
            aria-label="加粗"
            @click="editor?.chain().focus().toggleBold().run()"
          >
            <strong>粗</strong>
          </button>
          <button
            type="button"
            class="toolbar-btn"
            :class="{ active: editor?.isActive('italic') }"
            title="斜体 (Ctrl+I)"
            aria-label="斜体"
            @click="editor?.chain().focus().toggleItalic().run()"
          >
            <em>斜</em>
          </button>
          <button
            type="button"
            class="toolbar-btn"
            :class="{ active: editor?.isActive('underline') }"
            title="下划线 (Ctrl+U)"
            aria-label="下划线"
            @click="editor?.chain().focus().toggleUnderline().run()"
          >
            <u>下</u>
          </button>
          <button
            type="button"
            class="toolbar-btn"
            :class="{ active: editor?.isActive('strike') }"
            title="删除线"
            aria-label="删除线"
            @click="editor?.chain().focus().toggleStrike().run()"
          >
            <s>删</s>
          </button>
          <button
            type="button"
            class="toolbar-btn"
            :class="{ active: editor?.isActive('code') }"
            title="行内代码"
            aria-label="行内代码"
            @click="editor?.chain().focus().toggleCode().run()"
          >
            代码
          </button>
          <button
            type="button"
            class="toolbar-btn"
            :class="{ active: editor?.isActive('superscript') }"
            title="上标"
            aria-label="上标"
            @click="toggleSuperscript"
          >
            上标
          </button>
          <button
            type="button"
            class="toolbar-btn"
            :class="{ active: editor?.isActive('subscript') }"
            title="下标"
            aria-label="下标"
            @click="toggleSubscript"
          >
            下标
          </button>
          <button
            type="button"
            class="toolbar-btn"
            title="清除格式"
            aria-label="清除格式"
            @click="clearFormatting"
          >
            清除
          </button>
        </div>

        <div class="toolbar-group toolbar-group-select" role="group" aria-label="段落">
          <select
            class="toolbar-select toolbar-select-heading"
            :value="getHeadingLevel()"
            aria-label="标题级别"
            @change="setHeading($event)"
          >
            <option value="0">正文</option>
            <option value="1">标题 1</option>
            <option value="2">标题 2</option>
            <option value="3">标题 3</option>
            <option value="4">标题 4</option>
            <option value="5">标题 5</option>
            <option value="6">标题 6</option>
          </select>
        </div>

        <div class="toolbar-group" role="group" aria-label="对齐">
          <button
            type="button"
            class="toolbar-btn"
            :class="{ active: editor?.isActive({ textAlign: 'left' }) }"
            title="左对齐"
            aria-label="左对齐"
            @click="editor?.chain().focus().setTextAlign('left').run()"
          >
            左
          </button>
          <button
            type="button"
            class="toolbar-btn"
            :class="{ active: editor?.isActive({ textAlign: 'center' }) }"
            title="居中"
            aria-label="居中对齐"
            @click="editor?.chain().focus().setTextAlign('center').run()"
          >
            中
          </button>
          <button
            type="button"
            class="toolbar-btn"
            :class="{ active: editor?.isActive({ textAlign: 'right' }) }"
            title="右对齐"
            aria-label="右对齐"
            @click="editor?.chain().focus().setTextAlign('right').run()"
          >
            右
          </button>
          <button
            type="button"
            class="toolbar-btn"
            :class="{ active: editor?.isActive({ textAlign: 'justify' }) }"
            title="两端对齐"
            aria-label="两端对齐"
            @click="editor?.chain().focus().setTextAlign('justify').run()"
          >
            齐
          </button>
        </div>

        <div class="toolbar-meta">
          <span class="word-count" aria-live="polite">{{ wordCount }} 字</span>
          <button
            ref="fullscreenBtn"
            type="button"
            class="toolbar-btn toolbar-btn-solo"
            :title="isFullscreen ? '退出全屏 (Esc)' : '全屏模式'"
            :aria-label="isFullscreen ? '退出全屏' : '进入全屏编辑'"
            :aria-pressed="isFullscreen"
            @click="toggleFullscreen"
          >
            {{ isFullscreen ? '退出全屏' : '全屏' }}
          </button>
        </div>
      </div>

      <div class="toolbar-row toolbar-row-secondary">
        <div class="toolbar-group" role="group" aria-label="列表">
          <button
            type="button"
            class="toolbar-btn"
            :class="{ active: editor?.isActive('bulletList') }"
            title="无序列表"
            aria-label="无序列表"
            @click="editor?.chain().focus().toggleBulletList().run()"
          >
            列表
          </button>
          <button
            type="button"
            class="toolbar-btn"
            :class="{ active: editor?.isActive('orderedList') }"
            title="有序列表"
            aria-label="有序列表"
            @click="editor?.chain().focus().toggleOrderedList().run()"
          >
            编号
          </button>
          <button
            type="button"
            class="toolbar-btn"
            :class="{ active: editor?.isActive('taskList') }"
            title="任务列表"
            aria-label="任务列表"
            @click="editor?.chain().focus().toggleTaskList().run()"
          >
            任务
          </button>
          <button
            type="button"
            class="toolbar-btn"
            :class="{ active: editor?.isActive('blockquote') }"
            title="引用块"
            aria-label="引用块"
            @click="editor?.chain().focus().toggleBlockquote().run()"
          >
            引用
          </button>
          <button
            type="button"
            class="toolbar-btn"
            title="分割线"
            aria-label="分割线"
            @click="editor?.chain().focus().setHorizontalRule().run()"
          >
            横线
          </button>
        </div>

        <div class="toolbar-group toolbar-group-select" role="group" aria-label="样式">
          <select
            class="toolbar-select toolbar-select-color"
            :value="currentTextColor"
            title="文字色"
            aria-label="文字色"
            @change="setTextColor($event)"
          >
            <option v-for="c in textColorPresets" :key="'tc-' + c.label" :value="c.value">
              {{ c.value === '' ? '文字色' : c.label }}
            </option>
          </select>
          <select
            class="toolbar-select toolbar-select-color"
            :value="currentHighlight"
            title="高亮"
            aria-label="高亮"
            @change="setHighlightColor($event)"
          >
            <option v-for="c in highlightPresets" :key="'hl-' + c.label" :value="c.value">
              {{ c.value === '' ? '高亮' : c.label }}
            </option>
          </select>
        </div>

        <div class="toolbar-group" role="group" aria-label="插入">
          <button type="button" class="toolbar-btn" title="插入链接" aria-label="插入链接" @click="insertLink">
            链接
          </button>
          <button
            type="button"
            class="toolbar-btn"
            title="插入代码块"
            aria-label="插入代码块"
            @click="insertCodeBlock"
          >
            代码块
          </button>
          <button type="button" class="toolbar-btn" title="插入表格" aria-label="插入表格" @click="insertTable">
            表格
          </button>
          <button
            type="button"
            class="toolbar-btn"
            title="插入文件"
            aria-label="插入文件"
            @click="openFilePicker"
          >
            文件
          </button>
        </div>
      </div>
    </div>
    <div v-if="tableActive" class="table-ops" role="toolbar" aria-label="表格操作">
      <span class="table-ops-label">表格</span>
      <button type="button" class="toolbar-btn" title="上方插入行" @click="runTable('addRowBefore')">上行</button>
      <button type="button" class="toolbar-btn" title="下方插入行" @click="runTable('addRowAfter')">下行</button>
      <button type="button" class="toolbar-btn" title="删除行" @click="runTable('deleteRow')">删行</button>
      <button type="button" class="toolbar-btn" title="左侧插入列" @click="runTable('addColumnBefore')">左列</button>
      <button type="button" class="toolbar-btn" title="右侧插入列" @click="runTable('addColumnAfter')">右列</button>
      <button type="button" class="toolbar-btn" title="删除列" @click="runTable('deleteColumn')">删列</button>
      <button type="button" class="toolbar-btn" title="删除表格" @click="runTable('deleteTable')">删表</button>
    </div>

    <!-- 编辑器内容区 -->
    <div class="editor-container">
      <div class="editor-content">
        <editor-content :editor="editor" />
      </div>
      <div v-if="showPreview" class="editor-preview">
        <div class="preview-content">{{ previewPlain }}</div>
      </div>
    </div>
    <!-- 任意格式；选中后确认是否解析到正文 -->
    <input
      ref="fileInput"
      type="file"
      accept="*/*"
      style="display: none"
      @change="handleFileSelect"
    />
    <Teleport to="body">
      <div
        v-if="showParseConfirm && pendingFile"
        class="file-parse-overlay"
        @click.self="cancelPendingFile"
      >
        <div
          class="file-parse-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="file-parse-title"
        >
          <h3 id="file-parse-title" class="file-parse-title">是否解析到正文</h3>
          <p class="file-parse-file">{{ pendingFile.name }}（{{ formatByteSize(pendingFile.size) }}）</p>
          <p class="file-parse-hint">
            选择「解析到正文」会把原文写入编辑器：文本保持原文字，表格保持单元格，图片保持图像。提不出文字时只加入文件库（支持全部格式）。
          </p>
          <div class="file-parse-actions">
            <Button type="primary" :loading="isParsing" @click="confirmParseIntoBody">解析到正文</Button>
            <Button type="default" :disabled="isParsing" @click="confirmAttachOnly">仅入库</Button>
            <Button type="text" :disabled="isParsing" @click="cancelPendingFile">取消</Button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
  </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import Underline from '@tiptap/extension-underline'
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import TextAlign from '@tiptap/extension-text-align'
import { TextStyle } from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import Highlight from '@tiptap/extension-highlight'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Subscript from '@tiptap/extension-subscript'
import Superscript from '@tiptap/extension-superscript'
import { common, createLowlight } from 'lowlight'
import Button from './Button.vue'
import { ElMessageBox } from 'element-plus'
import { formatByteSize, parseFileForBody, type BodyParseResult } from './fileBodyParse'

const lowlight = createLowlight(common)

const textColorPresets = [
  { label: '默认', value: '' },
  { label: '正文', value: 'var(--cyp-text)' },
  { label: '次要', value: 'var(--cyp-text-secondary)' },
  { label: '主色', value: 'var(--cyp-brand)' },
  { label: '成功', value: 'var(--cyp-success)' },
  { label: '警告', value: 'var(--cyp-warning)' },
  { label: '危险', value: 'var(--cyp-danger)' },
] as const

const highlightPresets = [
  { label: '无', value: '' },
  { label: '主色底', value: 'var(--cyp-brand-tint)' },
  { label: '警告底', value: 'rgba(230, 162, 60, 0.28)' },
  { label: '成功底', value: 'rgba(103, 194, 58, 0.28)' },
  { label: '危险底', value: 'rgba(245, 108, 108, 0.28)' },
] as const

export interface MemoEditorProps {
  modelValue: string
  placeholder?: string
  autosave?: boolean
  autosaveDelay?: number
}

const props = withDefaults(defineProps<MemoEditorProps>(), {
  placeholder: '开始写点什么...',
  autosave: true,
  autosaveDelay: 2000,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  autosave: [value: string]
  'file-upload': [file: File]
}>()

const isFullscreen = ref(false)
/** 浏览器 Fullscreen API 不可用或拒绝时，退回 CSS/Teleport 伪全屏 */
const cssFallbackFs = ref(false)
const fsStatusText = ref('')
const editorRoot = ref<HTMLElement | null>(null)
const fullscreenBtn = ref<HTMLButtonElement | null>(null)
const showPreview = ref(false)
const fileInput = ref<HTMLInputElement>()
const pendingFile = ref<File | null>(null)
const showParseConfirm = ref(false)
const isParsing = ref(false)
const tableActive = ref(false)
let autosaveTimer: number | null = null
let fsToggleBusy = false

type FullscreenCapableElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void
}

const getNativeFullscreenElement = (): Element | null =>
  document.fullscreenElement ||
  (document as Document & { webkitFullscreenElement?: Element | null }).webkitFullscreenElement ||
  null

const isNativeFullscreenEnabled = (): boolean =>
  !!(
    document.fullscreenEnabled ||
    (document as Document & { webkitFullscreenEnabled?: boolean }).webkitFullscreenEnabled
  )

const requestNativeFullscreen = async (el: FullscreenCapableElement): Promise<void> => {
  if (typeof el.requestFullscreen === 'function') {
    await el.requestFullscreen({ navigationUI: 'show' })
    return
  }
  if (typeof el.webkitRequestFullscreen === 'function') {
    await Promise.resolve(el.webkitRequestFullscreen())
    return
  }
  throw new Error('Fullscreen API unavailable')
}

const exitNativeFullscreen = async (): Promise<void> => {
  if (!getNativeFullscreenElement()) return
  if (typeof document.exitFullscreen === 'function') {
    await document.exitFullscreen()
    return
  }
  const webkitExit = (
    document as Document & { webkitExitFullscreen?: () => Promise<void> | void }
  ).webkitExitFullscreen
  if (typeof webkitExit === 'function') {
    await Promise.resolve(webkitExit.call(document))
  }
}

const announceFullscreen = (active: boolean) => {
  fsStatusText.value = active ? '已进入全屏编辑，按 Esc 可退出' : '已退出全屏编辑'
}

const focusFullscreenSurface = async () => {
  await nextTick()
  // 全屏对话面先承接焦点（符合 dialog 初始焦点）；避免 ProseMirror scrollIntoView 在无布局环境报错
  editorRoot.value?.focus({ preventScroll: true })
}

const syncTableActive = (current = editor.value) => {
  tableActive.value = !!current?.isActive('table')
}

// 表情选择器已移除（图标机检禁止 emoji 代图标）

// 初始化编辑器
const editor = useEditor({
  extensions: [
    StarterKit.configure({
      codeBlock: false, // 使用自定义代码块
    }),
    Placeholder.configure({
      placeholder: props.placeholder,
    }),
    Image.configure({
      inline: true,
      allowBase64: true,
    }),
    Link.configure({
      openOnClick: false,
      HTMLAttributes: {
        target: '_blank',
        rel: 'noopener noreferrer',
      },
    }),
    Underline,
    TextStyle,
    Color,
    Highlight.configure({ multicolor: true }),
    TextAlign.configure({
      types: ['heading', 'paragraph'],
    }),
    TaskList,
    TaskItem.configure({
      nested: true,
    }),
    Subscript,
    Superscript,
    Table.configure({ resizable: true, cellMinWidth: 48 }),
    TableRow,
    TableHeader,
    TableCell,
    CodeBlockLowlight.configure({
      lowlight,
    }),
  ],
  content: props.modelValue,
  editorProps: {
    attributes: {
      class: 'prose prose-sm max-w-none',
    },
  },
  onUpdate: ({ editor }) => {
    const html = editor.getHTML()
    emit('update:modelValue', html)

    syncTableActive(editor)

    // 自动保存
    if (props.autosave) {
      if (autosaveTimer) {
        clearTimeout(autosaveTimer)
      }
      autosaveTimer = window.setTimeout(() => {
        emit('autosave', html)
      }, props.autosaveDelay)
    }
  },
  onSelectionUpdate: ({ editor: current }) => {
    syncTableActive(current)
  },
})

const currentTextColor = computed(() => {
  const value = editor.value?.getAttributes('textStyle')?.color
  return typeof value === 'string' ? value : ''
})

const currentHighlight = computed(() => {
  if (!editor.value?.isActive('highlight')) return ''
  const value = editor.value.getAttributes('highlight')?.color
  return typeof value === 'string' ? value : highlightPresets[1]?.value || ''
})

// 字数统计
const wordCount = computed(() => {
  if (!editor.value) return 0
  const text = editor.value.getText()
  return text.length
})

// 预览纯文本（禁 HTML 注入）
const previewPlain = computed(() => {
  return editor.value?.getText() || ''
})

// 获取当前标题级别
const getHeadingLevel = () => {
  if (!editor.value) return '0'
  for (let level = 1; level <= 6; level++) {
    if (editor.value.isActive('heading', { level })) {
      return String(level)
    }
  }
  return '0'
}

// 设置标题
const setHeading = (event: Event) => {
  const level = parseInt((event.target as HTMLSelectElement).value)
  if (level === 0) {
    editor.value?.chain().focus().setParagraph().run()
  } else {
    editor.value
      ?.chain()
      .focus()
      .setHeading({ level: level as 1 | 2 | 3 | 4 | 5 | 6 })
      .run()
  }
}

const toggleSuperscript = () => {
  const current = editor.value
  if (!current) return
  current.chain().focus().unsetSubscript().toggleSuperscript().run()
}

const toggleSubscript = () => {
  const current = editor.value
  if (!current) return
  current.chain().focus().unsetSuperscript().toggleSubscript().run()
}

const clearFormatting = () => {
  editor.value
    ?.chain()
    .focus()
    .unsetAllMarks()
    .clearNodes()
    .setParagraph()
    .run()
}

const setTextColor = (event: Event) => {
  const value = (event.target as HTMLSelectElement).value
  if (!value) {
    editor.value?.chain().focus().unsetColor().run()
    return
  }
  editor.value?.chain().focus().setColor(value).run()
}

const setHighlightColor = (event: Event) => {
  const value = (event.target as HTMLSelectElement).value
  if (!value) {
    editor.value?.chain().focus().unsetHighlight().run()
    return
  }
  editor.value?.chain().focus().toggleHighlight({ color: value }).run()
}

// 插入链接
const insertLink = async () => {
  try {
    const { value } = await ElMessageBox.prompt('请输入链接地址:', '插入链接', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      inputPattern: /.+/,
      inputErrorMessage: '链接地址不能为空',
    })
    if (value) {
      editor.value?.chain().focus().setLink({ href: value }).run()
    }
  } catch {
    // 用户取消，不做处理
  }
}

// 插入代码块
const insertCodeBlock = () => {
  editor.value?.chain().focus().toggleCodeBlock().run()
}

// 插入表格
const insertTable = () => {
  editor.value?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
  syncTableActive()
}

const runTable = (
  command:
    | 'addRowBefore'
    | 'addRowAfter'
    | 'deleteRow'
    | 'addColumnBefore'
    | 'addColumnAfter'
    | 'deleteColumn'
    | 'deleteTable'
) => {
  const current = editor.value
  if (!current) return
  current.chain().focus()[command]().run()
  syncTableActive(current)
}

// 显示表情选择器

// 插入表情

const openFilePicker = () => {
  fileInput.value?.click()
}

const closeParseConfirm = () => {
  showParseConfirm.value = false
  pendingFile.value = null
  isParsing.value = false
}

const cancelPendingFile = () => {
  if (isParsing.value) return
  closeParseConfirm()
}

const insertPlainText = (text: string) => {
  const current = editor.value
  if (!current) return
  const normalized = text.replace(/\r\n/g, '\n').replace(/\u0000/g, '')
  const lines = normalized.split('\n')
  if (lines.length > 400 || normalized.length > 8000) {
    current
      .chain()
      .focus()
      .insertContent({
        type: 'codeBlock',
        content: normalized ? [{ type: 'text', text: normalized }] : [],
      })
      .run()
    return
  }
  current
    .chain()
    .focus()
    .insertContent(
      lines.map((line) =>
        line
          ? { type: 'paragraph', content: [{ type: 'text', text: line }] }
          : { type: 'paragraph' }
      )
    )
    .run()
}

const applyParsedBody = (result: BodyParseResult) => {
  if (result.kind === 'image') {
    editor.value?.chain().focus().setImage({ src: result.dataUrl, alt: result.alt }).run()
    return
  }
  if (result.kind === 'html') {
    editor.value?.chain().focus().insertContent(result.html).run()
    return
  }
  insertPlainText(result.text)
}

const handleFileSelect = (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  target.value = ''
  if (!file || isParsing.value) return
  pendingFile.value = file
  showParseConfirm.value = true
}

const confirmAttachOnly = () => {
  const file = pendingFile.value
  if (!file || isParsing.value) return
  emit('file-upload', file)
  closeParseConfirm()
}

const confirmParseIntoBody = async () => {
  const file = pendingFile.value
  if (!file || isParsing.value) return
  isParsing.value = true
  try {
    applyParsedBody(await parseFileForBody(file))
    emit('file-upload', file)
  } catch {
    insertPlainText(`「${file.name}」解析失败，已加入文件库。`)
    emit('file-upload', file)
  } finally {
    closeParseConfirm()
  }
}

const setBodyScrollLocked = (locked: boolean) => {
  document.body.style.overflow = locked ? 'hidden' : ''
}

const enterCssFallbackFullscreen = async () => {
  cssFallbackFs.value = true
  isFullscreen.value = true
  setBodyScrollLocked(true)
  announceFullscreen(true)
  await focusFullscreenSurface()
}

const exitCssFallbackFullscreen = async () => {
  cssFallbackFs.value = false
  isFullscreen.value = false
  setBodyScrollLocked(false)
  announceFullscreen(false)
  await nextTick()
  fullscreenBtn.value?.focus()
}

const enterFullscreen = async () => {
  const el = editorRoot.value
  if (!el) return

  if (isNativeFullscreenEnabled()) {
    try {
      await requestNativeFullscreen(el)
      // 状态以 fullscreenchange 为准；此处先同步，避免按钮态闪烁
      isFullscreen.value = true
      cssFallbackFs.value = false
      setBodyScrollLocked(false)
      announceFullscreen(true)
      await focusFullscreenSurface()
      return
    } catch {
      // 用户拒绝或环境不支持时走 CSS 回退
    }
  }
  await enterCssFallbackFullscreen()
}

const exitFullscreen = async () => {
  if (getNativeFullscreenElement()) {
    try {
      await exitNativeFullscreen()
    } catch {
      /* ignore */
    }
  }
  if (cssFallbackFs.value || isFullscreen.value) {
    await exitCssFallbackFullscreen()
  }
}

const toggleFullscreen = async () => {
  if (fsToggleBusy) return
  fsToggleBusy = true
  try {
    if (isFullscreen.value) {
      await exitFullscreen()
    } else {
      await enterFullscreen()
    }
  } finally {
    fsToggleBusy = false
  }
}

const handleFullscreenChange = () => {
  const nativeEl = getNativeFullscreenElement()
  if (nativeEl && nativeEl === editorRoot.value) {
    isFullscreen.value = true
    cssFallbackFs.value = false
    setBodyScrollLocked(false)
    return
  }
  // 浏览器 Esc / 系统退出原生全屏
  if (!cssFallbackFs.value && isFullscreen.value) {
    isFullscreen.value = false
    setBodyScrollLocked(false)
    announceFullscreen(false)
    void nextTick(() => fullscreenBtn.value?.focus())
  }
}

// 监听内容变化
watch(
  () => props.modelValue,
  (value) => {
    const isSame = editor.value?.getHTML() === value
    if (!isSame) {
      editor.value?.commands.setContent(value, false)
    }
  }
)

// 快捷键处理
const handleKeydown = (event: KeyboardEvent) => {
  // Ctrl/Cmd + S 保存
  if ((event.ctrlKey || event.metaKey) && event.key === 's') {
    event.preventDefault()
    emit('autosave', editor.value?.getHTML() || '')
  }
  // 仅 CSS 回退需要自管 Esc；原生全屏由浏览器处理
  if (event.key === 'Escape' && isFullscreen.value && cssFallbackFs.value) {
    event.preventDefault()
    void exitCssFallbackFullscreen()
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
  document.addEventListener('fullscreenchange', handleFullscreenChange)
  document.addEventListener('webkitfullscreenchange', handleFullscreenChange)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeydown)
  document.removeEventListener('fullscreenchange', handleFullscreenChange)
  document.removeEventListener('webkitfullscreenchange', handleFullscreenChange)
  if (getNativeFullscreenElement() === editorRoot.value) {
    void exitNativeFullscreen().catch(() => undefined)
  }
  setBodyScrollLocked(false)
  if (autosaveTimer) {
    clearTimeout(autosaveTimer)
  }
  editor.value?.destroy()
})
</script>

<style scoped>
.memo-editor-host {
  display: flex;
  flex-direction: column;
  flex: 1 1 0;
  min-height: 280px;
  width: 100%;
  min-width: 0;
}

.memo-editor-host.is-fullscreen {
  min-height: 280px;
}

.memo-editor {
  display: flex;
  flex-direction: column;
  flex: 1 1 0;
  min-height: 0;
  height: 100%;
  width: 100%;
  border: none;
  border-top: 1px solid var(--cyp-chrome-border);
  border-radius: 0;
  background: transparent;
  color: var(--cyp-text);
  overflow: hidden;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

/* 原生 :fullscreen + CSS 回退 .fullscreen 共用 */
.memo-editor:fullscreen,
.memo-editor:-webkit-full-screen,
.memo-editor.fullscreen {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100dvh;
  max-height: 100dvh;
  z-index: 10000;
  border: none;
  border-radius: 0;
  background: var(--cyp-chrome-bg-panel);
  color: var(--cyp-text);
  backdrop-filter: blur(var(--cyp-chrome-blur));
  -webkit-backdrop-filter: blur(var(--cyp-chrome-blur));
}

.memo-editor:fullscreen,
.memo-editor:-webkit-full-screen {
  position: static;
  width: 100%;
  height: 100%;
  max-height: none;
}

.editor-toolbar {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  width: 100%;
  min-width: 0;
  padding: 0.5rem 0.625rem;
  border-bottom: 1px solid var(--cyp-chrome-border);
  background: var(--cyp-chrome-bg-soft);
}

.toolbar-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}

.toolbar-row-primary {
  row-gap: 0.5rem;
}

.toolbar-row-secondary {
  padding-top: 0.125rem;
}

.toolbar-meta {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: nowrap;
  align-items: center;
  gap: 0.375rem;
  margin-left: auto;
}

.toolbar-group {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: stretch;
  height: 1.75rem;
  overflow: hidden;
  border: 1px solid var(--cyp-border);
  border-radius: 0.375rem;
  background: var(--cyp-bg-input);
}

.toolbar-group-select {
  gap: 0;
}

.toolbar-btn {
  box-sizing: border-box;
  min-width: 1.75rem;
  height: 100%;
  margin: 0;
  padding: 0 0.45rem;
  border: none;
  border-right: 1px solid var(--cyp-border);
  border-radius: 0;
  background: transparent;
  color: var(--cyp-text-secondary);
  cursor: pointer;
  font-family: var(--cyp-font-sans);
  font-size: 0.75rem;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
  transition: background 0.12s ease, color 0.12s ease;
}

.toolbar-group > .toolbar-btn:last-child,
.toolbar-group > .toolbar-select:last-child {
  border-right: none;
}

.toolbar-btn:hover:not(:disabled) {
  background: var(--cyp-brand-tint);
  color: var(--cyp-brand);
}

.toolbar-btn.active {
  background: var(--cyp-brand);
  color: #fff;
}

.toolbar-btn:disabled {
  opacity: 0.72;
  color: var(--cyp-text-muted);
  cursor: not-allowed;
}

.toolbar-btn-solo {
  height: 1.75rem;
  border: 1px solid var(--cyp-border);
  border-radius: 0.375rem;
  background: var(--cyp-bg-input);
  color: var(--cyp-text-secondary);
}

.toolbar-select {
  box-sizing: border-box;
  height: 100%;
  max-width: 5.25rem;
  margin: 0;
  padding: 0 0.35rem;
  border: none;
  border-right: 1px solid var(--cyp-border);
  border-radius: 0;
  background: transparent;
  color: var(--cyp-text-secondary);
  cursor: pointer;
  font-family: var(--cyp-font-sans);
  font-size: 0.75rem;
  outline: none;
}

.toolbar-select:hover,
.toolbar-select:focus {
  background: var(--cyp-brand-tint);
  color: var(--cyp-brand);
}

.toolbar-select-heading {
  max-width: 4.75rem;
}

.toolbar-select-color {
  max-width: 4.5rem;
}

.word-count {
  font-size: 0.75rem;
  color: var(--cyp-text-muted);
  padding: 0 0.15rem;
  white-space: nowrap;
  line-height: 1.75rem;
}

.table-ops {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--cyp-border);
  background: var(--cyp-bg-muted);
}

.table-ops-label {
  margin-right: 4px;
  font-size: 12px;
  color: var(--cyp-text-muted);
}

.editor-container {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.editor-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
}

.editor-content :deep(> *) {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 100%;
}

.editor-preview {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  border-left: 1px solid var(--cyp-chrome-border);
  background: var(--cyp-chrome-bg-soft);
}

.preview-content {
  line-height: 1.8;
}

.emoji-picker {
  position: absolute;
  top: 60px;
  right: 20px;
  background: var(--cyp-chrome-bg-panel);
  border: 1px solid var(--cyp-chrome-border);
  border-radius: 8px;
  padding: 12px;
  box-shadow: var(--cyp-chrome-shadow), 0 4px 12px rgba(0, 0, 0, 0.25);
  backdrop-filter: blur(var(--cyp-chrome-blur));
  -webkit-backdrop-filter: blur(var(--cyp-chrome-blur));
  z-index: 100;
}

.emoji-grid {
  display: grid;
  grid-template-columns: repeat(10, 1fr);
  gap: 4px;
}

.emoji-btn {
  width: 32px;
  height: 32px;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 20px;
  border-radius: 4px;
  transition: all 0.2s;
}

.emoji-btn:hover {
  background: var(--cyp-bg-muted);
  transform: scale(1.2);
}

/* TipTap 编辑器样式 */
:deep(.ProseMirror) {
  outline: none;
  min-height: 100%;
}

:deep(.ProseMirror p.is-editor-empty:first-child::before) {
  content: attr(data-placeholder);
  float: left;
  color: var(--cyp-text-muted);
  pointer-events: none;
  height: 0;
}

:deep(.ProseMirror h1) {
  font-size: 2em;
  font-weight: 700;
  margin: 0.67em 0;
}

:deep(.ProseMirror h2) {
  font-size: 1.5em;
  font-weight: 700;
  margin: 0.75em 0;
}

:deep(.ProseMirror h3) {
  font-size: 1.17em;
  font-weight: 700;
  margin: 0.83em 0;
}

:deep(.ProseMirror code) {
  background: var(--cyp-bg-muted);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: var(--cyp-font-mono);
}

:deep(.ProseMirror pre) {
  background: #282c34;
  color: #abb2bf;
  padding: 16px;
  border-radius: 8px;
  overflow-x: auto;
}

:deep(.ProseMirror blockquote) {
  border-left: 4px solid var(--cyp-brand);
  padding-left: 16px;
  margin: 16px 0;
  color: var(--cyp-text-secondary);
}

:deep(.ProseMirror img) {
  max-width: 100%;
  height: auto;
  border-radius: 8px;
}

:deep(.tableWrapper) {
  margin: 16px 0;
  overflow-x: auto;
}

:deep(.ProseMirror table) {
  border-collapse: collapse;
  table-layout: fixed;
  width: 100%;
  margin: 0;
  overflow: hidden;
}

:deep(.ProseMirror th),
:deep(.ProseMirror td) {
  position: relative;
  box-sizing: border-box;
  min-width: 3rem;
  border: 1px solid var(--cyp-border);
  padding: 8px 12px;
  vertical-align: top;
}

:deep(.ProseMirror th > *),
:deep(.ProseMirror td > *) {
  margin: 0;
}

:deep(.ProseMirror .selectedCell::after) {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 2;
  background: rgba(0, 153, 255, 0.14);
  pointer-events: none;
}

:deep(.column-resize-handle) {
  position: absolute;
  top: 0;
  right: -2px;
  bottom: -2px;
  z-index: 3;
  width: 4px;
  background: var(--cyp-brand);
  pointer-events: none;
}

:deep(.ProseMirror.resize-cursor) {
  cursor: col-resize;
}

:deep(.ProseMirror th) {
  background: var(--cyp-bg-muted);
  font-weight: 600;
}

:deep(.ProseMirror ul[data-type='taskList']) {
  list-style: none;
  padding-left: 0;
  margin: 12px 0;
}

:deep(.ProseMirror ul[data-type='taskList'] li) {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 6px 0;
}

:deep(.ProseMirror ul[data-type='taskList'] li > label) {
  flex-shrink: 0;
  margin-top: 0.2em;
}

:deep(.ProseMirror ul[data-type='taskList'] li > div) {
  flex: 1;
  min-width: 0;
}

:deep(.ProseMirror ul[data-type='taskList'] li[data-checked='true'] > div) {
  color: var(--cyp-text-muted);
  text-decoration: line-through;
}

:deep(.ProseMirror mark) {
  border-radius: 2px;
  padding: 0 2px;
  background: var(--cyp-brand-tint);
  color: inherit;
}

:deep(.ProseMirror hr) {
  border: none;
  border-top: 1px solid var(--cyp-border);
  margin: 20px 0;
}

:deep(.ProseMirror [style*='text-align: center']),
:deep(.ProseMirror [style*='text-align:center']) {
  text-align: center;
}

:deep(.ProseMirror [style*='text-align: right']),
:deep(.ProseMirror [style*='text-align:right']) {
  text-align: right;
}

:deep(.ProseMirror [style*='text-align: justify']),
:deep(.ProseMirror [style*='text-align:justify']) {
  text-align: justify;
}

:deep(.ProseMirror sub) {
  font-size: 0.75em;
  vertical-align: sub;
}

:deep(.ProseMirror sup) {
  font-size: 0.75em;
  vertical-align: super;
}

/* 深色主题支持 */
.file-parse-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  padding: 12px;
  box-sizing: border-box;
}

.file-parse-dialog {
  width: min(440px, 100%);
  max-height: calc(100dvh - 24px);
  overflow-y: auto;
  padding: 20px;
  border-radius: 8px;
  background: var(--cyp-chrome-bg-panel);
  border: 1px solid var(--cyp-chrome-border);
  color: var(--cyp-text);
  box-shadow: var(--cyp-chrome-shadow), 0 8px 24px rgba(0, 0, 0, 0.28);
  backdrop-filter: blur(var(--cyp-chrome-blur));
  -webkit-backdrop-filter: blur(var(--cyp-chrome-blur));
}

.file-parse-title {
  margin: 0 0 12px;
  font-size: 16px;
  font-weight: 600;
}

.file-parse-file {
  margin: 0 0 8px;
  font-size: 14px;
  word-break: break-all;
}

.file-parse-hint {
  margin: 0 0 16px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--cyp-text-secondary);
}

.file-parse-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

@media (max-width: 768px) {
  .toolbar-group {
    height: 2.75rem;
  }

  .toolbar-btn {
    min-width: 2.75rem;
    padding: 0 0.55rem;
    font-size: 0.8125rem;
  }

  .toolbar-btn-solo {
    height: 2.75rem;
    min-width: 2.75rem;
  }

  .editor-toolbar {
    max-height: none;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
}
</style>
