<!--
  CYP-memo 欢迎引导页面
  Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
  全面更新版本 - 现代化设计
-->

<template>
  <div :class="['welcome-view', { 'dark-mode': isDarkMode }]">
    <!-- 背景装饰 -->
    <div class="bg-decoration">
      <div class="bg-circle circle-1"></div>
      <div class="bg-circle circle-2"></div>
      <div class="bg-circle circle-3"></div>
    </div>

    <div class="welcome-container">
      <!-- 顶部进度条 -->
      <div class="progress-bar-container">
        <div class="progress-bar">
          <div 
            class="progress-fill" 
            :style="{ width: `${((currentStepIndex + 1) / steps.length) * 100}%` }"
          ></div>
        </div>
        <span class="progress-text">{{ currentStepIndex + 1 }} / {{ steps.length }}</span>
      </div>

      <!-- 步骤指示器 -->
      <div class="step-indicators">
        <div
          v-for="(step, index) in steps"
          :key="step.id"
          class="step-indicator"
          :class="{
            active: index === currentStepIndex,
            completed: index < currentStepIndex,
            clickable: index <= currentStepIndex
          }"
          @click="goToStep(index)"
        >
          <div class="indicator-dot">
            <transition name="check" mode="out-in">
              <svg v-if="index < currentStepIndex" class="check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
              <span v-else class="step-num">{{ index + 1 }}</span>
            </transition>
          </div>
          <span class="indicator-label" v-if="index === currentStepIndex">{{ getStepLabel(index) }}</span>
        </div>
      </div>

      <!-- 主内容区域 -->
      <div class="main-content">
        <transition :name="transitionName" mode="out-in">
          <div :key="currentStep.id" class="step-content">
            <!-- 第一步：欢迎页面 -->
            <template v-if="currentStepIndex === 0">
              <div class="welcome-hero">
                <div class="hero-logo">
                  <div class="logo-wrapper">
                    <BrandMark size="xl" class="logo-mark" />
                    <div class="logo-glow"></div>
                  </div>
                </div>
                <h1 class="hero-title">
                  <span class="title-welcome">欢迎使用</span>
                  <span class="title-brand">CYP-memo</span>
                </h1>
                <p class="hero-subtitle">{{ currentStep.description }}</p>
                <div class="hero-badges">
                  <span class="badge">安全可靠</span>
                  <span class="badge">快速高效</span>
                  <span class="badge">简洁美观</span>
                </div>
              </div>
            </template>

            <!-- 最后一步：开始使用 -->
            <template v-else-if="currentStepIndex === steps.length - 1">
              <div class="final-step">
                <div class="final-icon" aria-hidden="true">
                  <el-icon :size="64"><CircleCheckFilled /></el-icon>
                </div>
                <h1 class="final-title">准备就绪！</h1>
                <p class="final-subtitle">{{ currentStep.description }}</p>
                
                <div class="features-showcase">
                  <div 
                    v-for="(feature, index) in features" 
                    :key="index"
                    class="feature-card"
                    :style="{ animationDelay: `${index * 0.1}s` }"
                  >
                    <span class="feature-icon" aria-hidden="true">
                      <el-icon :size="32"><component :is="feature.icon" /></el-icon>
                    </span>
                    <span class="feature-name">{{ feature.name }}</span>
                    <span class="feature-desc">{{ feature.desc }}</span>
                  </div>
                </div>
              </div>
            </template>

            <!-- 中间步骤 -->
            <template v-else>
              <div class="guide-step">
                <div class="guide-illustration">
                  <div class="illustration-wrapper">
                    <span class="illustration-icon" aria-hidden="true">
                      <el-icon :size="64"><component :is="getStepIcon(currentStepIndex)" /></el-icon>
                    </span>
                  </div>
                </div>
                <h1 class="guide-title">{{ currentStep.title }}</h1>
                <p class="guide-description">{{ currentStep.description }}</p>
                
                <!-- 步骤特定的提示 -->
                <div class="guide-tips" v-if="getStepTips(currentStepIndex).length">
                  <div 
                    v-for="(tip, index) in getStepTips(currentStepIndex)" 
                    :key="index"
                    class="tip-item"
                  >
                    <span class="tip-icon" aria-hidden="true">
                      <el-icon :size="18"><InfoFilled /></el-icon>
                    </span>
                    <span class="tip-text">{{ tip }}</span>
                  </div>
                </div>
              </div>
            </template>
          </div>
        </transition>
      </div>

      <!-- 底部导航 -->
      <div class="navigation-footer">
        <div class="nav-left">
          <button 
            v-if="currentStepIndex > 0" 
            class="nav-btn btn-secondary"
            @click="previousStep"
          >
            <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
            <span>上一步</span>
          </button>
        </div>

        <div class="nav-center">
          <button 
            v-if="!isLastStep" 
            class="nav-btn btn-text"
            @click="skipGuide"
          >
            跳过引导
          </button>
        </div>

        <div class="nav-right">
          <button 
            v-if="!isLastStep" 
            class="nav-btn btn-primary"
            @click="nextStep"
          >
            <span>下一步</span>
            <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </button>
          <button 
            v-else 
            class="nav-btn btn-primary btn-start"
            :class="{ loading: isCompleting }"
            :disabled="isCompleting"
            @click="completeGuide"
          >
            <span v-if="!isCompleting">开始使用</span>
            <span v-else class="loading-text">
              <span class="loading-spinner"></span>
              正在准备...
            </span>
          </button>
        </div>
      </div>
    </div>
    <AppFooter />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, type Component } from 'vue'
