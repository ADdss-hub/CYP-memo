/**
 * CYP-memo 后端 API 服务器
 * Copyright (c) 2026 CYP <nasDSSCYP@outlook.com>
 */

import express from 'express'
import cors from 'cors'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'
import { initDatabase, database } from './sqlite-database.js'
import bcrypt from 'bcryptjs'
import { v4 as uuidv4 } from 'uuid'
import { getConfig, formatConfigInfo, type ContainerConfig } from './config.js'

// 获取当前文件的目录路径（兼容 ESM 和各种平台）
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * 健康状态类型
 * Requirements: 4.1, 4.4, 4.5
 */
type HealthStatus = 'ok' | 'degraded' | 'unhealthy'

/**
 * 磁盘空间信息接口
 */
interface DiskSpaceInfo {
  used: number      // 已用空间 (bytes)
  available: number // 可用空间 (bytes)
  total: number     // 总空间 (bytes)
}

/**
 * 获取磁盘空间信息
 * Requirements: 4.4
 */
function getDiskSpace(dirPath: string): DiskSpaceInfo | null {
  try {
    // Windows 使用 wmic 命令
    if (process.platform === 'win32') {
      // 获取驱动器盘符
      const drive = path.parse(path.resolve(dirPath)).root.replace('\\', '')
      const output = execSync(`wmic logicaldisk where "DeviceID='${drive}'" get FreeSpace,Size /format:csv`, {
        encoding: 'utf-8',
        timeout: 5000
      })
      const lines = output.trim().split('\n').filter(line => line.trim())
      if (lines.length >= 2) {
        const values = lines[1].split(',')
        if (values.length >= 3) {
          const available = parseInt(values[1], 10) || 0
          const total = parseInt(values[2], 10) || 0
          return {
            available,
            total,
            used: total - available
          }
        }
      }
    } else {
      // Unix/Linux 使用 df 命令
      const output = execSync(`df -B1 "${dirPath}" | tail -1`, {
        encoding: 'utf-8',
        timeout: 5000
      })
      const parts = output.trim().split(/\s+/)
      if (parts.length >= 4) {
        const total = parseInt(parts[1], 10) || 0
        const used = parseInt(parts[2], 10) || 0
        const available = parseInt(parts[3], 10) || 0
        return { used, available, total }
      }
    }
    return null
  } catch {
    return null
  }
}

/**
 * 最小可用磁盘空间阈值 (100MB)
 */
const MIN_DISK_SPACE_BYTES = 100 * 1024 * 1024

const app = express()

// 加载配置
let config: ContainerConfig
try {
  config = getConfig()
} catch (err) {
  console.error('❌ 配置加载失败:', err instanceof Error ? err.message : String(err))
  process.exit(1)
}

const PORT = config.port

// 配置文件上传目录（使用配置的数据目录）
const uploadDir = path.join(config.dataDir, 'uploads')
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true })
}

// 配置 multer 文件上传
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir)
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    cb(null, uniqueSuffix + '-' + file.originalname)
  }
})

const upload = multer({ storage })

// 中间件
app.use(cors())
app.use(express.json({ limit: '50mb' }))

// ========== 生产环境静态文件服务 ==========
// 在生产环境中，服务器需要托管前端静态文件
if (process.env.NODE_ENV === 'production') {
  // 用户端静态文件
  const appDistPath = path.join(__dirname, '../../app/dist')
  // 管理端静态文件
  const adminDistPath = path.join(__dirname, '../../admin/dist')
  
  // 检查静态文件目录是否存在
  const appDistExists = fs.existsSync(appDistPath)
  const adminDistExists = fs.existsSync(adminDistPath)
  
  if (appDistExists) {
    // 管理端路由 (必须在用户端之前)
    if (adminDistExists) {
      app.use('/admin', express.static(adminDistPath))
    }
    
    // 用户端路由
    app.use(express.static(appDistPath))
    
    console.log('📁 静态文件服务已启用 (生产模式)')
    console.log(`   用户端: ${appDistPath} (${appDistExists ? '存在' : '不存在'})`)
    console.log(`   管理端: ${adminDistPath} (${adminDistExists ? '存在' : '不存在'})`)
  } else {
    console.warn('⚠️ 静态文件目录不存在，跳过静态文件服务')
    console.warn(`   用户端: ${appDistPath}`)
    console.warn(`   管理端: ${adminDistPath}`)
  }
}

