import base from './playwright.mapbox.config.mjs'
import { defineConfig } from '@playwright/test'
export default defineConfig({ ...base, testDir: './tests/reference-browser', testMatch: 'terrain-studies.spec.mjs', metadata: { liveTerrain: true } })
