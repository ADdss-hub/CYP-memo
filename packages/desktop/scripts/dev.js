/**
 * 开发模式启动脚本
 * Development mode startup script with hot reload support
 */

import { spawn, execSync } from 'child_process'
import { createServer, build } from 'vite'
import electron from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.join(__dirname, '..')

let electronProcess = null

/**
 * 编译主进程 TypeScript
 */
function compileMain() {
  console.log('📦 Compiling main process...')
  execSync('npx tsc -p tsconfig.main.json', { 
    stdio: 'inherit', 
    cwd: rootDir 
  })
  console.log('✅ Main process compiled')
}

/**
 * 启动 Vite 开发服务器
 */
async function startViteServer() {
  console.log('🚀 Starting Vite dev server...')
  const server = await createServer({
    configFile: path.join(rootDir, 'vite.config.ts'),
    mode: 'development',
  })
  await server.listen()
  const info = server.config.server
  console.log(`✅ Vite server running at http://localhost:${info.port}`)
  return server
}

/**
 * 启动 Electron
 */
function startElectron() {
  console.log('⚡ Starting Electron...')
  
  const mainPath = path.join(rootDir, 'dist/main/index.js')
  
  if (!fs.existsSync(mainPath)) {
    console.error('❌ Main process not compiled. Run compile first.')
    process.exit(1)
  }

  electronProcess = spawn(electron, [mainPath], {
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'development',
      VITE_DEV_SERVER_URL: 'http://localhost:5174',
    },
  })

  electronProcess.on('close', (code) => {
    console.log(`Electron exited with code ${code}`)
    process.exit(code)
  })

  return electronProcess
}

/**
 * 监听主进程文件变化并重新编译
 */
function watchMainProcess() {
  const mainSrcDir = path.join(rootDir, 'src/main')
  const preloadSrcDir = path.join(rootDir, 'src/preload')
  const sharedSrcDir = path.join(rootDir, 'src/shared')
  
  const chokidar = import('chokidar').then(({ default: chokidar }) => {
    const watcher = chokidar.watch([mainSrcDir, preloadSrcDir, sharedSrcDir], {
      ignoreInitial: true,
    })

    watcher.on('change', (filePath) => {
      console.log(`\n📝 File changed: ${path.relative(rootDir, filePath)}`)
      try {
        compileMain()
        restartElectron()
      } catch (error) {
        console.error('❌ Compilation failed:', error.message)
      }
    })

    console.log('👀 Watching main process files for changes...')
  }).catch(() => {
    console.log('⚠️ chokidar not installed, file watching disabled')
  })
}

/**
 * 重启 Electron
 */
function restartElectron() {
  if (electronProcess) {
    console.log('🔄 Restarting Electron...')
    electronProcess.kill()
    electronProcess = null
  }
  startElectron()
}

/**
 * 主函数
 */
async function main() {
  console.log('🎬 CYP-memo Desktop Development Mode\n')
  
  try {
    // 1. 编译主进程
    compileMain()
    
    // 2. 启动 Vite 开发服务器
    await startViteServer()
    
    // 3. 启动 Electron
    startElectron()
    
    // 4. 监听文件变化
    watchMainProcess()
    
  } catch (error) {
    console.error('❌ Failed to start development mode:', error)
    process.exit(1)
  }
}

// 处理退出信号
process.on('SIGINT', () => {
  if (electronProcess) {
    electronProcess.kill()
  }
  process.exit()
})

main()
