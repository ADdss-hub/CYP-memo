/**
 * CYP-memo 验证工具
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

/**
 * 密码强度验证结果
 */
export interface PasswordValidationResult {
  valid: boolean
  errors: string[]
}

/**
 * 验证密码强度
 * 要求：至少 8 位，包含字母和数字
 * @param password 待验证的密码
 * @returns PasswordValidationResult 验证结果
 */
export function validatePasswordStrength(password: string): PasswordValidationResult {
  const errors: string[] = []

  // 检查长度
  if (password.length < 8) {
    errors.push('密码长度至少为 8 位')
  }

  // 检查是否包含字母
  if (!/[a-zA-Z]/.test(password)) {
    errors.push('密码必须包含字母')
  }

  // 检查是否包含数字
  if (!/[0-9]/.test(password)) {
    errors.push('密码必须包含数字')
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * 验证标签名称
 * 要求：不为空且不超过 20 个字符
 * @param tagName 待验证的标签名称
 * @returns boolean 标签名称是否有效
 */
export function validateTagName(tagName: string): boolean {
  // 去除首尾空格后检查
  const trimmed = tagName.trim()
  return trimmed.length > 0 && trimmed.length <= 20
}

/**
 * 验证文件大小
 * 要求：不超过 10GB
 * @param fileSize 文件大小（字节）
 * @returns boolean 文件大小是否有效
 */
export function validateFileSize(fileSize: number): boolean {
  const MAX_FILE_SIZE = 10 * 1024 * 1024 * 1024 // 10GB in bytes
  return fileSize > 0 && fileSize <= MAX_FILE_SIZE
}

/**
 * 获取最大文件大小（字节）
 * @returns number 最大文件大小
 */
export function getMaxFileSize(): number {
  return 10 * 1024 * 1024 * 1024 // 10GB
}
