/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    headers: {
      // WebMCP is only available in origin-isolated documents.
      'Origin-Agent-Cluster': '?1',
    },
  },
  preview: {
    headers: {
      'Origin-Agent-Cluster': '?1',
    },
  },
  test: {
    environment: 'jsdom',
    globals: false,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
