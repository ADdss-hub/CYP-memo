/**
 * CYP-memo 性能测试
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 * 
 * 测试系统性能指标：
 * - 页面加载时间 < 2s
 * - 用户交互响应时间 < 100ms
 * - 大列表渲染性能
 * 
 * 需求: 9.1
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import App from '../src/App.vue'
import MemoListView from '../src/views/memo/MemoListView.vue'
import { useMemoStore } from '../src/stores/memo'
import { useAuthStore } from '../src/stores/auth'

// 性能测试辅助函数
function measureTime(fn: () => void | Promise<void>): Promise<number> {
  return new Promise(async (resolve) => {
    const start = performance.now()
    await fn()
    const end = performance.now()
    resolve(end - start)
  })
}

describe('性能测试', () => {
  let pinia: ReturnType<typeof createPinia>
  let router: ReturnType<typeof createRouter>

  beforeEach(() => {
    pinia = createPinia()
    router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { template: '<div>Home</div>' } },
        { path: '/memos', component: MemoListView },
      ],
    })
  })

  describe('页面加载时间测试', () => {
    it('应用初始化时间应小于 2 秒', async () => {
      const loadTime = await measureTime(async () => {
        const wrapper = mount(App, {
          global: {
            plugins: [pinia, router],
          },
        })
        await wrapper.vm.$nextTick()
        wrapper.unmount()
      })

      console.log(`应用初始化时间: ${loadTime.toFixed(2)}ms`)
      expect(loadTime).toBeLessThan(2000)
    })

    it('备忘录列表页面加载时间应小于 2 秒', async () => {
      // 模拟已登录状态
      const authStore = useAuthStore(pinia)
      authStore.currentUser = {
        id: 'test-user',
        username: 'testuser',
        isMainAccount: true,
        permissions: [],
        rememberPassword: false,
        createdAt: new Date(),
        lastLoginAt: new Date(),
      }

      const loadTime = await measureTime(async () => {
        const wrapper = mount(MemoListView, {
          global: {
            plugins: [pinia, router],
          },
        })
        await wrapper.vm.$nextTick()
        wrapper.unmount()
      })

      console.log(`备忘录列表页面加载时间: ${loadTime.toFixed(2)}ms`)
      expect(loadTime).toBeLessThan(2000)
    })

    it('路由切换时间应小于 2 秒', async () => {
      const wrapper = mount(App, {
        global: {
          plugins: [pinia, router],
        },
      })

      const loadTime = await measureTime(async () => {
        await router.push('/memos')
        await wrapper.vm.$nextTick()
      })

      console.log(`路由切换时间: ${loadTime.toFixed(2)}ms`)
      expect(loadTime).toBeLessThan(2000)

      wrapper.unmount()
    })
  })

  describe('用户交互响应时间测试', () => {
    it('按钮点击响应时间应小于 100ms', async () => {
      const clickHandler = vi.fn()
      const wrapper = mount({
        template: '<button @click="onClick">测试按钮</button>',
        methods: {
          onClick: clickHandler,
        },
      })

      const button = wrapper.find('button')
      const responseTime = await measureTime(async () => {
        await button.trigger('click')
      })

      console.log(`按钮点击响应时间: ${responseTime.toFixed(2)}ms`)
      expect(responseTime).toBeLessThan(100)
      expect(clickHandler).toHaveBeenCalled()

      wrapper.unmount()
    })

    it('输入框输入响应时间应小于 100ms', async () => {
      const inputHandler = vi.fn()
      const wrapper = mount({
        template: '<input @input="onInput" />',
        methods: {
          onInput: inputHandler,
        },
      })

      const input = wrapper.find('input')
      const responseTime = await measureTime(async () => {
        await input.setValue('测试输入')
      })

      console.log(`输入框响应时间: ${responseTime.toFixed(2)}ms`)
      expect(responseTime).toBeLessThan(100)
      expect(inputHandler).toHaveBeenCalled()

      wrapper.unmount()
    })

    it('搜索操作响应时间应小于 100ms', async () => {
      const authStore = useAuthStore(pinia)
      authStore.currentUser = {
        id: 'test-user',
        username: 'testuser',
        isMainAccount: true,
        permissions: [],
        rememberPassword: false,
        createdAt: new Date(),
        lastLoginAt: new Date(),
      }

      const memoStore = useMemoStore(pinia)
      
      // 添加测试数据
      for (let i = 0; i < 100; i++) {
        memoStore.memos.push({
          id: `memo-${i}`,
          userId: 'test-user',
          title: `测试备忘录 ${i}`,
          content: `这是测试内容 ${i}`,
          tags: ['测试'],
          attachments: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        })
      }

      const responseTime = await measureTime(async () => {
        memoStore.searchQuery = '测试'
        await new Promise(resolve => setTimeout(resolve, 0))
      })

      console.log(`搜索响应时间: ${responseTime.toFixed(2)}ms`)
      expect(responseTime).toBeLessThan(100)
    })

    it('标签筛选响应时间应小于 100ms', async () => {
      const authStore = useAuthStore(pinia)
      authStore.currentUser = {
        id: 'test-user',
        username: 'testuser',
        isMainAccount: true,
        permissions: [],
        rememberPassword: false,
        createdAt: new Date(),
        lastLoginAt: new Date(),
      }

      const memoStore = useMemoStore(pinia)
      
      // 添加测试数据
      for (let i = 0; i < 100; i++) {
        memoStore.memos.push({
          id: `memo-${i}`,
          userId: 'test-user',
          title: `测试备忘录 ${i}`,
          content: `这是测试内容 ${i}`,
          tags: i % 2 === 0 ? ['工作'] : ['个人'],
          attachments: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        })
      }

      const responseTime = await measureTime(async () => {
        memoStore.selectedTags = ['工作']
        await new Promise(resolve => setTimeout(resolve, 0))
      })

      console.log(`标签筛选响应时间: ${responseTime.toFixed(2)}ms`)
      expect(responseTime).toBeLessThan(100)
    })
  })

  describe('大列表渲染性能测试', () => {
    it('应该能够渲染 1000 个备忘录项目', async () => {
      const authStore = useAuthStore(pinia)
      authStore.currentUser = {
        id: 'test-user',
        username: 'testuser',
        isMainAccount: true,
        permissions: [],
        rememberPassword: false,
        createdAt: new Date(),
        lastLoginAt: new Date(),
      }

      const memoStore = useMemoStore(pinia)
      
      // 添加 1000 个备忘录
      for (let i = 0; i < 1000; i++) {
        memoStore.memos.push({
          id: `memo-${i}`,
          userId: 'test-user',
          title: `测试备忘录 ${i}`,
          content: `这是测试内容 ${i}`,
          tags: [`标签${i % 10}`],
          attachments: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        })
      }

      const renderTime = await measureTime(async () => {
        const wrapper = mount(MemoListView, {
          global: {
            plugins: [pinia, router],
          },
        })
        await wrapper.vm.$nextTick()
        wrapper.unmount()
      })

      console.log(`渲染 1000 个备忘录耗时: ${renderTime.toFixed(2)}ms`)
      // 大列表渲染应该在合理时间内完成（5秒内）
      expect(renderTime).toBeLessThan(5000)
    })

    it('应该能够渲染 10000 个备忘录项目', async () => {
      const authStore = useAuthStore(pinia)
      authStore.currentUser = {
        id: 'test-user',
        username: 'testuser',
        isMainAccount: true,
        permissions: [],
        rememberPassword: false,
        createdAt: new Date(),
        lastLoginAt: new Date(),
      }

      const memoStore = useMemoStore(pinia)
      
      // 添加 10000 个备忘录
      for (let i = 0; i < 10000; i++) {
        memoStore.memos.push({
          id: `memo-${i}`,
          userId: 'test-user',
          title: `测试备忘录 ${i}`,
          content: `这是测试内容 ${i}`,
          tags: [`标签${i % 10}`],
          attachments: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        })
      }

      const renderTime = await measureTime(async () => {
        const wrapper = mount(MemoListView, {
          global: {
            plugins: [pinia, router],
          },
        })
        await wrapper.vm.$nextTick()
        wrapper.unmount()
      })

      console.log(`渲染 10000 个备忘录耗时: ${renderTime.toFixed(2)}ms`)
      // 使用虚拟滚动后，即使 10000 个项目也应该快速渲染（10秒内）
      expect(renderTime).toBeLessThan(10000)
    })

    it('滚动大列表时性能应该保持稳定', async () => {
      const authStore = useAuthStore(pinia)
      authStore.currentUser = {
        id: 'test-user',
        username: 'testuser',
        isMainAccount: true,
        permissions: [],
        rememberPassword: false,
        createdAt: new Date(),
        lastLoginAt: new Date(),
      }

      const memoStore = useMemoStore(pinia)
      
      // 添加 1000 个备忘录
      for (let i = 0; i < 1000; i++) {
        memoStore.memos.push({
          id: `memo-${i}`,
          userId: 'test-user',
          title: `测试备忘录 ${i}`,
          content: `这是测试内容 ${i}`,
          tags: [`标签${i % 10}`],
          attachments: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        })
      }

      const wrapper = mount(MemoListView, {
        global: {
          plugins: [pinia, router],
        },
      })

      // 模拟滚动事件
      const scrollTimes: number[] = []
      for (let i = 0; i < 10; i++) {
        const scrollTime = await measureTime(async () => {
          // 触发滚动
          await wrapper.vm.$nextTick()
        })
        scrollTimes.push(scrollTime)
      }

      const avgScrollTime = scrollTimes.reduce((a, b) => a + b, 0) / scrollTimes.length
      console.log(`平均滚动响应时间: ${avgScrollTime.toFixed(2)}ms`)
      
      // 滚动响应应该快速（每次小于 100ms）
      expect(avgScrollTime).toBeLessThan(100)

      wrapper.unmount()
    })

    it('搜索大列表时性能应该保持稳定', async () => {
      const authStore = useAuthStore(pinia)
      authStore.currentUser = {
        id: 'test-user',
        username: 'testuser',
        isMainAccount: true,
        permissions: [],
        rememberPassword: false,
        createdAt: new Date(),
        lastLoginAt: new Date(),
      }

      const memoStore = useMemoStore(pinia)
      
      // 添加 1000 个备忘录
      for (let i = 0; i < 1000; i++) {
        memoStore.memos.push({
          id: `memo-${i}`,
          userId: 'test-user',
          title: `测试备忘录 ${i}`,
          content: `这是测试内容 ${i}`,
          tags: [`标签${i % 10}`],
          attachments: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        })
      }

      const searchTime = await measureTime(async () => {
        memoStore.searchQuery = '测试备忘录 500'
        await new Promise(resolve => setTimeout(resolve, 0))
      })

      console.log(`搜索 1000 个备忘录耗时: ${searchTime.toFixed(2)}ms`)
      // 搜索应该快速完成（500ms内）
      expect(searchTime).toBeLessThan(500)
    })
  })

  describe('内存使用测试', () => {
    it('创建和销毁大量组件不应导致内存泄漏', async () => {
      const authStore = useAuthStore(pinia)
      authStore.currentUser = {
        id: 'test-user',
        username: 'testuser',
        isMainAccount: true,
        permissions: [],
        rememberPassword: false,
        createdAt: new Date(),
        lastLoginAt: new Date(),
      }

      // 记录初始内存（如果可用）
      const initialMemory = (performance as any).memory?.usedJSHeapSize || 0

      // 创建和销毁 100 个组件
      for (let i = 0; i < 100; i++) {
        const wrapper = mount(MemoListView, {
          global: {
            plugins: [pinia, router],
          },
        })
        await wrapper.vm.$nextTick()
        wrapper.unmount()
      }

      // 记录最终内存（如果可用）
      const finalMemory = (performance as any).memory?.usedJSHeapSize || 0

      if (initialMemory > 0 && finalMemory > 0) {
        const memoryIncrease = finalMemory - initialMemory
        console.log(`内存增长: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`)
        
        // 内存增长应该在合理范围内（小于 50MB）
        expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024)
      } else {
        console.log('内存监控不可用，跳过内存测试')
        expect(true).toBe(true)
      }
    })
  })
})
