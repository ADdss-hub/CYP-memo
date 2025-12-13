#!/usr/bin/env node

/**
 * 版本更新器 (Version Updater)
 * 负责版本的初始化、更新、递增和历史管理
 * 
 * @author CYP (nasDSSCYP@outlook.com)
 * @version v2.1.0
 */

const fs = require('fs');
const path = require('path');

/**
 * 版本更新器类
 * 提供完整的版本更新和管理功能
 */
class VersionUpdater {
  constructor(options = {}) {
    this.options = {
      projectName: options.projectName || 'unknown',
      config: options.config || {},
      ...options
    };

    this.versionDir = path.join(process.cwd(), '.version');
    this.versionFile = path.join(this.versionDir, 'version.json');
    this.historyFile = path.join(this.versionDir, 'changelog.json');
  }

  /**
   * 初始化版本系统
   */
  initializeVersion(version, options = {}) {
    console.log(`🚀 初始化版本系统: ${version}`);

    // 1. 创建版本目录
    this.ensureVersionDirectory();

    // 2. 初始化版本文件
    const versionData = {
      version,
      timestamp: new Date().toISOString(),
      author: options.author || 'Unknown',
      project: this.options.projectName,
      changes: options.changes || [],
      metadata: {
        initialized: true,
        schema: '2.1.0'
      }
    };

    fs.writeFileSync(this.versionFile, JSON.stringify(versionData, null, 2));
    console.log(`✅ 版本文件已创建: ${this.versionFile}`);

    // 3. 初始化历史文件
    this.initializeHistoryFile();

    // 4. 创建版本模块
    this.createVersionModule(version, versionData);

    return versionData;
  }

  /**
   * 确保版本目录存在
   */
  ensureVersionDirectory() {
    if (!fs.existsSync(this.versionDir)) {
      fs.mkdirSync(this.versionDir, { recursive: true });
      console.log(`📁 版本目录已创建: ${this.versionDir}`);
    }
  }

  /**
   * 初始化历史文件
   */
  initializeHistoryFile() {
    const historyData = {
      schema: '2.1.0',
      history: [],
      metadata: {
        created: new Date().toISOString(),
        project: this.options.projectName
      }
    };

    fs.writeFileSync(this.historyFile, JSON.stringify(historyData, null, 2));
    console.log(`📜 历史文件已创建: ${this.historyFile}`);
  }

  /**
   * 更新版本
   */
  updateVersion(version, options = {}) {
    console.log(`🔄 更新版本到: ${version}`);

    // 1. 验证版本格式
    const versionChecker = require('./version-checker.js');
    const checker = new versionChecker({
      projectName: this.options.projectName,
      config: this.options.config
    });

    const formatCheck = checker.checkVersionFormat(version);
    if (!formatCheck.valid) {
      throw new Error(`版本格式错误: ${formatCheck.error}`);
    }

    // 2. 读取当前版本
    let currentVersionData = null;
    if (fs.existsSync(this.versionFile)) {
      currentVersionData = JSON.parse(fs.readFileSync(this.versionFile, 'utf8'));
    }

    // 3. 创建新版本数据
    const newVersionData = {
      version,
      timestamp: new Date().toISOString(),
      author: options.author || 'Unknown',
      project: this.options.projectName,
      changes: options.changes || [],
      metadata: {
        previousVersion: currentVersionData?.version || null,
        updated: true,
        schema: '2.1.0'
      }
    };

    // 4. 保存新版本
    fs.writeFileSync(this.versionFile, JSON.stringify(newVersionData, null, 2));

    // 5. 更新历史记录
    this.addToHistory(newVersionData, currentVersionData);

    // 6. 更新版本模块
    this.createVersionModule(version, newVersionData);

    console.log(`✅ 版本更新完成: ${currentVersionData?.version || '无'} -> ${version}`);
    return newVersionData;
  }

  /**
   * 递增版本号
   */
  incrementVersion(currentVersion, level = 'patch') {
    const VersionChecker = require('./version-checker.js');
    const checker = new VersionChecker();

    const parsed = checker.parseVersion(currentVersion);
    if (!parsed) {
      throw new Error(`无效的版本号: ${currentVersion}`);
    }

    let newVersion;
    switch (level.toLowerCase()) {
      case 'major':
        newVersion = `v${parsed.major + 1}.0.0`;
        break;
      case 'minor':
        newVersion = `v${parsed.major}.${parsed.minor + 1}.0`;
        break;
      case 'patch':
        newVersion = `v${parsed.major}.${parsed.minor}.${parsed.patch + 1}`;
        break;
      default:
        throw new Error(`不支持的递增级别: ${level}`);
    }

    return newVersion;
  }