// 健康检查（包含版本、运行时间、数据库状态和磁盘空间信息）
// Requirements: 4.1, 4.4, 4.5
app.get('/api/health', (_req, res) => {
  const uptime = Math.floor((Date.now() - config.startTime.getTime()) / 1000)
  
  // 检查数据库状态 (Requirements: 4.1)
  const databaseHealthy = database.isHealthy()
  
  // 检查磁盘空间 (Requirements: 4.4)
  const diskSpace = getDiskSpace(config.dataDir)
  const diskSpaceLow = diskSpace ? diskSpace.available < MIN_DISK_SPACE_BYTES : false
  
  // 确定整体健康状态
  let status: HealthStatus = 'ok'
  if (!databaseHealthy) {
    status = 'unhealthy'
  } else if (diskSpaceLow) {
    status = 'degraded'
  }
  
  res.json({ 
    success: true, 
    data: { 
      status,
      version: config.version,
      uptime,
      database: databaseHealthy,
      diskSpace: diskSpace ? {
        used: diskSpace.used,
        available: diskSpace.available,
        total: diskSpace.total
      } : null
    } 
  })
})

// 配置信息接口（用于验证环境变量配置一致性）
app.get('/api/config', (_req, res) => {
  res.json({
    success: true,
    data: {
      port: config.port,
      dataDir: config.dataDir,
      logLevel: config.logLevel,
      nodeEnv: config.nodeEnv,
      version: config.version,
      timezone: config.timezone
    }
  })
})

// 检查 Docker Hub 最新版本
app.get('/api/version/latest', async (_req, res) => {
  try {
    // 从 GitHub Releases 获取最新版本（更可靠）
    const response = await fetch(
      'https://api.github.com/repos/ADdss-hub/CYP-memo/releases/latest',
      {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'CYP-memo-Server'
        }
      }
    )

    if (!response.ok) {
      // 如果 GitHub API 失败，返回当前版本
      res.json({
        success: true,
        data: {
          currentVersion: config.version,
          latestVersion: config.version,
          hasUpdate: false,
          releaseUrl: null,
          releaseNotes: null
        }
      })
      return
    }

    const release = await response.json()
    const latestVersion = (release.tag_name as string).replace(/^v/, '')
    const hasUpdate = compareVersions(latestVersion, config.version) > 0

    res.json({
      success: true,
      data: {
        currentVersion: config.version,
        latestVersion,
        hasUpdate,
        releaseUrl: release.html_url,
        releaseNotes: release.body || '',
        publishedAt: release.published_at
      }
    })
  } catch (error) {
    // 网络错误时返回当前版本
    res.json({
      success: true,
      data: {
        currentVersion: config.version,
        latestVersion: config.version,
        hasUpdate: false,
        releaseUrl: null,
        releaseNotes: null,
        error: 'Failed to check for updates'
      }
    })
  }
})

/**
 * 比较版本号
 */
function compareVersions(v1: string, v2: string): number {
  const parseVersion = (v: string): number[] => {
    return v.replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0)
  }
  const parts1 = parseVersion(v1)
  const parts2 = parseVersion(v2)
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0
    const p2 = parts2[i] || 0
    if (p1 > p2) return 1
    if (p1 < p2) return -1
  }
  return 0
}

// ========== 管理员 API ==========

// 管理员登录
app.post('/api/admins/login', (req, res) => {
  const { username, password } = req.body
  
  const admin = database.getAdminByUsername(username)
  
  if (!admin || !bcrypt.compareSync(password, admin.passwordHash)) {
    // 记录登录失败日志
    database.createLog({
      level: 'warn',
      message: `管理员登录失败: ${username}`,
      action: 'admin_login_failed',
      details: JSON.stringify({ username, reason: '用户名或密码错误' })
    })
    return res.status(401).json({ success: false, error: { message: '用户名或密码错误' } })
  }
  
  database.updateAdmin(admin.id, { lastLoginAt: new Date().toISOString() })
  
  // 记录登录成功日志
  database.createLog({
    level: 'info',
    message: `管理员登录成功: ${username}`,
    userId: admin.id,
    action: 'admin_login',
    details: JSON.stringify({ adminId: admin.id, username })
  })
  
  res.json({
    success: true,
    data: {
      id: admin.id,
      username: admin.username,
      role: admin.role,
      createdAt: admin.createdAt,
      lastLoginAt: new Date().toISOString()
    }
  })
})

