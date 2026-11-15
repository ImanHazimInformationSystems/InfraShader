import base from './playwright.live.config.mjs'
import {defineConfig} from '@playwright/test'
// Real local Supabase identity + cross-origin API (CORS) paths. Ports configurable to run beside a
// developer's own servers: INFRA_ACCESS_API_PORT (default 8001), INFRA_ACCESS_WEB_PORT (default 5173).
const apiPort=process.env.INFRA_ACCESS_API_PORT||'8001'
const webPort=process.env.INFRA_ACCESS_WEB_PORT||'5173'
const api=`http://127.0.0.1:${apiPort}`
process.env.INFRA_TEST_API_URL=api
export default defineConfig({...base,testDir:'./tests',testMatch:/(access-browser|live-browser)\/.*\.spec\.mjs/,timeout:90000,
use:{...base.use,baseURL:`http://127.0.0.1:${webPort}`},
webServer:base.webServer.map((server,index)=>index===0?{...server,command:server.command.replace(/--port \d+/,`--port ${apiPort}`),url:`${api}/api/v1/health`,env:{CORS_ORIGINS:`["http://127.0.0.1:${webPort}"]`}}:{...server,command:server.command.replace(/--port \d+ --strictPort/,`--port ${webPort} --strictPort`),url:`http://127.0.0.1:${webPort}`,env:{...server.env,VITE_API_BASE_URL:api,VITE_API_PROXY_TARGET:api}})})
