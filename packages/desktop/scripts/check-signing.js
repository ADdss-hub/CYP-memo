#!/usr/bin/env node

/**
 * 代码签名配置检查脚本
 * 
 * 检查当前平台的代码签名配置是否正确
 * 需求: 7.6 - 代码签名验证
 * 
 * 使用方法:
 *   node scripts/check-signing.js
 *   pnpm check-signing
 */

const os = require('os')

console.log('='.repeat(50))
console.log('CYP-memo Code Signing Configuration Check')
console.log('='.repeat(50))
console.log(`\nPlatform: ${os.platform()} (${os.arch()})`)
console.log(`Node.js: ${process.version}`)
console.log('')

// 检查通用环境变量
function checkCommonConfig() {
  console.log('Common Configuration:')
  console.log('-'.repeat(30))
  
  const ghToken = process.env.GH_TOKEN || process.env.GITHUB_TOKEN
  if (ghToken) {
    console.log('✅ GitHub token configured')
  } else {
    console.log('⚠️  GitHub token not set (GH_TOKEN or GITHUB_TOKEN)')
    console.log('   Required for publishing releases')
  }
  
  console.log('')
}

// 检查 Windows 配置
function checkWindowsConfig() {
  console.log('Windows Code Signing:')
  console.log('-'.repeat(30))
  
  const cscLink = process.env.CSC_LINK
  const cscPassword = process.env.CSC_KEY_PASSWORD
  const winCscLink = process.env.WIN_CSC_LINK
  
  if (cscLink) {
    console.log('✅ CSC_LINK is set')
    if (cscPassword) {
      console.log('✅ CSC_KEY_PASSWORD is set')
    } else {
      console.log('⚠️  CSC_KEY_PASSWORD not set')
    }
  } else if (winCscLink) {
    console.log('✅ WIN_CSC_LINK is set (using Windows certificate store)')
  } else {
    console.log('❌ No Windows certificate configured')
    console.log('   Set CSC_LINK to certificate file path, or')
    console.log('   Set WIN_CSC_LINK to certificate thumbprint')
  }
  
  console.log('')
}

// 检查 macOS 配置
function checkMacOSConfig() {
  console.log('macOS Code Signing:')
  console.log('-'.repeat(30))
  
  const cscLink = process.env.CSC_LINK
  const cscName = process.env.CSC_NAME
  const cscPassword = process.env.CSC_KEY_PASSWORD
  
  if (cscLink) {
    console.log('✅ CSC_LINK is set')
    if (cscPassword) {
      console.log('✅ CSC_KEY_PASSWORD is set')
    } else {
      console.log('⚠️  CSC_KEY_PASSWORD not set')
    }
  } else if (cscName) {
    console.log('✅ CSC_NAME is set (using keychain certificate)')
  } else {
    console.log('❌ No macOS certificate configured')
    console.log('   Set CSC_LINK to .p12 file path, or')
    console.log('   Set CSC_NAME to certificate name in keychain')
  }
  
  console.log('')
  console.log('macOS Notarization:')
  console.log('-'.repeat(30))
  
  const appleId = process.env.APPLE_ID
  const applePassword = process.env.APPLE_ID_PASSWORD
  const teamId = process.env.APPLE_TEAM_ID
  
  let notarizationReady = true
  
  if (appleId) {
    console.log('✅ APPLE_ID is set')
  } else {
    console.log('❌ APPLE_ID not set')
    notarizationReady = false
  }
  
  if (applePassword) {
    console.log('✅ APPLE_ID_PASSWORD is set')
  } else {
    console.log('❌ APPLE_ID_PASSWORD not set')
    notarizationReady = false
  }
  
  if (teamId) {
    console.log('✅ APPLE_TEAM_ID is set')
  } else {
    console.log('❌ APPLE_TEAM_ID not set')
    notarizationReady = false
  }
  
  if (!notarizationReady) {
    console.log('')
    console.log('To enable notarization:')
    console.log('1. Set APPLE_ID to your Apple ID email')
    console.log('2. Generate app-specific password at appleid.apple.com')
    console.log('3. Set APPLE_ID_PASSWORD to the app-specific password')
    console.log('4. Set APPLE_TEAM_ID to your team ID')
  }
  
  console.log('')
}

// 检查 CI 环境
function checkCIEnvironment() {
  console.log('CI Environment:')
  console.log('-'.repeat(30))
  
  const isCI = process.env.CI === 'true' || process.env.CI === '1'
  
  if (isCI) {
    console.log('✅ Running in CI environment')
    
    // 检查常见 CI 平台
    if (process.env.GITHUB_ACTIONS) {
      console.log('   Platform: GitHub Actions')
    } else if (process.env.GITLAB_CI) {
      console.log('   Platform: GitLab CI')
    } else if (process.env.CIRCLECI) {
      console.log('   Platform: CircleCI')
    } else if (process.env.TRAVIS) {
      console.log('   Platform: Travis CI')
    }
  } else {
    console.log('ℹ️  Not running in CI environment')
    console.log('   Notarization will be skipped in local builds')
  }
  
  console.log('')
}

// 运行检查
checkCommonConfig()
checkWindowsConfig()
checkMacOSConfig()
checkCIEnvironment()

// 总结
console.log('='.repeat(50))
console.log('Summary')
console.log('='.repeat(50))

const hasWindowsSigning = process.env.CSC_LINK || process.env.WIN_CSC_LINK
const hasMacOSSigning = process.env.CSC_LINK || process.env.CSC_NAME
const hasNotarization = process.env.APPLE_ID && process.env.APPLE_ID_PASSWORD && process.env.APPLE_TEAM_ID

console.log(`Windows signing: ${hasWindowsSigning ? '✅ Ready' : '❌ Not configured'}`)
console.log(`macOS signing: ${hasMacOSSigning ? '✅ Ready' : '❌ Not configured'}`)
console.log(`macOS notarization: ${hasNotarization ? '✅ Ready' : '❌ Not configured'}`)

if (!hasWindowsSigning && !hasMacOSSigning) {
  console.log('')
  console.log('⚠️  No code signing configured!')
  console.log('   Builds will not be signed and may trigger security warnings.')
  console.log('')
  console.log('For development, this is usually fine.')
  console.log('For production releases, configure code signing.')
}

console.log('')
