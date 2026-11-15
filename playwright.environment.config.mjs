import base from './playwright.providers.config.mjs'
import { defineConfig } from '@playwright/test'
export default defineConfig({
  ...base,
  testDir: './tests/environment-browser',
  timeout: 90000,
  use: { ...base.use, baseURL: 'http://127.0.0.1:5174' },
  webServer: [
    {
      ...base.webServer[0],
      command: base.webServer[0].command.replace('--port 8000', '--port 8001'),
      url: 'http://127.0.0.1:8001/api/v1/health',
      env: { CORS_ORIGINS: '["http://127.0.0.1:5174"]' },
    },
    {
      ...base.webServer[1],
      command: 'npm run dev --workspace apps/web -- --port 5174',
      url: 'http://127.0.0.1:5174',
      env: {
        VITE_MAP_STYLE_URL: 'https://tiles.openfreemap.org/styles/bright',
        VITE_API_BASE_URL: 'http://127.0.0.1:8001',
      },
    },
  ],
})
