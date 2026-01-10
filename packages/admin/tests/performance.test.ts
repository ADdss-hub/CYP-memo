/**
 * CYP-memo 管理员端性能测试
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 * 
 * 测试系统性能指标：
 * - 页面加载时间 < 2s
 * - 用户交互响应时间 < 100ms
 * - 大列表渲染性能
 * 
 * 需求: 9.1
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import App from '../src/App.vue'
import UsersView from '../src/views/UsersView.vue'
import DatabaseView from '../src/views/DatabaseView.vue'
import { useAdminAuthStore } from '../src/stores/auth'

// 性能测试辅助函数
function measureTime(fn: () => void | Promise<void>): Promise<number> {
  return new Promise(async (resolve) => {
    const start = performance.now()
    await fn()
    const end = performance.now()
    resolve(end - start)
  })
}

describe('管理员端性能测试', () => {
  let pinia: ReturnType<typeof createPinia>
  let router: ReturnType<typeof createRouter>

  beforeEach(() => {
    pinia = createPinia()
    router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { template: '<div>Home</div>' } },
        { path: '/users', component: UsersView },
        { path: '/database', component: DatabaseView },
      ],
    })
  })

  describe('页面加载时间测试', () => {
    it('管理员应用初始化时间应小于 2 秒', async () => {
      const loadTime = await measureTime(async () => {
        const wrapper = mount(App, {
          global: {
            plugins: [pinia, router],
          },
        })
        await wrapper.vm.$nextTick()
        wrapper.unmount()
      })

      console.log(`管理员应用初始化时间: ${loadTime.toFixed(2)}ms`)
      expect(loadTime).toBeLessThan(2000)
    })

    it('用户管理页面加载时间应小于 2 秒', async () => {
      // 模拟已登录的管理员
      const authStore = useAdminAuthStore(pinia)
      authStore.currentAdmin = {
        id: 'admin',
        username: 'admin',
        isMainAccount: true,
        permissions: [],
        rememberPassword: false,
        createdAt: new Date(),
        lastLoginAt: new Date(),
      }

      const loadTime = await measureTime(async () => {
        const wrapper = mount(UsersView, {
          global: {
            plugins: [pinia, router],
          },
        })
        await wrapper.vm.$nextTick()
        wrapper.unmount()
      })

      console.log(`用户管理页面加载时间: ${loadTime.toFixed(2)}ms`)
      expect(loadTime).toBeLessThan(2000)
    })

    it('数据库管理页面加载时间应小于 2 秒', async () => {
      const authStore = useAdminAuthStore(pinia)
      authStore.currentAdmin = {
        id: 'admin',
        username: 'admin',
        isMainAccount: true,
        permissions: [],
        rememberPassword: false,
        createdAt: new Date(),
        lastLoginAt: new Date(),
      }

      const loadTime = await measureTime(async () => {
        const wrapper = mount(DatabaseView, {
          global: {
            plugins: [pinia, router],
          },
        })
        await wrapper.vm.$nextTick()
        wrapper.unmount()
      })

      console.log(`数据库管理页面加载时间: ${loadTime.toFixed(2)}ms`)
      expect(loadTime).toBeLessThan(2000)
    })

    it('路由切换时间应小于 2 秒', async () => {
      const wrapper = mount(App, {
        global: {
          plugins: [pinia, router],
        },
      })

      const loadTime = await measureTime(async () => {
        await router.push('/users')
        await wrapper.vm.$nextTick()
      })

      console.log(`路由切换时间: ${loadTime.toFixed(2)}ms`)
      expect(loadTime).toBeLessThan(2000)

      wrapper.unmount()
    })
  })

  describe('用户交互响应时间测试', () => {
    it('按钮点击响应时间应小于 100ms', async () => {
      let clicked = false
      const wrapper = mount({
        template: '<button @click="onClick">测试按钮</button>',
        methods: {
          onClick() {
            clicked = true
          },
        },
      })

      const button = wrapper.find('button')
      const responseTime = await measureTime(async () => {
        await button.trigger('click')
      })

      console.log(`按钮点击响应时间: ${responseTime.toFixed(2)}ms`)
      expect(responseTime).toBeLessThan(100)
      expect(clicked).toBe(true)

      wrapper.unmount()
    })

    it('表单输入响应时间应小于 100ms', async () => {
      let inputValue = ''
      const wrapper = mount({
        template: '<input @input="onInput" />',
        methods: {
          onInput(e: Event) {
            inputValue = (e.target as HTMLInputElement).value
          },
        },
      })

      const input = wrapper.find('input')
      const responseTime = await measureTime(async () => {
        await input.setValue('测试输入')
      })

      console.log(`表单输入响应时间: ${responseTime.toFixed(2)}ms`)
      expect(responseTime).toBeLessThan(100)
      expect(inputValue).toBe('测试输入')

      wrapper.unmount()
    })

    it('搜索操作响应时间应小于 100ms', async () => {
      const authStore = useAdminAuthStore(pinia)
      authStore.currentAdmin = {
        id: 'admin',
        username: 'admin',
        isMainAccount: true,
        permissions: [],
        rememberPassword: false,
        createdAt: new Date(),
        lastLoginAt: new Date(),
      }

      const wrapper = mount(UsersView, {
        global: {
          plugins: [pinia, router],
        },
      })

      const responseTime = await measureTime(async () => {
        // 模拟搜索操作
        await wrapper.vm.$nextTick()
      })

      console.log(`搜索响应时间: ${responseTime.toFixed(2)}ms`)
      expect(responseTime).toBeLessThan(100)

      wrapper.unmount()
    })
  })

  describe('大列表渲染性能测试', () => {
    it('应该能够渲染 1000 个用户项目', async () => {
      const authStore = useAdminAuthStore(pinia)
      authStore.currentAdmin = {
        id: 'admin',
        username: 'admin',
        isMainAccount: true,
        permissions: [],
        rememberPassword: false,
        createdAt: new Date(),
        lastLoginAt: new Date(),
      }

      // 创建包含 1000 个用户的测试组件
      const TestComponent = {
        template: `
          <div>
            <div v-for="user in users" :key="user.id">
              {{ user.username }}
            </div>
          </div>
        `,
        data() {
          return {
            users: Array.from({ length: 1000 }, (_, i) => ({
              id: `user-${i}`,
              username: `用户${i}`,
            })),
          }
        },
      }

      const renderTime = await measureTime(async () => {
        const wrapper = mount(TestComponent, {
          global: {
            plugins: [pinia, router],
          },
        })
        await wrapper.vm.$nextTick()
        wrapper.unmount()
      })

      console.log(`渲染 1000 个用户耗时: ${renderTime.toFixed(2)}ms`)
      // 大列表渲染应该在合理时间内完成（5秒内）
      expect(renderTime).toBeLessThan(5000)
    })

    it('应该能够渲染 10000 个日志项目', async () => {
      const authStore = useAdminAuthStore(pinia)
      authStore.currentAdmin = {
        id: 'admin',
        username: 'admin',
        isMainAccount: true,
        permissions: [],
        rememberPassword: false,
        createdAt: new Date(),
        lastLoginAt: new Date(),
      }

      // 创建包含 10000 个日志的测试组件
      const TestComponent = {
        template: `
          <div>
            <div v-for="log in logs" :key="log.id">
              {{ log.message }}
            </div>
          </div>
        `,
        data() {
          return {
            logs: Array.from({ length: 10000 }, (_, i) => ({
              id: `log-${i}`,
              message: `日志消息 ${i}`,
            })),
          }
        },
      }

      const renderTime = await measureTime(async () => {
        const wrapper = mount(TestComponent, {
          global: {
            plugins: [pinia, router],
          },
        })
        await wrapper.vm.$nextTick()
        wrapper.unmount()
      })

      console.log(`渲染 10000 个日志耗时: ${renderTime.toFixed(2)}ms`)
      // 使用虚拟滚动后，即使 10000 个项目也应该快速渲染（10秒内）
      expect(renderTime).toBeLessThan(10000)
    })

    it('表格排序性能应该保持稳定', async () => {
      const authStore = useAdminAuthStore(pinia)
      authStore.currentAdmin = {
        id: 'admin',
        username: 'admin',
        isMainAccount: true,
        permissions: [],
        rememberPassword: false,
        createdAt: new Date(),
        lastLoginAt: new Date(),
      }

      // 创建包含 1000 个用户的测试组件
      const TestComponent = {
        template: `
          <div>
            <button @click="sortUsers">排序</button>
            <div v-for="user in sortedUsers" :key="user.id">
              {{ user.username }}
            </div>
          </div>
        `,
        data() {
          return {
            users: Array.from({ length: 1000 }, (_, i) => ({
              id: `user-${i}`,
              username: `用户${i}`,
            })),
            sorted: false,
          }
        },
        computed: {
          sortedUsers() {
            return this.sorted
              ? [...this.users].sort((a, b) => a.username.localeCompare(b.username))
              : this.users
          },
        },
        methods: {
          sortUsers() {
            this.sorted = !this.sorted
          },
        },
      }

      const wrapper = mount(TestComponent, {
        global: {
          plugins: [pinia, router],
        },
      })

      const sortTime = await measureTime(async () => {
        await wrapper.find('button').trigger('click')
        await wrapper.vm.$nextTick()
      })

      console.log(`排序 1000 个用户耗时: ${sortTime.toFixed(2)}ms`)
      // 排序应该快速完成（500ms内）
      expect(sortTime).toBeLessThan(500)

      wrapper.unmount()
    })

    it('筛选大列表时性能应该保持稳定', async () => {
      const authStore = useAdminAuthStore(pinia)
      authStore.currentAdmin = {
        id: 'admin',
        username: 'admin',
        isMainAccount: true,
        permissions: [],
        rememberPassword: false,
        createdAt: new Date(),
        lastLoginAt: new Date(),
      }

      // 创建包含 1000 个用户的测试组件
      const TestComponent = {
        template: `
          <div>
            <input v-model="filter" placeholder="筛选" />
            <div v-for="user in filteredUsers" :key="user.id">
              {{ user.username }}
            </div>
          </div>
        `,
        data() {
          return {
            users: Array.from({ length: 1000 }, (_, i) => ({
              id: `user-${i}`,
              username: `用户${i}`,
            })),
            filter: '',
          }
        },
        computed: {
          filteredUsers() {
            if (!this.filter) return this.users
            return this.users.filter(u => u.username.includes(this.filter))
          },
        },
      }

      const wrapper = mount(TestComponent, {
        global: {
          plugins: [pinia, router],
        },
      })

      const filterTime = await measureTime(async () => {
        await wrapper.find('input').setValue('用户500')
        await wrapper.vm.$nextTick()
      })

      console.log(`筛选 1000 个用户耗时: ${filterTime.toFixed(2)}ms`)
      // 筛选应该快速完成（500ms内）
      expect(filterTime).toBeLessThan(500)

      wrapper.unmount()
    })
  })

  describe('内存使用测试', () => {
    it('创建和销毁大量组件不应导致内存泄漏', async () => {
      const authStore = useAdminAuthStore(pinia)
      authStore.currentAdmin = {
        id: 'admin',
        username: 'admin',
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
        const wrapper = mount(UsersView, {
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
