import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      'playwright-trace-player/react': resolve(
        fileURLToPath(new URL('.', import.meta.url)),
        'src/react/index.ts',
      ),
    },
  },
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      reporter: ['text', 'html'],
    },
  },
})
