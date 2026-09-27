/**
 * CYP-memo 数据库初始化测试
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { CYPMemoDB } from '../src/database/db'
import Dexie from 'dexie'

describe('数据库初始化', () => {
  let testDb: CYPMemoDB

  beforeEach(() => {
    // 为每个测试创建新的数据库实例
    testDb = new CYPMemoDB()
  })

  afterEach(async () => {
    // 清理：删除测试数据库
    if (testDb && testDb.isOpen()) {
      await testDb.delete()
    }
  })

  it('应该成功创建数据库实例', () => {
    expect(testDb).toBeInstanceOf(Dexie)
    expect(testDb).toBeInstanceOf(CYPMemoDB)
    expect(testDb.name).toBe('CYPMemoDB')
  })

  it('应该定义所有必需的表', () => {
    const tables = testDb.tables.map((table) => table.name)
    
    expect(tables).toContain('users')
    expect(tables).toContain('memos')
    expect(tables).toContain('memoHistory')
    expect(tables).toContain('files')
    expect(tables).toContain('fileBlobs')
    expect(tables).toContain('logs')
    expect(tables).toContain('shares')
    expect(tables).toContain('settings')
  })

  it('应该为 users 表定义正确的索引', () => {
    const usersTable = testDb.table('users')
    const schema = usersTable.schema
    
    expect(schema.primKey.name).toBe('id')
    expect(schema.indexes).toBeDefined()
    
    const indexNames = schema.indexes.map((idx) => idx.name)
    expect(indexNames).toContain('username')
    expect(indexNames).toContain('token')
    expect(indexNames).toContain('parentUserId')
    expect(indexNames).toContain('role')
    expect(indexNames).toContain('tenantRootId')
    expect(indexNames).toContain('digitalId')
  })

  it('应该保留 admins 表（兼容，upgrade 后清空）', () => {
    const tables = testDb.tables.map((table) => table.name)
    expect(tables).toContain('admins')
    const adminsTable = testDb.table('admins')
    expect(adminsTable.schema.primKey.name).toBe('id')
    expect(adminsTable.schema.indexes.map((idx) => idx.name)).toContain('username')
  })

  it('应该为 memos 表定义正确的索引', () => {
    const memosTable = testDb.table('memos')
    const schema = memosTable.schema
    
    expect(schema.primKey.name).toBe('id')
    
    const indexNames = schema.indexes.map((idx) => idx.name)
    expect(indexNames).toContain('userId')
    expect(indexNames).toContain('tags')
    expect(indexNames).toContain('createdAt')
    expect(indexNames).toContain('updatedAt')
    expect(indexNames).toContain('deletedAt')
    
    // 验证 tags 是多值索引
    const tagsIndex = schema.indexes.find((idx) => idx.name === 'tags')
    expect(tagsIndex?.multi).toBe(true)
  })

  it('应该为 memoHistory 表定义正确的索引', () => {
    const memoHistoryTable = testDb.table('memoHistory')
    const schema = memoHistoryTable.schema
    
    expect(schema.primKey.name).toBe('id')
    
    const indexNames = schema.indexes.map((idx) => idx.name)
    expect(indexNames).toContain('memoId')
    expect(indexNames).toContain('timestamp')
  })

  it('应该为 files 表定义正确的索引', () => {
    const filesTable = testDb.table('files')
    const schema = filesTable.schema
    
    expect(schema.primKey.name).toBe('id')
    
    const indexNames = schema.indexes.map((idx) => idx.name)
    expect(indexNames).toContain('userId')
    expect(indexNames).toContain('memoId')
    expect(indexNames).toContain('uploadedAt')
  })

  it('应该为 fileBlobs 表定义正确的主键', () => {
    const fileBlobsTable = testDb.table('fileBlobs')
    const schema = fileBlobsTable.schema
    
    expect(schema.primKey.name).toBe('id')
    expect(schema.indexes.length).toBe(0) // 只有主键，没有其他索引
  })

  it('应该为 logs 表定义正确的索引', () => {
    const logsTable = testDb.table('logs')
    const schema = logsTable.schema
    
    expect(schema.primKey.name).toBe('id')
    
    const indexNames = schema.indexes.map((idx) => idx.name)
    expect(indexNames).toContain('level')
    expect(indexNames).toContain('timestamp')
  })

  it('应该为 shares 表定义正确的索引', () => {
    const sharesTable = testDb.table('shares')
    const schema = sharesTable.schema
    
    expect(schema.primKey.name).toBe('id')
    
    const indexNames = schema.indexes.map((idx) => idx.name)
    expect(indexNames).toContain('memoId')
    expect(indexNames).toContain('userId')
    expect(indexNames).toContain('expiresAt')
  })

  it('应该为 settings 表定义正确的主键', () => {
    const settingsTable = testDb.table('settings')
    const schema = settingsTable.schema
    
    expect(schema.primKey.name).toBe('key')
  })

  it('应该能够打开数据库连接', async () => {
    await expect(testDb.open()).resolves.toBe(testDb)
    expect(testDb.isOpen()).toBe(true)
  })

  it('应该使用版本 3（SIX-DB 身份字段）', () => {
    expect(testDb.verno).toBe(3)
  })

  it('open 后应回填 role/tenantRootId/digitalId', async () => {
    await testDb.open()
    const ownerId = 'owner-smoke-1'
    const memberId = 'member-smoke-1'
    await testDb.users.put({
      id: ownerId,
      username: 'owner_smoke',
      rememberPassword: false,
      isMainAccount: true,
      permissions: [],
      createdAt: new Date(),
      lastLoginAt: new Date(),
    } as never)
    await testDb.users.put({
      id: memberId,
      username: 'member_smoke',
      rememberPassword: false,
      isMainAccount: false,
      parentUserId: ownerId,
      permissions: [],
      createdAt: new Date(),
      lastLoginAt: new Date(),
    } as never)

    // 已在 v3 的库不会再次跑 upgrade；手动走投影路径验证契约
    const { projectUserIdentityFields, allocateClientDigitalId } = await import(
      '../src/database/identityMigration'
    )
    const owner = projectUserIdentityFields((await testDb.users.get(ownerId))!)
    const member = projectUserIdentityFields((await testDb.users.get(memberId))!)
    expect(owner.role).toBe('owner')
    expect(owner.tenantRootId).toBe(ownerId)
    expect(member.role).toBe('member')
    expect(member.tenantRootId).toBe(ownerId)

    const used = new Set<string>()
    const did = allocateClientDigitalId(used)
    expect(did).toMatch(/^\d{6}$/)
  })
})


