#!/usr/bin/env node

/**
 * 简洁版版本记录管理系统
 * 专注于版本记录的自动查找和同步功能
 */

const fs = require('fs');
const path = require('path');

class SimpleVersionRecordManager {
  constructor(projectRoot = process.cwd()) {
    this.projectRoot = path.resolve(projectRoot);
    this.recordFile = path.join(this.projectRoot, '.version-record.json');
    
    // 项目中的JS/TS文件列表
    this.jsFiles = [];
    // 版本记录映射表
    this.fileVersionMap = new Map();
    
    this.loadRecordFile();
  }

  /**
   * 加载版本记录文件
   */
  loadRecordFile() {
    if (fs.existsSync(this.recordFile)) {
      try {
        const data = fs.readFileSync(this.recordFile, 'utf8');
        const record = JSON.parse(data);
        this.fileVersionMap = new Map(Object.entries(record.files || {}));
        console.log(`已加载版本记录: ${Object.keys(record.files || {}).length} 个文件`);
      } catch (error) {
        console.warn('版本记录文件加载失败:', error.message);
        this.fileVersionMap = new Map();
      }
    } else {
      console.log('未找到版本记录文件，将创建新的记录');
      this.fileVersionMap = new Map();
    }
  }

  /**
   * 保存版本记录文件
   */
  saveRecordFile() {
    const record = {
      lastUpdate: new Date().toISOString(),
      files: Object.fromEntries(this.fileVersionMap)
    };
    
    try {
      fs.writeFileSync(this.recordFile, JSON.stringify(record, null, 2), 'utf8');
      console.log('版本记录文件已保存');
      return true;
    } catch (error) {
      console.error('保存版本记录文件失败:', error.message);
      return false;
    }
  }