import { useRouter } from 'vue-router'
import { welcomeManager, type GuideStep } from '@cyp-memo/shared'
import { useSettingsStore } from '../stores/settings'
import { useToast } from '../composables/useToast'
import BrandMark from '../components/BrandMark.vue'
import AppFooter from '../components/AppFooter.vue'
import {
  EditPen,
  CollectionTag,
  Paperclip,
  Search,
  DataAnalysis,
  Setting,
  CircleCheckFilled,
  InfoFilled,
  Document,
  Upload,
  TrendCharts,
} from '@element-plus/icons-vue'

const router = useRouter()
const settingsStore = useSettingsStore()
const toast = useToast()

// 状态
const currentStepIndex = ref(0)
const steps = ref<GuideStep[]>([])
const isCompleting = ref(false)
const transitionName = ref('slide-left')

// 计算属性
const currentStep = computed(() => steps.value[currentStepIndex.value] || { id: '', title: '', description: '' })
const isLastStep = computed(() => currentStepIndex.value === steps.value.length - 1)
const isDarkMode = computed(() => {
  return document.documentElement.getAttribute('data-theme') === 'dark'
})

// 功能特性列表（SVG 图标，避免 emoji 被编码剥离）
const features: Array<{ icon: Component; name: string; desc: string }> = [
  { icon: EditPen, name: '富文本编辑', desc: '支持 Markdown' },
  { icon: CollectionTag, name: '标签管理', desc: '智能分类' },
  { icon: Upload, name: '文件上传', desc: '多格式支持' },
  { icon: Search, name: '快速搜索', desc: '全文检索' },
  { icon: TrendCharts, name: '数据统计', desc: '可视化分析' },
  { icon: Setting, name: '个性设置', desc: '自定义体验' },
]

// 获取步骤标签
function getStepLabel(index: number): string {
  const labels = ['欢迎', '创建', '标签', '文件', '搜索', '统计', '设置', '开始']
  return labels[index] || ''
}

// 获取步骤图标（与引导步骤语义对齐）
function getStepIcon(index: number): Component {
  const icons: Component[] = [
    Document,
    EditPen,
    CollectionTag,
    Paperclip,
    Search,
    DataAnalysis,
    Setting,
    CircleCheckFilled,
  ]
  return icons[index] || Document
}