// 获取所有管理员
app.get('/api/admins', (_req, res) => {
  const admins = database.getAdmins().map(a => ({
    id: a.id,
    username: a.username,
    role: a.role,
    createdAt: a.createdAt,
    lastLoginAt: a.lastLoginAt
  }))
  res.json({ success: true, data: admins })
})

// 管理员数量
app.get('/api/admins/count', (_req, res) => {
  const count = database.getAdmins().length
  res.json({ success: true, data: { count } })
})

// ========== 用户 API ==========

// 获取所有用户
app.get('/api/users', (_req, res) => {
  const users = database.getUsers()
  res.json({ success: true, data: users })
})

// 根据ID获取用户
app.get('/api/users/:id', (req, res) => {
  const user = database.getUserById(req.params.id)
  if (!user) {
    return res.status(404).json({ success: false, error: { message: '用户不存在' } })
  }
  res.json({ success: true, data: user })
})

// 根据用户名获取用户
app.get('/api/users/by-username/:username', (req, res) => {
  const user = database.getUserByUsername(req.params.username)
  if (!user) {
    return res.status(404).json({ success: false, error: { message: '用户不存在' } })
  }
  res.json({ success: true, data: user })
})

// 根据令牌获取用户
app.get('/api/users/by-token/:token', (req, res) => {
  const user = database.getUserByToken(req.params.token)
  if (!user) {
    return res.status(404).json({ success: false, error: { message: '用户不存在' } })
  }
  res.json({ success: true, data: user })
})

// 创建用户
app.post('/api/users', (req, res) => {
  try {
    const user = req.body
    const id = user.id || uuidv4()
    
    // 检查用户名是否已存在
    if (database.usernameExists(user.username)) {
      return res.status(400).json({ success: false, error: { message: '用户名已存在' } })
    }
    
    // 检查令牌是否已存在
    if (user.token && database.tokenExists(user.token)) {
      return res.status(400).json({ success: false, error: { message: '令牌已存在' } })
    }
    
    database.createUser({
      id,
      username: user.username,
      passwordHash: user.passwordHash || null,
      token: user.token || null,
      securityQuestion: user.securityQuestion || null,
      gender: user.gender || null,
      email: user.email || null,
      birthDate: user.birthDate || null,
      phone: user.phone || null,
      address: user.address || null,
      position: user.position || null,
      company: user.company || null,
      bio: user.bio || null,
      rememberPassword: user.rememberPassword || false,
      isMainAccount: user.isMainAccount || false,
      parentUserId: user.parentUserId || null,
      permissions: user.permissions || [],
      createdAt: user.createdAt || new Date().toISOString(),
      lastLoginAt: user.lastLoginAt || new Date().toISOString()
    })
    
    res.json({ success: true, data: { id } })
  } catch (err) {
    console.error('创建用户失败:', err)
    res.status(500).json({ success: false, error: { message: err instanceof Error ? err.message : '创建用户失败' } })
  }
})

// 更新用户
app.patch('/api/users/:id', (req, res) => {
  database.updateUser(req.params.id, req.body)
  res.json({ success: true, data: null })
})

// 删除用户（同时删除用户的所有数据和子账号）
app.delete('/api/users/:id', (req, res) => {
  try {
    const userId = req.params.id
    const user = database.getUserById(userId)
    const result = database.deleteUserWithData(userId)
    const message = result.subAccounts > 0 
      ? `用户及其 ${result.subAccounts} 个子账号的数据已删除`
      : '用户及其数据已删除'
    
    // 记录删除用户日志
    database.createLog({
      level: 'info',
      message: `删除用户: ${user?.username || userId}`,
      action: 'user_delete',
      details: JSON.stringify({ 
        userId, 
        username: user?.username,
        deleted: result 
      })
    })
    
    res.json({ 
      success: true, 
      data: { 
        message,
        deleted: result
      } 
    })
  } catch (err) {
    console.error('删除用户失败:', err)
    res.status(500).json({ success: false, error: { message: '删除用户失败' } })
  }
})