  /**
   * 添加到历史记录
   */
  addToHistory(newVersionData, previousVersionData = null) {
    let historyData;

    if (fs.existsSync(this.historyFile)) {
      historyData = JSON.parse(fs.readFileSync(this.historyFile, 'utf8'));
    } else {
      historyData = {
        schema: '2.1.0',
        history: [],
        metadata: {
          created: new Date().toISOString(),
          project: this.options.projectName
        }
      };
    }

    // 添加新记录
    const historyEntry = {
      version: newVersionData.version,
      timestamp: newVersionData.timestamp,
      author: newVersionData.author,
      changes: newVersionData.changes,
      type: this.determineChangeType(newVersionData.changes),
      previousVersion: previousVersionData?.version || null,
      metadata: newVersionData.metadata
    };

    historyData.history.unshift(historyEntry); // 最新的在前面

    // 保持历史记录数量限制（可选）
    const maxHistoryEntries = this.options.config.versioning?.maxHistoryEntries || 100;
    if (historyData.history.length > maxHistoryEntries) {
      historyData.history = historyData.history.slice(0, maxHistoryEntries);
    }

    fs.writeFileSync(this.historyFile, JSON.stringify(historyData, null, 2));
    console.log(`📚 历史记录已更新`);
  }

  /**
   * 确定变更类型
   */
  determineChangeType(changes = []) {
    if (changes.length === 0) return 'chore';

    // 检查是否有重大变更
    const hasBreaking = changes.some(change => 
      change.type === 'feat' && change.breaking === true
    );
    if (hasBreaking) return 'major';

    // 检查是否有新功能
    const hasFeature = changes.some(change => change.type === 'feat');
    if (hasFeature) return 'minor';

    // 默认返回修复
    return 'patch';
  }

  /**
   * 创建版本模块
   */
  createVersionModule(version, versionData) {
    const moduleContent = `/**
 * 自动生成的版本模块
 * 版本: ${version}
 * 生成时间: ${new Date().toISOString()}
 */

const version: "v0.1.2";
const versionData = ${JSON.stringify(versionData, null, 2)};

module.exports = {
  version,
  versionData,
  
  // 版本信息
  getVersion() {
    return version;
  },
  
  getVersionData() {
    return versionData;
  },
  
  // 版本比较
  compare(otherVersion) {
    const VersionChecker = require('./version-checker.js');
    const checker = new VersionChecker();
    
    const current = checker.parseVersion(version);
    const other = checker.parseVersion(otherVersion);
    
    if (!current || !other) return null;
    
    if (current.major !== other.major) {
      return current.major > other.major ? 1 : -1;
    }
    if (current.minor !== other.minor) {
      return current.minor > other.minor ? 1 : -1;
    }
    if (current.patch !== other.patch) {
      return current.patch > other.patch ? 1 : -1;
    }
    
    return 0;
  },
  
  // 版本格式化
  format(format = 'full') {
    switch (format) {
      case 'short':
        return version;
      case 'major':
        return \`v\${versionData.version.major}\`;
      case 'majorMinor':
        return \`v\${versionData.version.major}.\${versionData.version.minor}\`;
      case 'full':
      default:
        return \`\${versionData.project} v\${version} (\${versionData.timestamp})\`;
    }
  }
};

console.log('版本模块已加载:', module.exports.format('full'));
`;

    const modulePath = path.join(this.versionDir, 'version-module.js');
    fs.writeFileSync(modulePath, moduleContent);
    console.log(`📦 版本模块已创建: ${modulePath}`);
  }

  /**
   * 获取当前版本
   */
  getCurrentVersion() {
    if (fs.existsSync(this.versionFile)) {
      try {
        return JSON.parse(fs.readFileSync(this.versionFile, 'utf8'));
      } catch (error) {
        console.warn('读取版本文件失败:', error.message);
        return null;
      }
    }
    return null;
  }

