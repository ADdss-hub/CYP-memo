<!--
  备忘录编辑器组件 (基于 TipTap)
  Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
-->
<template>
  <div :class="['memo-editor', { fullscreen: isFullscreen }]">
    <!-- 工具栏 -->
    <div class="editor-toolbar">
      <div class="toolbar-group">
        <!-- 文本格式 -->
        <button
          class="toolbar-btn"
          :class="{ active: editor?.isActive('bold') }"
          title="加粗 (Ctrl+B)"
          @click="editor?.chain().focus().toggleBold().run()"
        >
          <strong>B</strong>
        </button>
        <button
          class="toolbar-btn"
          :class="{ active: editor?.isActive('italic') }"
          title="斜体 (Ctrl+I)"
          @click="editor?.chain().focus().toggleItalic().run()"
        >
          <em>I</em>
        </button>
        <button
          class="toolbar-btn"
          :class="{ active: editor?.isActive('underline') }"
          title="下划线 (Ctrl+U)"
          @click="editor?.chain().focus().toggleUnderline().run()"
        >
          <u>U</u>
        </button>
        <button
          class="toolbar-btn"
          :class="{ active: editor?.isActive('strike') }"
          title="删除线"
          @click="editor?.chain().focus().toggleStrike().run()"
        >
          <s>S</s>
        </button>
      </div>

      <div class="toolbar-divider" />

      <div class="toolbar-group">
        <!-- 标题 -->
        <select class="toolbar-select" :value="getHeadingLevel()" @change="setHeading($event)">
          <option value="0">正文</option>
          <option value="1">标题 1</option>
          <option value="2">标题 2</option>
          <option value="3">标题 3</option>
          <option value="4">标题 4</option>
          <option value="5">标题 5</option>
          <option value="6">标题 6</option>
        </select>
      </div>

      <div class="toolbar-divider" />

      <div class="toolbar-group">
        <!-- 列表 -->
        <button
          class="toolbar-btn"
          :class="{ active: editor?.isActive('bulletList') }"
          title="无序列表"
          @click="editor?.chain().focus().toggleBulletList().run()"
        >
          ☰
        </button>
        <button
          class="toolbar-btn"
          :class="{ active: editor?.isActive('orderedList') }"
          title="有序列表"
          @click="editor?.chain().focus().toggleOrderedList().run()"
        >
          ≡
        </button>
      </div>

      <div class="toolbar-divider" />

      <div class="toolbar-group">
        <!-- 插入 -->
        <button class="toolbar-btn" title="插入链接" @click="insertLink">🔗</button>
        <button class="toolbar-btn" title="插入代码块" @click="insertCodeBlock">&lt;/&gt;</button>
        <button
          class="toolbar-btn"
          :class="{ active: editor?.isActive('blockquote') }"
          title="引用块"
          @click="editor?.chain().focus().toggleBlockquote().run()"
        >
          "
        </button>
        <button class="toolbar-btn" title="插入表格" @click="insertTable">⊞</button>
        <button class="toolbar-btn" title="插入表情" @click="showEmojiPicker">😊</button>
        <button class="toolbar-btn" title="插入文件" @click="openFilePicker">📎</button>
      </div>

      <div class="toolbar-spacer" />

      <div class="toolbar-group">
        <!-- 字数统计 -->
        <span class="word-count">{{ wordCount }} 字</span>
      </div>

      <div class="toolbar-divider" />

      <div class="toolbar-group">
        <!-- 全屏 -->
        <button class="toolbar-btn" title="全屏模式" @click="toggleFullscreen">
          {{ isFullscreen ? '⊡' : '⊞' }}
        </button>
      </div>
    </div>

    <!-- 编辑器内容区 -->
    <div class="editor-container">
      <div class="editor-content">
        <editor-content :editor="editor" />
      </div>
      <div v-if="showPreview" class="editor-preview">
        <div class="preview-content" v-html="previewHtml" />
      </div>
    </div>

    <!-- 表情选择器 -->
    <div v-if="emojiPickerVisible" class="emoji-picker">
      <div class="emoji-grid">
        <button v-for="emoji in emojis" :key="emoji" class="emoji-btn" @click="insertEmoji(emoji)">
          {{ emoji }}
        </button>
      </div>
    </div>

    <!-- 文件输入 -->
    <input ref="fileInput" type="file" style="display: none" @change="handleFileSelect" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import Underline from '@tiptap/extension-underline'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { common, createLowlight } from 'lowlight'

const lowlight = createLowlight(common)

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
const showPreview = ref(false)
const emojiPickerVisible = ref(false)
const fileInput = ref<HTMLInputElement>()
let autosaveTimer: number | null = null

// 常用表情
const emojis = [
  '😊',
  '😂',
  '❤️',
  '👍',
  '👎',
  '🎉',
  '🔥',
  '✨',
  '💡',
  '📝',
  '✅',
  '❌',
  '⚠️',
  '💪',
  '🙏',
  '👏',
  '🎯',
  '🚀',
  '⭐',
  '💯',
]

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
})

// 字数统计
const wordCount = computed(() => {
  if (!editor.value) return 0
  const text = editor.value.getText()
  return text.length
})

