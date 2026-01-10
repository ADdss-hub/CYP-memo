#!/usr/bin/env node

/**
 * 统一版本管理器
 * 协调所有版本管理模块，提供统一的接口
 * 
 * @module version-manager-unified
 * @author CYP
 * @version v1.15.7
 */

const fs = require('fs');
const path = require('path');
const VersionValidator = require('./modules/version-validator');
const VersionWriter = require('./modules/version-writer');
const VersionIncrementer = require('./modules/version-incrementer');
const VersionHistory = require('./modules/version-history');

class UnifiedVersionManager {
  constructor(options = {}) {
    this.projectRoot = options.projectRoot || process.cwd();
    this.silent = options.silent || false;
    
    // 初始化模块
    this.validator = new VersionValidator({ 
      projectRoot: this.projectRoot, 
      silent: this.silent 
    });
    this.writer = new VersionWriter({ 
      projectRoot: this.projectRoot, 
      silent: this.silent 
    });
    this.incrementer = new VersionIncrementer({ 
      silent: this.silent 
    });
    this.history = new VersionHistory({
      projectRoot: this.projectRoot,
      silent: this.silent
    });
  }

  /**
   * 获取当前版本号
   * @returns {string} 当前版本号
   */
  getCurrentVersion() {
    const versionFile = path.join(this.projectRoot, 'VERSION');
    
    if (!fs.existsSync(versionFile)) {
      throw new Error('VERSION 文件不存在');
    }

    return fs.readFileSync(versionFile, 'utf8').trim();
  }

  /**
   * 更新版本号（完整流程）
   * @param {string} newVersion - 新版本号
   * @param {Object} options - 选项
   * @returns {Object} 更新结果
   */
  async updateVersion(newVersion, options = {}) {
    const startTime = Date.now();
    
    if (!this.silent) {
      console.log('🚀 开始版本更新流程...\n');
      console.log(`目标版本: ${newVersion}\n`);
    }

    const result = {
      success: false,
      version: newVersion,
      steps: {},
      duration: 0
    };

    try {
      // 步骤 1: 验证版本号
      if (!this.silent) {
        console.log('📋 步骤 1/5: 验证版本号');
      }
      
      const validation = this.validator.validate(newVersion);
      result.steps.validation = validation;
      
      if (!validation.valid) {
        throw new Error('版本验证失败');
      }

      // 步骤 2: 检查版本冲突
      if (!this.silent) {
        console.log('📋 步骤 2/5: 检查版本冲突');
      }
      
      const currentVersion = this.getCurrentVersion();
      const comparison = this.incrementer.compare(newVersion, currentVersion);
      
      if (comparison <= 0) {
        if (!this.silent) {
          console.log(`   ⚠️  警告: 新版本 ${newVersion} 不大于当前版本 ${currentVersion}`);
        }
      } else if (!this.silent) {
        console.log(`   ✓ ${currentVersion} → ${newVersion}`);
      }

      // 步骤 3: 写入版本号
      if (!this.silent) {
        console.log('📋 步骤 3/5: 写入版本号');
      }
      
      this.writer.writeAll(newVersion);
      result.steps.write = { success: true };

      // 步骤 4: 再次验证（确保写入正确）
      if (!this.silent) {
        console.log('📋 步骤 4/5: 验证写入结果');
      }
      
      const postValidation = this.validator.checkHardcode();
      result.steps.postValidation = postValidation;
      
      if (!postValidation.valid) {
        throw new Error('写入后验证失败：发现硬编码');
      }
      
      if (!this.silent) {
        console.log('   ✓ 验证通过');
      }

      // 步骤 5: 更新版本历史记录
      if (!this.silent) {
        console.log('📋 步骤 5/5: 更新版本历史记录');
      }
      
      if (options.updateHistory !== false) {
        this.updateVersionHistory(currentVersion, newVersion, options);
        result.steps.history = { success: true };
      } else if (!this.silent) {
        console.log('   ⊘ 跳过');
      }

      result.success = true;
      result.duration = Date.now() - startTime;

      if (!this.silent) {
        console.log(`\n✅ 版本更新完成！耗时 ${result.duration}ms\n`);
        this.printSummary(currentVersion, newVersion);
      }

    } catch (error) {
      result.success = false;
      result.error = error.message;
      result.duration = Date.now() - startTime;

      if (!this.silent) {
        console.log(`\n❌ 版本更新失败: ${error.message}\n`);
      }
    }

    return result;
  }

  /**
   * 递增版本号（完整流程）
   * @param {string} type - 递增类型 (major/minor/patch)
   * @param {Object} options - 选项
   * @returns {Object} 更新结果
   */
  async incrementVersion(type = 'patch', options = {}) {
    if (!this.silent) {
      console.log(`🔢 递增 ${type} 版本号...\n`);
    }

    const currentVersion = this.getCurrentVersion();
    const newVersion = this.incrementer.increment(currentVersion, type);

    return await this.updateVersion(newVersion, options);
  }

