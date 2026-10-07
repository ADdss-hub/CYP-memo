/**
 * CYP-memo 版本信息
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

export const VERSION = {
  major: 2,
  minor: 0,
  patch: 1,
  get full() {
    return `${this.major}.${this.minor}.${this.patch}`
  },
  author: 'CYP',
  email: 'nasDSSCYP@outlook.com',
  get copyright() {
    return `© ${new Date().getFullYear()} CYP-memo 版权所有 作者：CYP`
  },
  /** 分行展示（兼容旧调用） */
  get copyrightLines() {
    const year = new Date().getFullYear()
    return {
      line1: `CYP-memo V${this.full}`,
      line2: `作者：CYP`,
      line3: `© ${year} CYP-memo 版权所有 作者：CYP`,
      line4: '保留所有权利',
    }
  },
}
