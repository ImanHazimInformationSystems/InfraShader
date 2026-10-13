import {defineConfig} from '@playwright/test'
import path from 'node:path'
import {existsSync} from 'node:fs'
const localUv=process.env.LOCALAPPDATA&&path.join(process.env.LOCALAPPDATA,'Microsoft','WinGet','Links','uv.exe')
const uv=localUv&&existsSync(localUv)?`"${localUv}"`:'uv'
export default defineConfig({testDir:'./tests/live-browser',workers:1,reporter:[['list']],globalTeardown:'./tests/live-browser/teardown.mjs',
 use:{baseURL:'http://127.0.0.1:5173',channel:process.env.PLAYWRIGHT_CHANNEL||(process.platform==='win32'?'msedge':undefined),trace:'off',viewport:{width:1280,height:900}},
 webServer:[{command:`${uv} run --frozen uvicorn tests.live_server:app --host 127.0.0.1 --port 8000`,cwd:path.resolve('apps/api'),url:'http://127.0.0.1:8000/api/v1/health',reuseExistingServer:false,timeout:60000},
 {command:'npm run dev',url:'http://127.0.0.1:5173',reuseExistingServer:false,env:{VITE_MAP_STYLE_URL:'offline',VITE_SUPABASE_URL:'http://127.0.0.1:54331'}}]})
