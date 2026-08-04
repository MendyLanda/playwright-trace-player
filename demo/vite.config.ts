import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  root: resolve(fileURLToPath(new URL('.', import.meta.url))),
  plugins: [react()],
  resolve: {
    alias: {
      'playwright-trace-player/react': resolve(fileURLToPath(new URL('.', import.meta.url)), '../src/react/index.ts'),
    },
  },
  server: {
    proxy: {
      '/demo-traces': {
        target: 'https://files.mendylanda.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(
          /^\/demo-traces/,
          '/playwright-trace-player/traces/v1',
        ),
      },
    },
  },
  build: {
    outDir: resolve(fileURLToPath(new URL('.', import.meta.url)), '../demo-dist'),
    emptyOutDir: true,
  },
})