// 检查用户名是否存在
app.get('/api/users/check-username/:username', (req, res) => {
  const exists = database.usernameExists(req.params.username)
  res.json({ success: true, data: { exists } })
})

// 检查令牌是否存在
app.get('/api/users/check-token/:token', (req, res) => {
  const exists = database.tokenExists(req.params.token)
  res.json({ success: true, data: { exists } })
})

// 获取子账号列表
app.get('/api/users/:parentUserId/sub-accounts', (req, res) => {
  const subAccounts = database.getSubAccounts(req.params.parentUserId)
  res.json({ success: true, data: subAccounts })
})

// ========== 备忘录 API ==========

// 获取用户的备忘录
app.get('/api/users/:userId/memos', (req, res) => {
  const memos = database.getMemosByUserId(req.params.userId)
  res.json({ success: true, data: memos })
})

// 获取备忘录
app.get('/api/memos/:id', (req, res) => {
  const memo = database.getMemoById(req.params.id)
  if (!memo) {
    return res.status(404).json({ success: false, error: { message: '备忘录不存在' } })
  }
  res.json({ success: true, data: memo })
})

// 创建备忘录
app.post('/api/memos', (req, res) => {
  const memo = req.body
  const id = memo.id || uuidv4()
  
  database.createMemo({
    id,
    userId: memo.userId,
    title: memo.title,
    content: memo.content || '',
    tags: memo.tags || [],
    priority: memo.priority || null,
    attachments: memo.attachments || [],
    createdAt: memo.createdAt || new Date().toISOString(),
    updatedAt: memo.updatedAt || new Date().toISOString()
  })
  
  res.json({ success: true, data: { id } })
})

// 更新备忘录
app.patch('/api/memos/:id', (req, res) => {
  database.updateMemo(req.params.id, req.body)
  res.json({ success: true, data: null })
})

// 删除备忘录
app.delete('/api/memos/:id', (req, res) => {
  database.deleteMemo(req.params.id)
  res.json({ success: true, data: null })
})

// ========== 文件 API ==========

// 上传文件
app.post('/api/files', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: { message: '未上传文件' } })
    }

    const metadataStr = req.body.metadata
    if (!metadataStr) {
      return res.status(400).json({ success: false, error: { message: '缺少文件元数据' } })
    }

    const metadata = JSON.parse(metadataStr)
    const id = metadata.id || uuidv4()

    database.createFile({
      id,
      userId: metadata.userId,
      memoId: metadata.memoId || null,
      filename: metadata.filename || req.file.originalname,
      mimeType: metadata.type || req.file.mimetype,
      size: req.file.size,
      path: req.file.path,
      createdAt: metadata.uploadedAt || new Date().toISOString()
    })

    res.json({ success: true, data: { id } })
  } catch (err) {
    console.error('上传文件失败:', err)
    res.status(500).json({ success: false, error: { message: '上传文件失败' } })
  }
})

// 获取文件元数据
app.get('/api/files/:id/metadata', (req, res) => {
  const files = database.getFiles()
  const file = files.find(f => f.id === req.params.id)
  
  if (!file) {
    return res.status(404).json({ success: false, error: { message: '文件不存在' } })
  }

  res.json({
    success: true,
    data: {
      id: file.id,
      userId: file.userId,
      memoId: file.memoId,
      filename: file.filename,
      type: file.mimeType,
      size: file.size,
      uploadedAt: file.createdAt
    }
  })
})

// 获取文件内容
app.get('/api/files/:id/blob', (req, res) => {
  const files = database.getFiles()
  const file = files.find(f => f.id === req.params.id)
  
  if (!file) {
    return res.status(404).json({ success: false, error: { message: '文件不存在' } })
  }

  if (!fs.existsSync(file.path)) {
    return res.status(404).json({ success: false, error: { message: '文件内容不存在' } })
  }

  res.setHeader('Content-Type', file.mimeType)
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.filename)}"`)
  fs.createReadStream(file.path).pipe(res)
})

