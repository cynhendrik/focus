import { defineConfig, configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    passWithNoTests: true,
    // Ignore stray agent git worktrees so we don't run ~20 duplicate copies
    // of the suite (and to keep the run fast).
    exclude: [...configDefaults.exclude, '**/.claude/**'],
  },
})
