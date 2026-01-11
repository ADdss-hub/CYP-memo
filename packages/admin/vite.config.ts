import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
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
    port: 5174,
    host: process.env.VITE_HOST || 'localhost',
    open: false,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
