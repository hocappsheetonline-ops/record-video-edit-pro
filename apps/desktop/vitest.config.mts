import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': resolve(import.meta.dirname, 'src/shared'),
      '@renderer': resolve(import.meta.dirname, 'src/renderer/src'),
    },
  },
  test: {
    setupFiles: ['./vitest.setup.ts'],
    projects: [
      {
        extends: true,
        test: { name: 'main', environment: 'node', include: ['src/main/**/*.test.ts'] },
      },
      {
        extends: true,
        test: {
          name: 'renderer',
          environment: 'jsdom',
          include: ['src/renderer/**/*.test.{ts,tsx}'],
        },
      },
    ],
  },
})