// 获取步骤提示
function getStepTips(index: number): string[] {
  const tips: Record<number, string[]> = {
    1: ['点击右上角的"新建"按钮即可创建备忘录', '支持 Markdown 语法，让内容更丰富'],
    2: ['标签可以帮助您快速分类和查找备忘录', '输入时会自动提示已有标签'],
    3: ['支持图片、文档等多种文件格式', '拖拽文件到编辑区即可上传'],
    4: ['支持标题、内容、标签的全文搜索', '可以组合多个条件进行筛选'],
    5: ['查看备忘录数量、标签使用情况', '了解存储空间使用状态'],
    6: ['切换深色/浅色主题', '调整字体大小和其他偏好设置'],
  }
  return tips[index] || []
}

/**
 * 下一步
 */
function nextStep() {
  if (currentStepIndex.value < steps.value.length - 1) {
    transitionName.value = 'slide-left'
    currentStepIndex.value++
  }
}

/**
 * 上一步
 */
function previousStep() {
  if (currentStepIndex.value > 0) {
    transitionName.value = 'slide-right'
    currentStepIndex.value--
  }
}

/**
 * 跳转到指定步骤
 */
function goToStep(index: number) {
  if (index <= currentStepIndex.value) {
    transitionName.value = index < currentStepIndex.value ? 'slide-right' : 'slide-left'
    currentStepIndex.value = index
  }
}

/**
 * 跳过引导
 */
async function skipGuide() {
  try {
    isCompleting.value = true
    
    await settingsStore.setWelcomeCompleted(true)
    await settingsStore.setFirstTime(false)
    
    try {
      await welcomeManager.markWelcomeCompleted()
    } catch (serverError) {
      console.warn('服务器端设置更新失败，但本地设置已更新:', serverError)
    }
    
    router.push({ name: 'memos' })
  } catch (error) {
    console.error('跳过引导失败:', error)
    toast.error('跳过引导失败，请重试')
  } finally {
    isCompleting.value = false
  }
}

/**
 * 完成引导
 */
async function completeGuide() {
  try {
    isCompleting.value = true
    
    await settingsStore.setWelcomeCompleted(true)
    await settingsStore.setFirstTime(false)
    
    try {
      await welcomeManager.markWelcomeCompleted()
    } catch (serverError) {
      console.warn('服务器端设置更新失败，但本地设置已更新:', serverError)
    }
    
    toast.success('欢迎使用 CYP-memo！开始您的备忘之旅吧')
    router.push({ name: 'memos' })
  } catch (error) {
    console.error('完成引导失败:', error)
    toast.error('完成引导失败，请重试')
  } finally {
    isCompleting.value = false
  }
}

/**
 * 初始化
 */
onMounted(() => {
  steps.value = welcomeManager.getGuideSteps()
})
</script>

<style scoped>
/* 基础布局 */
.welcome-view {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: var(--cyp-bg-page);
  padding: 1.5rem 1.5rem 0;
  position: relative;
  overflow-x: hidden;
}

/* 背景装饰 */
.bg-decoration {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}

.bg-circle {
  position: absolute;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  animation: float 20s infinite ease-in-out;
}

.circle-1 {
  width: 400px;
  height: 400px;
  top: -100px;
  right: -100px;
  animation-delay: 0s;
}

.circle-2 {
  width: 300px;
  height: 300px;
  bottom: -50px;
  left: -50px;
  animation-delay: -5s;
}

.circle-3 {
  width: 200px;
  height: 200px;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  animation-delay: -10s;
}

@keyframes float {
  0%, 100% { transform: translate(0, 0) scale(1); }
  25% { transform: translate(20px, -20px) scale(1.05); }
  50% { transform: translate(-10px, 10px) scale(0.95); }
  75% { transform: translate(10px, 20px) scale(1.02); }
}

/* 主容器 */
.welcome-container {
  max-width: 900px;
  width: 100%;
  background: var(--cyp-bg-card);
  border-radius: 24px;
  box-shadow: 0 25px 80px rgba(0, 0, 0, 0.3);
  padding: 2rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  position: relative;
  z-index: 1;
  margin-top: auto;
  margin-bottom: auto;
}

/* 版权栏贴视口底部（勿与引导卡片并排） */
.welcome-view :deep(.app-footer) {
  width: 100%;
  flex-shrink: 0;
  align-self: stretch;
  margin-top: 0;
}

