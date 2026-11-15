import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  // Discover lazily imported dependencies at startup so the dev server does not
  // re-optimise and reload mid-session (stale dynamic imports in browser checks).
  optimizeDeps: { entries: ['index.html', 'src/**/*.tsx'] },
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': loadEnv(mode, '.', 'VITE_').VITE_API_PROXY_TARGET || 'http://127.0.0.1:8000' },
  },
  test: { environment: 'jsdom', globals: true, clearMocks: true },
}))
