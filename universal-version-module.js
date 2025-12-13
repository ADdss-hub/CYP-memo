/**
 * 统一版本模块 (Universal Version Module)
 * 自动生成的版本信息汇总
 * 生成时间: 2025-12-13T12:16:13.119Z
 */

const versionInfo = {
  // 当前版本信息
  current: {
  "version": "v0.1.2",
  "name": "CYP-memo",
  "author": "CYP",
  "contact": "nasDSSCYP@outlook.com",
  "description": "容器化的CYP备忘录，支持WebDAV、二维码、文件解析等功能",
  "lastUpdate": "2025-12-13T12:10:54.742Z",
  "status": "active"
},
  
  // 版本历史
  history: [],
  
  // 版本记录统计
  records: {
  "lastUpdate": "2025-12-13T12:15:08.359Z",
  "files": {
    "DEVELOPMENT_DOCS.md": "v0.1.0",
    "project_structure.md": "v0.1.0",
    "unified-version-system\\core\\version-api.js": "v2.1.0",
    "unified-version-system\\core\\version-checker.js": "v2.1.0",
    "unified-version-system\\core\\version-config.js": "v2.1.0",
    "unified-version-system\\core\\version-manager.js": "v2.1.0",
    "unified-version-system\\core\\version-updater.js": "v2.1.0",
    "unified-version-system\\README.md": "v0.1.0"
  }
},
  
  // 版本服务API
  api: {
    getCurrentVersion() {
      return "v0.1.2";
    },
    
    getProjectName() {
      return "undefined";
    },
    
    getVersionTimestamp() {
      return "undefined";
    },
    
    getVersionAuthor() {
      return "CYP";
    },
    
    getVersionChanges() {
      return undefined;
    },
    
    getVersionHistory() {
      return [];
    },
    
    getVersionSummary() {
      const current = this.getCurrentVersion();
      const history = this.getVersionHistory();
      
      return {
        current,
        totalHistory: history.length,
        latestUpdate: history[0]?.timestamp || null,
        project: this.getProjectName()
      };
    }
  }
};

module.exports = versionInfo;

// 快速访问函数
module.exports.getVersion = () => module.exports.api.getCurrentVersion();
module.exports.getProject = () => module.exports.api.getProjectName();
module.exports.getHistory = () => module.exports.api.getVersionHistory();
module.exports.getSummary = () => module.exports.api.getVersionSummary();

console.log('统一版本模块已加载:', module.exports.getSummary());
