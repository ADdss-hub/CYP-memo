# CYP-memo 通用组件

本目录包含 CYP-memo 应用的所有通用组件。

## 基础组件

### Toast (提示组件)

用于显示临时提示消息。

**使用方式:**

```typescript
import { useToast } from '@/composables/useToast'

const toast = useToast()

// 成功提示
toast.success('操作成功')

// 错误提示
toast.error('操作失败', '错误标题')

// 警告提示
toast.warning('请注意')

// 信息提示
toast.info('提示信息')
```

**特性:**
- 支持 4 种类型：success, error, warning, info
- 自动关闭（默认 3 秒）
- 可手动关闭
- 支持自定义标题和消息

### Modal (对话框组件)

用于显示模态对话框。

**使用方式:**

```vue
<template>
  <Modal
    v-model="visible"
    title="确认删除"
    @confirm="handleConfirm"
    @cancel="handleCancel"
  >
    <p>确定要删除这条备忘录吗？</p>
  </Modal>
</template>

<script setup>
import { ref } from 'vue'
import { Modal } from '@/components'

const visible = ref(false)

const handleConfirm = () => {
  // 处理确认
  visible.value = false
}

const handleCancel = () => {
  // 处理取消
}
</script>
```

**特性:**
- 支持自定义标题和内容
- 支持自定义底部按钮
- 点击遮罩层关闭
- 支持关闭按钮

### Loading (加载组件)

用于显示加载状态。

**使用方式:**

```vue
<template>
  <!-- 全屏加载 -->
  <Loading :visible="loading" text="加载中..." fullscreen />

  <!-- 内联加载 -->
  <Loading text="加载中..." size="24px" />
</template>

<script setup>
import { ref } from 'vue'
import { Loading } from '@/components'

const loading = ref(true)
</script>
```

**特性:**
- 支持全屏和内联两种模式
- 支持自定义加载文本
- 支持自定义大小

### Button (按钮组件)

统一样式的按钮组件。

**使用方式:**

```vue
<template>
  <Button type="primary" @click="handleClick">
    主要按钮
  </Button>

  <Button type="success" size="large">
    成功按钮
  </Button>

  <Button type="danger" :loading="loading">
    危险按钮
  </Button>

  <Button :disabled="true">
    禁用按钮
  </Button>
</template>

<script setup>
import { Button } from '@/components'
</script>
```

**特性:**
- 5 种类型：primary, success, warning, danger, default
- 3 种尺寸：small, medium, large
- 支持加载状态
- 支持禁用状态
- 支持图标
- 最小触摸尺寸 44x44px

## 布局组件

### AppLayout (主布局)

应用的主布局组件，包含 Header、Sidebar、Content 和 Footer。

**使用方式:**

```vue
<template>
  <AppLayout>
    <template #header-center>
      <input type="search" placeholder="搜索..." />
    </template>

    <template #header-right>
      <Button>设置</Button>
    </template>

    <template #sidebar>
      <nav>
        <router-link to="/memos">备忘录</router-link>
        <router-link to="/statistics">统计</router-link>
      </nav>
    </template>

    <!-- 主内容 -->
    <div>
      <router-view />
    </div>
  </AppLayout>
</template>

<script setup>
import { AppLayout, Button } from '@/components'
</script>
```

**特性:**
- 响应式设计
- 可折叠侧边栏
- 固定头部和底部
- 移动端自动适配

### AppFooter (底部信息栏)

显示版本号、作者和版权信息。

**特性:**
- 自动显示版本信息
- 固定在底部
- 响应式设计

### MobileBottomNav (移动端底部导航)

移动端专用的底部导航栏。

**特性:**
- 仅在移动设备显示
- 固定在底部
- 支持路由高亮

## 编辑器组件

### MemoEditor (备忘录编辑器)

基于 TipTap 的富文本编辑器。

**使用方式:**

```vue
<template>
  <MemoEditor
    v-model="content"
    placeholder="开始写点什么..."
    :autosave="true"
    @autosave="handleAutosave"
    @file-upload="handleFileUpload"
  />
</template>

<script setup>
import { ref } from 'vue'
import { MemoEditor } from '@/components'

const content = ref('')

const handleAutosave = (html: string) => {
  console.log('自动保存:', html)
}

const handleFileUpload = (file: File) => {
  console.log('文件上传:', file)
}
</script>
```

**特性:**
- 富文本编辑（加粗、斜体、下划线、删除线）
- 标题级别（H1-H6）
- 列表（有序、无序）
- 插入链接
- 插入代码块（支持语法高亮）
- 插入引用块
- 插入表格
- 插入表情符号
- 插入文件（图片预览、文本内容插入）
- 字数统计
- 全屏模式
- 快捷键支持
- 自动保存
- Markdown 支持

**快捷键:**
- `Ctrl+B` / `Cmd+B`: 加粗
- `Ctrl+I` / `Cmd+I`: 斜体
- `Ctrl+U` / `Cmd+U`: 下划线
- `Ctrl+S` / `Cmd+S`: 保存
- `Esc`: 退出全屏

## 样式说明

所有组件都支持深色主题，会根据系统偏好自动切换。

## 开发指南

### 添加新组件

1. 在 `src/components` 目录创建新的 `.vue` 文件
2. 在 `src/components/index.ts` 中导出组件
3. 在本 README 中添加文档
4. 在 `tests/` 目录添加测试

### 组件规范

- 所有组件必须包含 TypeScript 类型定义
- 所有组件必须支持深色主题
- 交互元素最小尺寸 44x44px（触摸友好）
- 使用中文作为默认语言
- 遵循 Element Plus 的设计规范

## 版权

Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
