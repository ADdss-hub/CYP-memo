/**
 * 法律文案结构测试
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { describe, it, expect } from 'vitest'
import { TERMS_SECTIONS, PRIVACY_SECTIONS, LEGAL_EFFECTIVE_DATE } from '../src/content/legal'

describe('legal 文案', () => {
  it('生效日与条款章节齐全', () => {
    expect(LEGAL_EFFECTIVE_DATE).toBe('2026-10-07')
    const titles = TERMS_SECTIONS.map((s) => s.title)
    expect(titles).toEqual(
      expect.arrayContaining([
        '服务说明',
        '功能范围',
        '账户与认证',
        '用户行为与生成内容',
        '自动化工具与 AI 客户端',
        '免责声明',
        '知识产权',
        '第三方服务',
        '服务变更、终止与数据处置',
        '未成年人',
      ])
    )
    for (const s of TERMS_SECTIONS) {
      expect(Boolean(s.content) || Boolean(s.list?.length)).toBe(true)
    }
    const blob = TERMS_SECTIONS.flatMap((s) => [s.content, ...(s.list ?? [])]).join(' ')
    expect(blob).toContain('MCP')
    expect(blob).toContain('HTTPS')
    expect(blob).not.toContain('禁止商业用途')
  })

  it('隐私政策覆盖收集、存储、权利与跨境', () => {
    const titles = PRIVACY_SECTIONS.map((s) => s.title)
    expect(titles).toEqual(
      expect.arrayContaining([
        '处理原则与控制者',
        '我们处理的信息',
        'Cookie 与本地存储',
        '共享、披露与跨境',
        '您的权利',
      ])
    )
    const blob = PRIVACY_SECTIONS.flatMap((s) => [s.content, ...(s.list ?? [])]).join(' ')
    expect(blob).toContain('业务库')
    expect(blob).toContain('GitHub')
    expect(blob).toContain('系统存储空间')
    expect(blob).toContain('文件库存储空间')
    expect(blob).toContain('OAuth')
    expect(blob).not.toContain('不收集任何个人敏感信息')
  })
})
