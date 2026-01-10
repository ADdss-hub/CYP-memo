/**
 * CYP-memo 格式化工具
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

/**
 * 格式化日期时间为中文格式
 * @param date 日期对象或时间戳
 * @param includeTime 是否包含时间部分，默认为 true
 * @returns string 格式化后的日期时间字符串
 * @example
 * formatDateTime(new Date()) // "2025年1月5日 14:30:45"
 * formatDateTime(new Date(), false) // "2025年1月5日"
 */
export function formatDateTime(date: Date | number, includeTime: boolean = true): string {
  const d = typeof date === 'number' ? new Date(date) : date

  const year = d.getFullYear()
  const month = d.getMonth() + 1
  const day = d.getDate()

  let result = `${year}年${month}月${day}日`

  if (includeTime) {
    const hours = d.getHours().toString().padStart(2, '0')
    const minutes = d.getMinutes().toString().padStart(2, '0')
    const seconds = d.getSeconds().toString().padStart(2, '0')
    result += ` ${hours}:${minutes}:${seconds}`
  }

  return result
}

/**
 * 格式化相对时间（中文）
 * @param date 日期对象或时间戳
 * @returns string 相对时间描述
 * @example
 * formatRelativeTime(Date.now() - 1000) // "1秒前"
 * formatRelativeTime(Date.now() - 60000) // "1分钟前"
 */
export function formatRelativeTime(date: Date | number): string {
  const d = typeof date === 'number' ? new Date(date) : date
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffSeconds = Math.floor(diffMs / 1000)

  if (diffSeconds < 60) {
    return `${diffSeconds}秒前`
  }

  const diffMinutes = Math.floor(diffSeconds / 60)
  if (diffMinutes < 60) {
    return `${diffMinutes}分钟前`
  }

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) {
    return `${diffHours}小时前`
  }

  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 30) {
    return `${diffDays}天前`
  }

  const diffMonths = Math.floor(diffDays / 30)
  if (diffMonths < 12) {
    return `${diffMonths}个月前`
  }

  const diffYears = Math.floor(diffMonths / 12)
  return `${diffYears}年前`
}

/**
 * 格式化文件大小
 * @param bytes 文件大小（字节）
 * @param decimals 小数位数，默认为 2
 * @returns string 格式化后的文件大小字符串
 * @example
 * formatFileSize(1024) // "1.00 KB"
 * formatFileSize(1048576) // "1.00 MB"
 * formatFileSize(1073741824) // "1.00 GB"
 */
export function formatFileSize(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return '0 Bytes'

  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']

  const i = Math.floor(Math.log(bytes) / Math.log(k))
  const size = parseFloat((bytes / Math.pow(k, i)).toFixed(dm))

  return `${size} ${sizes[i]}`
}
