/**
 * 组件基础测试
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import Button from '../src/components/Button.vue'
import Loading from '../src/components/Loading.vue'
import AppFooter from '../src/components/AppFooter.vue'

describe('基础组件测试', () => {
  it('Button 组件应该正确渲染', () => {
    const wrapper = mount(Button, {
      slots: {
        default: '测试按钮'
      }
    })
    expect(wrapper.text()).toContain('测试按钮')
    expect(wrapper.classes()).toContain('btn')
  })

  it('Button 组件应该支持不同类型', () => {
    const wrapper = mount(Button, {
      props: {
        type: 'primary'
      }
    })
    expect(wrapper.classes()).toContain('btn-primary')
  })

  it('Button 组件应该支持禁用状态', () => {
    const wrapper = mount(Button, {
      props: {
        disabled: true
      }
    })
    expect(wrapper.classes()).toContain('btn-disabled')
    expect(wrapper.attributes('disabled')).toBeDefined()
  })

  it('Loading 组件应该正确渲染', () => {
    const wrapper = mount(Loading, {
      props: {
        text: '加载中...'
      }
    })
    expect(wrapper.text()).toContain('加载中...')
  })

  it('AppFooter 组件应该显示版本信息', () => {
    const wrapper = mount(AppFooter, {
      global: {
        stubs: {
          RouterLink: {
            template: '<a><slot /></a>',
          },
        },
      },
    })
    expect(wrapper.text()).toContain('V2.0.0')
    expect(wrapper.text()).toContain('作者')
    expect(wrapper.text()).toContain('CYP')
  })

  it('AppFooter 应提供服务条款与隐私链接', () => {
    const wrapper = mount(AppFooter, {
      global: {
        stubs: {
          RouterLink: {
            props: ['to'],
            template: '<a :href="to"><slot /></a>',
          },
        },
      },
    })
    expect(wrapper.text()).toContain('服务条款')
    expect(wrapper.text()).toContain('隐私')
    const hrefs = wrapper.findAll('a').map((a) => a.attributes('href'))
    expect(hrefs).toContain('/terms')
    expect(hrefs).toContain('/privacy')
  })
})
