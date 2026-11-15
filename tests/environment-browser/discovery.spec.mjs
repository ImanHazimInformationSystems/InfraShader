import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

const styleUrl = '**/tiles.openfreemap.org/styles/bright'
const style = { version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#e5ece0' } }] }
async function explore(page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Open Browser Demo' }).click()
  await page.getByRole('navigation').getByRole('button', { name: 'Explore Map' }).click()
}
async function selectCoordinates(page) {
  for (const [label, value] of Object.entries({ 'West longitude': '101.681', 'South latitude': '3.131', 'East longitude': '101.683', 'North latitude': '3.133' })) await page.getByLabel(label, { exact: true }).fill(value)
  await page.getByRole('button', { name: 'Apply coordinates', exact: true }).click()
}

test('L02 retries failed provider style while retaining site and explorer clock', async ({ page }, info) => {
  let attempts = 0
  await page.route(styleUrl, route => route.fulfill(++attempts === 1 ? { status: 503, body: '' } : { json: style }))
  await explore(page)
  await selectCoordinates(page)
  await page.getByRole('button', { name: 'Hide site controls', exact: true }).click()
  await page.getByLabel('Shadow date', { exact: true }).fill('2026-11-04')
  await page.getByLabel('Shadow time', { exact: true }).fill('14:30')
  await page.getByRole('button', { name: 'Retry map loading', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Retry map loading', exact: true })).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Explore site map' })).toHaveAttribute('data-map-status', 'ready')
  await expect(page.getByLabel('Shadow date', { exact: true })).toHaveValue('2026-11-04')
  await expect(page.getByLabel('Shadow time', { exact: true })).toHaveValue('14:30')
  expect(attempts).toBe(2)
  await page.getByText('Preview data & limits', { exact: true }).click()
  await expect(page.getByLabel('Loaded building coverage')).toContainText('Loaded building parts: 0')
  await page.getByRole('button', { name: 'Show site controls', exact: true }).click()
  await expect(page.getByLabel('West longitude', { exact: true })).toHaveValue('101.681')
  await mkdir('artifacts', { recursive: true })
  await page.screenshot({ path: `artifacts/l02-recovered-${info.project.name}.png`, fullPage: true })
  await page.getByRole('button', { name: 'Continue with this site', exact: true }).click()
  await expect(page.getByLabel('Relevant use times')).toHaveValue(/2026-11-04 14:30/)
})

test('L02 unavailable WebGL retains a usable numeric site and project creation path', async ({ page }, info) => {
  await page.route(styleUrl, route => route.fulfill({ json: style }))
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      if (type === 'webgl2' || type === 'webgl') return null
      return original.call(this, type, ...args)
    }
  })
  await explore(page)
  await expect(page.getByRole('region', { name: 'Explore site map' })).toHaveAttribute('data-map-status', 'unavailable')
  await selectCoordinates(page)
  await page.getByRole('button', { name: 'Continue with this site', exact: true }).click()
  await page.getByLabel('Project name', { exact: false }).fill('L02 Numeric fallback')
  await page.getByLabel('Internal sponsor', { exact: false }).fill('Test fixture')
  await page.getByRole('button', { name: 'Create project', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'L02 Numeric fallback', exact: true })).toBeVisible()
  await expect(page.getByText('101.681000 / 3.131000 / 101.683000 / 3.133000', { exact: true })).toBeVisible()
  await mkdir('artifacts', { recursive: true })
  await page.screenshot({ path: `artifacts/l02-numeric-${info.project.name}.png`, fullPage: true })
})