  /**
   * 更新版本历史记录
   * @param {string} previousVersion - 上一版本号
   * @param {string} newVersion - 新版本号
   * @param {Object} options - 选项
   */
  updateVersionHistory(previousVersion, newVersion, options = {}) {
    try {
      // 确定版本类型
      const versionType = options.type || this.determineVersionType(previousVersion, newVersion);
      
      // 添加历史记录
      this.history.addRecord({
        version: newVersion,
        author: options.author || 'CYP',
        changes: options.changes || [],
        type: versionType,
        previousVersion: previousVersion,
        metadata: options.metadata || {}
      });

      // 生成 Markdown 文档
      this.history.saveMarkdown();

      if (!this.silent) {
        console.log('   ✓ 版本历史已更新');
      }
    } catch (error) {
      if (!this.silent) {
        console.log(`   ⚠️  版本历史更新失败: ${error.message}`);
      }
    }
  }

  /**
   * 确定版本类型
   * @param {string} oldVersion - 旧版本号
   * @param {string} newVersion - 新版本号
   * @returns {string} 版本类型
   */
  determineVersionType(oldVersion, newVersion) {
    const oldParts = this.incrementer.parse(oldVersion);
    const newParts = this.incrementer.parse(newVersion);

    if (newParts.major > oldParts.major) return 'major';
    if (newParts.minor > oldParts.minor) return 'minor';
    if (newParts.patch > oldParts.patch) return 'patch';
    
    return 'chore';
  }

  /**
   * 打印摘要信息
   * @param {string} oldVersion - 旧版本号
   * @param {string} newVersion - 新版本号
   */
  printSummary(oldVersion, newVersion) {
    console.log('📊 更新摘要:');
    console.log(`   版本变更: ${oldVersion} → ${newVersion}`);
    console.log(`   更新时间: ${new Date().toLocaleString('zh-CN')}`);
    console.log('');
    console.log('📝 已更新的文件:');
    console.log('   ✓ VERSION');
    console.log('   ✓ package.json');
    console.log('   ✓ frontend/package.json');
    console.log('   ✓ backend/package.json');
    console.log('   ✓ frontend/src/utils/version.ts');
    console.log('');
  }

  /**
   * 获取版本信息
   * @returns {Object} 版本信息
   */
  getVersionInfo() {
    const currentVersion = this.getCurrentVersion();
    const suggestions = this.incrementer.getSuggestions(currentVersion);

    return {
      current: currentVersion,
      suggestions: suggestions,
      files: {
        version: path.join(this.projectRoot, 'VERSION'),
        packageJson: path.join(this.projectRoot, 'package.json'),
        frontendVersion: path.join(this.projectRoot, 'frontend/src/utils/version.ts')
      }
    };
  }

  /**
   * 验证当前版本系统
   * @returns {Object} 验证结果
   */
  validateSystem() {
    if (!this.silent) {
      console.log('🔍 验证版本系统...\n');
    }

    const currentVersion = this.getCurrentVersion();
    const validation = this.validator.validate(currentVersion);

    if (!this.silent) {
      if (validation.valid) {
        console.log('✅ 版本系统验证通过！\n');
      } else {
        console.log('❌ 版本系统验证失败！\n');
      }
    }

    return validation;
  }
}

module.exports = UnifiedVersionManager;

// CLI 支持
if (require.main === module) {
  const command = process.argv[2];
  const manager = new UnifiedVersionManager();

  (async () => {
    try {
      switch (command) {
        case 'update':
          const version = process.argv[3];
          if (!version) {
            console.error('❌ 请提供版本号');
            console.log('用法: node version-manager-unified.js update <version>');
            process.exit(1);
          }
          await manager.updateVersion(version);
          break;

        case 'increment':
          const type = process.argv[3] || 'patch';
          await manager.incrementVersion(type);
          break;

        case 'info':
          const info = manager.getVersionInfo();
          console.log('📊 版本信息:\n');
          console.log(`当前版本: ${info.current}`);
          console.log('\n版本建议:');
          console.log(`  Patch: ${info.suggestions.patch}`);
          console.log(`  Minor: ${info.suggestions.minor}`);
          console.log(`  Major: ${info.suggestions.major}`);
          console.log('');
          break;

        case 'validate':
          manager.validateSystem();
          break;

        default:
          console.log('统一版本管理器\n');
          console.log('用法:');
          console.log('  node version-manager-unified.js update <version>  - 更新到指定版本');
          console.log('  node version-manager-unified.js increment [type]  - 递增版本 (patch/minor/major)');
          console.log('  node version-manager-unified.js info              - 显示版本信息');
          console.log('  node version-manager-unified.js validate          - 验证版本系统');
          console.log('');
      }
    } catch (error) {
      console.error(`❌ 错误: ${error.message}\n`);
      process.exit(1);
    }
  })();
}
