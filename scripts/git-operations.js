#!/usr/bin/env node
/**
 * Git 操作模块
 * 提供 Git 相关操作：提交、标签、推送
 * 
 * @module git-operations
 * @author CYP
 * @version v1.0.0
 */

import { execSync } from 'child_process'
import { fileURLToPath } from 'url'
import path from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

class GitOperations {
  constructor(options = {}) {
    this.projectRoot = options.projectRoot || path.join(__dirname, '..')
    this.silent = options.silent || false
  }

  /**
   * 执行 Git 命令
   */
  exec(command, options = {}) {
    try {
      return execSync(`git ${command}`, {
        cwd: this.projectRoot,
        encoding: 'utf-8',
        stdio: options.silent || this.silent ? 'pipe' : 'inherit',
        ...options,
      })
    } catch (error) {
      if (!options.ignoreError) {
        throw error
      }
      return null
    }
  }

  /**
   * 检查是否是 Git 仓库
   */
  isGitRepo() {
    try {
      this.exec('rev-parse --git-dir', { silent: true })
      return true
    } catch {
      return false
    }
  }

  /**
   * 获取当前分支名
   */
  getCurrentBranch() {
    const branch = this.exec('rev-parse --abbrev-ref HEAD', { silent: true })
    return branch ? branch.trim() : 'main'
  }

  /**
   * 检查是否有未提交的更改
   */
  getUncommittedChanges() {
    const status = this.exec('status --porcelain', { silent: true })
    return status ? status.trim().split('\n').filter(Boolean) : []
  }

  /**
   * 检查 tag 是否已存在
   */
  tagExists(tagName) {
    try {
      this.exec(`rev-parse ${tagName}`, { silent: true })
      return true
    } catch {
      return false
    }
  }

  /**
   * 暂存所有更改
   */
  stageAll() {
    try {
      this.exec('add -A')
      if (!this.silent) console.log('   ✅ 已暂存所有更改')
      return true
    } catch (error) {
      if (!this.silent) console.log(`   ❌ 暂存失败: ${error.message}`)
      return false
    }
  }

  /**
   * 提交更改
   */
  commit(message) {
    try {
      this.exec(`commit -m "${message}"`)
      if (!this.silent) console.log(`   ✅ 已提交: ${message}`)
      return true
    } catch (error) {
      if (!this.silent) console.log(`   ❌ 提交失败: ${error.message}`)
      return false
    }
  }

  /**
   * 创建标签
   */
  createTag(tagName, message = null) {
    try {
      if (this.tagExists(tagName)) {
        if (!this.silent) console.log(`   ⚠️  标签 ${tagName} 已存在，跳过创建`)
        return false
      }

      if (message) {
        this.exec(`tag -a ${tagName} -m "${message}"`)
      } else {
        this.exec(`tag ${tagName}`)
      }
      
      if (!this.silent) console.log(`   ✅ 已创建标签: ${tagName}`)
      return true
    } catch (error) {
      if (!this.silent) console.log(`   ❌ 创建标签失败: ${error.message}`)
      return false
    }
  }

  /**
   * 删除本地标签
   */
  deleteTag(tagName) {
    try {
      this.exec(`tag -d ${tagName}`)
      if (!this.silent) console.log(`   ✅ 已删除本地标签: ${tagName}`)
      return true
    } catch (error) {
      if (!this.silent) console.log(`   ❌ 删除标签失败: ${error.message}`)
      return false
    }
  }

  /**
   * 推送到远程
   */
  push(remote = 'origin', branch = null) {
    try {
      const targetBranch = branch || this.getCurrentBranch()
      this.exec(`push ${remote} ${targetBranch}`)
      if (!this.silent) console.log(`   ✅ 已推送到 ${remote}/${targetBranch}`)
      return true
    } catch (error) {
      if (!this.silent) console.log(`   ❌ 推送失败: ${error.message}`)
      return false
    }
  }

  /**
   * 推送标签到远程
   */
  pushTag(tagName, remote = 'origin') {
    try {
      this.exec(`push ${remote} ${tagName}`)
      if (!this.silent) console.log(`   ✅ 已推送标签: ${tagName}`)
      return true
    } catch (error) {
      if (!this.silent) console.log(`   ❌ 推送标签失败: ${error.message}`)
      return false
    }
  }

