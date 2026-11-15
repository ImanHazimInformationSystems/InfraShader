import { defineConfig } from '@playwright/test'
import path from 'node:path'
import { existsSync } from 'node:fs'

const localUv = process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Links', 'uv.exe')
const uv = localUv && existsSync(localUv) ? `"${localUv}"` : 'uv'
// Optional alternate ports (INFRA_BROWSER_API_PORT / INFRA_BROWSER_WEB_PORT) run the production bundle
// beside a developer's own servers; without them the original dev-server behaviour is unchanged.
const altApi = process.env.INFRA_BROWSER_API_PORT
const altWeb = process.env.INFRA_BROWSER_WEB_PORT
const alternate = Boolean(altApi && altWeb)
const dist = path.resolve('test-results/browser-web-dist')
const channel = process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined)

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: alternate ? `http://127.0.0.1:${altWeb}` : 'http://127.0.0.1:5173', channel, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 900 } } },
    { name: 'tablet', use: { viewport: { width: 768, height: 1024 } } },
    { name: 'phone', use: { viewport: { width: 390, height: 844 } } },
  ],
  webServer: alternate
    ? [
        { command: `${uv} run --frozen uvicorn app.main:app --host 127.0.0.1 --port ${altApi}`, cwd: path.resolve('apps/api'), url: `http://127.0.0.1:${altApi}/api/v1/health`, reuseExistingServer: false, timeout: 60000 },
        { command: `npx vite build --outDir "${dist}" --emptyOutDir && npx vite preview --outDir "${dist}" --host 127.0.0.1 --port ${altWeb} --strictPort`, cwd: path.resolve('apps/web'), env: { VITE_MAP_STYLE_URL: 'offline', VITE_API_PROXY_TARGET: `http://127.0.0.1:${altApi}` }, url: `http://127.0.0.1:${altWeb}`, reuseExistingServer: false, timeout: 240000 },
      ]
    : [
    { command: `${uv} run --frozen uvicorn app.main:app --host 127.0.0.1 --port 8000`, cwd: path.resolve('apps/api'), url: 'http://127.0.0.1:8000/api/v1/health', reuseExistingServer: !process.env.CI, timeout: 60000 },
    { command: 'npm run dev', env: { VITE_MAP_STYLE_URL: 'offline' }, url: 'http://127.0.0.1:5173', reuseExistingServer: !process.env.CI, timeout: 60000 },
  ],
})
