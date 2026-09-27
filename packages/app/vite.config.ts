import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { cpSync, mkdirSync } from 'fs'
import { createRequire } from 'module'
import { dirname, join, resolve } from 'path'
import { createApiProxy } from '../shared/src/config/viteApiProxy'

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
  "connect-src 'self' ws://localhost:* http://localhost:* ws://127.0.0.1:* http://127.0.0.1:* https:",
  "media-src 'self'",
  "object-src 'none'",
  "frame-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ')

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
    // Vite 联调主机配置（工具链；非独立配置面）:
    // - VITE_HOST=0.0.0.0: 需外部访问时
    // - VITE_HOST=localhost / 默认 127.0.0.1: 本机联调
    host: process.env.VITE_HOST || '127.0.0.1',
    open: false,
    strictPort: false,
    // CFG-SYS-07：代理目标来自 PORT / VITE_API_PROXY_TARGET，业务代码只用 /api
    proxy: createApiProxy(),
    hmr: {},
    watch: {},
    headers: {
      'Content-Security-Policy': LOCAL_TOOLING_CSP,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  },
  preview: {
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
