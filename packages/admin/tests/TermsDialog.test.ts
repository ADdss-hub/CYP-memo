/**
 * TermsDialog 组件测试（管理员端）
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import TermsDialog from '../src/components/TermsDialog.vue'
import { VERSION } from '@cyp-memo/shared'

describe('TermsDialog 组件测试（管理员端）', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('应该显示版本信息', () => {
    const wrapper = mount(TermsDialog)
    const text = wrapper.text()
    
    expect(text).toContain('版本')
    expect(text).toContain(`v${VERSION.full}`)
  })

  it('应该显示作者信息', () => {
    const wrapper = mount(TermsDialog)
    const text = wrapper.text()
    
    expect(text).toContain('作者')
    expect(text).toContain(VERSION.author)
    expect(text).toContain(VERSION.email)
  })

  it('应该从 VERSION 配置动态获取信息', () => {
    const wrapper = mount(TermsDialog)
    const text = wrapper.text()
    
    // 验证版本号格式正确
    expect(text).toContain(`v${VERSION.major}.${VERSION.minor}.${VERSION.patch}`)
    
    // 验证作者信息格式正确
    expect(text).toContain(VERSION.author)
    expect(text).toContain(VERSION.email)
  })
})
