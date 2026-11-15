import base from './playwright.reference.config.mjs'
import { defineConfig } from '@playwright/test'
// Opt-in real map-provider check; no hosted backend or paid provider.
export default defineConfig({ ...base, testMatch: /(?:studio-shell|geographic-editor)\.spec\.mjs/,
  webServer: base.webServer.map((server, index) => index === 1 ? {
    ...server, env: { ...server.env, VITE_MAP_STYLE_URL: 'https://tiles.openfreemap.org/styles/liberty' }
  } : server)
})