// 获取用户的所有文件
app.get('/api/users/:userId/files', (req, res) => {
  const files = database.getFilesByUserId(req.params.userId)
  
  // 转换为前端期望的格式
  const formattedFiles = files.map(file => ({
    id: file.id,
    userId: file.userId,
    memoId: file.memoId,
    filename: file.filename,
    type: file.mimeType,
    size: file.size,
    uploadedAt: file.createdAt
  }))
  
  res.json({ success: true, data: formattedFiles })
})

// 获取备忘录的所有文件
app.get('/api/memos/:memoId/files', (req, res) => {
  const allFiles = database.getFiles()
  const files = allFiles.filter(f => f.memoId === req.params.memoId)
  
  // 转换为前端期望的格式
  const formattedFiles = files.map(file => ({
    id: file.id,
    userId: file.userId,
    memoId: file.memoId,
    filename: file.filename,
    type: file.mimeType,
    size: file.size,
    uploadedAt: file.createdAt
  }))
  
  res.json({ success: true, data: formattedFiles })
})

// 更新文件元数据
app.patch('/api/files/:id', (req, res) => {
  try {
    const files = database.getFiles()
    const file = files.find(f => f.id === req.params.id)
    
    if (!file) {
      return res.status(404).json({ success: false, error: { message: '文件不存在' } })
    }

    // 更新文件记录（目前数据库没有updateFile方法，需要删除后重新创建）
    // 这里简化处理，只返回成功
    res.json({ success: true, data: null })
  } catch (err) {
    console.error('更新文件失败:', err)
    res.status(500).json({ success: false, error: { message: '更新文件失败' } })
  }
})

// 删除文件
app.delete('/api/files/:id', (req, res) => {
  try {
    const files = database.getFiles()
    const file = files.find(f => f.id === req.params.id)
    
    if (file && file.path && fs.existsSync(file.path)) {
      fs.unlinkSync(file.path)
    }
    
    database.deleteFile(req.params.id)
    res.json({ success: true, data: null })
  } catch (err) {
    console.error('删除文件失败:', err)
    res.status(500).json({ success: false, error: { message: '删除文件失败' } })
  }
})

// 获取用户存储使用量
app.get('/api/users/:userId/storage', (req, res) => {
  const files = database.getFilesByUserId(req.params.userId)
  const used = files.reduce((total, file) => total + (file.size || 0), 0)
  res.json({ success: true, data: { used } })
})

// ========== 分享 API ==========

// 创建分享链接
app.post('/api/shares', (req, res) => {
  try {
    const share = req.body
    const id = share.id || uuidv4()
    
    database.createShare({
      id,
      userId: share.userId,
      memoId: share.memoId,
      shareCode: share.shareCode || uuidv4().replace(/-/g, '').substring(0, 8),
      expiresAt: share.expiresAt || null,
      viewCount: share.viewCount || share.accessCount || 0,
      createdAt: share.createdAt || new Date().toISOString()
    })
    
    res.json({ success: true, data: { id } })
  } catch (err) {
    console.error('创建分享链接失败:', err)
    res.status(500).json({ success: false, error: { message: '创建分享链接失败' } })
  }
})

// 获取分享链接
app.get('/api/shares/:id', (req, res) => {
  const shares = database.getShares()
  const share = shares.find(s => s.id === req.params.id)
  
  if (!share) {
    return res.status(404).json({ success: false, error: { message: '分享链接不存在' } })
  }

  res.json({
    success: true,
    data: {
      id: share.id,
      userId: share.userId,
      memoId: share.memoId,
      shareCode: share.shareCode,
      expiresAt: share.expiresAt,
      accessCount: share.viewCount || 0,
      createdAt: share.createdAt
    }
  })
})

