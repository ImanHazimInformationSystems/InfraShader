import base from './playwright.config.mjs'
import { defineConfig } from '@playwright/test'
export default defineConfig({ ...base, testDir:'./tests/provider-browser', projects:[{name:'desktop',use:{viewport:{width:1280,height:900}}},{name:'tablet',use:{viewport:{width:768,height:1024}}},{name:'phone',use:{viewport:{width:390,height:844}}}], webServer: base.webServer.map(server=>server.command==='npm run dev'?{...server,reuseExistingServer:false,env:{VITE_MAP_STYLE_URL:'https://tiles.openfreemap.org/styles/bright'}}:{...server,reuseExistingServer:false}) })
