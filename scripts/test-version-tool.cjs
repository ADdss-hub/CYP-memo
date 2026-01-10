/**
 * 版本工具测试脚本
 * 测试版本管理工具的各项功能
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const versionFile = path.join(rootDir, 'VERSION');
const uvmPath = path.join(rootDir, 'unified-version-system-v1.0.0/unified-version-system/bin/uvm.js');

console.log('🧪 开始测试版本管理工具\n');

// 保存当前版本
const originalVersion = fs.readFileSync(versionFile, 'utf-8').trim();
console.log(`📌 当前版本: ${originalVersion}\n`);

let testsPassed = 0;
let testsFailed = 0;

/**
 * 运行测试
 */
function runTest(name, testFn) {
  try {
    console.log(`🔍 测试: ${name}`);
    testFn();
    console.log(`✅ 通过\n`);
    testsPassed++;
  } catch (error) {
    console.log(`❌ 失败: ${error.message}\n`);
    testsFailed++;
  }
}

/**
 * 执行命令
 */
function execCommand(command) {
  try {
    const output = execSync(command, { 
      cwd: rootDir, 
      encoding: 'utf-8',
      stdio: 'pipe'
    });
    return { success: true, output };
  } catch (error) {
    return { success: false, error: error.message, output: error.stdout || error.stderr };
  }
}

// 测试 1: info 命令
runTest('info 命令', () => {
  const result = execCommand(`node "${uvmPath}" info`);
  if (!result.success) {
    throw new Error('info 命令执行失败');
  }
  if (!result.output.includes('当前版本')) {
    throw new Error('info 命令输出不正确');
  }
});

// 测试 2: validate 命令
runTest('validate 命令', () => {
  const result = execCommand(`node "${uvmPath}" validate`);
  if (!result.success) {
    throw new Error('validate 命令执行失败');
  }
  if (!result.output.includes('验证通过')) {
    throw new Error('validate 命令输出不正确');
  }
});

// 测试 3: 版本文件读取
runTest('版本文件读取', () => {
  const version = fs.readFileSync(versionFile, 'utf-8').trim();
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error('版本号格式不正确');
  }
});

// 测试 4: package.json 版本一致性
runTest('package.json 版本一致性', () => {
  const version = fs.readFileSync(versionFile, 'utf-8').trim();
  const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf-8'));
  
  if (packageJson.version !== version) {
    throw new Error(`版本不一致: VERSION=${version}, package.json=${packageJson.version}`);
  }
});

// 测试 5: 版本验证脚本
runTest('版本验证脚本', () => {
  const result = execCommand('node scripts/verify-version.js');
  if (!result.success) {
    throw new Error('版本验证脚本执行失败');
  }
  if (!result.output.includes('版本验证通过')) {
    throw new Error('版本验证未通过');
  }
});

// 恢复原始版本（如果被修改）
const currentVersion = fs.readFileSync(versionFile, 'utf-8').trim();
if (currentVersion !== originalVersion) {
  console.log(`🔄 恢复原始版本: ${originalVersion}\n`);
  fs.writeFileSync(versionFile, originalVersion + '\n');
}

// 输出测试结果
console.log('='.repeat(50));
console.log(`\n📊 测试结果:`);
console.log(`   ✅ 通过: ${testsPassed}`);
console.log(`   ❌ 失败: ${testsFailed}`);
console.log(`   📈 总计: ${testsPassed + testsFailed}`);

if (testsFailed === 0) {
  console.log(`\n🎉 所有测试通过！版本工具运行正常。\n`);
  process.exit(0);
} else {
  console.log(`\n⚠️  有 ${testsFailed} 个测试失败。\n`);
  process.exit(1);
}
