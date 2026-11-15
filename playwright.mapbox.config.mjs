import base from './playwright.reference.config.mjs'
import { defineConfig } from '@playwright/test'
export default defineConfig({ ...base,
  testDir: './tests/mapbox-browser',
  timeout: 120000,
  use: { ...base.use, trace: 'off' },
  webServer: base.webServer.map((server, index) => index === 1 ? {
    ...server, env: { ...server.env, VITE_MAP_STYLE_URL: '', VITE_MAPBOX_OFFLINE: 'false' },
  } : server),
})
