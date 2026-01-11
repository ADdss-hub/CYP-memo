/**
 * Windows 代码签名脚本
 * 
 * 用于在构建过程中对 Windows 可执行文件进行代码签名
 * 需求: 7.6 - 代码签名验证
 * 
 * 环境变量:
 * - CSC_LINK: 证书文件路径（.pfx 或 .p12）或 base64 编码的证书
 * - CSC_KEY_PASSWORD: 证书密码
 * - WIN_CSC_LINK: Windows 证书存储中的证书指纹（可选）
 * 
 * 使用方法:
 * 1. 获取代码签名证书（可从 DigiCert、Sectigo 等 CA 购买）
 * 2. 设置环境变量
 * 3. electron-builder 会自动调用签名
 */

const { execSync } = require('child_process')
const path = require('path')
const fs = require('fs')

/**
 * 检查 Windows 代码签名配置
 */
function checkWindowsSigningConfig() {
  const config = {
    hasCertificate: false,
    certificateType: null,
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

    // 检查密码
    if (!process.env.CSC_KEY_PASSWORD) {
      config.warnings.push('CSC_KEY_PASSWORD not set, certificate may require password')
    }
  }

  // 检查 Windows 证书存储
  if (process.env.WIN_CSC_LINK) {
    config.hasCertificate = true
    config.certificateType = 'store'
  }

  if (!config.hasCertificate) {
    config.warnings.push('No code signing certificate configured')
    config.warnings.push('Set CSC_LINK or WIN_CSC_LINK environment variable')
  }

  return config
}

/**
 * 验证签名后的文件
 */
function verifySignature(filePath) {
  if (process.platform !== 'win32') {
    console.log('Signature verification only available on Windows')
    return null
  }

  try {
    // 使用 PowerShell 验证签名
    const result = execSync(
      `powershell -Command "Get-AuthenticodeSignature '${filePath}' | Select-Object -ExpandProperty Status"`,
      { encoding: 'utf8' }
    ).trim()

    return {
      valid: result === 'Valid',
      status: result,
    }
  } catch (error) {
    return {
      valid: false,
      status: 'Error',
      error: error.message,
    }
  }
}

/**
 * 获取签名信息
 */
function getSignatureInfo(filePath) {
  if (process.platform !== 'win32') {
    console.log('Signature info only available on Windows')
    return null
  }

  try {
    const result = execSync(
      `powershell -Command "Get-AuthenticodeSignature '${filePath}' | ConvertTo-Json"`,
      { encoding: 'utf8' }
    )
    return JSON.parse(result)
  } catch (error) {
    return null
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  console.log('Windows Code Signing Configuration Check')
  console.log('========================================')
  
  const config = checkWindowsSigningConfig()
  
  console.log(`\nCertificate configured: ${config.hasCertificate}`)
  if (config.certificateType) {
    console.log(`Certificate type: ${config.certificateType}`)
  }
  
  if (config.errors.length > 0) {
    console.log('\nErrors:')
    config.errors.forEach(e => console.log(`  ❌ ${e}`))
  }
  
  if (config.warnings.length > 0) {
    console.log('\nWarnings:')
    config.warnings.forEach(w => console.log(`  ⚠️  ${w}`))
  }
  
  if (config.hasCertificate && config.errors.length === 0) {
    console.log('\n✅ Code signing is properly configured')
  } else {
    console.log('\n❌ Code signing is not configured')
    console.log('\nTo configure code signing:')
    console.log('1. Obtain a code signing certificate from a trusted CA')
    console.log('2. Set CSC_LINK to the certificate file path')
    console.log('3. Set CSC_KEY_PASSWORD to the certificate password')
  }
}

module.exports = {
  checkWindowsSigningConfig,
  verifySignature,
  getSignatureInfo,
}