  /**
   * 递归扫描项目文件
   */
  async scanDirectory(dir, patterns, files) {
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const relativePath = path.relative(this.projectRoot, fullPath);
      
      // 跳过特定目录
      if (item.startsWith('.') || item === 'node_modules' || item === 'dist' || item === 'build') {
        continue;
      }
      
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        await this.scanDirectory(fullPath, patterns, files);
      } else if (stat.isFile() && this.isSourceFile(item)) {
        files.push(fullPath);
      }
    }
  }

  /**
   * 判断是否为源文件
   */
  isSourceFile(filename) {
    return /\.(js|ts|jsx|tsx|md|markdown|txt)$/.test(filename) && !filename.endsWith('.min.js');
  }

  /**
   * 扫描项目中所有源文件
   */
  async scanProjectFiles() {
    console.log('开始扫描项目文件...');
    
    const files = [];
    await this.scanDirectory(this.projectRoot, [], files);
    
    this.jsFiles = files;
    console.log(`扫描完成，共找到 ${files.length} 个源文件`);
    return files;
  }

  /**
   * 从文件内容中提取版本信息
   */
  extractVersionFromContent(content, filename) {
    const fileExt = path.extname(filename).toLowerCase();
    
    // JavaScript/TypeScript文件的版本模式
    if (fileExt.match(/\.(js|ts|jsx|tsx)$/)) {
      return this.extractVersionFromCode(content, filename);
    }
    
    // 文档文件的版本模式
    if (fileExt.match(/\.(md|markdown|txt)$/)) {
      return this.extractVersionFromDocument(content, filename);
    }
    
    return null;
  }

  /**
   * 从代码文件中提取版本信息
   */
  extractVersionFromCode(content, filename) {
    const patterns = [
      /version\s*[:=]\s*['"]([^'"]+)['"]/gi,
      /VERSION\s*[:=]\s*['"]([^'"]+)['"]/gi,
      /@version\s+([^\s]+)/gi,
      /const\s+version\s*=\s*['"]([^'"]+)['"]/gi,
      /export\s+const\s+version\s*=\s*['"]([^'"]+)['"]/gi,
      /export\s+default\s+{[^}]*version\s*:\s*['"]([^'"]+)['"]/gi,
      /@author\s+([^\n]+)/gi
    ];

    for (const pattern of patterns) {
      const match = pattern.exec(content);
      if (match && match[1]) {
        const version = match[1];
        if (this.isValidVersion(version)) {
          return {
            version,
            pattern: pattern.source,
            matchText: match[0],
            type: 'code'
          };
        }
      }
    }

    return null;
  }

  /**
   * 从文档文件中提取版本信息
   */
  extractVersionFromDocument(content, filename) {
    const patterns = [
      // 版本号在标题中
      /^#.*\b(v\d+\.\d+\.\d+)\b.*$/gmi,
      // 版本信息在表格中
      /\|.*\b(v\d+\.\d+\.\d+)\b.*\|/gmi,
      // 版本号在文本中
      /\bversion[:\s]+(v\d+\.\d+\.\d+)\b/gi,
      // 版本历史记录中的版本号
      /## 版本历史.*?(v\d+\.\d+\.\d+)/gmi,
      // Markdown文档顶部的版本信息
      /^(?:---|\*\*\*)\s*[\r\n]+.*?version:\s*(v\d+\.\d+\.\d+)/gmi,
      // 文档末尾的版本信息
      /版本[:\s]+(v\d+\.\d+\.\d+)/gi,
      // 变更日志格式
      /###\s*(v\d+\.\d+\.\d+)/gmi,
      // 文档元数据中的版本
      /"version"\s*:\s*"(v\d+\.\d+\.\d+)"/gmi
    ];

    for (const pattern of patterns) {
      const match = pattern.exec(content);
      if (match && match[1]) {
        const version = match[1];
        if (this.isValidVersion(version)) {
          return {
            version,
            pattern: pattern.source,
            matchText: match[0],
            type: 'document'
          };
        }
      }
    }

    return null;
  }

  /**
   * 验证版本号格式
   */
  isValidVersion(version) {
    return /^v\d+\.\d+\.\d+/.test(version);
  }

  /**
   * 分析文件版本信息
   */
  async analyzeFileVersions() {
    console.log('开始分析文件版本信息...');
    
    let updatedCount = 0;
    
    for (const filePath of this.jsFiles) {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const relativePath = path.relative(this.projectRoot, filePath);
        
        const versionInfo = this.extractVersionFromContent(content, filePath);
        
        if (versionInfo) {
          this.fileVersionMap.set(relativePath, versionInfo.version);
          console.log(`发现版本: ${relativePath} -> ${versionInfo.version}`);
        } else {
          console.log(`未发现版本: ${relativePath}`);
        }
      } catch (error) {
        console.warn(`分析文件失败 ${filePath}:`, error.message);
      }
    }
    
    console.log(`版本分析完成，共分析 ${this.jsFiles.length} 个文件`);
    return updatedCount;
  }

  /**
   * 获取项目版本信息摘要
   */
  getVersionSummary() {
    const versions = Array.from(this.fileVersionMap.values());
    const uniqueVersions = [...new Set(versions)];
    
    return {
      totalFiles: this.fileVersionMap.size,
      uniqueVersions: uniqueVersions.length,
      versions: uniqueVersions,
      filesWithVersions: this.fileVersionMap.size,
      lastUpdate: new Date().toISOString()
    };
  }

  /**
   * 导出版本记录模块
   */
  exportVersionModule(outputPath = 'version-record-module.js') {
    const summary = this.getVersionSummary();
    const moduleContent = `/**
 * 版本记录模块
 * 自动生成的版本信息汇总
 * 最后更新: ${summary.lastUpdate}
 */

const versionRecord = ${JSON.stringify(summary, null, 2)};

module.exports = versionRecord;

// 版本信息
console.log('版本记录模块已加载');
console.log('总文件数:', versionRecord.totalFiles);
console.log('唯一版本数:', versionRecord.uniqueVersions);
console.log('版本列表:', versionRecord.versions.join(', '));
`;

    try {
      const fullPath = path.resolve(outputPath);
      fs.writeFileSync(fullPath, moduleContent, 'utf8');
      console.log(`版本记录模块已导出到: ${fullPath}`);
      return true;
    } catch (error) {
      console.error('导出版本记录模块失败:', error.message);
      return false;
    }
  }

  /**
   * 自动更新版本记录
   */
  async autoUpdate() {
    console.log('开始自动更新版本记录...');
    
    // 1. 扫描文件
    await this.scanProjectFiles();
    
    // 2. 分析版本
    await this.analyzeFileVersions();
    
    // 3. 保存记录
    this.saveRecordFile();
    
    // 4. 显示摘要
    const summary = this.getVersionSummary();
    console.log('版本记录更新完成:');
    console.log(`  - 总文件数: ${summary.totalFiles}`);
    console.log(`  - 唯一版本数: ${summary.uniqueVersions}`);
    console.log(`  - 版本列表: ${summary.versions.join(', ')}`);
    
    return summary;
  }
}

// 主程序
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';
  
  const manager = new SimpleVersionRecordManager();
  
  switch (command) {
    case 'scan':
      await manager.scanProjectFiles();
      break;
      
    case 'analyze':
      await manager.analyzeFileVersions();
      break;
      
    case 'auto':
      await manager.autoUpdate();
      break;
      
    case 'info':
      const summary = manager.getVersionSummary();
      console.log('版本记录信息:');
      console.log(JSON.stringify(summary, null, 2));
      break;
      
    case 'export':
      const outputPath = args[1] || 'version-record-module.js';
      manager.exportVersionModule(outputPath);
      break;
      
    case 'help':
    default:
      console.log('简洁版版本记录管理系统');
      console.log('');
      console.log('用法: node version-record-simple.js <命令> [参数]');
      console.log('');
      console.log('命令:');
      console.log('  scan      扫描项目中所有源文件');
      console.log('  analyze   分析文件中的版本信息');
      console.log('  auto      自动更新版本记录 (推荐)');
      console.log('  info      显示版本记录摘要信息');
      console.log('  export    导出版本记录模块 [输出文件路径]');
      console.log('  help      显示此帮助信息');
      break;
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main().catch(error => {
    console.error('执行过程中发生错误:', error);
    process.exit(1);
  });
}

module.exports = SimpleVersionRecordManager;