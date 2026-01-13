<!--
  备忘录数据管理界面
  Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
-->
<template>
  <AppLayout>
    <div class="memo-data-view">
      <div class="page-header">
        <Button type="text" @click="handleBack">
          <span class="back-icon">←</span> 返回
        </Button>
        <h1 class="page-title">备忘录数据管理</h1>
      </div>

      <!-- 导入备忘录 -->
      <section class="data-section">
        <h2 class="section-title">导入备忘录</h2>
        <el-card shadow="hover">
          <div class="import-area">
            <div class="import-info">
              <el-icon :size="48" color="#409eff">
                <Upload />
              </el-icon>
              <p class="info-text">支持导入 JSON、Excel (XLSX) 格式的备忘录数据</p>
              <p class="info-hint">请使用本系统导出的模板格式</p>
            </div>
            <div class="import-actions">
              <input
                ref="importFileInput"
                type="file"
                accept=".json,.xlsx,.xls"
                style="display: none"
                @change="handleImportFile"
              />
              <el-button type="primary" @click="triggerImportFile">
                <el-icon><Upload /></el-icon>
                选择文件导入
              </el-button>
              <el-button type="default" @click="showTemplateDialog = true">
                <el-icon><Download /></el-icon>
                下载导入模板
              </el-button>
            </div>
          </div>
        </el-card>
      </section>

      <!-- 待确认的导入数据 -->
      <section v-if="pendingImportMemos.length > 0" class="data-section">
        <h2 class="section-title">待确认导入数据 ({{ pendingImportMemos.length }})</h2>
        <el-card shadow="hover">
          <el-table :data="pendingImportMemos" style="width: 100%" max-height="400">
            <el-table-column prop="title" label="标题" min-width="200" />
            <el-table-column prop="content" label="内容" min-width="300" show-overflow-tooltip />
            <el-table-column label="标签" min-width="150">
              <template #default="{ row }">
                <el-tag
                  v-for="tag in row.tags"
                  :key="tag"
                  size="small"
                  style="margin-right: 4px"
                >
                  {{ tag }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="优先级" width="100">
              <template #default="{ row }">
                <el-tag :type="getPriorityType(row.priority)" size="small">
                  {{ getPriorityLabel(row.priority) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="100" fixed="right">
              <template #default="{ $index }">
                <el-button type="danger" size="small" @click="removePendingMemo($index)">
                  移除
                </el-button>
              </template>
            </el-table-column>
          </el-table>
          <div class="import-confirm-actions">
            <el-button @click="cancelImport"> 取消导入 </el-button>
            <el-button type="primary" :loading="isImporting" @click="confirmImport">
              确认导入 ({{ pendingImportMemos.length }})
            </el-button>
          </div>
        </el-card>
      </section>

      <!-- 导出备忘录 -->
      <section class="data-section">
        <h2 class="section-title">导出备忘录</h2>
        <el-card shadow="hover">
          <div class="export-area">
            <div class="export-info">
              <el-icon :size="48" color="#67c23a">
                <Download />
              </el-icon>
              <p class="info-text">导出所有备忘录数据为 JSON、Excel 或 PDF 格式</p>
              <p class="info-hint">导出的文件可用于备份或迁移</p>
            </div>
            <div class="export-stats">
              <div class="stat-item">
                <div class="stat-label">备忘录总数</div>
                <div class="stat-value">{{ memoCount }}</div>
              </div>
              <div class="stat-item">
                <div class="stat-label">最后更新</div>
                <div class="stat-value">{{ lastUpdateTime }}</div>
              </div>
            </div>
            <div class="export-actions">
              <el-button type="success" :loading="isExporting" @click="handleExport('json')">
                <el-icon><Download /></el-icon>
                导出为 JSON
              </el-button>
              <el-button type="success" :loading="isExporting" @click="handleExport('excel')">
                <el-icon><Download /></el-icon>
                导出为 Excel
              </el-button>
              <el-button type="success" :loading="isExporting" @click="handleExport('pdf')">
                <el-icon><Download /></el-icon>
                导出为 PDF
              </el-button>
            </div>
          </div>
        </el-card>
      </section>
    </div>

    <!-- 模板下载对话框 -->
    <el-dialog v-model="showTemplateDialog" title="选择模板格式" width="500px">
      <div class="template-options">
        <el-button type="primary" @click="downloadTemplate('json')">
          <el-icon><Document /></el-icon>
          下载 JSON 模板
        </el-button>
        <el-button type="primary" @click="downloadTemplate('excel')">
          <el-icon><Document /></el-icon>
          下载 Excel 模板
        </el-button>
      </div>
      <template #footer>
        <el-button @click="showTemplateDialog = false">关闭</el-button>
      </template>
    </el-dialog>
  </AppLayout>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { ElMessage } from 'element-plus'
import { Upload, Download, Document } from '@element-plus/icons-vue'
import AppLayout from '../components/AppLayout.vue'
import Button from '../components/Button.vue'
import type { Memo, Priority } from '@cyp-memo/shared'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'

const router = useRouter()
const authStore = useAuthStore()

// 状态
const importFileInput = ref<HTMLInputElement | null>(null)
const pendingImportMemos = ref<Partial<Memo>[]>([])
const isImporting = ref(false)
const isExporting = ref(false)
const memoCount = ref(0)
const lastUpdateTime = ref('-')
const showTemplateDialog = ref(false)

/**
 * 返回上一页
 */
function handleBack() {
  router.back()
}

/**
 * 触发文件选择
 */
function triggerImportFile() {
  importFileInput.value?.click()
}

/**
 * 处理导入文件
 */
async function handleImportFile(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]

  if (!file) {
    return
  }

  try {
    const fileName = file.name.toLowerCase()
    
    if (fileName.endsWith('.json')) {
      await handleImportJSON(file)
    } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
      await handleImportExcel(file)
    } else {
      ElMessage.error('不支持的文件格式，请选择 JSON 或 Excel 文件')
    }
  } catch (error) {
    console.error('导入文件失败:', error)
    ElMessage.error('导入文件失败')
  }

  // 重置文件输入
  if (importFileInput.value) {
    importFileInput.value.value = ''
  }
}

/**
 * 处理JSON导入
 */
async function handleImportJSON(file: File) {
  const reader = new FileReader()
  reader.onload = async (e) => {
    try {
      const content = e.target?.result as string
      const data = JSON.parse(content)

      // 验证数据格式
      if (!data.memos || !Array.isArray(data.memos)) {
        ElMessage.error('导入文件格式不正确，请使用本系统导出的模板')
        return
      }

      // 显示待确认的数据
      pendingImportMemos.value = data.memos
      ElMessage.success(`已读取 ${data.memos.length} 条备忘录，请确认后导入`)
    } catch (error) {
      console.error('解析导入文件失败:', error)
      ElMessage.error('导入文件格式不正确')
    }
  }
  reader.onerror = () => {
    ElMessage.error('读取文件失败')
  }
  reader.readAsText(file, 'UTF-8')
}

/**
 * 处理Excel导入
 * 保持备忘录的回车换行格式
 */
async function handleImportExcel(file: File) {
  const reader = new FileReader()
  reader.onload = async (e) => {
    try {
      const data = e.target?.result
      const workbook = XLSX.read(data, { type: 'binary' })
      const sheetName = workbook.SheetNames[0]
      const worksheet = workbook.Sheets[sheetName]
      // 使用 raw: false 确保正确解析换行符
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { raw: false })

      // 优先级映射：支持中文和英文
      const priorityMap: Record<string, Priority> = {
        '低': 'low',
        '中': 'medium',
        '高': 'high',
        'low': 'low',
        'medium': 'medium',
        'high': 'high',
      }

      // 转换为备忘录格式
      const memos: Partial<Memo>[] = jsonData.map((row: any) => {
        const rawPriority = String(row['优先级'] || row['priority'] || '中').toLowerCase().trim()
        const priority = priorityMap[rawPriority] || priorityMap[row['优先级']] || 'medium'
        
        // 获取内容并转换为 HTML 格式（保持换行）
        const rawContent = row['内容'] || row['content'] || ''
        const htmlContent = textToHtml(rawContent)
        
        return {
          title: row['标题'] || row['title'] || '未命名',
          content: htmlContent,
          tags: row['标签'] || row['tags'] ? String(row['标签'] || row['tags']).split(',').map(t => t.trim()) : [],
          priority: priority,
        }
      })

      // 显示待确认的数据
      pendingImportMemos.value = memos
      ElMessage.success(`已读取 ${memos.length} 条备忘录，请确认后导入`)
    } catch (error) {
      console.error('解析Excel文件失败:', error)
      ElMessage.error('Excel文件格式不正确')
    }
  }
  reader.onerror = () => {
    ElMessage.error('读取文件失败')
  }
  reader.readAsArrayBuffer(file)
}

