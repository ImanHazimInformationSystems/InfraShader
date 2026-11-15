import base from './playwright.environment.config.mjs'
import { defineConfig } from '@playwright/test'

// Repeat the existing offline responsive suite without stopping the development UI.
export default defineConfig({
  ...base,
  testDir: './tests/browser',
  webServer: base.webServer.map((server, index) =>
    index === 1 ? { ...server, env: { ...server.env, VITE_MAP_STYLE_URL: 'offline' } } : server,
  ),
})
