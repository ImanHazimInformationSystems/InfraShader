import {defineConfig} from '@playwright/test'
import path from 'node:path'
import {existsSync} from 'node:fs'
const localUv=process.env.LOCALAPPDATA&&path.join(process.env.LOCALAPPDATA,'Microsoft','WinGet','Links','uv.exe')
const uv=localUv&&existsSync(localUv)?`"${localUv}"`:'uv'
// LOCAL ONLY: real local Supabase Auth/Storage (Docker, 54331) + disposable PostGIS schema.
// Ports are configurable to run beside a developer's own servers (INFRA_LIVE_API_PORT / INFRA_LIVE_WEB_PORT).
// The web app runs as the production bundle (see playwright.integration.config.mjs for the reason).
const apiPort=process.env.INFRA_LIVE_API_PORT||'8000'
const webPort=process.env.INFRA_LIVE_WEB_PORT||'5173'
const api=`http://127.0.0.1:${apiPort}`
// Teardown posts the fixture cleanup to this API; without it a non-default port cleaned up nothing.
process.env.INFRA_TEST_API_URL=api
const dist=path.resolve('test-results/live-web-dist')
export default defineConfig({testDir:'./tests/live-browser',workers:1,reporter:[['list']],globalTeardown:'./tests/live-browser/teardown.mjs',
 use:{baseURL:`http://127.0.0.1:${webPort}`,channel:process.env.PLAYWRIGHT_CHANNEL||(process.platform==='win32'?'msedge':undefined),trace:'off',screenshot:'only-on-failure',viewport:{width:1280,height:900}},
 webServer:[{command:`${uv} run --frozen uvicorn tests.live_server:app --host 127.0.0.1 --port ${apiPort}`,cwd:path.resolve('apps/api'),url:`${api}/api/v1/health`,reuseExistingServer:false,timeout:60000},
 {command:`npx vite build --outDir "${dist}" --emptyOutDir && npx vite preview --outDir "${dist}" --host 127.0.0.1 --port ${webPort} --strictPort`,cwd:path.resolve('apps/web'),url:`http://127.0.0.1:${webPort}`,reuseExistingServer:false,timeout:240000,env:{VITE_MAP_STYLE_URL:'offline',VITE_SUPABASE_URL:'http://127.0.0.1:54331',VITE_API_PROXY_TARGET:api}}]})
