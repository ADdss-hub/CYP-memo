#!/usr/bin/env node

/**
 * 版本检查器 (Version Checker)
 * 负责版本格式验证、规则检查和变更类型验证
 * 
 * @author CYP (nasDSSCYP@outlook.com)
 * @version v2.1.0
 */

const fs = require('fs');
const path = require('path');

/**
 * 版本检查器类
 * 提供完整的版本验证和检查功能
 */
class VersionChecker {
  constructor(options = {}) {
    this.options = {
      projectName: options.projectName || 'unknown',
      config: options.config || {},
      ...options
    };

    // 标准变更类型定义
    this.changeTypes = {
      feat: { level: 'minor', description: '新功能' },
      fix: { level: 'patch', description: '修复问题' },
      docs: { level: 'patch', description: '文档更新' },
      style: { level: 'patch', description: '代码风格' },
      refactor: { level: 'patch', description: '代码重构' },
      perf: { level: 'patch', description: '性能优化' },
      test: { level: 'patch', description: '测试相关' },
      build: { level: 'patch', description: '构建系统' },
      ci: { level: 'patch', description: 'CI配置' },
      chore: { level: 'patch', description: '日常维护' },
      revert: { level: 'auto', description: '回滚提交' }
    };

    // 版本格式验证正则表达式
    this.versionPattern = /^v\d+\.\d+\.\d+(?:-[\w.-]+)?$/;
    this.versionPartsPattern = /^v(\d+)\.(\d+)\.(\d+)(?:-([\w.-]+))?$/;
  }

  /**
   * 检查版本号格式
   */
  checkVersionFormat(version) {
    if (!version) {
      return { valid: false, error: '版本号不能为空' };
    }

    if (!version.startsWith('v')) {
      return { valid: false, error: '版本号必须以 "v" 开头' };
    }

    if (!this.versionPattern.test(version)) {
      return { valid: false, error: '版本号格式不正确，应为 vX.Y.Z' };
    }

    return { valid: true, version };
  }

  /**
   * 解析版本号
   */
  parseVersion(version) {
    const formatCheck = this.checkVersionFormat(version);
    if (!formatCheck.valid) {
      return null;
    }

    const match = this.versionPartsPattern.exec(version);
    if (!match) {
      return null;
    }

    return {
      major: parseInt(match[1], 10),
      minor: parseInt(match[2], 10),
      patch: parseInt(match[3], 10),
      prerelease: match[4] || null,
      original: version
    };
  }

  /**
   * 验证变更类型
   */
  validateChangeType(changeType) {
    if (!changeType) {
      return { valid: false, error: '变更类型不能为空' };
    }

    if (!this.changeTypes[changeType]) {
      return { 
        valid: false, 
        error: `不支持的变更类型: ${changeType}`,
        supportedTypes: Object.keys(this.changeTypes)
      };
    }

    return { 
      valid: true, 
      changeType,
      config: this.changeTypes[changeType]
    };
  }

