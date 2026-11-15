import { defineConfig } from '@playwright/test'
import path from 'node:path'
import { existsSync } from 'node:fs'
const localUv = process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Links', 'uv.exe')
const uv = localUv && existsSync(localUv) ? `"${localUv}"` : 'uv'
// Ports are configurable so the suite can run beside a developer's own servers
// (for example INFRA_IT_API_PORT=8100 INFRA_IT_WEB_PORT=5174).
const apiPort = process.env.INFRA_IT_API_PORT || '8000'
const webPort = process.env.INFRA_IT_WEB_PORT || '5173'
const api = `http://127.0.0.1:${apiPort}`
process.env.INFRA_TEST_API_URL = api
// The web app runs as the production bundle (vite build + preview), not the module-per-file
// dev server: it mirrors what is deployed and avoids Edge ERR_NO_BUFFER_SPACE / dependency
// re-optimisation reloads seen when hundreds of dev modules load per page (2026-11-13).
const dist = path.resolve('test-results/integration-web-dist')
export default defineConfig({
  testDir: './tests/integration-browser', workers: 1, reporter: [['list']],
  globalTeardown: './tests/integration-browser/teardown.mjs',
  use: { baseURL: `http://127.0.0.1:${webPort}`, channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined), viewport: { width: 1280, height: 900 }, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: [
    { command: `${uv} run --frozen uvicorn tests.browser_server:app --host 127.0.0.1 --port ${apiPort}`, cwd: path.resolve('apps/api'), url: `${api}/api/v1/health`, reuseExistingServer: false, timeout: 60000, env: { INFRA_TEST_API_URL: api } },
    { command: `npx vite build --outDir "${dist}" --emptyOutDir && npx vite preview --outDir "${dist}" --host 127.0.0.1 --port ${webPort} --strictPort`, cwd: path.resolve('apps/web'), url: `http://127.0.0.1:${webPort}`, reuseExistingServer: false, timeout: 240000, env: { VITE_MAP_STYLE_URL: 'offline', VITE_SUPABASE_URL: api, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_browser_fixture', VITE_API_PROXY_TARGET: api } },
  ],
})
