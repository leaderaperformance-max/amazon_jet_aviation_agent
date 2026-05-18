import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: 'node',
    globals: true,
    passWithNoTests: true,
    env: {
      DEBOUNCE_DELAY_MS: '0',
    },
  },
})
