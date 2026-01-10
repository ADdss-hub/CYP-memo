/**
 * CYP-memo 认证管理器单元测试
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { authManager } from '../src/managers/AuthManager'
import { userDAO } from '../src/database/UserDAO'
import { hashPassword } from '../src/utils/crypto'
import type { SecurityQuestion } from '../src/types'
import { Permission } from '../src/types'

describe('认证管理器单元测试', () => {
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

  describe('边界情况测试', () => {
    describe('账号密码登录边界情况', () => {
      it('应该拒绝空用户名', async () => {
        await expect(
          authManager.loginWithPassword('', 'password123')
        ).rejects.toThrow()
      })

      it('应该拒绝空密码', async () => {
        const username = 'testuser'
        const password = 'validPass123'
        const securityQuestion: SecurityQuestion = {
          question: '你的宠物叫什么？',
          answerHash: await hashPassword('fluffy')
        }
        
        await authManager.registerWithPassword(username, password, securityQuestion)
        await authManager.logout()
        
        await expect(
          authManager.loginWithPassword(username, '')
        ).rejects.toThrow()
      })

      it('应该拒绝只有空格的用户名', async () => {
        await expect(
          authManager.loginWithPassword('   ', 'password123')
        ).rejects.toThrow()
      })

      it('应该处理不存在的用户', async () => {
        await expect(
          authManager.loginWithPassword('nonexistent_user_12345', 'password123')
        ).rejects.toThrow('用户名或密码错误')
      })

      it('应该拒绝令牌用户使用密码登录', async () => {
        const { user } = await authManager.registerWithToken()
        await authManager.logout()
        
        await expect(
          authManager.loginWithPassword(user.username, 'anypassword123')
        ).rejects.toThrow('该用户不支持密码登录')
      })
    })

    describe('个人令牌登录边界情况', () => {
      it('应该拒绝空令牌', async () => {
        await expect(
          authManager.loginWithToken('')
        ).rejects.toThrow('令牌格式无效')
      })

      it('应该拒绝格式错误的令牌（太短）', async () => {
        await expect(
          authManager.loginWithToken('short')
        ).rejects.toThrow('令牌格式无效')
      })

      it('应该拒绝格式错误的令牌（包含非法字符）', async () => {
        await expect(
          authManager.loginWithToken('invalid-token-with-dashes-and-spaces!')
        ).rejects.toThrow('令牌格式无效')
      })

      it('应该拒绝不存在的令牌', async () => {
        const fakeToken = 'a'.repeat(64) // 64个字符的有效格式但不存在的令牌
        await expect(
          authManager.loginWithToken(fakeToken)
        ).rejects.toThrow('令牌无效或不存在')
      })
    })

    describe('账号密码注册边界情况', () => {
      it('应该拒绝空用户名', async () => {
        const securityQuestion: SecurityQuestion = {
          question: '你的宠物叫什么？',
          answerHash: await hashPassword('fluffy')
        }
        
        await expect(
          authManager.registerWithPassword('', 'validPass123', securityQuestion)
        ).rejects.toThrow('用户名不能为空')
      })

      it('应该拒绝只有空格的用户名', async () => {
        const securityQuestion: SecurityQuestion = {
          question: '你的宠物叫什么？',
          answerHash: await hashPassword('fluffy')
        }
        
        await expect(
          authManager.registerWithPassword('   ', 'validPass123', securityQuestion)
        ).rejects.toThrow('用户名不能为空')
      })

      it('应该拒绝重复的用户名', async () => {
        const username = 'duplicateuser'
        const password = 'validPass123'
        const securityQuestion: SecurityQuestion = {
          question: '你的宠物叫什么？',
          answerHash: await hashPassword('fluffy')
        }
        
        await authManager.registerWithPassword(username, password, securityQuestion)
        
        await expect(
          authManager.registerWithPassword(username, password, securityQuestion)
        ).rejects.toThrow('用户名已存在')
      })

      it('应该拒绝弱密码（太短）', async () => {
        const securityQuestion: SecurityQuestion = {
          question: '你的宠物叫什么？',
          answerHash: await hashPassword('fluffy')
        }
        
        await expect(
          authManager.registerWithPassword('testuser', 'short1', securityQuestion)
        ).rejects.toThrow()
      })

      it('应该拒绝弱密码（只有字母）', async () => {
        const securityQuestion: SecurityQuestion = {
          question: '你的宠物叫什么？',
          answerHash: await hashPassword('fluffy')
        }
        
        await expect(
          authManager.registerWithPassword('testuser', 'onlyletters', securityQuestion)
        ).rejects.toThrow()
      })

      it('应该拒绝弱密码（只有数字）', async () => {
        const securityQuestion: SecurityQuestion = {
          question: '你的宠物叫什么？',
          answerHash: await hashPassword('fluffy')
        }
        
        await expect(
          authManager.registerWithPassword('testuser', '12345678', securityQuestion)
        ).rejects.toThrow()
      })

      it('应该拒绝空的安全问题', async () => {
        const securityQuestion: SecurityQuestion = {
          question: '',
          answerHash: await hashPassword('fluffy')
        }
        
        await expect(
          authManager.registerWithPassword('testuser', 'validPass123', securityQuestion)
        ).rejects.toThrow('安全问题和答案不能为空')
      })

      it('应该拒绝空的安全答案哈希', async () => {
        const securityQuestion: SecurityQuestion = {
          question: '你的宠物叫什么？',
          answerHash: ''
        }
        
        await expect(
          authManager.registerWithPassword('testuser', 'validPass123', securityQuestion)
        ).rejects.toThrow('安全问题和答案不能为空')
      })

      it('应该为新用户分配所有主账号权限', async () => {
        const username = 'newuser'
        const password = 'validPass123'
        const securityQuestion: SecurityQuestion = {
          question: '你的宠物叫什么？',
          answerHash: await hashPassword('fluffy')
        }
        
        const user = await authManager.registerWithPassword(username, password, securityQuestion)
        
        expect(user.isMainAccount).toBe(true)
        expect(user.permissions).toContain(Permission.MEMO_MANAGE)
        expect(user.permissions).toContain(Permission.STATISTICS_VIEW)
        expect(user.permissions).toContain(Permission.ATTACHMENT_MANAGE)
        expect(user.permissions).toContain(Permission.SETTINGS_MANAGE)
        expect(user.permissions).toContain(Permission.ACCOUNT_MANAGE)
      })
    })

    describe('密码找回边界情况', () => {
      it('应该拒绝不存在的用户名', async () => {
        await expect(
          authManager.resetPassword('nonexistent', 'answer', 'newPass123')
        ).rejects.toThrow('用户不存在')
      })

      it('应该拒绝令牌用户的密码找回', async () => {
        const { user } = await authManager.registerWithToken()
        
        await expect(
          authManager.resetPassword(user.username, 'answer', 'newPass123')
        ).rejects.toThrow('该用户未设置安全问题，请联系管理员')
      })

      it('应该拒绝错误的安全问题答案', async () => {
        const username = 'testuser'
        const password = 'validPass123'
        const securityQuestion: SecurityQuestion = {
          question: '你的宠物叫什么？',
          answerHash: await hashPassword('fluffy')
        }
        
        await authManager.registerWithPassword(username, password, securityQuestion)
        
        await expect(
          authManager.resetPassword(username, 'wronganswer', 'newPass123')
        ).rejects.toThrow('安全问题答案错误')
      })

      it('应该拒绝弱的新密码', async () => {
        const username = 'testuser'
        const password = 'validPass123'
        const answer = 'fluffy'
        const securityQuestion: SecurityQuestion = {
          question: '你的宠物叫什么？',
          answerHash: await hashPassword(answer)
        }
        
        await authManager.registerWithPassword(username, password, securityQuestion)
        
        await expect(
          authManager.resetPassword(username, answer, 'weak')
        ).rejects.toThrow()
      })

      it('应该成功重置密码并使旧密码失效', async () => {
        const username = 'testuser'
        const oldPassword = 'oldPass123'
        const newPassword = 'newPass456'
        const answer = 'fluffy'
        const securityQuestion: SecurityQuestion = {
          question: '你的宠物叫什么？',
          answerHash: await hashPassword(answer)
        }
        
        const user = await authManager.registerWithPassword(username, oldPassword, securityQuestion)
        await authManager.resetPassword(username, answer, newPassword)
        await authManager.logout()
        
        // 旧密码应该失效
        await expect(
          authManager.loginWithPassword(username, oldPassword)
        ).rejects.toThrow()
        
        // 新密码应该有效
        const loginResult = await authManager.loginWithPassword(username, newPassword)
        expect(loginResult.id).toBe(user.id)
      })
    })

    describe('自动登录边界情况', () => {
      it('应该在没有认证信息时返回 null', async () => {
        const result = await authManager.autoLogin()
        expect(result).toBeNull()
      })

      it('应该在认证信息损坏时返回 null', async () => {
        localStorage.setItem('cyp-memo-auth', 'invalid json')
        const result = await authManager.autoLogin()
        expect(result).toBeNull()
      })

      it('应该在用户被删除后返回 null', async () => {
        const username = 'testuser'
        const password = 'validPass123'
        const securityQuestion: SecurityQuestion = {
          question: '你的宠物叫什么？',
          answerHash: await hashPassword('fluffy')
        }
        
        const user = await authManager.registerWithPassword(username, password, securityQuestion)
        await authManager.logout()
        await authManager.loginWithPassword(username, password)
        
        // 删除用户
        await userDAO.delete(user.id)
        
        // 自动登录应该失败
        const result = await authManager.autoLogin()
        expect(result).toBeNull()
        
        // 认证信息应该被清除
        const authData = localStorage.getItem('cyp-memo-auth')
        expect(authData).toBeNull()
      })
    })

    describe('记住密码边界情况', () => {
      it('应该在未记住密码时返回 null', async () => {
        const info = authManager.getRememberInfo()
        expect(info).toBeNull()
      })

      it('应该在记住密码信息损坏时返回 null', async () => {
        localStorage.setItem('cyp-memo-remember', 'invalid json')
        const info = authManager.getRememberInfo()
        expect(info).toBeNull()
      })

      it('应该在选择不记住时清除之前的记住信息', async () => {
        const username = 'testuser'
        const password = 'validPass123'
        const securityQuestion: SecurityQuestion = {
          question: '你的宠物叫什么？',
          answerHash: await hashPassword('fluffy')
        }
        
        await authManager.registerWithPassword(username, password, securityQuestion)
        await authManager.logout()
        
        // 第一次登录：记住密码
        await authManager.loginWithPassword(username, password, true)
        let info = authManager.getRememberInfo()
        expect(info).not.toBeNull()
        expect(info!.username).toBe(username)
        
        await authManager.logout()
        
        // 第二次登录：不记住密码
        await authManager.loginWithPassword(username, password, false)
        info = authManager.getRememberInfo()
        expect(info).toBeNull()
      })
    })
  })

  describe('错误处理测试', () => {
    it('应该在数据库错误时抛出有意义的错误', async () => {
      // 测试重复用户名错误
      const username = 'duplicateuser'
      const password = 'validPass123'
      const securityQuestion: SecurityQuestion = {
        question: '你的宠物叫什么？',
        answerHash: await hashPassword('fluffy')
      }
      
      await authManager.registerWithPassword(username, password, securityQuestion)
      
      // 尝试再次注册相同用户名应该抛出错误
      await expect(
        authManager.registerWithPassword(username, password, securityQuestion)
      ).rejects.toThrow('用户名已存在')
    })

    it('应该处理并发注册相同用户名', async () => {
      const username = 'concurrent'
      const password = 'validPass123'
      const securityQuestion: SecurityQuestion = {
        question: '你的宠物叫什么？',
        answerHash: await hashPassword('fluffy')
      }
      
      // 第一次注册应该成功
      await authManager.registerWithPassword(username, password, securityQuestion)
      
      // 第二次注册应该失败
      await expect(
        authManager.registerWithPassword(username, password, securityQuestion)
      ).rejects.toThrow('用户名已存在')
    })

    it('应该在注销后清除认证信息', async () => {
      const username = 'testuser'
      const password = 'validPass123'
      const securityQuestion: SecurityQuestion = {
        question: '你的宠物叫什么？',
        answerHash: await hashPassword('fluffy')
      }
      
      await authManager.registerWithPassword(username, password, securityQuestion)
      await authManager.logout()
      
      // 登录以创建认证信息
      await authManager.loginWithPassword(username, password)
      
      // 验证登录后有认证信息
      let authData = localStorage.getItem('cyp-memo-auth')
      expect(authData).not.toBeNull()
      
      // 注销
      await authManager.logout()
      
      // 验证认证信息被清除
      authData = localStorage.getItem('cyp-memo-auth')
      expect(authData).toBeNull()
    })

    it('应该在注销后保留记住密码信息', async () => {
      const username = 'testuser'
      const password = 'validPass123'
      const securityQuestion: SecurityQuestion = {
        question: '你的宠物叫什么？',
        answerHash: await hashPassword('fluffy')
      }
      
      await authManager.registerWithPassword(username, password, securityQuestion)
      await authManager.logout()
      await authManager.loginWithPassword(username, password, true)
      
      // 验证记住密码信息存在
      let rememberInfo = authManager.getRememberInfo()
      expect(rememberInfo).not.toBeNull()
      
      // 注销
      await authManager.logout()
      
      // 验证记住密码信息仍然存在
      rememberInfo = authManager.getRememberInfo()
      expect(rememberInfo).not.toBeNull()
      expect(rememberInfo!.username).toBe(username)
      expect(rememberInfo!.password).toBe(password)
    })
  })

  describe('令牌注册测试', () => {
    it('应该生成唯一的令牌', async () => {
      const { token: token1 } = await authManager.registerWithToken()
      const { token: token2 } = await authManager.registerWithToken()
      
      expect(token1).not.toBe(token2)
      expect(token1.length).toBe(64)
      expect(token2.length).toBe(64)
    })

    it('应该为令牌用户分配所有主账号权限', async () => {
      const { user } = await authManager.registerWithToken()
      
      expect(user.isMainAccount).toBe(true)
      expect(user.permissions).toContain(Permission.MEMO_MANAGE)
      expect(user.permissions).toContain(Permission.STATISTICS_VIEW)
      expect(user.permissions).toContain(Permission.ATTACHMENT_MANAGE)
      expect(user.permissions).toContain(Permission.SETTINGS_MANAGE)
      expect(user.permissions).toContain(Permission.ACCOUNT_MANAGE)
    })

    it('应该能够使用生成的令牌登录', async () => {
      const { user, token } = await authManager.registerWithToken()
      await authManager.logout()
      
      const loginResult = await authManager.loginWithToken(token)
      expect(loginResult.id).toBe(user.id)
      expect(loginResult.token).toBe(token)
    })
  })

  describe('登录状态持久化测试', () => {
    it('应该在登录后保存认证信息', async () => {
      const username = 'testuser'
      const password = 'validPass123'
      const securityQuestion: SecurityQuestion = {
        question: '你的宠物叫什么？',
        answerHash: await hashPassword('fluffy')
      }
      
      const user = await authManager.registerWithPassword(username, password, securityQuestion)
      await authManager.logout()
      await authManager.loginWithPassword(username, password)
      
      const authData = localStorage.getItem('cyp-memo-auth')
      expect(authData).not.toBeNull()
      
      const authInfo = JSON.parse(authData!)
      expect(authInfo.userId).toBe(user.id)
      expect(authInfo.username).toBe(username)
      expect(authInfo.loginType).toBe('password')
      expect(authInfo.timestamp).toBeDefined()
    })

    it('应该在令牌登录后保存正确的登录类型', async () => {
      const { user, token } = await authManager.registerWithToken()
      await authManager.logout()
      await authManager.loginWithToken(token)
      
      const authData = localStorage.getItem('cyp-memo-auth')
      expect(authData).not.toBeNull()
      
      const authInfo = JSON.parse(authData!)
      expect(authInfo.userId).toBe(user.id)
      expect(authInfo.loginType).toBe('token')
    })

    it('应该更新用户的最后登录时间', async () => {
      const username = 'testuser'
      const password = 'validPass123'
      const securityQuestion: SecurityQuestion = {
        question: '你的宠物叫什么？',
        answerHash: await hashPassword('fluffy')
      }
      
      const user = await authManager.registerWithPassword(username, password, securityQuestion)
      const initialLoginTime = user.lastLoginAt
      
      // 等待一小段时间
      await new Promise(resolve => setTimeout(resolve, 10))
      
      await authManager.logout()
      const loginResult = await authManager.loginWithPassword(username, password)
      
      expect(loginResult.lastLoginAt.getTime()).toBeGreaterThan(initialLoginTime.getTime())
    })
  })
})
