#!/usr/bin/env node
/**
 * CYP-memo 一键发布脚本
 * 集成版本更新工具，自动更新所有端的版本号并推送 tag
 * 
 * 使用方法:
 *   node scripts/install/release.js patch    # 补丁版本 1.7.10 -> 1.7.11
 *   node scripts/install/release.js minor    # 次版本   1.7.10 -> 1.8.0
 *   node scripts/install/release.js major    # 主版本   1.7.10 -> 2.0.0
 *   node scripts/install/release.js 1.8.0    # 指定版本
 * 
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import readline from 'readline'
import GitOperations from './git-operations.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.join(__dirname, '..', '..')

// 初始化 Git 操作模块
const git = new GitOperations({ projectRoot: rootDir })

// 需要更新版本号的文件
const VERSION_FILES = [
  { path: 'VERSION', type: 'text' },
  { path: 'package.json', type: 'json' },
  { path: 'packages/app/package.json', type: 'json' },
  { path: 'packages/server/package.json', type: 'json' },
  { path: 'packages/shared/package.json', type: 'json' },
  { path: 'packages/desktop/package.json', type: 'json' },
  { path: 'packages/shared/src/config/version.ts', type: 'typescript' },
]

/**
 * 读取当前版本号
 */
function getCurrentVersion() {
  const versionFile = path.join(rootDir, 'VERSION')
  return fs.readFileSync(versionFile, 'utf-8').trim()
}

/**
 * 解析版本号
 */
function parseVersion(version) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/)
  if (!match) {
    throw new Error(`无效的版本号格式: ${version}`)
  }
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
  }
}

/**
 * 计算新版本号
 */
function calculateNewVersion(current, type) {
  const v = parseVersion(current)
  
  switch (type) {
    case 'patch':
      return `${v.major}.${v.minor}.${v.patch + 1}`
    case 'minor':
      return `${v.major}.${v.minor + 1}.0`
    case 'major':
      return `${v.major + 1}.0.0`
    default:
      // 如果是具体版本号
      if (/^\d+\.\d+\.\d+$/.test(type)) {
        return type
      }
      throw new Error(`无效的版本类型: ${type}`)
  }
}

/**
 * 更新文件中的版本号
 */
function updateVersionInFile(filePath, newVersion) {
  const fullPath = path.join(rootDir, filePath)
  
  if (!fs.existsSync(fullPath)) {
    console.log(`  ⚠️  跳过不存在的文件: ${filePath}`)
    return false
  }

  const content = fs.readFileSync(fullPath, 'utf-8')
  let newContent

  if (filePath.endsWith('.json')) {
    // JSON 文件
    const json = JSON.parse(content)
    json.version = newVersion
    newContent = JSON.stringify(json, null, 2) + '\n'
  } else if (filePath.endsWith('version.ts')) {
    // TypeScript 版本配置文件
    const v = parseVersion(newVersion)
    newContent = content
      .replace(/major:\s*\d+/, `major: ${v.major}`)
      .replace(/minor:\s*\d+/, `minor: ${v.minor}`)
      .replace(/patch:\s*\d+/, `patch: ${v.patch}`)
  } else if (filePath === 'VERSION') {
    // VERSION 文件
    newContent = newVersion + '\n'
  } else {
    console.log(`  ⚠️  不支持的文件类型: ${filePath}`)
    return false
  }

  fs.writeFileSync(fullPath, newContent)
  console.log(`  ✅ ${filePath}`)
  return true
}

/**
 * 更新 changelog.json
 */
function updateChangelog(newVersion, previousVersion) {
  const changelogPath = path.join(rootDir, '.version/changelog.json')
  
  if (!fs.existsSync(changelogPath)) {
    console.log('  ⚠️  changelog.json 不存在，跳过')
    return
  }

  const changelog = JSON.parse(fs.readFileSync(changelogPath, 'utf-8'))
  
  // 添加新版本记录
  const newEntry = {
    version: newVersion,
    timestamp: new Date().toISOString(),
    author: 'CYP',
    changes: [],
    type: 'release',
    previousVersion: previousVersion,
    metadata: {
      autoRelease: true,
    },
  }

  changelog.history.unshift(newEntry)
  changelog.metadata.updated = new Date().toISOString()

  fs.writeFileSync(changelogPath, JSON.stringify(changelog, null, 2) + '\n')
  console.log(`  ✅ .version/changelog.json`)
}

/**
 * 更新 CHANGELOG.md
 */
