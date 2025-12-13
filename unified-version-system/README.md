# 通用版本管理系统使用指南

**作者**: CYP  
**联系方式**: nasDSSCYP@outlook.com  
**系统版本**: v2.1.0

## 项目结构

```
CYP-SemVer/
├── core/                           # 核心版本管理模块
│   ├── version-manager.js         # 统一版本管理器入口
│   ├── version-checker.js         # 版本检查和验证
│   ├── version-updater.js         # 版本更新和历史管理
│   ├── version-api.js             # 版本信息API服务
│   └── version-config.js          # 配置管理和项目适配
├── docs/                          # 项目文档
│   ├── README.md                  # 主要使用指南
│   ├── version-spec.md            # 版本规范说明
│   ├── extended-version-spec.md   # 扩展版本规范
│   ├── version-storage-design.md  # 存储设计文档
│   └── example-project.md         # 示例项目说明
├── .version/                      # 版本数据存储
│   ├── version.json               # 当前版本信息
│   └── changelog.json             # 版本变更历史
├── .version-config.json           # 项目配置文件
├── .version-record.json           # 版本记录数据
├── version-record-simple.js       # 版本记录管理工具
└── package.json                   # 项目配置
```

## 安装和初始化

1. 确保 Node.js 环境已安装
2. 在项目根目录下初始化版本管理系统：

```bash
# 初始化版本系统，默认版本为 v0.1.0
node core/version-manager.js init

# 或者指定初始版本号
node core/version-manager.js init v1.0.0
```

## 版本检查机制

本系统实现了严格的版本检查机制，确保版本号遵循语义化版本控制规范(SemVer)，包括：

1. 版本格式验证
2. 版本递增顺序检查
3. 重复版本检测
4. 版本历史一致性验证
5. 变更类型规范检查

## 基本命令

### 检查版本有效性

```bash
# 检查版本格式是否符合 SemVer 规范
node core/version-manager.js check v1.2.3

# 检查带有预发布标签的版本
node core/version-manager.js check v2.1.0-beta.1

# 检查版本并验证变更类型
node core/version-manager.js check v1.2.3 --changes '[{"type":"feat","description":"添加新功能"}]'

# 检查包含破坏性变更的版本
node core/version-manager.js check v2.0.0 --changes '[{"type":"feat","description":"添加新功能 BREAKING CHANGE: 不兼容的API修改"}]'
```

### 变更类型规范检查

系统支持验证变更类型是否符合约定式提交（Conventional Commits）规范：

```bash
# 检查无效的变更类型（会报错）
node core/version-manager.js check v1.2.3 --changes '[{"type":"invalid","description":"无效变更类型"}]'
```

### 版本递增检查

系统会自动检查版本递增是否符合 SemVer 规范：

```bash
# 检查有效的版本递增
node core/version-manager.js check v1.2.3  # 假设当前版本为 v1.2.2

# 检查无效的版本递增（会报错）
node core/version-manager.js check v2.1.0  # 假设当前版本为 v1.2.3，主版本号递增但次版本号未重置为0
```

### 重复版本检查

系统会检查要更新的版本是否已存在于历史记录中：

```bash
# 检查重复版本（会报错）
node core/version-manager.js check v1.2.3  # 假设版本v1.2.3已存在于历史记录中
```

### 更新版本

```bash
# 更新到指定版本
node core/version-manager.js update v1.2.3

# 更新版本并添加作者和变更描述
node core/version-manager.js update v1.2.4 --author "张三" --message "修复登录bug"

# 更新版本并记录 Git 提交哈希
node core/version-manager.js update v1.2.5 --commit "a1b2c3d"
```

### 自动递增版本

```bash
# 自动递增补丁版本 (v1.2.3 -> v1.2.4)
node core/version-manager.js increment patch

# 自动递增次版本 (v1.2.3 -> v1.3.0)
node core/version-manager.js increment minor

# 自动递增主版本 (v1.2.3 -> v2.0.0)
node core/version-manager.js increment major
```