/* 进度条 */
.progress-bar-container {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.progress-bar {
  flex: 1;
  height: 6px;
  background: var(--cyp-border);
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--cyp-brand) 0%, var(--cyp-brand-hover) 100%);
  border-radius: 3px;
  transition: width 0.5s ease;
}

.progress-text {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--cyp-text-muted);
  min-width: 50px;
  text-align: right;
}

/* 步骤指示器 */
.step-indicators {
  display: flex;
  justify-content: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.step-indicator {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  cursor: default;
}

.step-indicator.clickable {
  cursor: pointer;
}

.indicator-dot {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--cyp-border);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 0.875rem;
  color: var(--cyp-text-muted);
  transition: all 0.3s ease;
  position: relative;
}

.step-indicator.active .indicator-dot {
  background: var(--cyp-brand);
  color: white;
  transform: scale(1.15);
  box-shadow: 0 4px 15px rgba(0, 153, 255, 0.4);
}

.step-indicator.completed .indicator-dot {
  background: #10b981;
  color: white;
}

.step-indicator.clickable:hover .indicator-dot {
  transform: scale(1.1);
}

.check-icon {
  width: 18px;
  height: 18px;
}

.indicator-label {
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--cyp-brand);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* 主内容区域 */
.main-content {
  flex: 1;
  min-height: 380px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem 0;
}

.step-content {
  width: 100%;
  text-align: center;
}

/* 欢迎页面样式 */
.welcome-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
}

.hero-logo {
  margin-bottom: 0.5rem;
}

.logo-wrapper {
  position: relative;
  display: inline-block;
}

.logo-mark {
  width: 88px;
  height: 88px;
  display: block;
  object-fit: cover;
  border-radius: 20px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
  animation: bounce 2s ease-in-out infinite;
}

.logo-glow {
  position: absolute;
  inset: -20px;
  background: radial-gradient(circle, rgba(0, 153, 255, 0.3) 0%, transparent 70%);
  border-radius: 50%;
  animation: pulse 2s ease-in-out infinite;
}

@keyframes bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-15px); }
}

@keyframes pulse {
  0%, 100% { opacity: 0.5; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.1); }
}

.hero-title {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin: 0;
}

.title-welcome {
  font-size: 1.25rem;
  font-weight: 500;
  color: var(--cyp-text-muted);
}

.title-brand {
  font-size: 3rem;
  font-weight: 800;
  background: linear-gradient(135deg, var(--cyp-brand) 0%, var(--cyp-brand-hover) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.hero-subtitle {
  font-size: 1.1rem;
  color: var(--cyp-text-muted);
  max-width: 500px;
  line-height: 1.6;
  margin: 0;
}

.hero-badges {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
  justify-content: center;
}

.badge {
  padding: 0.5rem 1rem;
  background: linear-gradient(135deg, rgba(0,153,255,0.10) 0%, rgba(0,153,255,0.04) 100%);
  border-radius: 20px;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--cyp-brand);
}

/* 最后一步样式 */
.final-step {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}

.final-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--cyp-brand);
  animation: celebrate 1s ease-in-out infinite;
}

@keyframes celebrate {
  0%, 100% { transform: rotate(-5deg) scale(1); }
  50% { transform: rotate(5deg) scale(1.1); }
}

.final-title {
  font-size: 2.5rem;
  font-weight: 700;
  color: var(--cyp-text);
  margin: 0;
}

.final-subtitle {
  font-size: 1rem;
  color: var(--cyp-text-muted);
  margin: 0 0 1rem 0;
}

.features-showcase {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
  width: 100%;
  max-width: 600px;
}

.feature-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 1.25rem 1rem;
  background: var(--cyp-bg-muted);
  border-radius: 16px;
  transition: all 0.3s ease;
  animation: fadeInUp 0.5s ease forwards;
  opacity: 0;
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.feature-card:hover {
  background: linear-gradient(135deg, rgba(0,153,255,0.10) 0%, rgba(0,153,255,0.04) 100%);
  transform: translateY(-4px);
  box-shadow: 0 8px 25px rgba(0, 153, 255, 0.15);
}