  /**
   * 验证变更列表
   */
  validateChanges(changes = []) {
    const errors = [];
    const warnings = [];
    const validChanges = [];

    if (!Array.isArray(changes)) {
      return {
        valid: false,
        errors: ['变更列表必须是数组'],
        validChanges: []
      };
    }

    if (changes.length === 0) {
      warnings.push('建议提供变更描述');
    }

    changes.forEach((change, index) => {
      // 验证变更类型
      const typeValidation = this.validateChangeType(change.type);
      if (!typeValidation.valid) {
        errors.push(`变更 ${index + 1}: ${typeValidation.error}`);
        return;
      }

      // 验证变更描述
      if (!change.description || typeof change.description !== 'string') {
        errors.push(`变更 ${index + 1}: 缺少描述信息`);
        return;
      }

      validChanges.push({
        type: change.type,
        description: change.description,
        config: typeValidation.config
      });
    });

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      validChanges,
      changeTypes: this.getChangeTypeSummary()
    };
  }

  /**
   * 验证版本递增规则
   */
  validateIncrement(currentVersion, newVersion, changes = []) {
    const currentParsed = this.parseVersion(currentVersion);
    const newParsed = this.parseVersion(newVersion);

    if (!currentParsed || !newParsed) {
      return { valid: false, error: '版本号格式不正确' };
    }

    // 获取变更类型对应的递增级别
    const levels = changes.map(change => {
      const typeConfig = this.changeTypes[change.type];
      return typeConfig ? typeConfig.level : 'patch';
    });

    // 检查是否有 major 级别的变更
    if (levels.includes('major')) {
      return {
        valid: newParsed.major > currentParsed.major,
        expectedLevel: 'major',
        actualChange: { from: currentParsed.major, to: newParsed.major }
      };
    }

    // 检查是否有 minor 级别的变更
    if (levels.includes('minor')) {
      if (newParsed.major !== currentParsed.major) {
        return { 
          valid: false, 
          error: '有 minor 级别变更时不能改变 major 版本',
          expectedLevel: 'minor'
        };
      }
      return {
        valid: newParsed.minor > currentParsed.minor,
        expectedLevel: 'minor',
        actualChange: { from: currentParsed.minor, to: newParsed.minor }
      };
    }

    // 默认检查 patch 级别
    if (newParsed.major !== currentParsed.major || newParsed.minor !== currentParsed.minor) {
      return { 
        valid: false, 
        error: '仅有 patch 级别变更时不能改变 major 或 minor 版本',
        expectedLevel: 'patch'
      };
    }

    return {
      valid: newParsed.patch > currentParsed.patch,
      expectedLevel: 'patch',
      actualChange: { from: currentParsed.patch, to: newParsed.patch }
    };
  }

  /**
   * 检查重复版本号
   */
  checkDuplicateVersion(version, history = []) {
    if (history.includes(version)) {
      return {
        isDuplicate: true,
        error: `版本号 ${version} 已存在`,
        history
      };
    }

    return { isDuplicate: false, version };
  }

  /**
   * 完整版本检查
   */
  checkVersion(version, changes = [], currentVersion = null, history = []) {
    const report = {
      version: version,
      valid: true,
      errors: [],
      warnings: [],
      info: [],
      checks: {}
    };

    // 1. 检查版本格式
    const formatCheck = this.checkVersionFormat(version);
    report.checks.format = formatCheck;
    if (!formatCheck.valid) {
      report.valid = false;
      report.errors.push(formatCheck.error);
    } else {
      report.info.push(`✅ 版本格式正确: ${version}`);
    }

    // 2. 检查变更类型
    const changesValidation = this.validateChanges(changes);
    report.checks.changes = changesValidation;
    if (!changesValidation.valid) {
      report.valid = false;
      report.errors.push(...changesValidation.errors);
    }
    if (changesValidation.warnings.length > 0) {
      report.warnings.push(...changesValidation.warnings);
    }

    // 3. 检查版本递增规则
    if (currentVersion) {
      const incrementCheck = this.validateIncrement(currentVersion, version, changes);
      report.checks.increment = incrementCheck;
      if (!incrementCheck.valid) {
        report.valid = false;
        report.errors.push(incrementCheck.error);
      } else {
        report.info.push(`✅ 版本递增正确: ${currentVersion} -> ${version}`);
      }
    }

    // 4. 检查重复版本
    const duplicateCheck = this.checkDuplicateVersion(version, history);
    report.checks.duplicate = duplicateCheck;
    if (duplicateCheck.isDuplicate) {
      report.valid = false;
      report.errors.push(duplicateCheck.error);
    }

    // 5. 添加变更类型统计
    if (changesValidation.validChanges.length > 0) {
      const typeSummary = this.getChangeTypeSummary(changesValidation.validChanges);
      report.checks.typeSummary = typeSummary;
      report.info.push(`📊 变更类型统计: ${typeSummary.summary}`);
    }

    return report;
  }

  /**
   * 获取变更类型统计
   */
  getChangeTypeSummary(changes = null) {
    const sourceChanges = changes || [];
    const counts = {};

    sourceChanges.forEach(change => {
      counts[change.type] = (counts[change.type] || 0) + 1;
    });

    const summary = Object.entries(counts)
      .map(([type, count]) => `${type}(${count})`)
      .join(', ');

    return { counts, summary, total: sourceChanges.length };
  }

  /**
   * 打印检查报告
   */
  printReport(report) {
    console.log('\n🔍 版本检查报告:');
    console.log(`   版本: ${report.version}`);
    console.log(`   状态: ${report.valid ? '✅ 验证通过' : '❌ 验证失败'}`);

    if (report.info.length > 0) {
      console.log('\n📋 检查结果:');
      report.info.forEach(info => console.log(`   ${info}`));
    }

    if (report.warnings.length > 0) {
      console.log('\n⚠️  警告信息:');
      report.warnings.forEach(warning => console.log(`   ${warning}`));
    }

    if (report.errors.length > 0) {
      console.log('\n❌ 错误信息:');
      report.errors.forEach(error => console.log(`   ${error}`));
    }

    if (report.checks.typeSummary) {
      const { counts, total } = report.checks.typeSummary;
      console.log(`\n📊 变更统计: 共 ${total} 项变更`);
      Object.entries(counts).forEach(([type, count]) => {
        const typeInfo = this.changeTypes[type];
        console.log(`   ${type}: ${count} 项 (${typeInfo?.description || '未知'})`);
      });
    }
  }

  /**
   * 获取支持的变更类型列表
   */
  getSupportedChangeTypes() {
    return Object.entries(this.changeTypes).map(([type, config]) => ({
      type,
      level: config.level,
      description: config.description
    }));
  }

  /**
   * 验证配置文件
   */
  validateConfig(config) {
    const errors = [];
    const warnings = [];

    if (!config.project || !config.project.name) {
      warnings.push('未配置项目名称');
    }

    if (!config.versioning || !config.versioning.rules) {
      warnings.push('未配置版本递增规则');
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * 生成版本检查脚本
   */
  generateCheckScript(version, changes = []) {
    const script = `
/**
 * 自动生成的版本检查脚本
 * 版本: ${version}
 * 生成时间: ${new Date().toISOString()}
 */

const versionChecker = require('./version-checker.js');

const changes = ${JSON.stringify(changes, null, 2)};
const version: "v0.1.2";

const report = versionChecker.checkVersion(version, changes);
versionChecker.printReport(report);

if (!report.valid) {
  process.exit(1);
}
`;

    return script;
  }

  /**
   * 批量检查多个版本
   */
  batchCheck(versions, changes = []) {
    const results = versions.map(version => ({
      version,
      report: this.checkVersion(version, changes)
    }));

    const summary = {
      total: results.length,
      valid: results.filter(r => r.report.valid).length,
      invalid: results.filter(r => !r.report.valid).length,
      results
    };

    return summary;
  }

  /**
   * 导出为模块
   */
  static exportModule(outputPath = './version-checker-module.js') {
    const moduleCode = `
// 版本检查器模块
const VersionChecker = require('./version-checker.js');

module.exports = VersionChecker;
`;

    fs.writeFileSync(outputPath, moduleCode);
    console.log(`版本检查器模块已导出到: ${outputPath}`);
  }
}

module.exports = VersionChecker;