  /**
   * 推送所有标签到远程
   */
  pushAllTags(remote = 'origin') {
    try {
      this.exec(`push ${remote} --tags`)
      if (!this.silent) console.log(`   ✅ 已推送所有标签到 ${remote}`)
      return true
    } catch (error) {
      if (!this.silent) console.log(`   ❌ 推送标签失败: ${error.message}`)
      return false
    }
  }

  /**
   * 完整的发布流程：暂存 -> 提交 -> 创建标签 -> 推送
   */
  release(version, options = {}) {
    const {
      commitMessage = `release: v${version}`,
      tagName = `v${version}`,
      tagMessage = `Release v${version}`,
      remote = 'origin',
      branch = null,
      skipCommit = false,
      skipTag = false,
      skipPush = false,
    } = options

    const result = {
      success: false,
      steps: {},
      errors: [],
    }

    if (!this.silent) console.log('\n📤 Git 操作...')

    if (!this.isGitRepo()) {
      result.errors.push('当前目录不是 Git 仓库')
      return result
    }

    try {
      // 1. 暂存更改
      result.steps.stage = this.stageAll()

      // 2. 提交
      if (!skipCommit) {
        result.steps.commit = this.commit(commitMessage)
      } else if (!this.silent) {
        console.log('   ⊘ 跳过提交')
      }

      // 3. 创建标签
      if (!skipTag) {
        result.steps.tag = this.createTag(tagName, tagMessage)
      } else if (!this.silent) {
        console.log('   ⊘ 跳过创建标签')
      }

      // 4. 推送
      if (!skipPush) {
        if (!this.silent) console.log('\n🌐 推送到远程...')
        result.steps.pushCode = this.push(remote, branch)

        if (!skipTag && result.steps.tag) {
          result.steps.pushTag = this.pushTag(tagName, remote)
        }
      } else if (!this.silent) {
        console.log('   ⊘ 跳过推送')
      }

      result.success = true
    } catch (error) {
      result.errors.push(error.message)
    }

    return result
  }

  /**
   * 获取最近的标签
   */
  getLatestTag() {
    try {
      const tag = this.exec('describe --tags --abbrev=0', { silent: true })
      return tag ? tag.trim() : null
    } catch {
      return null
    }
  }

  /**
   * 获取所有标签
   */
  getAllTags() {
    try {
      const tags = this.exec('tag -l', { silent: true })
      return tags ? tags.trim().split('\n').filter(Boolean) : []
    } catch {
      return []
    }
  }
}

export default GitOperations

// CLI 支持
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const command = process.argv[2]
  const git = new GitOperations()

  switch (command) {
    case 'tag':
      const tagName = process.argv[3]
      if (!tagName) {
        console.error('❌ 请提供标签名')
        console.log('用法: node scripts/git-operations.js tag <tagName> [message]')
        process.exit(1)
      }
      const tagMessage = process.argv[4]
      git.createTag(tagName, tagMessage)
      break

    case 'push':
      git.push()
      if (!process.argv.includes('--no-tags')) {
        git.pushAllTags()
      }
      break

    case 'push-tag':
      const pushTagName = process.argv[3]
      if (!pushTagName) {
        console.error('❌ 请提供标签名')
        process.exit(1)
      }
      git.pushTag(pushTagName)
      break

    case 'info':
      console.log('📊 Git 信息:\n')
      console.log(`当前分支: ${git.getCurrentBranch()}`)
      const latestTag = git.getLatestTag()
      if (latestTag) console.log(`最新标签: ${latestTag}`)
      const changes = git.getUncommittedChanges()
      console.log(`未提交更改: ${changes.length} 个文件`)
      console.log('\n所有标签:')
      git.getAllTags().forEach(t => console.log(`  - ${t}`))
      break

    default:
      console.log('Git 操作工具\n')
      console.log('用法: node scripts/git-operations.js <command>\n')
      console.log('命令:')
      console.log('  tag <name> [message]  - 创建标签')
      console.log('  push                  - 推送代码和标签')
      console.log('  push-tag <name>       - 推送指定标签')
      console.log('  info                  - 显示 Git 信息')
  }
}
