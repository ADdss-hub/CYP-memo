import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/renderer/**', 'src/**/*.d.ts'],
    },
  },
  resolve: {
    alias: {
      '@': '/src',
      '@shared': '../shared/src',
    },
  },
})
