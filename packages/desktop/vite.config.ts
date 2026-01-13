import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default defineConfig({
  plugins: [vue()],
  root: path.join(__dirname, 'src/renderer'),
  base: './',
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:5170',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: path.join(__dirname, 'dist/renderer'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.join(__dirname, 'src/renderer/index.html'),
      },
    },
  },
  resolve: {
    alias: {
      '@': path.join(__dirname, 'src'),
      '@renderer': path.join(__dirname, 'src/renderer'),
      '@shared': path.join(__dirname, '../shared/src'),
      '@app': path.join(__dirname, '../app/src'),
      // 复用 web app 的组件和模块
      '@app-components': path.join(__dirname, '../app/src/components'),
      '@app-views': path.join(__dirname, '../app/src/views'),
      '@app-stores': path.join(__dirname, '../app/src/stores'),
      '@app-router': path.join(__dirname, '../app/src/router'),
      '@app-composables': path.join(__dirname, '../app/src/composables'),
    },
  },
  define: {
    // 定义环境变量
    __IS_ELECTRON__: true,
  },
  optimizeDeps: {
    include: [
      'vue',
      'vue-router',
      'pinia',
      'element-plus',
      '@element-plus/icons-vue',
    ],
  },
})
