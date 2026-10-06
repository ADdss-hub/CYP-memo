import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import { fileURLToPath } from 'url'
import { createApiProxy } from '../shared/src/config/viteApiProxy'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default defineConfig({
  plugins: [vue()],
  root: path.join(__dirname, 'src/renderer'),
  base: './',
  server: {
    port: 10175,
    strictPort: true,
    // CFG-SYS-07：含 /healthz；目标来自 PORT / VITE_API_PROXY_TARGET
    proxy: createApiProxy(),
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
      '@app-components': path.join(__dirname, '../app/src/components'),
      '@app-views': path.join(__dirname, '../app/src/views'),
      '@app-stores': path.join(__dirname, '../app/src/stores'),
      '@app-router': path.join(__dirname, '../app/src/router'),
      '@app-composables': path.join(__dirname, '../app/src/composables'),
    },
  },
  define: {
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
