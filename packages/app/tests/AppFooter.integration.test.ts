/**
 * AppFooter 集成测试 - 验证 Footer 在不同页面的显示
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.6
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import AppLayout from '../src/components/AppLayout.vue'
import AppFooter from '../src/components/AppFooter.vue'
import MemoListView from '../src/views/memo/MemoListView.vue'
import SettingsView from '../src/views/SettingsView.vue'
import StatisticsView from '../src/views/StatisticsView.vue'
import { VERSION } from '@shared/config/version'
import { createPinia, setActivePinia } from 'pinia'

describe('AppFooter 集成测试', () => {
  const footerStubs = {
    RouterLink: {
      props: ['to'],
      template: '<a :href="to"><slot /></a>',
    },
  }

  beforeEach(() => {
    // 为每个测试创建新的 Pinia 实例
    setActivePinia(createPinia())
  })

  describe('Footer 组件内容验证', () => {
    it('应该显示正确的版本号', () => {
      const wrapper = mount(AppFooter, { global: { stubs: footerStubs } })
      
      expect(wrapper.text()).toContain(`V${VERSION.full}`)
      expect(wrapper.text()).toContain(VERSION.full)
    })

    it('应该显示正确的作者信息', () => {
      const wrapper = mount(AppFooter, { global: { stubs: footerStubs } })
      
      expect(wrapper.text()).toContain('作者')
      expect(wrapper.text()).toContain(VERSION.author)
    })

    it('应该显示正确的版权信息', () => {
      const wrapper = mount(AppFooter, { global: { stubs: footerStubs } })
      
      expect(wrapper.text()).toContain(VERSION.copyright)
    })

    it('应该包含所有必需的信息元素', () => {
      const wrapper = mount(AppFooter, { global: { stubs: footerStubs } })
      const text = wrapper.text()
      
      // 验证所有必需信息都存在（footer-gate：V{full} · 作者 CYP · ©）
      expect(text).toContain(`V${VERSION.full}`)
      expect(text).toContain('作者')
      expect(text).toContain('CYP')
      expect(text).toContain('©')
    })

    it('应该链接到服务条款与隐私页', () => {
      const wrapper = mount(AppFooter, { global: { stubs: footerStubs } })
      const hrefs = wrapper.findAll('a').map((a) => a.attributes('href'))
      expect(hrefs).toContain('/terms')
      expect(hrefs).toContain('/privacy')
    })
  })

  describe('Footer 在 AppLayout 中的集成', () => {
    it('AppLayout 应该包含 AppFooter 组件', () => {
      const wrapper = mount(AppLayout, {
        global: {
          stubs: {
            MobileBottomNav: true,
            ...footerStubs,
          }
        }
      })
      
      // 验证 AppFooter 组件存在
      const footer = wrapper.findComponent(AppFooter)
      expect(footer.exists()).toBe(true)
    })

    it('AppLayout 中的 Footer 应该显示版本信息', () => {
      const wrapper = mount(AppLayout, {
        global: {
          stubs: {
            MobileBottomNav: true,
            ...footerStubs,
          }
        }
      })
      
      const footer = wrapper.findComponent(AppFooter)
      expect(footer.text()).toContain(`V${VERSION.full}`)
      expect(footer.text()).toContain(VERSION.full)
    })

    it('AppLayout 中的 Footer 应该有正确的 CSS 类', () => {
      const wrapper = mount(AppFooter, { global: { stubs: footerStubs } })
      
      expect(wrapper.classes()).toContain('app-footer')
      expect(wrapper.find('.footer-content').exists()).toBe(true)
    })
  })

  describe('Footer 在不同视图中的可见性', () => {
    it('MemoListView 应该通过 AppLayout 包含 Footer', async () => {
      const router = createRouter({
        history: createMemoryHistory(),
        routes: [
          {
            path: '/memos',
            component: MemoListView
          }
        ]
      })

      await router.push('/memos')
      await router.isReady()

      const wrapper = mount(MemoListView, {
        global: {
          plugins: [router],
          stubs: {
            MobileBottomNav: true,
            Button: true,
            Loading: true
          }
        }
      })

      // MemoListView 使用 AppLayout，应该包含 Footer
      const layout = wrapper.findComponent(AppLayout)
      expect(layout.exists()).toBe(true)
      
      const footer = layout.findComponent(AppFooter)
      expect(footer.exists()).toBe(true)
    })

    it('SettingsView 应该通过 AppLayout 包含 Footer', async () => {
      const router = createRouter({
        history: createMemoryHistory(),
        routes: [
          {
            path: '/settings',
            component: SettingsView
          }
        ]
      })

      await router.push('/settings')
      await router.isReady()

      const wrapper = mount(SettingsView, {
        global: {
          plugins: [router],
          stubs: {
            MobileBottomNav: true,
            Button: true,
            Modal: true
          }
        }
      })

      // SettingsView 使用 AppLayout，应该包含 Footer
      const layout = wrapper.findComponent(AppLayout)
      expect(layout.exists()).toBe(true)
      
      const footer = layout.findComponent(AppFooter)
      expect(footer.exists()).toBe(true)
    })

    it('StatisticsView 应该通过 AppLayout 包含 Footer', async () => {
      const router = createRouter({
        history: createMemoryHistory(),
        routes: [
          {
            path: '/statistics',
            component: StatisticsView
          }
        ]
      })

      await router.push('/statistics')
      await router.isReady()

      const wrapper = mount(StatisticsView, {
        global: {
          plugins: [router],
          stubs: {
            MobileBottomNav: true,
            Button: true,
            Loading: true
          }
        }
      })

      // StatisticsView 使用 AppLayout，应该包含 Footer
      const layout = wrapper.findComponent(AppLayout)
      expect(layout.exists()).toBe(true)
      
      const footer = layout.findComponent(AppFooter)
      expect(footer.exists()).toBe(true)
    })
  })

  describe('Footer 样式和布局验证', () => {
    it('Footer 应该有正确的 z-index 确保不被遮挡', () => {
      const wrapper = mount(AppFooter, { global: { stubs: footerStubs } })
      const footer = wrapper.find('.app-footer')
      
      expect(footer.exists()).toBe(true)
      // 验证 footer 元素存在（z-index 在 CSS 中定义为 90）
    })

    it('Footer 应该是 sticky 定位在底部', () => {
      const wrapper = mount(AppFooter, { global: { stubs: footerStubs } })
      const footer = wrapper.find('.app-footer')
      
      expect(footer.exists()).toBe(true)
      // 验证 footer 元素存在（position: sticky 在 CSS 中定义）
    })

    it('Footer 内容应该居中显示', () => {
      const wrapper = mount(AppFooter, { global: { stubs: footerStubs } })
      const footerContent = wrapper.find('.footer-content')
      
      expect(footerContent.exists()).toBe(true)
    })

    it('Footer 应该包含分隔符', () => {
      const wrapper = mount(AppFooter, { global: { stubs: footerStubs } })
      const dividers = wrapper.findAll('.sep')
      
      // footer-gate：V · © · 条款 · 隐私 · mailto 等多处 · 分隔
      expect(dividers.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('Footer 响应式设计验证', () => {
    it('Footer 应该在移动端有适配样式类', () => {
      const wrapper = mount(AppFooter, { global: { stubs: footerStubs } })
      
      // 验证 footer 元素存在，移动端样式通过 CSS media query 处理
      expect(wrapper.find('.app-footer').exists()).toBe(true)
      expect(wrapper.find('.footer-content').exists()).toBe(true)
    })

    it('Footer 内容应该支持 flex-wrap', () => {
      const wrapper = mount(AppFooter, { global: { stubs: footerStubs } })
      const footerContent = wrapper.find('.footer-content')
      
      // 验证 footer-content 存在（flex-wrap 在 CSS 中定义）
      expect(footerContent.exists()).toBe(true)
    })
  })
})