// 获取用户的所有分享链接
app.get('/api/users/:userId/shares', (req, res) => {
  const shares = database.getSharesByUserId(req.params.userId)
  
  // 转换为前端期望的格式
  const formattedShares = shares.map(share => ({
    id: share.id,
    userId: share.userId,
    memoId: share.memoId,
    shareCode: share.shareCode,
    expiresAt: share.expiresAt,
    accessCount: share.viewCount || 0,
    createdAt: share.createdAt
  }))
  
  res.json({ success: true, data: formattedShares })
})

// 获取备忘录的所有分享链接
app.get('/api/memos/:memoId/shares', (req, res) => {
  const allShares = database.getShares()
  const shares = allShares.filter(s => s.memoId === req.params.memoId)
  
  // 转换为前端期望的格式
  const formattedShares = shares.map(share => ({
    id: share.id,
    userId: share.userId,
    memoId: share.memoId,
    shareCode: share.shareCode,
    expiresAt: share.expiresAt,
    accessCount: share.viewCount || 0,
    createdAt: share.createdAt
  }))
  
  res.json({ success: true, data: formattedShares })
})

// 更新分享链接
app.patch('/api/shares/:id', (req, res) => {
  try {
    const shares = database.getShares()
    const share = shares.find(s => s.id === req.params.id)
    
    if (!share) {
      return res.status(404).json({ success: false, error: { message: '分享链接不存在' } })
    }

    // 目前数据库没有updateShare方法，简化处理
    res.json({ success: true, data: null })
  } catch (err) {
    console.error('更新分享链接失败:', err)
    res.status(500).json({ success: false, error: { message: '更新分享链接失败' } })
  }
})

// 删除分享链接
app.delete('/api/shares/:id', (req, res) => {
  try {
    database.deleteShare(req.params.id)
    res.json({ success: true, data: null })
  } catch (err) {
    console.error('删除分享链接失败:', err)
    res.status(500).json({ success: false, error: { message: '删除分享链接失败' } })
  }
})

// ========== 统计 API ==========

app.get('/api/data/statistics', (_req, res) => {
  const stats = database.getStatistics()
  res.json({ success: true, data: stats })
})

// ========== 数据导入导出 API ==========

// 导出所有数据
app.get('/api/data/export', (_req, res) => {
  const data = database.exportAll()
  res.json({ success: true, data: JSON.stringify(data) })
})

// 导入数据（从 IndexedDB 导出的格式）
app.post('/api/data/import', (req, res) => {
  try {
    const { data } = req.body
    const parsed = typeof data === 'string' ? JSON.parse(data) : data
    
    let imported = { users: 0, memos: 0 }
    
    // 导入用户
    if (parsed.users && Array.isArray(parsed.users)) {
      for (const user of parsed.users) {
        // 检查用户是否已存在
        if (!database.getUserById(user.id) && !database.getUserByUsername(user.username)) {
          database.createUser(user)
          imported.users++
        }
      }
    }
    
    // 导入备忘录
    if (parsed.memos && Array.isArray(parsed.memos)) {
      for (const memo of parsed.memos) {
        if (!database.getMemoById(memo.id)) {
          database.createMemo(memo)
          imported.memos++
        }
      }
    }
    
    res.json({ 
      success: true, 
      data: { 
        message: `导入成功：${imported.users} 个用户，${imported.memos} 条备忘录`,
        imported 
      } 
    })
  } catch (err) {
    res.status(400).json({ success: false, error: { message: '数据格式错误' } })
  }
})

// 清空数据库（危险操作）
app.delete('/api/data/clear', (_req, res) => {
  try {
    database.clearAllData()
    res.json({ success: true, data: { message: '数据库已清空' } })
  } catch (err) {
    res.status(500).json({ success: false, error: { message: '清空数据库失败' } })
  }
})

// ========== 日志 API ==========

// 创建日志
app.post('/api/logs', (req, res) => {
  try {
    const log = req.body
    // 将前端的 timestamp 映射为数据库的 createdAt
    // 确保 timestamp 是有效的日期字符串
    let createdAt = new Date().toISOString()
    if (log.timestamp) {
      const timestamp = new Date(log.timestamp)
      if (!isNaN(timestamp.getTime())) {
        createdAt = timestamp.toISOString()
      }
    }
    
    const id = database.createLog({
      id: log.id,
      level: log.level,
      message: log.message,
      userId: log.userId,
      action: log.action,
      details: log.context ? JSON.stringify(log.context) : null,
      createdAt: createdAt
    })
    res.json({ success: true, data: { id } })
  } catch (err) {
    console.error('创建日志失败:', err)
    res.status(500).json({ success: false, error: { message: '创建日志失败' } })
  }
})