  /**
   * 获取版本历史
   */
  getVersionHistory() {
    if (fs.existsSync(this.historyFile)) {
      try {
        const historyData = JSON.parse(fs.readFileSync(this.historyFile, 'utf8'));
        return historyData.history || [];
      } catch (error) {
        console.warn('读取历史文件失败:', error.message);
        return [];
      }
    }
    return [];
  }

  /**
   * 打印版本历史
   */
  printVersionHistory(limit = 10) {
    const history = this.getVersionHistory();
    
    console.log(`\n📜 版本历史 (显示最近 ${Math.min(limit, history.length)} 条):`);
    console.log('=' .repeat(60));
    
    history.slice(0, limit).forEach((entry, index) => {
      const changeTypes = entry.changes.map(c => c.type).join(', ');
      console.log(`${index + 1}. ${entry.version} - ${entry.timestamp}`);
      console.log(`   作者: ${entry.author}`);
      if (changeTypes) {
        console.log(`   变更: ${changeTypes}`);
      }
      if (entry.changes.length > 0) {
        entry.changes.forEach(change => {
          console.log(`     • ${change.description}`);
        });
      }
      console.log('');
    });
    
    if (history.length > limit) {
      console.log(`... 还有 ${history.length - limit} 条历史记录`);
    }
  }

  /**
   * 验证版本数据
   */
  validateVersionData(versionData) {
    const errors = [];

    if (!versionData.version) {
      errors.push('缺少版本号');
    }

    if (!versionData.timestamp) {
      errors.push('缺少时间戳');
    }

    if (!versionData.author) {
      errors.push('缺少作者信息');
    }

    if (!versionData.project) {
      errors.push('缺少项目信息');
    }

    // 验证版本格式
    if (versionData.version) {
      const VersionChecker = require('./version-checker.js');
      const checker = new VersionChecker();
      const formatCheck = checker.checkVersionFormat(versionData.version);
      if (!formatCheck.valid) {
        errors.push(`版本格式错误: ${formatCheck.error || '格式不符合规范'}`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * 备份版本数据
   */
  backupVersionData() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(this.versionDir, 'backups');
    
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    // 备份版本文件
    if (fs.existsSync(this.versionFile)) {
      const backupPath = path.join(backupDir, `version-${timestamp}.json`);
      fs.copyFileSync(this.versionFile, backupPath);
    }

    // 备份历史文件
    if (fs.existsSync(this.historyFile)) {
      const backupPath = path.join(backupDir, `changelog-${timestamp}.json`);
      fs.copyFileSync(this.historyFile, backupPath);
    }

    console.log(`💾 版本数据已备份到: ${backupDir}`);
  }

  /**
   * 恢复版本数据
   */
  restoreVersionData(backupTimestamp) {
    const backupDir = path.join(this.versionDir, 'backups');
    
    if (!fs.existsSync(backupDir)) {
      throw new Error('备份目录不存在');
    }

    const versionBackup = path.join(backupDir, `version-${backupTimestamp}.json`);
    const historyBackup = path.join(backupDir, `changelog-${backupTimestamp}.json`);

    if (!fs.existsSync(versionBackup)) {
      throw new Error(`版本备份文件不存在: ${versionBackup}`);
    }

    // 恢复文件
    fs.copyFileSync(versionBackup, this.versionFile);
    if (fs.existsSync(historyBackup)) {
      fs.copyFileSync(historyBackup, this.historyFile);
    }

    console.log(`🔄 版本数据已恢复: ${backupTimestamp}`);
  }

  /**
   * 导出版本数据
   */
  exportVersionData(outputPath = './version-export.json') {
    const currentVersion = this.getCurrentVersion();
    const history = this.getVersionHistory();

    const exportData = {
      schema: '2.1.0',
      exported: new Date().toISOString(),
      project: this.options.projectName,
      current: currentVersion,
      history: history,
      summary: {
        totalVersions: history.length,
        firstVersion: history.length > 0 ? history[history.length - 1].version : null,
        latestVersion: history.length > 0 ? history[0].version : null
      }
    };

    fs.writeFileSync(outputPath, JSON.stringify(exportData, null, 2));
    console.log(`📤 版本数据已导出到: ${outputPath}`);
    
    return exportData;
  }
}

module.exports = VersionUpdater;