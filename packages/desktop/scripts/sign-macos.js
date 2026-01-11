/**
 * macOS 代码签名脚本
 * 
 * 用于验证和管理 macOS 代码签名配置
 * 需求: 7.6 - 代码签名验证
 * 
 * 环境变量:
 * - CSC_LINK: 证书文件路径（.p12）或 base64 编码的证书
 * - CSC_KEY_PASSWORD: 证书密码
 * - CSC_NAME: 证书名称（用于从钥匙串中选择）
 * - APPLE_ID: Apple 开发者账号（用于公证）
 * - APPLE_ID_PASSWORD: 应用专用密码
 * - APPLE_TEAM_ID: 团队 ID
 * 
 * 证书类型:
 * - Developer ID Application: 用于分发到 Mac App Store 外
 * - Developer ID Installer: 用于签名 pkg 安装程序
 */

const { execSync } = require('child_process')
const fs = require('fs')

/**
 * 检查 macOS 代码签名配置
 */
function checkMacOSSigningConfig() {
  const config = {
    hasCertificate: false,
    certificateType: null,
    hasNotarization: false,
    errors: [],
    warnings: [],
  }

  // 检查证书文件
  if (process.env.CSC_LINK) {
    const cscLink = process.env.CSC_LINK

    // 检查是否是 base64 编码
    if (cscLink.length > 500 && !cscLink.includes('/') && !cscLink.includes('\\')) {
      config.hasCertificate = true
      config.certificateType = 'base64'
    } else if (fs.existsSync(cscLink)) {
      config.hasCertificate = true
      config.certificateType = 'file'
    } else {
      config.errors.push(`Certificate file not found: ${cscLink}`)
    }

    if (!process.env.CSC_KEY_PASSWORD) {
      config.warnings.push('CSC_KEY_PASSWORD not set')
    }
  }

  // 检查证书名称（从钥匙串）
  if (process.env.CSC_NAME) {
    config.hasCertificate = true
    config.certificateType = 'keychain'
  }

  // 检查公证配置
  if (process.env.APPLE_ID && process.env.APPLE_ID_PASSWORD && process.env.APPLE_TEAM_ID) {
    config.hasNotarization = true
  } else {
    if (!process.env.APPLE_ID) {
      config.warnings.push('APPLE_ID not set - notarization disabled')
    }
    if (!process.env.APPLE_ID_PASSWORD) {
      config.warnings.push('APPLE_ID_PASSWORD not set - notarization disabled')
    }
    if (!process.env.APPLE_TEAM_ID) {
      config.warnings.push('APPLE_TEAM_ID not set - notarization disabled')
    }
  }

  if (!config.hasCertificate) {
    config.warnings.push('No code signing certificate configured')
  }

  return config
}

/**
 * 列出钥匙串中的开发者证书
 */
function listDeveloperCertificates() {
  if (process.platform !== 'darwin') {
    console.log('This function only works on macOS')
    return []
  }

  try {
    const result = execSync(
      'security find-identity -v -p codesigning',
      { encoding: 'utf8' }
    )

    const lines = result.split('\n').filter(line => line.includes('Developer ID'))
    return lines.map(line => {
      const match = line.match(/"([^"]+)"/)
      return match ? match[1] : line
    })
  } catch (error) {
    console.error('Failed to list certificates:', error.message)
    return []
  }
}

/**
 * 验证应用签名
 */
function verifyAppSignature(appPath) {
  if (process.platform !== 'darwin') {
    console.log('Signature verification only available on macOS')
    return null
  }

  try {
    execSync(`codesign --verify --deep --strict "${appPath}"`, { encoding: 'utf8' })
    return { valid: true, status: 'Valid' }
  } catch (error) {
    return { valid: false, status: 'Invalid', error: error.message }
  }
}

/**
 * 获取签名信息
 */
function getSignatureInfo(appPath) {
  if (process.platform !== 'darwin') {
    console.log('Signature info only available on macOS')
    return null
  }

  try {
    const result = execSync(`codesign -dv --verbose=4 "${appPath}" 2>&1`, { encoding: 'utf8' })
    
    const info = {}
    const lines = result.split('\n')
    
    for (const line of lines) {
      const [key, ...valueParts] = line.split('=')
      if (key && valueParts.length > 0) {
        info[key.trim()] = valueParts.join('=').trim()
      }
    }
    
    return info
  } catch (error) {
    return null
  }
}

/**
 * 检查公证状态
 */
function checkNotarizationStatus(appPath) {
  if (process.platform !== 'darwin') {
    console.log('Notarization check only available on macOS')
    return null
  }

  try {
    const result = execSync(`spctl -a -vv "${appPath}" 2>&1`, { encoding: 'utf8' })
    return {
      notarized: result.includes('accepted') || result.includes('Notarized Developer ID'),
      output: result,
    }
  } catch (error) {
    return {
      notarized: false,
      error: error.message,
    }
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  console.log('macOS Code Signing Configuration Check')
  console.log('======================================')
  
  const config = checkMacOSSigningConfig()
  
  console.log(`\nCertificate configured: ${config.hasCertificate}`)
  if (config.certificateType) {
    console.log(`Certificate type: ${config.certificateType}`)
  }
  console.log(`Notarization configured: ${config.hasNotarization}`)
  
  if (config.errors.length > 0) {
    console.log('\nErrors:')
    config.errors.forEach(e => console.log(`  ❌ ${e}`))
  }
  
  if (config.warnings.length > 0) {
    console.log('\nWarnings:')
    config.warnings.forEach(w => console.log(`  ⚠️  ${w}`))
  }
  
  // 在 macOS 上列出可用证书
  if (process.platform === 'darwin') {
    console.log('\nAvailable Developer ID certificates:')
    const certs = listDeveloperCertificates()
    if (certs.length > 0) {
      certs.forEach(cert => console.log(`  - ${cert}`))
    } else {
      console.log('  No Developer ID certificates found in keychain')
    }
  }
  
  if (config.hasCertificate && config.errors.length === 0) {
    console.log('\n✅ Code signing is properly configured')
    if (config.hasNotarization) {
      console.log('✅ Notarization is properly configured')
    }
  } else {
    console.log('\n❌ Code signing is not fully configured')
    console.log('\nTo configure code signing:')
    console.log('1. Enroll in Apple Developer Program')
    console.log('2. Create a "Developer ID Application" certificate')
    console.log('3. Download and install the certificate')
    console.log('4. Set CSC_NAME to the certificate name, or')
    console.log('   Set CSC_LINK to the exported .p12 file path')
    console.log('\nTo configure notarization:')
    console.log('1. Set APPLE_ID to your Apple ID email')
    console.log('2. Set APPLE_ID_PASSWORD to an app-specific password')
    console.log('3. Set APPLE_TEAM_ID to your team ID')
  }
}

module.exports = {
  checkMacOSSigningConfig,
  listDeveloperCertificates,
  verifyAppSignature,
  getSignatureInfo,
  checkNotarizationStatus,
}
