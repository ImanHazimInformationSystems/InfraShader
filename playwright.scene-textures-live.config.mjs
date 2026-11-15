import base from './playwright.mapbox.config.mjs'
import { defineConfig } from '@playwright/test'
export default defineConfig({ ...base, testDir: './tests/reference-browser', testMatch: 'scene-textures.spec.mjs', metadata: { liveTextures: true } })