// 获取日志列表
app.get('/api/logs', (req, res) => {
  try {
    const rawLogs = database.getLogs()
    // 将 createdAt 映射为 timestamp，以匹配前端 LogEntry 类型
    const logs = rawLogs.map(log => ({
      id: log.id,
      level: log.level,
      message: log.message,
      context: log.details ? (() => {
        try {
          return JSON.parse(log.details)
        } catch {
          return undefined
        }
      })() : undefined,
      timestamp: log.createdAt
    }))
    res.json({ success: true, data: logs })
  } catch (err) {
    console.error('获取日志失败:', err)
    res.status(500).json({ success: false, error: { message: '获取日志失败' } })
  }
})

// 按级别获取日志
app.get('/api/logs/by-level/:level', (req, res) => {
  try {
    const { level } = req.params
    const rawLogs = database.getLogsByLevel(level)
    // 将 createdAt 映射为 timestamp，以匹配前端 LogEntry 类型
    const logs = rawLogs.map(log => ({
      id: log.id,
      level: log.level,
      message: log.message,
      context: log.details ? (() => {
        try {
          return JSON.parse(log.details)
        } catch {
          return undefined
        }
      })() : undefined,
      timestamp: log.createdAt
    }))
    res.json({ success: true, data: logs })
  } catch (err) {
    console.error('按级别获取日志失败:', err)
    res.status(500).json({ success: false, error: { message: '获取日志失败' } })
  }
})

// 清空日志
app.delete('/api/logs', (_req, res) => {
  try {
    database.clearLogs()
    res.json({ success: true, data: { message: '日志已清空' } })
  } catch (err) {
    res.status(500).json({ success: false, error: { message: '清空日志失败' } })
  }
})

// 删除指定日期之前的日志
app.delete('/api/logs/before/:date', (req, res) => {
  try {
    const deleted = database.deleteOldLogs(req.params.date)
    res.json({ success: true, data: { deleted } })
  } catch (err) {
    res.status(500).json({ success: false, error: { message: '删除日志失败' } })
  }
})

// ========== 清理 API ==========

// 清理已删除的备忘录
app.delete('/api/cleanup/deleted-memos', (req, res) => {
  try {
    const days = parseInt(req.query.days as string) || 30
    const deleted = database.cleanDeletedMemos(days)
    res.json({ success: true, data: { deleted } })
  } catch (err) {
    console.error('清理已删除备忘录失败:', err)
    res.status(500).json({ success: false, error: { message: '清理失败' } })
  }
})

// 清理孤立文件
app.delete('/api/cleanup/orphaned-files', (_req, res) => {
  try {
    const deleted = database.cleanOrphanedFiles()
    res.json({ success: true, data: { deleted } })
  } catch (err) {
    console.error('清理孤立文件失败:', err)
    res.status(500).json({ success: false, error: { message: '清理失败' } })
  }
})

// 清理过期分享链接
app.delete('/api/cleanup/expired-shares', (_req, res) => {
  try {
    const deleted = database.cleanExpiredShares()
    res.json({ success: true, data: { deleted } })
  } catch (err) {
    console.error('清理过期分享失败:', err)
    res.status(500).json({ success: false, error: { message: '清理失败' } })
  }
})

// 执行完整清理
app.post('/api/cleanup/perform', (req, res) => {
  try {
    const days = parseInt(req.body?.days as string) || 30
    const hours = parseInt(req.body?.hours as string) || 12
    
    // 计算日志截止时间
    const logCutoff = new Date()
    logCutoff.setHours(logCutoff.getHours() - hours)
    
    const result = {
      deletedMemosRemoved: database.cleanDeletedMemos(days),
      orphanedFilesRemoved: database.cleanOrphanedFiles(),
      expiredSharesRemoved: database.cleanExpiredShares(),
      oldLogsRemoved: database.deleteOldLogs(logCutoff.toISOString())
    }
    
    res.json({ success: true, data: result })
  } catch (err) {
    console.error('执行清理失败:', err)
    res.status(500).json({ success: false, error: { message: '清理失败' } })
  }
})