.feature-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--cyp-brand);
}

.feature-name {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--cyp-text-secondary);
}

.feature-desc {
  font-size: 0.75rem;
  color: var(--cyp-text-muted);
}

/* 中间步骤样式 */
.guide-step {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
}

.guide-illustration {
  margin-bottom: 0.5rem;
}

.illustration-wrapper {
  width: 120px;
  height: 120px;
  background: linear-gradient(135deg, rgba(0,153,255,0.10) 0%, rgba(0,153,255,0.04) 100%);
  border-radius: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 10px 30px rgba(0, 153, 255, 0.15);
}

.illustration-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--cyp-brand);
}

.guide-title {
  font-size: 2rem;
  font-weight: 700;
  color: var(--cyp-text);
  margin: 0;
}

.guide-description {
  font-size: 1.1rem;
  color: var(--cyp-text-muted);
  max-width: 500px;
  line-height: 1.6;
  margin: 0;
}

.guide-tips {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  width: 100%;
  max-width: 450px;
}

.tip-item {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.875rem 1rem;
  background: rgba(230, 162, 60, 0.12);
  border-radius: 12px;
  text-align: left;
}

.tip-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--cyp-brand);
}

.tip-text {
  font-size: 0.9rem;
  color: var(--cyp-text-secondary);
  line-height: 1.5;
}

/* 底部导航 */
.navigation-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 1rem;
  border-top: 1px solid var(--cyp-border);
}

.nav-left, .nav-center, .nav-right {
  flex: 1;
}

.nav-center {
  text-align: center;
}

.nav-right {
  text-align: right;
}

.nav-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 12px;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
}

.btn-icon {
  width: 18px;
  height: 18px;
}

.btn-primary {
  background: linear-gradient(135deg, var(--cyp-brand) 0%, var(--cyp-brand-hover) 100%);
  color: #ffffff;
  box-shadow: 0 4px 15px rgba(0, 153, 255, 0.35);
}

