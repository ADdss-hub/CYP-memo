/**
 * macOS 公证脚本
 * 
 * 在代码签名后自动提交应用到 Apple 进行公证
 * 需求: 7.6 - 代码签名验证
 * 
 * 环境变量:
 * - APPLE_ID: Apple 开发者账号邮箱
 * - APPLE_ID_PASSWORD: 应用专用密码（不是账号密码）
 * - APPLE_TEAM_ID: Apple 开发者团队 ID
 * 
 * 生成应用专用密码:
 * 1. 访问 https://appleid.apple.com/account/manage
 * 2. 在"安全"部分选择"生成应用专用密码"
 */

const { notarize } = require('@electron/notarize')
const path = require('path')

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context

  // 只在 macOS 上执行公证
  if (electronPlatformName !== 'darwin') {
    console.log('Skipping notarization: not macOS')
    return
  }

  // 检查是否在 CI 环境中
  if (!process.env.CI) {
    console.log('Skipping notarization: not in CI environment')
    return
  }

  // 检查必要的环境变量
  const appleId = process.env.APPLE_ID
  const appleIdPassword = process.env.APPLE_ID_PASSWORD
  const teamId = process.env.APPLE_TEAM_ID

  if (!appleId || !appleIdPassword || !teamId) {
    console.log('Skipping notarization: missing Apple credentials')
    console.log('Required environment variables:')
    console.log('  - APPLE_ID: Apple developer account email')
    console.log('  - APPLE_ID_PASSWORD: App-specific password')
    console.log('  - APPLE_TEAM_ID: Apple developer team ID')
    return
  }

  const appName = context.packager.appInfo.productFilename
  const appPath = path.join(appOutDir, `${appName}.app`)

  console.log(`Notarizing ${appPath}...`)

  try {
    await notarize({
      tool: 'notarytool',
      appPath,
      appleId,
      appleIdPassword,
      teamId,
    })
    console.log('Notarization complete!')
  } catch (error) {
    console.error('Notarization failed:', error)
    // 在 CI 中，公证失败应该导致构建失败
    if (process.env.CI) {
      throw error
    }
  }
}