### 查看版本历史

```bash
# 显示所有版本历史记录
node core/version-manager.js history
```

### 版本记录管理

```bash
# 扫描项目中所有文件的版本信息
node version-record-simple.js scan

# 自动同步和更新版本记录
node version-record-simple.js auto

# 导出版本记录信息
node version-record-simple.js export

# 查看版本记录详情
node version-record-simple.js info
```

## 文件结构

系统会在项目根目录下创建 `.version` 目录，包含以下文件：

```
.version/
├── version.json     # 当前版本信息
├── changelog.json   # 版本变更历史
└── versions/        # 版本快照目录（未来扩展）
```

### version.json 格式

```json
{
  "version": "v1.2.3",
  "releaseDate": "2025-12-13",
  "commit": "a1b2c3d4e5f",
  "tag": "v1.2.3"
}
```

### changelog.json 格式

```json
{
  "versions": [
    {
      "version": "v1.2.3",
      "date": "2025-12-13",
      "changes": [
        {
          "type": "fix",
          "description": "修复登录bug"
        }
      ],
      "author": "张三"
    }
  ]
}
```

## 集成到构建流程

可以在项目的 package.json 中添加脚本：

```json
{
  "scripts": {
    "version-check": "node core/version-manager.js check",
    "version-update": "node core/version-manager.js update",
    "pre-release": "node core/version-manager.js increment patch",
    "release-major": "node core/version-manager.js increment major",
    "release-minor": "node core/version-manager.js increment minor",
    "version-history": "node core/version-manager.js history",
    "version-record": "node version-record-simple.js scan",
    "version-record-auto": "node version-record-simple.js auto"
  }
}
```

## 开发指南

### API 使用

可以直接在代码中使用版本管理类：

```javascript
const VersionManager = require('./core/version-manager.js');

const manager = new VersionManager();

// 检查版本
const report = manager.checker.checkVersion('v1.2.3');
console.log(report.valid); // true 或 false

// 更新版本
manager.validateAndUpdate('v1.2.4', {
  author: '开发者',
  changes: [{ type: 'feat', description: '添加新功能' }]
});

// 自动递增版本
const newVersion = manager.autoIncrementVersion('minor');
console.log(newVersion); // 例如: v1.3.0
```

### 版本检查API

VersionChecker 类提供了详细的版本检查方法：

```javascript
const VersionChecker = require('./core/version-checker.js');
const checker = new VersionChecker({
  projectName: 'my-project',
  config: {}
});

// 检查版本格式
const isValid = checker.checkVersionFormat('v1.2.3');

// 比较版本号
const comparison = checker.compareVersions('v1.2.3', 'v1.2.2'); // 返回 1 (第一个版本更大)

// 检查版本递增是否符合规范
const incrementCheck = checker.validateIncrement('v1.2.3', 'v2.0.0'); // 检查主版本号递增

// 检查版本是否已存在于历史记录中
const consistencyCheck = checker.checkDuplicateVersion('v1.2.3', history);

// 全面的版本检查
const fullReport = checker.checkVersion('v1.2.3', changes, currentVersion, history);
```

## 最佳实践

1. **版本递增原则**：
   - PATCH: 向下兼容的缺陷修复
   - MINOR: 向下兼容的新功能
   - MAJOR: 不兼容的API修改

2. **变更日志记录**：
   - 每次版本更新都应该记录变更内容
   - 使用标准化的变更类型（feat, fix, chore, docs等）

3. **自动化集成**：
   - 在 CI/CD 流程中集成版本检查
   - 在发布流程中自动更新版本号

4. **备份策略**：
   - 版本历史记录会自动保存
   - 建议结合 Git 标签进行版本管理

## 版本检查规则

本系统严格按照以下规则进行版本检查：

