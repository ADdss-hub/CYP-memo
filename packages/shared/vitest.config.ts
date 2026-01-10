import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    // 使用 forks 以避免内存问题，但增加并发数
    pool: 'forks',
    poolOptions: {
      forks: {
        // 允许多个 fork 进程并发运行
        singleFork: false,
        // 限制最大并发数
        maxForks: 3,
        minForks: 1
      }
    },
    // 增加测试超时时间，特别是属性测试需要更长时间
    testTimeout: 120000, // 2 分钟
    hookTimeout: 60000, // 60 秒（增加 hook 超时）
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'tests/', '**/*.test.ts']
    }
  }
})
