#!/usr/bin/env node

/**
 * Unified Version Manager CLI
 * 统一版本管理器命令行工具
 * 
 * @author CYP
 * @version 1.0.0
 */

const path = require('path');
const UnifiedVersionManager = require('../version-manager-unified');
const VersionHistory = require('../modules/version-history');

const args = process.argv.slice(2);
const command = args[0];
const subCommand = args[1];

// 显示帮助信息
function showHelp() {
  console.log(`
统一版本管理器 (Unified Version Manager)

用法:
  uvm <command> [options]

命令:

  版本更新:
    uvm update <version>           更新到指定版本
    uvm increment <type>           递增版本 (patch/minor/major)
    uvm patch                      递增补丁版本 (快捷方式)
    uvm minor                      递增次版本 (快捷方式)
    uvm major                      递增主版本 (快捷方式)

  版本信息:
    uvm info                       显示版本信息
    uvm current                    显示当前版本
    uvm validate                   验证版本系统

  版本历史:
    uvm history                    生成版本历史文档
    uvm history stats              显示版本统计
    uvm history clean              清理重复记录

  其他:
    uvm help                       显示帮助信息
    uvm version                    显示工具版本

示例:
  uvm patch                        # 递增补丁版本
  uvm update 2.0.0                 # 更新到 2.0.0
  uvm info                         # 查看版本信息
  uvm history stats                # 查看历史统计

文档: https://github.com/your-repo/unified-version-system
  `);
}

// 显示工具版本
function showVersion() {
  const pkg = require('../package.json');
  console.log(`Unified Version Manager v${pkg.version}`);
}

// 主函数
async function main() {
  try {
    // 获取项目根目录
    const projectRoot = process.cwd();
    
    // 创建管理器实例
    const manager = new UnifiedVersionManager({ projectRoot });
    const history = new VersionHistory({ projectRoot });

    // 处理命令
    switch (command) {
      case 'update':
        if (!subCommand) {
          console.error('❌ 错误: 请提供版本号');
          console.log('用法: uvm update <version>');
          process.exit(1);
        }
        await manager.updateVersion(subCommand);
        break;

      case 'increment':
        const type = subCommand || 'patch';
        if (!['patch', 'minor', 'major'].includes(type)) {
          console.error('❌ 错误: 无效的版本类型');
          console.log('有效类型: patch, minor, major');
          process.exit(1);
        }
        await manager.incrementVersion(type);
        break;

      case 'patch':
        await manager.incrementVersion('patch');
        break;

      case 'minor':
        await manager.incrementVersion('minor');
        break;

      case 'major':
        await manager.incrementVersion('major');
        break;

      case 'info':
        const info = manager.getVersionInfo();
        console.log('\n📊 版本信息:\n');
        console.log(`当前版本: ${info.current}`);
        console.log('\n版本建议:');
        console.log(`  Patch: ${info.suggestions.patch}`);
        console.log(`  Minor: ${info.suggestions.minor}`);
        console.log(`  Major: ${info.suggestions.major}`);
        console.log('');
        break;

      case 'current':
        const currentVersion = manager.getCurrentVersion();
        console.log(currentVersion);
        break;

      case 'validate':
        manager.validateSystem();
        break;

      case 'history':
        if (subCommand === 'stats') {
          const stats = history.getStats();
          console.log('\n📊 版本统计信息:\n');
          console.log(`总版本数: ${stats.total}`);
          console.log(`主版本更新: ${stats.major} 次`);
          console.log(`次版本更新: ${stats.minor} 次`);
          console.log(`补丁更新: ${stats.patch} 次`);
          console.log(`首个版本: ${stats.firstVersion}`);
          console.log(`最新版本: ${stats.latestVersion}`);
          console.log('');
        } else if (subCommand === 'clean') {
          history.cleanDuplicates();
          console.log('\n✅ 重复记录已清理！\n');
        } else {
          history.saveMarkdown();
          console.log('\n✅ 版本历史记录已生成！\n');
        }
        break;

      case 'version':
        showVersion();
        break;

      case 'help':
      case '--help':
      case '-h':
        showHelp();
        break;

      default:
        if (!command) {
          showHelp();
        } else {
          console.error(`❌ 错误: 未知命令 "${command}"\n`);
          console.log('运行 "uvm help" 查看可用命令');
          process.exit(1);
        }
    }
  } catch (error) {
    console.error(`\n❌ 错误: ${error.message}\n`);
    process.exit(1);
  }
}

// 运行主函数
main();
