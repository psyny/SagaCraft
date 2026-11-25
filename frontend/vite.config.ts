/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // (loaded only when a map is downloaded: bundled ahead in dev, else its first load reloads the page)
  optimizeDeps: { include: ['react-dom/server'] },
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
})
