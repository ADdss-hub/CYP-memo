/**
 * 自动更新配置
 * 
 * 配置 electron-updater 的更新服务器和行为
 * 需求: 7.1 - 配置自动更新发布
 */

import { autoUpdater } from 'electron-updater'
import { app } from 'electron'
import * as path from 'path'
import * as fs from 'fs'

/**
 * 更新配置接口
 */
export interface UpdateConfig {
  // 更新服务器提供者
  provider: 'github' | 'generic' | 's3' | 'spaces'
  
  // GitHub 配置
  github?: {
    owner: string
    repo: string
    releaseType?: 'release' | 'prerelease' | 'draft'
    private?: boolean
    token?: string
  }
  
  // 通用服务器配置
  generic?: {
    url: string
    channel?: string
  }
  
  // 更新行为配置
  autoDownload?: boolean
  autoInstallOnAppQuit?: boolean
  allowPrerelease?: boolean
  allowDowngrade?: boolean
  
  // 更新检查间隔（毫秒）
  checkInterval?: number
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: UpdateConfig = {
  provider: 'github',
  github: {
    owner: 'ADdss-hub',
    repo: 'cyp-memo',
    releaseType: 'release',
    private: false,
  },
  autoDownload: false,
  autoInstallOnAppQuit: true,
  allowPrerelease: false,
  allowDowngrade: false,
  checkInterval: 60 * 60 * 1000, // 1 小时
}

/**
 * 获取用户配置文件路径
 */
function getConfigPath(): string {
  const userDataPath = app.getPath('userData')
  return path.join(userDataPath, 'update-config.json')
}

/**
 * 加载用户配置
 */
export function loadUpdateConfig(): UpdateConfig {
  const configPath = getConfigPath()
  
  try {
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf-8')
      const userConfig = JSON.parse(content)
      return { ...DEFAULT_CONFIG, ...userConfig }
    }
  } catch (error) {
    console.error('[UpdateConfig] Failed to load config:', error)
  }
  
  return DEFAULT_CONFIG
}

/**
 * 保存用户配置
 */
export function saveUpdateConfig(config: Partial<UpdateConfig>): void {
  const configPath = getConfigPath()
  const currentConfig = loadUpdateConfig()
  const newConfig = { ...currentConfig, ...config }
  
  try {
    const dir = path.dirname(configPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2))
  } catch (error) {
    console.error('[UpdateConfig] Failed to save config:', error)
  }
}

/**
 * 应用更新配置到 autoUpdater
 */
export function applyUpdateConfig(config?: UpdateConfig): void {
  const cfg = config || loadUpdateConfig()
  
  // 设置更新行为
  autoUpdater.autoDownload = cfg.autoDownload ?? false
  autoUpdater.autoInstallOnAppQuit = cfg.autoInstallOnAppQuit ?? true
  autoUpdater.allowPrerelease = cfg.allowPrerelease ?? false
  autoUpdater.allowDowngrade = cfg.allowDowngrade ?? false
  
  // 设置更新服务器
  if (cfg.provider === 'github' && cfg.github) {
    const { owner, repo, releaseType, private: isPrivate, token } = cfg.github
    
    autoUpdater.setFeedURL({
      provider: 'github',
      owner,
      repo,
      releaseType: releaseType || 'release',
      private: isPrivate || false,
      token: token || process.env.GH_TOKEN,
    })
    
    console.log(`[UpdateConfig] Using GitHub releases: ${owner}/${repo}`)
  } else if (cfg.provider === 'generic' && cfg.generic) {
    const { url, channel } = cfg.generic
    
    autoUpdater.setFeedURL({
      provider: 'generic',
      url,
      channel: channel || 'latest',
    })
    
    console.log(`[UpdateConfig] Using generic server: ${url}`)
  }
}

/**
 * 获取更新服务器 URL
 */
export function getUpdateServerUrl(): string {
  const config = loadUpdateConfig()
  
  if (config.provider === 'github' && config.github) {
    const { owner, repo } = config.github
    return `https://github.com/${owner}/${repo}/releases`
  } else if (config.provider === 'generic' && config.generic) {
    return config.generic.url
  }
  
  return ''
}

/**
 * 检查是否配置了自定义更新服务器
 */
export function hasCustomUpdateServer(): boolean {
  const config = loadUpdateConfig()
  return config.provider === 'generic' && !!config.generic?.url
}

/**
 * 设置自定义更新服务器
 */
export function setCustomUpdateServer(url: string): void {
  saveUpdateConfig({
    provider: 'generic',
    generic: { url },
  })
  applyUpdateConfig()
}

/**
 * 重置为默认 GitHub 更新服务器
 */
export function resetToGitHubUpdates(): void {
  saveUpdateConfig({
    provider: 'github',
    github: DEFAULT_CONFIG.github,
  })
  applyUpdateConfig()
}

/**
 * 导出默认配置供参考
 */
export { DEFAULT_CONFIG }