1. **格式验证**：版本号必须符合 SemVer 规范 (MAJOR.MINOR.PATCH)
2. **递增验证**：
   - 主版本号(MAJOR)递增时，次版本号(MINOR)和修订号(PATCH)必须重置为0
   - 次版本号(MINOR)递增时，修订号(PATCH)必须重置为0
   - 修订号(PATCH)必须严格递增
3. **重复检查**：不允许使用已存在于历史记录中的版本号
4. **顺序验证**：新版本号必须大于等于当前版本号，确保版本单调递增
5. **变更类型验证**：变更类型必须符合约定式提交（Conventional Commits）规范

### 变更类型规范

系统支持以下标准变更类型：

| 类型       | 说明                         | 对版本号的影响        |
|------------|------------------------------|----------------------|
| feat       | 新功能                       | MINOR 版本递增        |
| fix        | 修复问题                     | PATCH 版本递增        |
| docs       | 文档更新                     | PATCH 版本递增        |
| style      | 代码风格更新（不影响功能）   | PATCH 版本递增        |
| refactor   | 代码重构（不影响功能）       | PATCH 版本递增        |
| perf       | 性能优化                     | PATCH 版本递增        |
| test       | 测试相关                     | PATCH 版本递增        |
| build      | 构建系统或外部依赖变更       | PATCH 版本递增        |
| ci         | CI配置文件和脚本变更         | PATCH 版本递增        |
| chore      | 日常维护工作                 | PATCH 版本递增        |
| revert     | 回滚之前的提交               | 根据被回滚的提交决定  |

### 破坏性变更类型

对于包含 `BREAKING CHANGE:` 标识的变更，无论变更类型是什么，都会触发 MAJOR 版本号递增。

## 版本记录自动查找机制

本系统提供了强大的版本记录自动查找和管理功能，能够自动扫描项目中所有JavaScript/TypeScript文件，提取版本信息并统一管理。

### 核心功能

1. **自动文件扫描**：递归扫描项目目录，识别包含版本信息的JavaScript/TypeScript文件
2. **版本信息提取**：从文件内容中提取版本号、支持者信息、变更类型等
3. **版本记录管理**：统一存储和管理所有文件的版本信息
4. **自动同步**：保持版本记录与实际文件版本信息的一致性
5. **格式验证**：验证版本号格式和递增规则的正确性

### 版本记录API

```javascript
const VersionRecordManager = require('./version-record-simple.js');

// 扫描并分析项目中的版本信息
const records = manager.scanProject();
console.log(`发现 ${records.length} 个版本记录`);

// 自动同步版本记录
manager.autoSync();

// 导出版本记录信息
const exportedData = manager.exportRecords();
```

### 版本记录文件格式

版本记录数据存储在 `.version-record.json` 文件中，格式如下：

```json
{
  "projectName": "CYP-SemVer",
  "lastUpdate": "2025-12-13T19:50:00.000Z",
  "totalFiles": 15,
  "files": [
    {
      "filePath": "core/version-manager.js",
      "version": "v2.1.0",
      "type": "module",
      "detected": "2025-12-13T19:50:00.000Z",
      "content": {
        "version": "v2.1.0",
        "author": "Universal Version Manager",
        "lastModified": "2025-12-13"
      }
    }
  ]
}
```

## 技术特性

### 项目自适应配置
- 自动检测项目类型（Node.js、TypeScript、前端项目等）
- 智能适配不同的版本标记格式和约定
- 动态配置验证规则和检查策略

### 跨文件版本同步
- 自动识别package.json中的版本信息
- 同步更新所有相关文件的版本号
- 保持版本一致性，防止版本漂移

### 完整的历史记录
- 详细的版本变更历史记录
- 支持回滚和版本恢复
- 变更类型和作者信息跟踪

### 集成友好
- 命令行接口便于CI/CD集成
- 模块化API支持直接代码调用
- 支持自定义钩子和回调函数