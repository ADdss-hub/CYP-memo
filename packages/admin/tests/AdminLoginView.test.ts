/**
 * 管理员登录界面测试
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import AdminLoginView from '../src/views/AdminLoginView.vue'
import { useAdminAuthStore } from '../src/stores/auth'

// Mock router
const mockRouter = {
  push: vi.fn()
}

const mockRoute = {
  query: {}
}

vi.mock('vue-router', () => ({
  useRouter: () => mockRouter,
  useRoute: () => mockRoute
}))

describe('AdminLoginView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockRouter.push.mockClear()
  })

  it('应该渲染登录表单', () => {
    const wrapper = mount(AdminLoginView, {
      global: {
        stubs: {
          'router-link': true
        }
      }
    })

    expect(wrapper.find('.login-title').text()).toBe('CYP-memo 管理员端')
    expect(wrapper.find('.login-subtitle').text()).toBe('系统管理控制台')
  })

  it('应该有账号密码和个人令牌两种登录方式', () => {
    const wrapper = mount(AdminLoginView, {
      global: {
        stubs: {
          'router-link': true
        }
      }
    })

    const tabs = wrapper.findAll('.tab-button')
    expect(tabs).toHaveLength(2)
    expect(tabs[0].text()).toBe('账号密码登录')
    expect(tabs[1].text()).toBe('个人令牌登录')
  })

  it('应该默认显示账号密码登录表单', () => {
    const wrapper = mount(AdminLoginView, {
      global: {
        stubs: {
          'router-link': true
        }
      }
    })

    expect(wrapper.find('#username').exists()).toBe(true)
    expect(wrapper.find('#password').exists()).toBe(true)
  })

  it('应该能够切换到个人令牌登录', async () => {
    const wrapper = mount(AdminLoginView, {
      global: {
        stubs: {
          'router-link': true
        }
      }
    })

    const tokenTab = wrapper.findAll('.tab-button')[1]
    await tokenTab.trigger('click')

    expect(wrapper.find('#token').exists()).toBe(true)
  })

  it('应该显示管理员专用提示', () => {
    const wrapper = mount(AdminLoginView, {
      global: {
        stubs: {
          'router-link': true
        }
      }
    })

    expect(wrapper.find('.admin-notice').text()).toContain('只有主账号可以登录管理员端')
  })

  it('应该在表单为空时显示错误', async () => {
    const wrapper = mount(AdminLoginView, {
      global: {
        stubs: {
          'router-link': true
        }
      }
    })

    const form = wrapper.find('.login-form')
    await form.trigger('submit.prevent')

    expect(wrapper.find('.error-message').text()).toBe('请输入用户名和密码')
  })

  it('应该支持记住密码功能', () => {
    const wrapper = mount(AdminLoginView, {
      global: {
        stubs: {
          'router-link': true
        }
      }
    })

    const checkbox = wrapper.find('.checkbox-input')
    expect(checkbox.exists()).toBe(true)
  })

  it('应该支持显示/隐藏密码', async () => {
    const wrapper = mount(AdminLoginView, {
      global: {
        stubs: {
          'router-link': true
        }
      }
    })

    const passwordInput = wrapper.find('#password')
    expect(passwordInput.attributes('type')).toBe('password')

    const toggleButton = wrapper.find('.password-toggle')
    await toggleButton.trigger('click')

    expect(passwordInput.attributes('type')).toBe('text')
  })
})
