/**
 * CYP-memo 认证管理器属性测试
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fc from 'fast-check'
import { authManager } from '../src/managers/AuthManager'
import { userDAO } from '../src/database/UserDAO'
import { hashPassword } from '../src/utils/crypto'
import type { SecurityQuestion } from '../src/types'

describe('认证管理器属性测试', () => {
  // 清理测试环境
  beforeEach(async () => {
    // 清空数据库
    const users = await userDAO.getAll()
    for (const user of users) {
      await userDAO.delete(user.id)
    }
    
    // 清空本地存储
    localStorage.clear()
  })

  afterEach(async () => {
    // 清空数据库
    const users = await userDAO.getAll()
    for (const user of users) {
      await userDAO.delete(user.id)
    }
    
    // 清空本地存储
    localStorage.clear()
  })

  describe('登录验证属性', () => {
    // Feature: cyp-memo, Property 4: 登录验证正确性
    it('属性 4: 对于任何有效的用户名密码组合，登录验证应该成功；对于任何无效组合，应该失败', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0), // username (non-empty after trim)
            fc.string({ minLength: 8, maxLength: 20 })
              .filter(s => /[a-zA-Z]/.test(s) && /[0-9]/.test(s)), // valid password
            fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0), // security question
            fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0)  // security answer
          ),
          async ([username, password, question, answer]) => {
            // 添加时间戳确保用户名唯一
            const uniqueUsername = `${username}_${Date.now()}_${Math.random().toString(36).substring(7)}`
            
            // 创建安全问题
            const answerHash = await hashPassword(answer)
            const securityQuestion: SecurityQuestion = {
              question,
              answerHash
            }
            
            // 注册用户
            const user = await authManager.registerWithPassword(uniqueUsername, password, securityQuestion)
            expect(user).toBeDefined()
            expect(user.username).toBe(uniqueUsername)
            
            // 清除登录状态
            await authManager.logout()
            
            // 测试有效的用户名密码组合应该成功
            const loginResult = await authManager.loginWithPassword(uniqueUsername, password)
            expect(loginResult).toBeDefined()
            expect(loginResult.id).toBe(user.id)
            expect(loginResult.username).toBe(uniqueUsername)
            
            // 清除登录状态
            await authManager.logout()
            
            // 测试无效的密码应该失败
            const wrongPassword = password + 'wrong'
            await expect(
              authManager.loginWithPassword(uniqueUsername, wrongPassword)
            ).rejects.toThrow()
            
            // 测试不存在的用户名应该失败
            const wrongUsername = uniqueUsername + '_nonexistent'
            await expect(
              authManager.loginWithPassword(wrongUsername, password)
            ).rejects.toThrow()
            
            // 清理
            await userDAO.delete(user.id)
          }
        ),
        { numRuns: 20 }
      )
    }, 60000) // 60 second timeout

    // Feature: cyp-memo, Property 5: 令牌验证正确性
    it('属性 5: 对于任何有效的令牌，验证应该成功；对于任何无效或格式错误的令牌，应该失败', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constant(null),
          async () => {
            // 注册令牌用户
            const { user, token } = await authManager.registerWithToken()
            expect(user).toBeDefined()
            expect(token).toBeDefined()
            expect(token.length).toBe(64)
            
            // 清除登录状态
            await authManager.logout()
            
            // 测试有效的令牌应该成功
            const loginResult = await authManager.loginWithToken(token)
            expect(loginResult).toBeDefined()
            expect(loginResult.id).toBe(user.id)
            expect(loginResult.token).toBe(token)
            
            // 清除登录状态
            await authManager.logout()
            
            // 测试无效的令牌应该失败
            const wrongToken = token.substring(0, 63) + 'x'
            await expect(
              authManager.loginWithToken(wrongToken)
            ).rejects.toThrow()
            
            // 测试格式错误的令牌应该失败
            await expect(
              authManager.loginWithToken('invalid-token')
            ).rejects.toThrow()
            
            await expect(
              authManager.loginWithToken('')
            ).rejects.toThrow()
            
            // 清理
            await userDAO.delete(user.id)
          }
        ),
        { numRuns: 20 }
      )
    }, 60000) // 60 second timeout
  })

  describe('登录状态持久化属性', () => {
    // Feature: cyp-memo, Property 6: 登录状态持久化
    it('属性 6: 对于任何成功的登录操作，本地存储应该包含认证信息', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
            fc.string({ minLength: 8, maxLength: 20 })
              .filter(s => /[a-zA-Z]/.test(s) && /[0-9]/.test(s)),
            fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
            fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0)
          ),
          async ([username, password, question, answer]) => {
            // 添加时间戳确保用户名唯一
            const uniqueUsername = `${username}_${Date.now()}_${Math.random().toString(36).substring(7)}`
            
            // 创建安全问题
            const answerHash = await hashPassword(answer)
            const securityQuestion: SecurityQuestion = {
              question,
              answerHash
            }
            
            // 注册并登录
            const user = await authManager.registerWithPassword(uniqueUsername, password, securityQuestion)
            await authManager.logout()
            await authManager.loginWithPassword(uniqueUsername, password)
            
            // 验证本地存储包含认证信息
            const authData = localStorage.getItem('cyp-memo-auth')
            expect(authData).toBeDefined()
            expect(authData).not.toBeNull()
            
            const authInfo = JSON.parse(authData!)
            expect(authInfo.userId).toBe(user.id)
            expect(authInfo.username).toBe(uniqueUsername)
            expect(authInfo.loginType).toBe('password')
            expect(authInfo.timestamp).toBeDefined()
            
            // 清理
            await userDAO.delete(user.id)
          }
        ),
        { numRuns: 20 }
      )
    }, 60000)

    // Feature: cyp-memo, Property 7: 自动登录
    it('属性 7: 对于任何在本地存储中有有效认证信息的情况，系统应该能够自动登录', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
            fc.string({ minLength: 8, maxLength: 20 })
              .filter(s => /[a-zA-Z]/.test(s) && /[0-9]/.test(s)),
            fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
            fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0)
          ),
          async ([username, password, question, answer]) => {
            // 添加时间戳确保用户名唯一
            const uniqueUsername = `${username}_${Date.now()}_${Math.random().toString(36).substring(7)}`
            
            // 创建安全问题
            const answerHash = await hashPassword(answer)
            const securityQuestion: SecurityQuestion = {
              question,
              answerHash
            }
            
            // 注册并登录
            const user = await authManager.registerWithPassword(uniqueUsername, password, securityQuestion)
            await authManager.logout()
            await authManager.loginWithPassword(uniqueUsername, password)
            
            // 验证本地存储有认证信息
            const authData = localStorage.getItem('cyp-memo-auth')
            expect(authData).not.toBeNull()
            
            // 测试自动登录
            const autoLoginUser = await authManager.autoLogin()
            expect(autoLoginUser).not.toBeNull()
            expect(autoLoginUser!.id).toBe(user.id)
            expect(autoLoginUser!.username).toBe(uniqueUsername)
            
            // 清理
            await userDAO.delete(user.id)
          }
        ),
        { numRuns: 20 }
      )
    }, 60000)

    // Feature: cyp-memo, Property 8: 注销清理
    it('属性 8: 对于任何注销操作，本地存储中的认证信息应该被完全清除', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
            fc.string({ minLength: 8, maxLength: 20 })
              .filter(s => /[a-zA-Z]/.test(s) && /[0-9]/.test(s)),
            fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
            fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0)
          ),
          async ([username, password, question, answer]) => {
            // 添加时间戳确保用户名唯一
            const uniqueUsername = `${username}_${Date.now()}_${Math.random().toString(36).substring(7)}`
            
            // 创建安全问题
            const answerHash = await hashPassword(answer)
            const securityQuestion: SecurityQuestion = {
              question,
              answerHash
            }
            
            // 注册并登录
            const user = await authManager.registerWithPassword(uniqueUsername, password, securityQuestion)
            await authManager.logout()
            await authManager.loginWithPassword(uniqueUsername, password)
            
            // 验证登录后有认证信息
            let authData = localStorage.getItem('cyp-memo-auth')
            expect(authData).not.toBeNull()
            
            // 注销
            await authManager.logout()
            
            // 验证认证信息被清除
            authData = localStorage.getItem('cyp-memo-auth')
            expect(authData).toBeNull()
            
            // 验证自动登录失败
            const autoLoginUser = await authManager.autoLogin()
            expect(autoLoginUser).toBeNull()
            
            // 清理
            await userDAO.delete(user.id)
          }
        ),
        { numRuns: 20 }
      )
    }, 60000)
  })

  describe('安全问题和密码重置属性', () => {
    // Feature: cyp-memo, Property 9: 安全问题验证
    it('属性 9: 对于任何用户和安全问题答案，验证函数应该正确判断答案是否与存储的答案匹配', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
            fc.string({ minLength: 8, maxLength: 20 })
              .filter(s => /[a-zA-Z]/.test(s) && /[0-9]/.test(s)),
            fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
            fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0)
          ),
          async ([username, password, question, answer]) => {
            // 添加时间戳确保用户名唯一
            const uniqueUsername = `${username}_${Date.now()}_${Math.random().toString(36).substring(7)}`
            
            // 创建安全问题
            const answerHash = await hashPassword(answer)
            const securityQuestion: SecurityQuestion = {
              question,
              answerHash
            }
            
            // 注册用户
            const user = await authManager.registerWithPassword(uniqueUsername, password, securityQuestion)
            
            // 生成新密码
            const newPassword = password + '123'
            
            // 测试正确的答案应该成功
            await expect(
              authManager.resetPassword(uniqueUsername, answer, newPassword)
            ).resolves.not.toThrow()
            
            // 验证密码已更改（使用新密码登录）
            await authManager.logout()
            const loginResult = await authManager.loginWithPassword(uniqueUsername, newPassword)
            expect(loginResult).toBeDefined()
            
            // 测试错误的答案应该失败
            const wrongAnswer = answer + '_wrong'
            const anotherNewPassword = newPassword + '456'
            await expect(
              authManager.resetPassword(uniqueUsername, wrongAnswer, anotherNewPassword)
            ).rejects.toThrow('安全问题答案错误')
            
            // 清理
            await userDAO.delete(user.id)
          }
        ),
        { numRuns: 20 }
      )
    }, 60000)

    // Feature: cyp-memo, Property 10: 密码重置
    it('属性 10: 对于任何安全问题答案正确的情况，密码重置应该成功，且新密码应该生效', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
            fc.string({ minLength: 8, maxLength: 20 })
              .filter(s => /[a-zA-Z]/.test(s) && /[0-9]/.test(s)),
            fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
            fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
            fc.string({ minLength: 8, maxLength: 20 })
              .filter(s => /[a-zA-Z]/.test(s) && /[0-9]/.test(s))
          ),
          async ([username, oldPassword, question, answer, newPassword]) => {
            // 添加时间戳确保用户名唯一
            const uniqueUsername = `${username}_${Date.now()}_${Math.random().toString(36).substring(7)}`
            
            // 确保新旧密码不同
            if (oldPassword === newPassword) {
              newPassword = newPassword + 'x1'
            }
            
            // 创建安全问题
            const answerHash = await hashPassword(answer)
            const securityQuestion: SecurityQuestion = {
              question,
              answerHash
            }
            
            // 注册用户
            const user = await authManager.registerWithPassword(uniqueUsername, oldPassword, securityQuestion)
            
            // 重置密码
            await authManager.resetPassword(uniqueUsername, answer, newPassword)
            
            // 验证旧密码不再有效
            await authManager.logout()
            await expect(
              authManager.loginWithPassword(uniqueUsername, oldPassword)
            ).rejects.toThrow()
            
            // 验证新密码有效
            const loginResult = await authManager.loginWithPassword(uniqueUsername, newPassword)
            expect(loginResult).toBeDefined()
            expect(loginResult.id).toBe(user.id)
            
            // 清理
            await userDAO.delete(user.id)
          }
        ),
        { numRuns: 20 }
      )
    }, 60000)
  })

  describe('密码记住功能属性', () => {
    // Feature: cyp-memo, Property 31: 密码记住功能
    it('属性 31: 对于任何选择记住密码的用户，下次访问时应该能够获取记住的密码信息', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
            fc.string({ minLength: 8, maxLength: 20 })
              .filter(s => /[a-zA-Z]/.test(s) && /[0-9]/.test(s)),
            fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
            fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
            fc.boolean() // remember flag
          ),
          async ([username, password, question, answer, remember]) => {
            // 添加时间戳确保用户名唯一
            const uniqueUsername = `${username}_${Date.now()}_${Math.random().toString(36).substring(7)}`
            
            // 创建安全问题
            const answerHash = await hashPassword(answer)
            const securityQuestion: SecurityQuestion = {
              question,
              answerHash
            }
            
            // 注册用户
            const user = await authManager.registerWithPassword(uniqueUsername, password, securityQuestion)
            await authManager.logout()
            
            // 使用记住密码选项登录
            await authManager.loginWithPassword(uniqueUsername, password, remember)
            
            // 获取记住的密码信息
            const rememberInfo = authManager.getRememberInfo()
            
            if (remember) {
              // 如果选择记住，应该能获取到信息
              expect(rememberInfo).not.toBeNull()
              expect(rememberInfo!.username).toBe(uniqueUsername)
              expect(rememberInfo!.password).toBe(password)
            } else {
              // 如果不记住，应该没有信息
              expect(rememberInfo).toBeNull()
            }
            
            // 清理
            await userDAO.delete(user.id)
          }
        ),
        { numRuns: 20 }
      )
    }, 60000)

    // 扩展测试：验证记住密码在注销后仍然保留
    it('属性 31 (扩展): 记住的密码信息在注销后应该仍然保留', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
            fc.string({ minLength: 8, maxLength: 20 })
              .filter(s => /[a-zA-Z]/.test(s) && /[0-9]/.test(s)),
            fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
            fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0)
          ),
          async ([username, password, question, answer]) => {
            // 添加时间戳确保用户名唯一
            const uniqueUsername = `${username}_${Date.now()}_${Math.random().toString(36).substring(7)}`
            
            // 创建安全问题
            const answerHash = await hashPassword(answer)
            const securityQuestion: SecurityQuestion = {
              question,
              answerHash
            }
            
            // 注册用户
            const user = await authManager.registerWithPassword(uniqueUsername, password, securityQuestion)
            await authManager.logout()
            
            // 使用记住密码选项登录
            await authManager.loginWithPassword(uniqueUsername, password, true)
            
            // 验证记住的密码信息存在
            let rememberInfo = authManager.getRememberInfo()
            expect(rememberInfo).not.toBeNull()
            expect(rememberInfo!.username).toBe(uniqueUsername)
            
            // 注销
            await authManager.logout()
            
            // 验证记住的密码信息仍然存在
            rememberInfo = authManager.getRememberInfo()
            expect(rememberInfo).not.toBeNull()
            expect(rememberInfo!.username).toBe(uniqueUsername)
            expect(rememberInfo!.password).toBe(password)
            
            // 清理
            await userDAO.delete(user.id)
          }
        ),
        { numRuns: 20 }
      )
    }, 60000)

    // 扩展测试：验证不记住密码时，之前的记住信息会被清除
    it('属性 31 (扩展): 当用户选择不记住密码时，之前记住的密码信息应该被清除', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
            fc.string({ minLength: 8, maxLength: 20 })
              .filter(s => /[a-zA-Z]/.test(s) && /[0-9]/.test(s)),
            fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
            fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0)
          ),
          async ([username, password, question, answer]) => {
            // 添加时间戳确保用户名唯一
            const uniqueUsername = `${username}_${Date.now()}_${Math.random().toString(36).substring(7)}`
            
            // 创建安全问题
            const answerHash = await hashPassword(answer)
            const securityQuestion: SecurityQuestion = {
              question,
              answerHash
            }
            
            // 注册用户
            const user = await authManager.registerWithPassword(uniqueUsername, password, securityQuestion)
            await authManager.logout()
            
            // 第一次登录：记住密码
            await authManager.loginWithPassword(uniqueUsername, password, true)
            let rememberInfo = authManager.getRememberInfo()
            expect(rememberInfo).not.toBeNull()
            
            // 注销
            await authManager.logout()
            
            // 第二次登录：不记住密码
            await authManager.loginWithPassword(uniqueUsername, password, false)
            rememberInfo = authManager.getRememberInfo()
            expect(rememberInfo).toBeNull()
            
            // 清理
            await userDAO.delete(user.id)
          }
        ),
        { numRuns: 20 }
      )
    }, 60000)
  })
})
