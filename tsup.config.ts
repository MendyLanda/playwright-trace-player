import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    core: 'src/core/index.ts',
    react: 'src/react/index.ts',
    'trace-worker': 'src/core/trace-worker.js',
  },
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: true,
  external: ['react', 'react-dom'],
})