/**
 * 移除待导入的备忘录
 */
function removePendingMemo(index: number) {
  pendingImportMemos.value.splice(index, 1)
  ElMessage.success('已移除')
}

/**
 * 取消导入
 */
function cancelImport() {
  pendingImportMemos.value = []
  ElMessage.info('已取消导入')
}

/**
 * 确认导入
 */
async function confirmImport() {
  if (pendingImportMemos.value.length === 0) {
    ElMessage.warning('没有待导入的数据')
    return
  }

  if (!authStore.currentUser) {
    ElMessage.error('用户未登录')
    return
  }

  isImporting.value = true

  try {
    const { memoDAO } = await import('@cyp-memo/shared')

    // 批量创建备忘录
    let successCount = 0
    for (const memo of pendingImportMemos.value) {
      try {
        await memoDAO.create({
          title: memo.title || '未命名',
          content: memo.content || '',
          tags: memo.tags || [],
          priority: memo.priority || 'medium',
          userId: authStore.currentUser.id,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        successCount++
      } catch (error) {
        console.error('导入备忘录失败:', error)
      }
    }

    ElMessage.success(`成功导入 ${successCount} 条备忘录`)
    pendingImportMemos.value = []
    
    // 刷新备忘录列表和统计信息
    await loadMemoStats()
    
    // 触发全局备忘录列表刷新
    const { useMemoStore } = await import('../stores/memo')
    const memoStore = useMemoStore()
    await memoStore.loadMemos(authStore.currentUser.id)
  } catch (error) {
    console.error('导入失败:', error)
    ElMessage.error('导入失败')
  } finally {
    isImporting.value = false
  }
}

/**
 * 下载导入模板
 */
function downloadTemplate(format: 'json' | 'excel') {
  if (format === 'json') {
    downloadJSONTemplate()
  } else if (format === 'excel') {
    downloadExcelTemplate()
  }
  showTemplateDialog.value = false
}

/**
 * 下载JSON模板
 * 模板中包含换行示例，展示格式保持功能
 */
function downloadJSONTemplate() {
  const template = {
    version: '1.0',
    exportDate: new Date().toISOString(),
    memos: [
      {
        title: '示例备忘录1',
        content: '<p>这是第一行内容</p><p>这是第二行内容</p><p>支持多行文本和<strong>粗体</strong>、<em>斜体</em>等样式</p>',
        tags: ['示例', '模板'],
        priority: 'medium',
      },
      {
        title: '示例备忘录2',
        content: '<p>工作任务清单：</p><p>1. 完成项目报告</p><p>2. 参加团队会议</p><p>3. 代码审查</p>',
        tags: ['工作', '重要'],
        priority: 'high',
      },
    ],
  }

  const jsonString = JSON.stringify(template, null, 2)
  const blob = new Blob([new TextEncoder().encode(jsonString)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'memo-import-template.json'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)

  ElMessage.success('JSON模板下载成功')
}

/**
 * 下载Excel模板
 * 模板中包含换行示例，展示格式保持功能
 */
function downloadExcelTemplate() {
  const templateData = [
    {
      '标题': '示例备忘录1',
      '内容': '这是第一行内容\n这是第二行内容\n支持多行文本',
      '标签': '示例,模板',
      '优先级': '中',
    },
    {
      '标题': '示例备忘录2',
      '内容': '工作任务清单：\n1. 完成项目报告\n2. 参加团队会议\n3. 代码审查',
      '标签': '工作,重要',
      '优先级': '高',
    },
  ]

  const worksheet = XLSX.utils.json_to_sheet(templateData)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, '备忘录模板')

  // 设置列宽
  worksheet['!cols'] = [
    { wch: 20 }, // 标题
    { wch: 50 }, // 内容（加宽以适应多行文本）
    { wch: 20 }, // 标签
    { wch: 10 }, // 优先级
  ]

  XLSX.writeFile(workbook, 'memo-import-template.xlsx')
  ElMessage.success('Excel模板下载成功')
}

/**
 * 导出备忘录
 */
async function handleExport(format: 'json' | 'excel' | 'pdf') {
  if (!authStore.currentUser) {
    ElMessage.error('用户未登录')
    return
  }

  isExporting.value = true

  try {
    const { memoDAO } = await import('@cyp-memo/shared')
    const memos = await memoDAO.getByUserId(authStore.currentUser.id)

    if (format === 'json') {
      await exportToJSON(memos)
    } else if (format === 'excel') {
      await exportToExcel(memos)
    } else if (format === 'pdf') {
      await exportToPDF(memos)
    }

    ElMessage.success(`导出为 ${format.toUpperCase()} 成功`)
  } catch (error) {
    console.error('导出失败:', error)
    ElMessage.error('导出失败')
  } finally {
    isExporting.value = false
  }
}

/**
 * 导出为JSON
 * 保持备忘录的原始HTML格式（包含回车、换行、样式）
 */
async function exportToJSON(memos: Memo[]) {
  const exportData = {
    version: '1.0',
    exportDate: new Date().toISOString(),
    memos: memos.map((memo) => ({
      title: memo.title,
      content: memo.content, // 保持原始 HTML 格式
      tags: memo.tags,
      priority: memo.priority,
    })),
  }

  const jsonString = JSON.stringify(exportData, null, 2)
  const blob = new Blob([new TextEncoder().encode(jsonString)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `memo-export-${new Date().toISOString().split('T')[0]}.json`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * 清除HTML标签，保留换行格式，提取纯文本内容
 * 用于Excel导出，保持回车换行格式
 */
function stripHtmlTagsPreserveLineBreaks(html: string): string {
  if (!html) return ''
  
  // 将 HTML 换行标签转换为实际换行符
  let text = html
    .replace(/<br\s*\/?>/gi, '\n')      // <br> -> 换行
    .replace(/<\/p>/gi, '\n')            // </p> -> 换行
    .replace(/<\/div>/gi, '\n')          // </div> -> 换行
    .replace(/<\/li>/gi, '\n')           // </li> -> 换行
    .replace(/<\/h[1-6]>/gi, '\n\n')     // </h1-6> -> 双换行
    .replace(/<\/blockquote>/gi, '\n')   // </blockquote> -> 换行
    .replace(/<\/pre>/gi, '\n')          // </pre> -> 换行
  
  // 移除其他 HTML 标签
  text = text.replace(/<[^>]*>/g, '')
  
  // 解码 HTML 实体
  const textarea = document.createElement('textarea')
  textarea.innerHTML = text
  text = textarea.value
  
  // 清理多余的连续换行（超过2个换行变为2个），但保留单个和双换行
  text = text.replace(/\n{3,}/g, '\n\n')
  
  // 去除首尾空白
  text = text.trim()
  
  return text
}

/**
 * 将纯文本内容转换为HTML格式（用于导入）
 * 保持回车换行格式
 */
function textToHtml(text: string): string {
  if (!text) return ''
  
  // 转义 HTML 特殊字符
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
  
  // 将换行符转换为 <br> 标签
  html = html.replace(/\n/g, '<br>')
  
  return html
}

/**
 * 导出为Excel
 * 保持备忘录的回车换行格式
 */
async function exportToExcel(memos: Memo[]) {
  // 优先级中文映射
  const priorityLabels: Record<string, string> = {
    low: '低',
    medium: '中',
    high: '高',
  }

  const exportData = memos.map((memo) => ({
    '标题': memo.title,
    '内容': stripHtmlTagsPreserveLineBreaks(memo.content),
    '标签': memo.tags.join(','),
    '优先级': priorityLabels[memo.priority] || '中',
    '创建时间': formatDate(memo.createdAt),
    '更新时间': formatDate(memo.updatedAt),
  }))

  const worksheet = XLSX.utils.json_to_sheet(exportData)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, '备忘录数据')

  // 设置列宽
  worksheet['!cols'] = [
    { wch: 20 }, // 标题
    { wch: 60 }, // 内容（加宽以适应多行文本）
    { wch: 20 }, // 标签
    { wch: 10 }, // 优先级
    { wch: 20 }, // 创建时间
    { wch: 20 }, // 更新时间
  ]

  XLSX.writeFile(workbook, `memo-export-${new Date().toISOString().split('T')[0]}.xlsx`)
}

/**
 * 导出为PDF
 * 使用 html2canvas 将中文内容渲染为图片，避免字体乱码问题
 * 支持长文本完整显示和自动分页
 */
async function exportToPDF(memos: Memo[]) {
  // 动态导入 html2canvas
  const html2canvas = (await import('html2canvas')).default
  
  const doc = new jsPDF('p', 'mm', 'a4')
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 15
  const contentWidth = pageWidth - margin * 2
  
  // 优先级中文映射
  const priorityLabels: Record<string, string> = { low: '低', medium: '中', high: '高' }
  const priorityColors: Record<string, string> = { low: '#67c23a', medium: '#e6a23c', high: '#f56c6c' }
  
  // 每页最多显示的备忘录数量（根据内容长度动态调整）
  const memosPerPage = 3
  const totalPages = Math.ceil(memos.length / memosPerPage)
  
  for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
    if (pageIndex > 0) {
      doc.addPage()
    }
    
    // 创建临时容器用于渲染当前页
    const container = document.createElement('div')
    container.style.cssText = `
      position: absolute;
      left: -9999px;
      top: 0;
      width: 800px;
      background: white;
      font-family: 'Microsoft YaHei', 'PingFang SC', 'Hiragino Sans GB', sans-serif;
      padding: 20px;
      color: #333;
    `
    
    // 构建当前页的HTML内容
    let htmlContent = ''
    
    // 第一页显示标题
    if (pageIndex === 0) {
      htmlContent += `
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="font-size: 28px; color: #409eff; margin: 0 0 10px 0;">CYP-memo 备忘录导出</h1>
          <p style="font-size: 14px; color: #909399; margin: 0;">
            导出日期：${new Date().toLocaleDateString('zh-CN')} | 
            备忘录总数：${memos.length} 条 |
            第 ${pageIndex + 1} / ${totalPages} 页
          </p>
        </div>
      `
    } else {
      htmlContent += `
        <div style="text-align: right; margin-bottom: 20px; font-size: 12px; color: #909399;">
          第 ${pageIndex + 1} / ${totalPages} 页
        </div>
      `
    }
    
    // 获取当前页的备忘录
    const startIndex = pageIndex * memosPerPage
    const endIndex = Math.min(startIndex + memosPerPage, memos.length)
    const pageMemos = memos.slice(startIndex, endIndex)
    
    pageMemos.forEach((memo, index) => {
      // 保留换行格式的内容
      const cleanContent = stripHtmlTagsPreserveLineBreaks(memo.content)
      // 将换行符转换为 HTML <br> 以在 PDF 中正确显示
      const displayContent = cleanContent ? cleanContent.replace(/\n/g, '<br>') : '无内容'
      const priority = memo.priority || 'medium'
      const globalIndex = startIndex + index + 1
      
      htmlContent += `
        <div style="border: 1px solid #e4e7ed; border-radius: 8px; padding: 16px; margin-bottom: 16px; background: #fafafa; page-break-inside: avoid;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <span style="background: #409eff; color: white; padding: 2px 8px; border-radius: 4px; font-size: 12px;">#${globalIndex}</span>
              <h3 style="font-size: 16px; margin: 0; color: #303133; word-break: break-word;">${memo.title || '无标题'}</h3>
            </div>
            <span style="background: ${priorityColors[priority]}; color: white; padding: 2px 10px; border-radius: 12px; font-size: 12px; flex-shrink: 0;">
              ${priorityLabels[priority]}
            </span>
          </div>
          <div style="font-size: 14px; color: #606266; line-height: 1.8; margin: 0 0 12px 0; word-break: break-word; white-space: pre-wrap;">
            ${displayContent}
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: #909399; border-top: 1px solid #e4e7ed; padding-top: 10px; flex-wrap: wrap; gap: 8px;">
            <div style="display: flex; flex-wrap: wrap; gap: 6px;">
              ${memo.tags.length > 0 
                ? memo.tags.map(tag => `<span style="background: #ecf5ff; color: #409eff; padding: 2px 8px; border-radius: 4px;">${tag}</span>`).join('')
                : '<span style="color: #c0c4cc;">无标签</span>'
              }
            </div>
            <span style="flex-shrink: 0;">创建时间：${formatDate(memo.createdAt)}</span>
          </div>
        </div>
      `
    })
    
    container.innerHTML = htmlContent
    document.body.appendChild(container)
    
    try {
      // 使用 html2canvas 渲染当前页
      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
      })
      
      const imgData = canvas.toDataURL('image/jpeg', 0.95)
      const imgWidth = contentWidth
      const imgHeight = (canvas.height * imgWidth) / canvas.width
      
      // 如果图片高度超过页面高度，需要缩放
      const maxHeight = pageHeight - margin * 2
      let finalWidth = imgWidth
      let finalHeight = imgHeight
      
      if (imgHeight > maxHeight) {
        const scale = maxHeight / imgHeight
        finalWidth = imgWidth * scale
        finalHeight = maxHeight
      }
      
      // 居中显示
      const xOffset = margin + (contentWidth - finalWidth) / 2
      
      doc.addImage(imgData, 'JPEG', xOffset, margin, finalWidth, finalHeight)
    } finally {
      // 清理临时容器
      document.body.removeChild(container)
    }
  }
  
  doc.save(`CYP-memo-备忘录导出-${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}.pdf`)
}

/**
 * 加载备忘录统计
 */
async function loadMemoStats() {
  if (!authStore.currentUser) return

  try {
    const { memoDAO } = await import('@cyp-memo/shared')
    const memos = await memoDAO.getByUserId(authStore.currentUser.id)
    memoCount.value = memos.length

    if (memos.length > 0) {
      const latestMemo = memos.reduce((latest, memo) =>
        new Date(memo.updatedAt) > new Date(latest.updatedAt) ? memo : latest
      )
      lastUpdateTime.value = formatDate(latestMemo.updatedAt)
    }
  } catch (error) {
    console.error('加载备忘录统计失败:', error)
  }
}

/**
 * 获取优先级类型
 */
function getPriorityType(priority: Priority): string {
  const types: Record<Priority, string> = {
    low: 'info',
    medium: 'warning',
    high: 'danger',
  }
  return types[priority] || 'info'
}

/**
 * 获取优先级标签
 */
function getPriorityLabel(priority: Priority): string {
  const labels: Record<Priority, string> = {
    low: '低',
    medium: '中',
    high: '高',
  }
  return labels[priority] || priority
}

/**
 * 格式化日期
 */
function formatDate(date: Date): string {
  const d = new Date(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

onMounted(() => {
  loadMemoStats()
})
</script>

<style scoped>
.memo-data-view {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

.page-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
}

.back-icon {
  font-size: 20px;
  font-weight: bold;
}

.page-title {
  font-size: 28px;
  font-weight: 600;
  color: #303133;
  margin: 0;
}

.data-section {
  margin-bottom: 32px;
}

.section-title {
  font-size: 20px;
  font-weight: 600;
  color: #303133;
  margin: 0 0 16px 0;
}

/* 导入区域 */
.import-area {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.import-info {
  text-align: center;
}

.info-text {
  font-size: 16px;
  color: #303133;
  margin: 16px 0 8px 0;
}

.info-hint {
  font-size: 14px;
  color: #909399;
  margin: 0;
}

.import-actions {
  display: flex;
  justify-content: center;
  gap: 12px;
}

/* 导入确认 */
.import-confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #f0f0f0;
}

/* 导出区域 */
.export-area {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.export-info {
  text-align: center;
}

.export-stats {
  display: flex;
  justify-content: center;
  gap: 48px;
}

.stat-item {
  text-align: center;
}

.stat-label {
  font-size: 14px;
  color: #909399;
  margin-bottom: 8px;
}

.stat-value {
  font-size: 24px;
  font-weight: 600;
  color: #303133;
}

.export-actions {
  display: flex;
  justify-content: center;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .memo-data-view {
    padding: 16px;
  }

  .page-title {
    font-size: 24px;
  }

  .import-actions,
  .export-actions {
    flex-direction: column;
  }

  .export-stats {
    flex-direction: column;
    gap: 16px;
  }
}

/* 模板选择对话框 */
.template-options {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 20px 0;
  align-items: center;
  justify-content: center;
}

.template-options .el-button {
  width: 100%;
  max-width: 300px;
  height: 48px;
  font-size: 16px;
}

/* 深色主题支持 */
[data-theme='dark'] .page-title,
[data-theme='dark'] .section-title,
[data-theme='dark'] .info-text,
[data-theme='dark'] .stat-value {
  color: #e5eaf3;
}

[data-theme='dark'] .info-hint,
[data-theme='dark'] .stat-label {
  color: #8a8f99;
}

[data-theme='dark'] .import-confirm-actions {
  border-top-color: #414243;
}
</style>
