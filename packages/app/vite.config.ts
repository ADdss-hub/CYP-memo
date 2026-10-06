import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { cpSync, existsSync, mkdirSync, readFileSync } from 'fs'
import { execFileSync } from 'child_process'
import { createRequire } from 'module'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { createApiProxy } from '../shared/src/config/viteApiProxy'

const __dirname = dirname(fileURLToPath(import.meta.url))

/** 从已安装的 pdfjs-dist 拷贝 cMap/标准字体到 public，随 dist 发布，不依赖本机绝对路径 */
function pdfjsStaticAssets() {
  const require = createRequire(import.meta.url)
  return {
    name: 'pdfjs-static-assets',
    buildStart() {
      const root = dirname(require.resolve('pdfjs-dist/package.json'))
      const dest = resolve(__dirname, 'public/pdfjs')
      mkdirSync(dest, { recursive: true })
      cpSync(join(root, 'cmaps'), join(dest, 'cmaps'), { recursive: true })
      cpSync(join(root, 'standard_fonts'), join(dest, 'standard_fonts'), { recursive: true })
    },
  }
}

/** R4 X-03：与 server/csp.ts 联调 HMR 策略对齐（需 eval/ws；配置仍为 prod） */
const LOCAL_TOOLING_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https: wss:",
  "media-src 'self'",
  "object-src 'none'",
  "frame-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ')

/**
 * R-TLS-001：联调壳与主 API 共用 dataDir/tls（只读 PEM；缺则经 server ensure 签发）
 * 禁止在此 import server/shared 桶入口（Vite 配 ESM 会断 extensionless 解析）
 */
function loadViteHttpsMaterial(dataDir: string): { key: string; cert: string } {
  const tryDir = (dir: string) => {
    const keyPath = join(dir, 'key.pem')
    const certPath = join(dir, 'cert.pem')
    if (!existsSync(keyPath) || !existsSync(certPath)) return null
    return { key: readFileSync(keyPath, 'utf8'), cert: readFileSync(certPath, 'utf8') }
  }

  let mat =
    tryDir(join(dataDir, 'tls', 'official')) || tryDir(join(dataDir, 'tls', 'leaf'))
  if (!mat) {
    const repoRoot = resolve(__dirname, '../..')
    const pnpmBin = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
    const issue = [
      `import { ensureApiTlsMaterial } from './src/tls/material.ts';`,
      `await ensureApiTlsMaterial(${JSON.stringify(dataDir)});`,
      `console.error('[vite-tls] issued for', ${JSON.stringify(dataDir)});`,
    ].join('')
    execFileSync(
      pnpmBin,
      ['--filter', '@cyp-memo/server', 'exec', 'tsx', '-e', issue],
      { cwd: repoRoot, stdio: 'inherit', shell: true, env: process.env }
    )
    mat = tryDir(join(dataDir, 'tls', 'official')) || tryDir(join(dataDir, 'tls', 'leaf'))
  }
  if (!mat) {
    throw new Error(`Vite HTTPS: TLS material missing under ${dataDir}/tls (official|leaf)`)
  }
  return mat
}

const dataDir = process.env.DATA_DIR || resolve(__dirname, '../server/data')
const viteTls = loadViteHttpsMaterial(dataDir)

export default defineConfig({
  plugins: [vue(), pdfjsStaticAssets()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@shared': resolve(__dirname, '../shared/src'),
    },
  },
  ssr: {
    noExternal: ['bcryptjs'],
  },
  server: {
    port: 5173,
    // CI02：与生产同口径，默认绑定全部网卡；访问用实机 IP（非 localhost / 非仅环回）
    // 覆盖：VITE_HOST=127.0.0.1 仅本机探针
    host: process.env.VITE_HOST || '0.0.0.0',
    https: {
      key: viteTls.key,
      cert: viteTls.cert,
    },
    open: false,
    strictPort: false,
    // CFG-SYS-07：代理目标来自 PORT / VITE_API_PROXY_TARGET，业务代码只用 /api
    proxy: createApiProxy(),
    hmr: {
      protocol: 'wss',
    },
    watch: {},
    headers: {
      'Content-Security-Policy': LOCAL_TOOLING_CSP,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  },
  preview: {
    https: {
      key: viteTls.key,
      cert: viteTls.cert,
    },
    headers: {
      'Content-Security-Policy': LOCAL_TOOLING_CSP,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
