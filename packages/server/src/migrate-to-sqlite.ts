/**
 * 数据迁移脚本：从 JSON 迁移到 SQLite
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { SqliteDatabase } from './sqlite-database.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, '..', 'data')
const JSON_FILE = path.join(DATA_DIR, 'database.json')
const BACKUP_FILE = path.join(DATA_DIR, `database.json.backup.${Date.now()}`)

async function migrate() {
  console.log('🚀 开始数据迁移：JSON → SQLite')
  console.log('=' .repeat(50))
  
  // 检查 JSON 文件是否存在
  if (!fs.existsSync(JSON_FILE)) {
    console.log('⚠️  未找到 database.json，跳过迁移')
    console.log('✅ 将使用全新的 SQLite 数据库')
    
    // 初始化空数据库
    const db = new SqliteDatabase()
    await db.init()
    db.close()
    console.log('✅ SQLite 数据库已创建')
    return
  }
  
  // 读取 JSON 数据
  console.log('📖 读取 JSON 数据...')
  const jsonData = JSON.parse(fs.readFileSync(JSON_FILE, 'utf-8'))
  
  console.log(`📊 数据统计：`)
  console.log(`   - 管理员: ${jsonData.admins?.length || 0}`)
  console.log(`   - 用户: ${jsonData.users?.length || 0}`)
  console.log(`   - 备忘录: ${jsonData.memos?.length || 0}`)
  console.log(`   - 文件: ${jsonData.files?.length || 0}`)
  console.log(`   - 分享: ${jsonData.shares?.length || 0}`)
  console.log(`   - 日志: ${jsonData.logs?.length || 0}`)
  
  // 创建 SQLite 数据库
  console.log('\n💾 创建 SQLite 数据库...')
  const db = new SqliteDatabase()
  await db.init()
  
  let migrated = {
    admins: 0,
    users: 0,
    memos: 0,
    files: 0,
    shares: 0,
    logs: 0
  }
  
  try {
    // 迁移用户
    if (jsonData.users && Array.isArray(jsonData.users)) {
      console.log('\n👥 迁移用户...')
      for (const user of jsonData.users) {
        try {
          // 检查是否已存在
          const existing = db.getUserByUsername(user.username)
          if (!existing) {
            db.createUser(user)
            migrated.users++
          }
        } catch (err) {
          console.error(`   ❌ 迁移用户失败: ${user.username}`, err)
        }
      }
      console.log(`   ✅ 已迁移 ${migrated.users} 个用户`)
    }
    
    // 迁移备忘录
    if (jsonData.memos && Array.isArray(jsonData.memos)) {
      console.log('\n📝 迁移备忘录...')
      for (const memo of jsonData.memos) {
        try {
          const existing = db.getMemoById(memo.id)
          if (!existing) {
            db.createMemo(memo)
            migrated.memos++
          }
        } catch (err) {
          console.error(`   ❌ 迁移备忘录失败: ${memo.id}`, err)
        }
      }
      console.log(`   ✅ 已迁移 ${migrated.memos} 条备忘录`)
    }
    
    // 迁移文件
    if (jsonData.files && Array.isArray(jsonData.files)) {
      console.log('\n📎 迁移文件元数据...')
      for (const file of jsonData.files) {
        try {
          db.createFile(file)
          migrated.files++
        } catch (err) {
          console.error(`   ❌ 迁移文件失败: ${file.filename}`, err)
        }
      }
      console.log(`   ✅ 已迁移 ${migrated.files} 个文件`)
    }
    
    // 迁移分享
    if (jsonData.shares && Array.isArray(jsonData.shares)) {
      console.log('\n🔗 迁移分享链接...')
      for (const share of jsonData.shares) {
        try {
          db.createShare(share)
          migrated.shares++
        } catch (err) {
          console.error(`   ❌ 迁移分享失败: ${share.id}`, err)
        }
      }
      console.log(`   ✅ 已迁移 ${migrated.shares} 个分享链接`)
    }
    
    // 迁移日志（可选，只迁移最近的）
    if (jsonData.logs && Array.isArray(jsonData.logs)) {
      console.log('\n📋 迁移日志（最近 1000 条）...')
      const recentLogs = jsonData.logs.slice(-1000)
      for (const log of recentLogs) {
        try {
          db.createLog(log)
          migrated.logs++
        } catch (err) {
          console.error(`   ❌ 迁移日志失败`, err)
        }
      }
      console.log(`   ✅ 已迁移 ${migrated.logs} 条日志`)
    }
    
    // 保存数据库
    db.saveNow()
    
    // 备份原 JSON 文件
    console.log('\n💾 备份原 JSON 文件...')
    fs.copyFileSync(JSON_FILE, BACKUP_FILE)
    console.log(`   ✅ 备份保存至: ${BACKUP_FILE}`)
    
    // 重命名原文件（保留但不使用）
    const oldFile = path.join(DATA_DIR, 'database.json.old')
    fs.renameSync(JSON_FILE, oldFile)
    console.log(`   ✅ 原文件重命名为: database.json.old`)
    
    console.log('\n' + '='.repeat(50))
    console.log('✅ 数据迁移完成！')
    console.log('\n📊 迁移统计：')
    console.log(`   - 用户: ${migrated.users}`)
    console.log(`   - 备忘录: ${migrated.memos}`)
    console.log(`   - 文件: ${migrated.files}`)
    console.log(`   - 分享: ${migrated.shares}`)
    console.log(`   - 日志: ${migrated.logs}`)
    console.log('\n⚠️  注意：')
    console.log('   1. 原 JSON 文件已备份')
    console.log('   2. 服务器将自动使用 SQLite 数据库')
    console.log('   3. 如需回滚，请恢复备份文件')
    console.log('='.repeat(50))
    
  } catch (err) {
    console.error('\n❌ 迁移失败:', err)
    throw err
  } finally {
    db.close()
  }
}

// 执行迁移
migrate().catch(err => {
  console.error('迁移过程出错:', err)
  process.exit(1)
})