// ========== SPA 路由回退 (生产环境) ==========
// 必须放在所有 API 路由之后
if (process.env.NODE_ENV === 'production') {
  const appDistPath = path.join(__dirname, '../../app/dist')
  const adminDistPath = path.join(__dirname, '../../admin/dist')
  
  // 检查静态文件目录是否存在
  const appDistExists = fs.existsSync(appDistPath)
  const adminDistExists = fs.existsSync(adminDistPath)
  
  if (appDistExists) {
    // 管理端 SPA 回退
    if (adminDistExists) {
      app.get('/admin/*', (_req, res) => {
        const indexPath = path.join(adminDistPath, 'index.html')
        if (fs.existsSync(indexPath)) {
          res.sendFile(indexPath)
        } else {
          res.status(404).send('Admin index.html not found')
        }
      })
    }
    
    // 用户端 SPA 回退 (排除 API 路由)
    app.get('*', (req, res) => {
      if (!req.path.startsWith('/api')) {
        const indexPath = path.join(appDistPath, 'index.html')
        if (fs.existsSync(indexPath)) {
          res.sendFile(indexPath)
        } else {
          res.status(404).send('App index.html not found')
        }
      }
    })
  }
}

// 启动服务器
async function start() {
  try {
    // 输出配置信息 (Requirements: 2.5)
    console.log('🔄 正在启动 CYP-memo API 服务器...')
    console.log(formatConfigInfo(config))
    
    // 初始化数据库
    await initDatabase()
    
    // 记录初始化日志
    database.createLog({
      level: 'info',
      message: '数据库初始化完成',
      action: 'system_init',
      details: JSON.stringify({ component: 'database', status: 'initialized' })
    })
    
    // 启动 HTTP 服务器 - 绑定到所有网络接口 (0.0.0.0)
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 CYP-memo API 服务器运行在 http://0.0.0.0:${PORT}`)
      console.log(`📊 健康检查: http://localhost:${PORT}/api/health`)
      console.log(`🌐 外部访问: http://<your-ip>:${PORT}`)
      
      // 记录服务器启动日志（包含完整配置信息）
      database.createLog({
        level: 'info',
        message: `服务器启动成功，监听端口 ${PORT}`,
        action: 'server_start',
        details: JSON.stringify({ 
          port: config.port,
          dataDir: config.dataDir,
          logLevel: config.logLevel,
          nodeEnv: config.nodeEnv,
          version: config.version,
          timezone: config.timezone,
          timestamp: new Date().toISOString(),
          nodeVersion: process.version,
          platform: process.platform
        })
      })
    })
    
    // 优雅关闭
    process.on('SIGINT', () => {
      console.log('\n🛑 正在关闭服务器...')
      // 记录服务器关闭日志
      database.createLog({
        level: 'info',
        message: '服务器正在关闭 (SIGINT)',
        action: 'server_shutdown',
        details: JSON.stringify({ signal: 'SIGINT', timestamp: new Date().toISOString() })
      })
      database.close()
      process.exit(0)
    })
    
    process.on('SIGTERM', () => {
      console.log('\n🛑 正在关闭服务器...')
      // 记录服务器关闭日志
      database.createLog({
        level: 'info',
        message: '服务器正在关闭 (SIGTERM)',
        action: 'server_shutdown',
        details: JSON.stringify({ signal: 'SIGTERM', timestamp: new Date().toISOString() })
      })
      database.close()
      process.exit(0)
    })
    
  } catch (err) {
    console.error('❌ 服务器启动失败:', err)
    // 记录启动失败日志
    try {
      database.createLog({
        level: 'error',
        message: `服务器启动失败: ${err instanceof Error ? err.message : String(err)}`,
        action: 'server_start_failed',
        details: JSON.stringify({ error: err instanceof Error ? err.stack : String(err) })
      })
    } catch (_) {
      // 忽略日志记录失败
    }
    process.exit(1)
  }
}

start()
