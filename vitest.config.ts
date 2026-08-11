import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  test: {
    projects: [
      {
        // Main-process + pure logic tests (SQLite, migrations, CSV utils).
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['electron/**/*.test.ts', 'src/**/*.test.ts']
        }
      },
      {
        // Renderer component tests.
        plugins: [react()],
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: ['src/**/*.test.tsx'],
          setupFiles: ['./src/test/setup.ts']
        }
      }
    ]
  }
})
