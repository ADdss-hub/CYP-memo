/**
 * CYP-memo 版本信息
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

export const VERSION = {
  major: 1,
  minor: 9,
  patch: 0,
  get full() {
    return `${this.major}.${this.minor}.${this.patch}`
  },
  author: 'CYP',
  email: 'nasDSSCYP@outlook.com',
  /** 版权信息（单行） */
  get copyright() {
    return `版权所有 © ${new Date().getFullYear()} CYP. 保留所有权利.`
  },
  /** 分行展示版权信息（优化版） */
  get copyrightLines() {
    return {
      line1: `CYP-memo v${this.full}`,
      line2: `作者: ${this.author}`,
      line3: `版权所有 © ${new Date().getFullYear()} CYP`,
      line4: '保留所有权利',
    }
  },
}