.btn-primary:hover {
  background: linear-gradient(135deg, var(--cyp-brand-hover) 0%, #0077cc 100%);
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(0, 153, 255, 0.45);
}

.btn-secondary {
  background: var(--cyp-bg-muted);
  color: var(--cyp-text-secondary);
}

.btn-secondary:hover {
  background: var(--cyp-border);
}

.btn-text {
  background: transparent;
  color: var(--cyp-text-muted);
  padding: 0.75rem 1rem;
}

.btn-text:hover {
  color: var(--cyp-text-muted);
}

.btn-start {
  padding: 0.875rem 2rem;
  font-size: 1rem;
}

.btn-start.loading {
  opacity: 0.8;
  cursor: not-allowed;
}

.loading-text {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.loading-spinner {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 过渡动画 */
.slide-left-enter-active,
.slide-left-leave-active,
.slide-right-enter-active,
.slide-right-leave-active {
  transition: all 0.4s ease;
}

.slide-left-enter-from {
  opacity: 0;
  transform: translateX(30px);
}

.slide-left-leave-to {
  opacity: 0;
  transform: translateX(-30px);
}

.slide-right-enter-from {
  opacity: 0;
  transform: translateX(-30px);
}

.slide-right-leave-to {
  opacity: 0;
  transform: translateX(30px);
}

.check-enter-active,
.check-leave-active {
  transition: all 0.2s ease;
}

.check-enter-from,
.check-leave-to {
  opacity: 0;
  transform: scale(0.5);
}

/* 深色模式 */
.dark-mode {
  background: var(--cyp-bg-page);
}

.dark-mode .welcome-container {
  background: var(--cyp-bg-card);
}

.dark-mode .progress-bar {
  background: var(--cyp-bg-muted);
}

.dark-mode .progress-text {
  color: var(--cyp-text-muted);
}

.dark-mode .indicator-dot {
  background: var(--cyp-bg-muted);
  color: var(--cyp-text-muted);
}

.dark-mode .indicator-label {
  color: #a5b4fc;
}

.dark-mode .title-welcome {
  color: var(--cyp-text-muted);
}

.dark-mode .hero-subtitle,
.dark-mode .guide-description,
.dark-mode .final-subtitle {
  color: var(--cyp-text-muted);
}

.dark-mode .badge {
  background: linear-gradient(135deg, #0b3d66 0%, var(--cyp-brand-hover) 100%);
  color: #ffffff;
}

.dark-mode .guide-title,
.dark-mode .final-title {
  color: var(--cyp-text);
}

.dark-mode .illustration-wrapper {
  background: linear-gradient(135deg, #0b3d66 0%, var(--cyp-brand-hover) 100%);
}

.dark-mode .illustration-icon,
.dark-mode .feature-icon,
.dark-mode .final-icon,
.dark-mode .tip-icon {
  color: #ffffff;
}

.dark-mode .tip-item {
  background: var(--cyp-bg-muted);
}

.dark-mode .tip-text {
  color: var(--cyp-text-secondary);
}

.dark-mode .feature-card {
  background: var(--cyp-bg-muted);
}

.dark-mode .feature-card:hover {
  background: linear-gradient(135deg, #0b3d66 0%, var(--cyp-brand-hover) 100%);
}

.dark-mode .feature-name {
  color: var(--cyp-text);
}

.dark-mode .feature-desc {
  color: var(--cyp-text-muted);
}

.dark-mode .navigation-footer {
  border-top-color: var(--cyp-border);
}

.dark-mode .btn-primary {
  background: linear-gradient(135deg, var(--cyp-brand) 0%, var(--cyp-brand-hover) 100%);
  color: #ffffff;
  box-shadow: 0 4px 15px rgba(0, 153, 255, 0.4);
}

.dark-mode .btn-primary:hover {
  background: linear-gradient(135deg, var(--cyp-brand-soft) 0%, var(--cyp-brand) 100%);
}

.dark-mode .btn-secondary {
  background: var(--cyp-bg-muted);
  color: #e5e7eb;
}

.dark-mode .btn-secondary:hover {
  background: #4b5563;
}

.dark-mode .btn-text {
  color: var(--cyp-text-muted);
}

.dark-mode .btn-text:hover {
  color: var(--cyp-text-muted);
}

/* 响应式设计 */
@media (max-width: 768px) {
  .welcome-view {
    padding: 1rem 1rem 0;
  }

  .welcome-container {
    padding: 1.5rem;
    border-radius: 20px;
  }

  .step-indicators {
    gap: 0.25rem;
  }

  .indicator-dot {
    width: 30px;
    height: 30px;
    font-size: 0.75rem;
  }

  .indicator-label {
    display: none;
  }

  .main-content {
    min-height: 320px;
  }

  .logo-mark {
    width: 64px;
    height: 64px;
  }

  .title-brand {
    font-size: 2.25rem;
  }

  .hero-subtitle,
  .guide-description {
    font-size: 1rem;
  }

  .features-showcase {
    grid-template-columns: repeat(2, 1fr);
    gap: 0.75rem;
  }

  .feature-card {
    padding: 1rem 0.75rem;
  }

  .guide-title,
  .final-title {
    font-size: 1.75rem;
  }

  .illustration-wrapper {
    width: 100px;
    height: 100px;
    border-radius: 24px;
  }

  .navigation-footer {
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  .nav-left, .nav-center, .nav-right {
    flex: none;
  }

  .nav-center {
    order: 3;
    width: 100%;
  }

  .nav-btn {
    padding: 0.625rem 1.25rem;
    font-size: 0.875rem;
  }
}

@media (max-width: 480px) {
  .welcome-container {
    padding: 1.25rem;
  }

  .progress-bar-container {
    gap: 0.5rem;
  }

  .hero-badges {
    gap: 0.5rem;
  }

  .badge {
    padding: 0.375rem 0.75rem;
    font-size: 0.8rem;
  }

  .features-showcase {
    grid-template-columns: 1fr;
  }

  .guide-tips {
    gap: 0.5rem;
  }

  .tip-item {
    padding: 0.75rem;
  }
}
</style>
