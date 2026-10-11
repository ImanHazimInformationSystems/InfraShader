import { defineConfig } from '@playwright/test'
import path from 'node:path'
import { existsSync } from 'node:fs'

const localUv = process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Links', 'uv.exe')
const uv = localUv && existsSync(localUv) ? `"${localUv}"` : 'uv'
const channel = process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined)

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:5173', channel, trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 900 } } },
    { name: 'tablet', use: { viewport: { width: 768, height: 1024 } } },
    { name: 'phone', use: { viewport: { width: 390, height: 844 } } },
  ],
  webServer: [
    { command: `${uv} run --frozen uvicorn app.main:app --host 127.0.0.1 --port 8000`, cwd: path.resolve('apps/api'), url: 'http://127.0.0.1:8000/api/v1/health', reuseExistingServer: !process.env.CI, timeout: 60000 },
    { command: 'npm run dev', url: 'http://127.0.0.1:5173', reuseExistingServer: !process.env.CI, timeout: 60000 },
  ],
})
