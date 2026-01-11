import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig(({ command }) => ({
  plugins: [vue()],
  // 生产环境下管理端部署在 /admin 路径下
  // command === 'build' 表示生产构建，command === 'serve' 表示开发服务器
  base: command === 'build' ? '/admin/' : '/',
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
    // 开发服务器主机配置:
    // - VITE_HOST=0.0.0.0: Docker 容器或需要外部访问时
    // - VITE_HOST=localhost: 本地开发（默认，更安全）
    // - WSL2 用户可能需要设置为 0.0.0.0 才能从 Windows 访问
    host: process.env.VITE_HOST || 'localhost',
    open: false,
    // 启用严格端口模式，端口被占用时报错而不是自动切换
    strictPort: false,
    // HMR 配置 - 解决 WSL2/Docker 环境下的热更新问题
    hmr: {
      // WSL2 环境下可能需要指定 host
      // host: 'localhost',
    },
    // 文件监听配置 - 解决某些文件系统（如 WSL2、Docker 挂载卷）的监听问题
    watch: {
      // 使用轮询模式（在 Docker 挂载卷或 WSL2 中可能需要）
      // usePolling: true,
      // interval: 1000,
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
}))
