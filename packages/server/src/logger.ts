/**
 * CYP-memo 服务器日志模块
 * 统一的日志输出，支持日志级别控制
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import type { LogLevel } from './config.js'

/**
 * 日志级别优先级
 */
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
}

/**
 * 日志级别图标
 */
const LOG_ICONS: Record<LogLevel, string> = {
  debug: '🔍',
  info: '📋',
  warn: '⚠️',
  error: '❌'
}

/**
 * 服务器日志类
 */
class ServerLogger {
  private level: LogLevel = 'info'
  private isProduction: boolean = process.env.NODE_ENV === 'production'

  /**
   * 设置日志级别
   */
  setLevel(level: LogLevel): void {
    this.level = level
  }

  /**
   * 设置生产模式
   */
  setProduction(isProduction: boolean): void {
    this.isProduction = isProduction
  }

  /**
   * 检查是否应该输出该级别的日志
   */
  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.level]
  }

  /**
   * 格式化日志消息
   */
  private format(level: LogLevel, message: string, context?: Record<string, unknown>): string {
    const timestamp = new Date().toISOString()
    const icon = LOG_ICONS[level]
    const contextStr = context ? ` ${JSON.stringify(context)}` : ''
    return `[${timestamp}] ${icon} [${level.toUpperCase()}] ${message}${contextStr}`
  }

  /**
   * 调试日志
   */
  debug(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog('debug')) {
      console.debug(this.format('debug', message, context))
    }
  }

  /**
   * 信息日志
   */
  info(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog('info')) {
      console.info(this.format('info', message, context))
    }
  }

  /**
   * 警告日志
   */
  warn(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog('warn')) {
      console.warn(this.format('warn', message, context))
    }
  }

  /**
   * 错误日志
   */
  error(message: string, error?: Error | unknown, context?: Record<string, unknown>): void {
    if (this.shouldLog('error')) {
      const errorContext = error instanceof Error 
        ? { ...context, errorMessage: error.message, stack: error.stack }
        : { ...context, error: String(error) }
      console.error(this.format('error', message, errorContext))
    }
  }

  /**
   * 启动信息（始终输出，用于服务器启动）
   */
  startup(message: string): void {
    console.log(message)
  }

  /**
   * 敏感信息日志（仅在开发模式输出）
   */
  sensitive(message: string, context?: Record<string, unknown>): void {
    if (!this.isProduction && this.shouldLog('debug')) {
      console.debug(this.format('debug', `[SENSITIVE] ${message}`, context))
    }
  }
}

/**
 * 全局日志实例
 */
export const logger = new ServerLogger()

/**
 * 初始化日志配置
 */
export function initLogger(level: LogLevel, isProduction: boolean): void {
  logger.setLevel(level)
  logger.setProduction(isProduction)
}
