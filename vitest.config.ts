import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'tests/fixtures/**/*.test.ts'],
    environment: 'node'
  }
})