// 预览 HTML
const previewHtml = computed(() => {
  return editor.value?.getHTML() || ''
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

// 插入链接
const insertLink = () => {
  const url = prompt('请输入链接地址:')
  if (url) {
    editor.value?.chain().focus().setLink({ href: url }).run()
  }
}

// 插入代码块
const insertCodeBlock = () => {
  editor.value?.chain().focus().toggleCodeBlock().run()
}

// 插入表格
const insertTable = () => {
  editor.value?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
}

// 显示表情选择器
const showEmojiPicker = () => {
  emojiPickerVisible.value = !emojiPickerVisible.value
}

// 插入表情
const insertEmoji = (emoji: string) => {
  editor.value?.chain().focus().insertContent(emoji).run()
  emojiPickerVisible.value = false
}

// 打开文件选择器
const openFilePicker = () => {
  fileInput.value?.click()
}

// 处理文件选择
const handleFileSelect = async (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  // 如果是图片，直接插入预览
  if (file.type.startsWith('image/')) {
    const reader = new FileReader()
    reader.onload = (e) => {
      const url = e.target?.result as string
      editor.value?.chain().focus().setImage({ src: url }).run()
    }
    reader.readAsDataURL(file)
  }
  // 如果是文本文件，读取内容插入
  else if (file.type.startsWith('text/')) {
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      editor.value?.chain().focus().insertContent(text).run()
    }
    reader.readAsText(file)
  }

  // 触发文件上传事件
  emit('file-upload', file)

  // 清空输入
  target.value = ''
}

// 切换全屏
const toggleFullscreen = () => {
  isFullscreen.value = !isFullscreen.value
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
  // Esc 退出全屏
  if (event.key === 'Escape' && isFullscreen.value) {
    isFullscreen.value = false
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeydown)
  if (autosaveTimer) {
    clearTimeout(autosaveTimer)
  }
  editor.value?.destroy()
})
</script>

<style scoped>
.memo-editor {
  display: flex;
  flex-direction: column;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  background: white;
  overflow: hidden;
}

.memo-editor.fullscreen {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 9999;
  border-radius: 0;
}

.editor-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  border-bottom: 1px solid #e4e7ed;
  flex-wrap: wrap;
  background: #fafafa;
}

.toolbar-group {
  display: flex;
  align-items: center;
  gap: 4px;
}

.toolbar-btn {
  min-width: 32px;
  min-height: 32px;
  padding: 6px 8px;
  background: white;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.toolbar-btn:hover {
  background: #ecf5ff;
  border-color: #409eff;
  color: #409eff;
}

.toolbar-btn.active {
  background: #409eff;
  border-color: #409eff;
  color: white;
}

.toolbar-select {
  height: 32px;
  padding: 0 8px;
  background: white;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
}

.toolbar-divider {
  width: 1px;
  height: 24px;
  background: #e4e7ed;
}

.toolbar-spacer {
  flex: 1;
}

.word-count {
  font-size: 12px;
  color: #909399;
  padding: 0 8px;
}

.editor-container {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.editor-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.editor-preview {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  border-left: 1px solid #e4e7ed;
  background: #fafafa;
}

.preview-content {
  line-height: 1.8;
}

.emoji-picker {
  position: absolute;
  top: 60px;
  right: 20px;
  background: white;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  padding: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
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
  background: #f5f7fa;
  transform: scale(1.2);
}

/* TipTap 编辑器样式 */
:deep(.ProseMirror) {
  outline: none;
  min-height: 300px;
}

:deep(.ProseMirror p.is-editor-empty:first-child::before) {
  content: attr(data-placeholder);
  float: left;
  color: #adb5bd;
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
  background: #f5f7fa;
  padding: 2px 6px;
  border-radius: 4px;
  font-family: 'Courier New', monospace;
}

:deep(.ProseMirror pre) {
  background: #282c34;
  color: #abb2bf;
  padding: 16px;
  border-radius: 8px;
  overflow-x: auto;
}

:deep(.ProseMirror blockquote) {
  border-left: 4px solid #409eff;
  padding-left: 16px;
  margin: 16px 0;
  color: #606266;
}

:deep(.ProseMirror img) {
  max-width: 100%;
  height: auto;
  border-radius: 8px;
}

:deep(.ProseMirror table) {
  border-collapse: collapse;
  width: 100%;
  margin: 16px 0;
}

:deep(.ProseMirror th),
:deep(.ProseMirror td) {
  border: 1px solid #e4e7ed;
  padding: 8px 12px;
}

:deep(.ProseMirror th) {
  background: #f5f7fa;
  font-weight: 600;
}

/* 深色主题支持 */
[data-theme='dark'] .memo-editor {
  background: #1d1e1f;
  border-color: #414243;
}

[data-theme='dark'] .editor-toolbar {
  background: #262727;
  border-bottom-color: #414243;
}

[data-theme='dark'] .toolbar-btn {
  background: #1d1e1f;
  border-color: #414243;
  color: #cfd3dc;
}

[data-theme='dark'] .toolbar-btn:hover {
  background: #337ecc;
  border-color: #409eff;
}

[data-theme='dark'] .toolbar-select {
  background: #1d1e1f;
  border-color: #414243;
  color: #cfd3dc;
}

[data-theme='dark'] .editor-preview {
  background: #262727;
  border-left-color: #414243;
}

[data-theme='dark'] .emoji-picker {
  background: #1d1e1f;
  border-color: #414243;
}

[data-theme='dark'] :deep(.ProseMirror) {
  color: #cfd3dc;
}

[data-theme='dark'] :deep(.ProseMirror code) {
  background: #262727;
}

[data-theme='dark'] :deep(.ProseMirror th) {
  background: #262727;
}

[data-theme='dark'] :deep(.ProseMirror th),
[data-theme='dark'] :deep(.ProseMirror td) {
  border-color: #414243;
}
</style>
