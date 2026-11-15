import base from './playwright.integration.config.mjs'
import { defineConfig } from '@playwright/test'
import path from 'node:path'
process.env.INFRA_TEST_API_URL = 'http://127.0.0.1:8001'
export default defineConfig({ ...base,
  use: { ...base.use, baseURL: 'http://127.0.0.1:5174' },
  webServer: base.webServer.map((server, index) => index === 0 ? {
    ...server, command: server.command.replace('--port 8000', '--port 8001'),
    url: 'http://127.0.0.1:8001/api/v1/health', env: { INFRA_TEST_API_URL: process.env.INFRA_TEST_API_URL, CORS_ORIGINS: '["http://127.0.0.1:5174"]' }
  } : { ...server, command: 'npm run dev --workspace apps/web -- --port 5174', url: 'http://127.0.0.1:5174',
    // "--workspace" must run from the repository root; the base config starts Vite from apps/web.
    cwd: path.resolve('.'),
    env: { ...server.env, VITE_SUPABASE_URL: process.env.INFRA_TEST_API_URL, VITE_API_BASE_URL: process.env.INFRA_TEST_API_URL, VITE_API_PROXY_TARGET: process.env.INFRA_TEST_API_URL }
  })
})