function updateChangelogMd(newVersion, previousVersion, changelog) {
  const changelogMdPath = path.join(rootDir, 'CHANGELOG.md')
  
  if (!fs.existsSync(changelogMdPath)) {
    console.log('  ⚠️  CHANGELOG.md 不存在，跳过')
    return
  }

  // 从 changelog.json 获取最新版本的变更记录
  const latestEntry = changelog?.history?.[0]
  const changes = latestEntry?.changes || []
  
  // 生成日期
  const today = new Date().toISOString().split('T')[0]
  
  // 构建新版本的 changelog 内容
  let newContent = `## [${newVersion}] - ${today}\n\n`
  
  if (changes.length > 0) {
    // 按类型分组
    const grouped = {}
    const typeLabels = {
      feat: '新增 ✨',
      fix: '修复 🐛',
      perf: '优化 ⚡',
      docs: '文档 📝',
      refactor: '重构 🔨',
      test: '测试 🧪',
      chore: '其他 🔧',
    }
    
    for (const change of changes) {
      const type = change.type || 'chore'
      if (!grouped[type]) grouped[type] = []
      grouped[type].push(change.description)
    }
    
    for (const [type, items] of Object.entries(grouped)) {
      const label = typeLabels[type] || type
      newContent += `### ${label}\n\n`
      for (const item of items) {
        newContent += `- ${item}\n`
      }
      newContent += '\n'
    }
  } else {
    newContent += `### 更新\n\n- 版本更新\n\n`
  }
  
  newContent += '---\n\n'
  
  // 读取现有内容
  let existingContent = fs.readFileSync(changelogMdPath, 'utf-8')
  
  // 找到第一个 ## 的位置（跳过标题和描述）
  const firstVersionIndex = existingContent.indexOf('\n## [')
  
  if (firstVersionIndex !== -1) {
    // 在第一个版本之前插入新版本
    const header = existingContent.substring(0, firstVersionIndex + 1)
    const rest = existingContent.substring(firstVersionIndex + 1)
    existingContent = header + newContent + rest
  } else {
    // 没有找到版本记录，追加到末尾
    existingContent += '\n' + newContent
  }
  
  fs.writeFileSync(changelogMdPath, existingContent)
  console.log(`  ✅ CHANGELOG.md`)
}

/**
 * 询问用户确认
 */
async function confirm(message) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return new Promise((resolve) => {
    rl.question(`${message} (y/N): `, (answer) => {
      rl.close()
      resolve(answer.toLowerCase() === 'y')
    })
  })
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2)
  
  if (args.length === 0 || args[0] === 'help' || args[0] === '-h') {
    console.log(`
📦 CYP-memo 一键发布脚本

使用方法:
  node scripts/install/release.js <type>

参数:
  patch     补丁版本 (1.7.10 -> 1.7.11)
  minor     次版本   (1.7.10 -> 1.8.0)
  major     主版本   (1.7.10 -> 2.0.0)
  x.y.z     指定版本号

选项:
  --no-push   只更新版本号，不推送到远程
  --no-tag    只更新版本号，不创建 tag

示例:
  node scripts/install/release.js patch
  node scripts/install/release.js minor --no-push
  node scripts/install/release.js 2.0.0
`)
    process.exit(0)
  }

  const versionType = args[0]
  const noPush = args.includes('--no-push')
  const noTag = args.includes('--no-tag')

  console.log('\n🚀 CYP-memo 发布流程\n')

  // 1. 获取当前版本
  const currentVersion = getCurrentVersion()
  console.log(`📌 当前版本: ${currentVersion}`)

  // 2. 计算新版本
  let newVersion
  try {
    newVersion = calculateNewVersion(currentVersion, versionType)
  } catch (error) {
    console.error(`❌ ${error.message}`)
    process.exit(1)
  }
  console.log(`📦 新版本: ${newVersion}\n`)

  // 3. 检查 Git 状态
  const uncommittedChanges = git.getUncommittedChanges()
  if (uncommittedChanges.length > 0) {
    console.log('⚠️  检测到未提交的更改:')
    uncommittedChanges.slice(0, 5).forEach((line) => console.log(`   ${line}`))
    if (uncommittedChanges.length > 5) {
      console.log(`   ... 还有 ${uncommittedChanges.length - 5} 个文件`)
    }
    console.log('')
    
    const shouldContinue = await confirm('是否继续？这些更改将被包含在发布中')
    if (!shouldContinue) {
      console.log('❌ 已取消')
      process.exit(0)
    }
  }

  // 4. 确认发布
  const shouldRelease = await confirm(`确认发布 v${newVersion}？`)
  if (!shouldRelease) {
    console.log('❌ 已取消')
    process.exit(0)
  }

  console.log('\n📝 更新版本号...')

  // 5. 更新所有文件的版本号
  for (const file of VERSION_FILES) {
    updateVersionInFile(file.path, newVersion)
  }

  // 6. 读取 changelog.json 获取变更记录
  const changelogPath = path.join(rootDir, '.version/changelog.json')
  let changelog = null
  if (fs.existsSync(changelogPath)) {
    changelog = JSON.parse(fs.readFileSync(changelogPath, 'utf-8'))
  }

  // 7. 更新 changelog.json
  updateChangelog(newVersion, currentVersion)
  
  // 8. 更新 CHANGELOG.md
  // 重新读取更新后的 changelog.json
  if (fs.existsSync(changelogPath)) {
    changelog = JSON.parse(fs.readFileSync(changelogPath, 'utf-8'))
  }
  updateChangelogMd(newVersion, currentVersion, changelog)

  // 9. Git 操作
  const gitResult = git.release(newVersion, {
    commitMessage: `release: v${newVersion}`,
    skipTag: noTag,
    skipPush: noPush,
  })

  if (!gitResult.success && gitResult.errors.length > 0) {
    console.log(`\n⚠️  Git 操作部分失败: ${gitResult.errors.join(', ')}`)
  }

  console.log(`
✨ 发布完成！

版本: v${newVersion}
${noPush ? '⚠️  未推送到远程，请手动执行: git push origin main && git push origin v' + newVersion : ''}
${!noPush && !noTag ? '🔄 GitHub Actions 正在自动构建和发布...' : ''}

查看发布状态: https://github.com/ADdss-hub/CYP-memo/actions
`)
}

main().catch((error) => {
  console.error('❌ 发布失败:', error.message)
  process.exit(1)
})
