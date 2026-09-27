#!/usr/bin/env node
/**
 * CYP-memo 产品版本自动化（先升版写史 · 全自动收口）
 *
 * 用法:
 *   node scripts/version-bump.js patch --change "fix:修复登录锁定" --yes
 *   node scripts/version-bump.js minor --change "feat:新增监控页" --change "docs:更新 DEPLOY" --yes
 *   node scripts/version-bump.js major --change "breaking:删除 admin 包" --yes
 *   node scripts/version-bump.js 2.1.0 --change "feat:..." --yes
 *
 * 权威: docs/PRODUCT_VERSIONING.md · 军械库 cyp-product-versioning-regulation.md
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { spawnSync } from 'child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.join(__dirname, '..')

const VERSION_FILES = [
  { path: 'VERSION', type: 'text' },
  { path: 'package.json', type: 'json' },
  { path: 'packages/app/package.json', type: 'json' },
  { path: 'packages/server/package.json', type: 'json' },
  { path: 'packages/shared/package.json', type: 'json' },
  { path: 'packages/desktop/package.json', type: 'json' },
  { path: 'packages/shared/src/config/version.ts', type: 'typescript' },
]

const TYPE_LABELS = {
  feat: '新增 ✨',
  fix: '修复 🐛',
  perf: '优化 ⚡',
  docs: '文档 📝',
  refactor: '重构 🔨',
  test: '测试 🧪',
  chore: '其他 🔧',
  remove: '删除 🗑️',
  breaking: '重大改版 🔨',
}

function getCurrentVersion() {
  return fs.readFileSync(path.join(rootDir, 'VERSION'), 'utf-8').trim()
}

function parseVersion(version) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/)
  if (!match) throw new Error(`无效的版本号格式: ${version}`)
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
  }
}

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
      if (/^\d+\.\d+\.\d+$/.test(type)) return type
      throw new Error(`无效的版本类型: ${type}`)
  }
}

function bumpKind(typeArg, changes) {
  if (['patch', 'minor', 'major'].includes(typeArg)) return typeArg
  if (changes.some((c) => c.type === 'breaking')) return 'major'
  if (changes.some((c) => c.type === 'feat')) return 'minor'
  return 'patch'
}

function updateVersionInFile(filePath, newVersion) {
  const fullPath = path.join(rootDir, filePath)
  if (!fs.existsSync(fullPath)) {
    console.log(`  ⚠️  跳过不存在: ${filePath}`)
    return false
  }
  const content = fs.readFileSync(fullPath, 'utf-8')
  let newContent
  if (filePath.endsWith('.json')) {
    const json = JSON.parse(content)
    json.version = newVersion
    newContent = JSON.stringify(json, null, 2) + '\n'
  } else if (filePath.endsWith('version.ts')) {
    const v = parseVersion(newVersion)
    newContent = content
      .replace(/major:\s*\d+/, `major: ${v.major}`)
      .replace(/minor:\s*\d+/, `minor: ${v.minor}`)
      .replace(/patch:\s*\d+/, `patch: ${v.patch}`)
  } else if (filePath === 'VERSION') {
    newContent = newVersion + '\n'
  } else {
    return false
  }
  fs.writeFileSync(fullPath, newContent)
  console.log(`  ✅ ${filePath}`)
  return true
}

function updateReadme(newVersion) {
  const p = path.join(rootDir, 'README.md')
  if (!fs.existsSync(p)) return
  const content = fs.readFileSync(p, 'utf-8')
  const next = content.replace(/\*\*版本\*\*:\s*\d+\.\d+\.\d+/, `**版本**: ${newVersion}`)
  if (next !== content) {
    fs.writeFileSync(p, next)
    console.log('  ✅ README.md')
  }
}

function parseChanges(argv) {
  const changes = []
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--change' && argv[i + 1]) {
      const raw = argv[++i]
      const idx = raw.indexOf(':')
      if (idx === -1) {
        changes.push({ type: 'chore', description: raw })
      } else {
        changes.push({
          type: raw.slice(0, idx).trim() || 'chore',
          description: raw.slice(idx + 1).trim(),
        })
      }
    }
  }
  return changes
}

function ensureVersionDir() {
  const dir = path.join(rootDir, '.version')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const changelogPath = path.join(dir, 'changelog.json')
  if (!fs.existsSync(changelogPath)) {
    fs.writeFileSync(
      changelogPath,
      JSON.stringify(
        {
          schema: '2.1.0',
          history: [],
          metadata: { updated: new Date().toISOString(), project: 'CYP-memo' },
        },
        null,
        2,
      ) + '\n',
    )
  }
}

function updateChangelogJson(newVersion, previousVersion, changes, releaseType) {
  ensureVersionDir()
  const changelogPath = path.join(rootDir, '.version/changelog.json')
  const changelog = JSON.parse(fs.readFileSync(changelogPath, 'utf-8'))
  if (changelog.history[0]?.version === newVersion) {
    throw new Error(`版本 ${newVersion} 已存在于 changelog.json，禁止重复写入`)
  }
  changelog.history.unshift({
    version: newVersion,
    timestamp: new Date().toISOString(),
    author: 'CYP',
    changes,
    type: releaseType,
    previousVersion,
    metadata: { autoRelease: true, productionFirst: true },
  })
  changelog.metadata = changelog.metadata || {}
  changelog.metadata.updated = new Date().toISOString()
  changelog.metadata.project = 'CYP-memo'
  fs.writeFileSync(changelogPath, JSON.stringify(changelog, null, 2) + '\n')
  console.log('  ✅ .version/changelog.json')
  return changelog
}

function updateChangelogMd(newVersion, changes) {
  const changelogMdPath = path.join(rootDir, 'CHANGELOG.md')
  if (!fs.existsSync(changelogMdPath)) return
  const today = new Date().toISOString().split('T')[0]
  let block = `## [${newVersion}] - ${today}\n\n`
  if (changes.length === 0) {
    block += `### 更新\n\n- 版本更新\n\n`
  } else {
    const grouped = {}
    for (const c of changes) {
      const t = c.type || 'chore'
      if (!grouped[t]) grouped[t] = []
      grouped[t].push(c.description)
    }
    for (const [type, items] of Object.entries(grouped)) {
      block += `### ${TYPE_LABELS[type] || type}\n\n`
      for (const item of items) block += `- ${item}\n`
      block += '\n'
    }
  }
  block += '---\n\n'
  let existing = fs.readFileSync(changelogMdPath, 'utf-8')
  const firstVersionIndex = existing.indexOf('\n## [')
  if (firstVersionIndex !== -1) {
    existing =
      existing.substring(0, firstVersionIndex + 1) + block + existing.substring(firstVersionIndex + 1)
  } else {
    existing += '\n' + block
  }
  fs.writeFileSync(changelogMdPath, existing)
  console.log('  ✅ CHANGELOG.md')
}

function regenerateVersionHistoryMd(changelog) {
  const typeLabel = {
    major: '🔨 重大改版',
    minor: '✨ 功能更新',
    patch: '🐛 问题修复',
    release: '📦 发布',
    chore: '🔧 其他',
    feat: '✨ 功能更新',
  }
  const changeTypeLabel = { ...TYPE_LABELS }
  const fmt = (iso) =>
    new Date(iso).toLocaleString('zh-CN', { hour12: false, timeZone: 'Asia/Shanghai' })
  let md = '# 版本历史记录\n\n'
  md += `> 自动生成于 ${fmt(new Date().toISOString())}\n\n`
  md += `**总版本数：** ${changelog.history.length}\n\n---\n\n`
  for (const e of changelog.history) {
    md += `## ${e.version}\n\n`
    md += `**发布时间：** ${fmt(e.timestamp)}\n\n`
    md += `**作者：** ${e.author || 'CYP'}\n\n`
    if (e.previousVersion) md += `**上一版本：** ${e.previousVersion}\n\n`
    md += `**变更类型：** ${typeLabel[e.type] || e.type || '📦 发布'}\n\n`
    md += '### 变更内容\n\n'
    const changes = e.changes || []
    if (changes.length === 0) {
      md += '- （无详细变更条目）\n\n'
    } else {
      const grouped = {}
      for (const c of changes) {
        const t = c.type || 'chore'
        if (!grouped[t]) grouped[t] = []
        grouped[t].push(c.description)
      }
      for (const [t, items] of Object.entries(grouped)) {
        md += `#### ${changeTypeLabel[t] || t}\n\n`
        for (const item of items) md += `- ${item}\n`
        md += '\n'
      }
    }
    md += '---\n\n'
  }
  fs.writeFileSync(path.join(rootDir, '.version/VERSION_HISTORY.md'), md)
  console.log('  ✅ .version/VERSION_HISTORY.md')
}

function runVerify() {
  const r = spawnSync(process.execPath, [path.join(rootDir, 'scripts/verify-version.js')], {
    cwd: rootDir,
    stdio: 'inherit',
  })
  if (r.status !== 0) throw new Error('verify-version 失败')
}

function printHelp() {
  console.log(`
📦 CYP-memo version-bump（先升版 · 全自动写史）

用法:
  node scripts/version-bump.js <patch|minor|major|x.y.z> --change "type:说明" [--yes]

示例:
  pnpm version:bump -- patch --change "fix:修复 E023 锁定文案" --yes
  pnpm version:bump -- minor --change "feat:租户监控页" --yes
  pnpm version:bump -- major --change "breaking:统一产品壳" --yes

说明:
  --yes     非交互确认（自动化必需）
  --change  可重复；type=feat|fix|perf|refactor|docs|test|chore|remove|breaking
  顺序强制: 本命令先于业务改码执行；验证须生产或生产等价真实环境
`)
}

async function main() {
  const argv = process.argv.slice(2)
  if (argv.length === 0 || argv[0] === 'help' || argv[0] === '-h') {
    printHelp()
    process.exit(0)
  }
  const yes = argv.includes('--yes') || argv.includes('-y')
  const typeArg = argv[0]
  const changes = parseChanges(argv)
  if (!yes) {
    console.error('❌ 自动化要求加 --yes（禁止无确认半自动假完成）')
    process.exit(1)
  }
  if (changes.length === 0) {
    console.error('❌ 至少一条 --change "type:说明"')
    process.exit(1)
  }

  const current = getCurrentVersion()
  const releaseType = bumpKind(typeArg, changes)
  const newVersion =
    /^\d+\.\d+\.\d+$/.test(typeArg) ? typeArg : calculateNewVersion(current, releaseType)

  console.log('\n🚀 CYP-memo 版本自动化（生产优先 · 先升版）\n')
  console.log(`📌 当前: ${current}`)
  console.log(`📦 新版: ${newVersion} (${releaseType})`)
  console.log(`📝 变更: ${changes.length} 条\n`)

  console.log('📝 对齐权威源...')
  for (const file of VERSION_FILES) updateVersionInFile(file.path, newVersion)
  updateReadme(newVersion)

  console.log('\n📚 写历史...')
  const changelog = updateChangelogJson(newVersion, current, changes, releaseType)
  updateChangelogMd(newVersion, changes)
  regenerateVersionHistoryMd(changelog)

  console.log('\n🔍 校验...')
  runVerify()

  console.log(`
✨ 版本收口完成: v${newVersion}

下一步（强制）:
  1. 再改业务代码 / 删除资产（与 --change 一致）
  2. 生产或生产等价真实环境验证（禁沙箱）
  3. 可选发版: git tag v${newVersion} && git push --tags
`)
}

main().catch((err) => {
  console.error('❌', err.message)
  process.exit(1)
})
