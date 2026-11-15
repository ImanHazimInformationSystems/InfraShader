import base from './playwright.access-fixture.config.mjs'
import {defineConfig} from '@playwright/test'
export default defineConfig({...base,testDir:'./tests/reference-browser',
  webServer:base.webServer.map((server,index)=>index===0?{...server,command:server.command.replace('tests.browser_server:app','tests.reference_server:app')}:server)
})
