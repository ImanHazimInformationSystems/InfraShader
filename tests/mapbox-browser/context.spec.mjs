import { test, expect } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'

test('live Mapbox 3D + controlled satellite tiles, sun/weather and project persistence', async ({ page, request }) => {
  const errors = [], mapboxFailures = []
  page.on('pageerror', e => errors.push(e.message))
  let imageryTiles = 0, shadowRequests = 0
  const imageryResponses = []
  // Live satellite requests returned HTTP 429 for this account. Exercise the actual
  // Mapbox raster decoder/layer with an explicit synthetic tile until that gate is resolved.
  await page.route(/https:\/\/api\.mapbox\.com\/v4\/mapbox\.satellite\/\d+\/\d+\/[^?]+/, route => route.fulfill({ path: 'tests/fixtures/mapbox-satellite-test.png', contentType: 'image/png' }))
  page.context().on('response', r => {
    const u = new URL(r.url())
    if (u.hostname.endsWith('mapbox.com') && r.status() >= 400) mapboxFailures.push({ status: r.status(), path: u.pathname })
    if (u.pathname.includes('satellite')) {
      imageryResponses.push(`${u.pathname}: ${r.status()} ${r.headers()['content-type'] ?? ''}`)
      if (r.ok() && !u.pathname.endsWith('.json')) imageryTiles++
    }
    if (u.pathname.endsWith('/explore/shadows') && r.ok()) shadowRequests++
  })
  const login = await request.post('http://127.0.0.1:8001/auth/v1/token', { data: { email: 'fixture@example.invalid', password: 'fixture-only' } })
  const headers = { Authorization: `Bearer ${(await login.json()).access_token}` }
  const org = (await (await request.get('/api/v1/session', { headers })).json()).organisations[0].id
  await page.goto('/')
  await page.getByLabel('Email address').fill('fixture@example.invalid')
  await page.getByLabel('Password', { exact: true }).fill('fixture-only')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.getByRole('combobox', { name: 'Active organisation', exact: true }).selectOption(org)
  await page.getByRole('button', { name: 'Open Design Studio', exact: true }).click()
  await page.getByRole('button', { name: 'New project', exact: true }).click()
  const map = page.getByRole('region', { name: 'Explore site map', exact: true })
  await expect(map).toHaveAttribute('data-map-status', 'ready', { timeout: 45000 })
  // A compact known urban area; no coverage claim beyond this observed viewport.
  for (const [name, value] of Object.entries({ 'West longitude': '101.708', 'South latitude': '3.153', 'East longitude': '101.713', 'North latitude': '3.158' })) await page.getByLabel(name, { exact: true }).fill(value)
  await page.getByRole('button', { name: 'Apply coordinates', exact: true }).click()
  await page.getByRole('button', { name: 'Hide site controls', exact: true }).click()
  const explore3d = page.getByRole('button', { name: 'Explore in 3D', exact: true })
  if (await explore3d.isVisible()) await explore3d.click()
  await expect.poll(async () => Number(await map.getAttribute('data-rendered-buildings')), { timeout: 45000 }).toBeGreaterThan(0)
  const canvas = map.locator('canvas').first()
  await expect(canvas).toHaveAttribute('data-weather-frames', /[1-9]/)
  const layers = page.getByLabel('Mapbox map layers', { exact: true })
  await page.evaluate(() => {
    const note = document.createElement('div'); note.textContent = 'Synthetic imagery fixture · integration test only'
    note.style.cssText = 'position:fixed;bottom:0;left:20%;right:20%;z-index:99999;padding:5px;background:#fff2c8;color:#381724;text-align:center;font:12px sans-serif'; document.body.append(note)
  })
  await layers.locator('summary').first().click()
  await expect(layers.getByLabel('Mapbox 3D tree context', { exact: true })).toBeChecked()
  await layers.getByLabel('Mapbox 3D tree context', { exact: true }).uncheck()
  await layers.getByLabel('Mapbox 3D tree context', { exact: true }).check()
  await layers.getByRole('combobox', { name: 'Mapbox basemap', exact: true }).selectOption('satellite')
  try { await expect.poll(() => imageryTiles, { timeout: 30000 }).toBeGreaterThan(0) }
  catch {
    await mkdir('artifacts', { recursive: true }); await page.screenshot({ path: 'artifacts/mapbox-satellite-debug.png' })
    throw new Error(`Satellite tiles unavailable: ${await map.locator('.map-canvas').getAttribute('data-map-error')}; responses: ${imageryResponses.slice(0, 8).join('; ')}`)
  }
  await layers.locator('summary').first().click()
  const sun = page.getByRole('region', { name: 'Sun and shadow explorer', exact: true })
  await sun.getByLabel('Shadow date', { exact: true }).fill('2026-11-12')
  await sun.getByLabel('Shadow time', { exact: true }).fill('10:00')
  await expect(sun).toHaveAttribute('data-solar-phase', 'Daylight', { timeout: 20000 })
  await expect.poll(() => shadowRequests, { timeout: 20000 }).toBeGreaterThan(0)
  await sun.getByText('Environment · Clear', { exact: true }).click()
  await sun.getByRole('button', { name: 'Storm', exact: true }).click()
  await expect(canvas).toHaveAttribute('data-weather-animating', 'true')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(canvas).toHaveAttribute('data-weather-animating', 'false')
  await mkdir('artifacts', { recursive: true })
  await page.screenshot({ path: 'artifacts/mapbox-satellite-fixture-weather.png', animations: 'disabled' })
  await sun.getByRole('button', { name: 'Clear', exact: true }).click()
  await sun.getByLabel('Shadow time', { exact: true }).fill('23:00')
  await expect(sun).toHaveAttribute('data-solar-phase', 'Night')
  await page.screenshot({ path: 'artifacts/mapbox-night.png', animations: 'disabled' })
  await sun.getByLabel('Shadow time', { exact: true }).fill('10:00')
  await page.getByRole('button', { name: 'Review site trees', exact: true }).click()
  const trees = page.getByRole('region', { name: 'Site tree inventory', exact: true })
  await trees.getByRole('button', { name: 'Add tree record', exact: true }).click()
  await trees.getByLabel('Tree name', { exact: true }).fill('Mapbox project tree')
  await trees.getByLabel('Tree longitude', { exact: true }).fill('101.7105')
  await trees.getByLabel('Tree latitude', { exact: true }).fill('3.1555')
  await trees.getByLabel('Tree height in metres (optional)', { exact: true }).fill('10')
  await trees.getByLabel('Crown diameter in metres (optional)', { exact: true }).fill('6')
  await trees.getByLabel('Tree dimensions source or explicit assumption', { exact: true }).fill('Synthetic test dimensions')
  await trees.getByRole('button', { name: 'Apply tree record to draft', exact: true }).click()
  await trees.getByRole('button', { name: 'Apply tree decisions', exact: true }).click()
  await page.getByRole('button', { name: 'Close tree panel', exact: true }).click()
  await expect(canvas).toHaveAttribute('data-tree-models', '1')
  await layers.locator('summary').first().click()
  await layers.getByRole('combobox', { name: 'Mapbox basemap', exact: true }).selectOption('standard')
  await expect(canvas).toHaveAttribute('data-tree-models', '1')
  await layers.locator('summary').first().click()
  await page.screenshot({ path: 'artifacts/mapbox-standard-project-tree.png', animations: 'disabled' })
  await page.getByRole('button', { name: 'Show site controls', exact: true }).click()
  await page.getByRole('button', { name: 'Continue with this site', exact: true }).click()
  await page.getByLabel('Project name').fill('Mapbox live integration')
  await page.getByLabel('Client / customer').fill('Fixture')
  await page.getByRole('button', { name: 'Create project', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Mapbox live integration', exact: true })).toBeVisible()
  const saved = (await (await request.get(`/api/v1/organisations/${org}/projects?query=Mapbox%20live%20integration`, { headers })).json()).items[0]
  expect(saved.site.trees[0].name).toBe('Mapbox project tree')
  await page.getByRole('button', { name: 'Open design map', exact: true }).click()
  const studio = page.getByRole('region', { name: 'Geometry drawing canvas', exact: true })
  await expect(studio.locator('canvas').first()).toHaveAttribute('data-tree-models', '1', { timeout: 45000 })
  await page.getByLabel('Mapbox map layers', { exact: true }).locator('summary').first().click()
  await page.getByRole('combobox', { name: 'Mapbox basemap', exact: true }).selectOption('satellite')
  await expect(studio.locator('canvas').first()).toHaveAttribute('data-tree-models', '1')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: 'artifacts/mapbox-studio-phone.png', animations: 'disabled' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
  const studioCanvas = studio.locator('canvas').first()
  await studioCanvas.evaluate(node => {
    const extension = node.getContext('webgl2').getExtension('WEBGL_lose_context')
    if (!extension) throw new Error('Context-loss extension unavailable')
    window.restoreMapboxContext = () => extension.restoreContext()
    extension.loseContext(); delete node.dataset.treeModels
  })
  await expect(page.locator('.tree-workbench [role="status"]').filter({ hasText: 'graphics were interrupted' })).toContainText('Tree decisions are retained')
  await page.evaluate(() => window.restoreMapboxContext())
  await expect(studioCanvas).toHaveAttribute('data-tree-models', '1', { timeout: 30000 })
  expect((await (await request.get(`/api/v1/organisations/${org}/projects/${saved.id}`, { headers })).json()).revision).toBe(saved.revision)
  expect(errors).toEqual([])
  await writeFile('artifacts/mapbox-provider-coverage.json', JSON.stringify([...new Map(mapboxFailures.map(e => [`${e.status}:${e.path}`, e])).values()], null, 2))
  // Missing tiles are coverage gaps, not proof that the whole map is complete.
  expect(mapboxFailures.filter(e => e.status !== 404)).toEqual([])
})
