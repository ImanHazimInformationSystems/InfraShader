import { test, expect } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { openDetailedWorkspace, openStudioTool, openListView } from '../studio-helpers.mjs'

test('roads and painted ground retain their looks in geographic and metric 3D terrain', async ({ page, request }, testInfo) => {
  test.setTimeout(150000); page.setDefaultTimeout(20000)
  const live = Boolean(testInfo.config.metadata.liveTextures), suffix = live ? '-live' : ''
  let tiles = 0
  const errors = []; page.on('pageerror', error => errors.push(error.message.replace(/access_token=[^&\s]+/g, 'access_token=[redacted]')))
  page.on('response', response => { const url = new URL(response.url()); if (url.hostname.endsWith('mapbox.com') && response.ok() && /\.pbf|\.mvt|\/tiles\//.test(url.pathname)) tiles++ })
  const identity = await (await request.post('http://127.0.0.1:8001/auth/v1/token', { data: { email: 'fixture@example.invalid', password: 'fixture-only' } })).json()
  const headers = { Authorization: `Bearer ${identity.access_token}` }
  const org = (await (await request.get('/api/v1/session', { headers })).json()).organisations[0].id
  const project = await (await request.post(`/api/v1/organisations/${org}/projects`, { headers, data: { name: '3D surface textures', purpose: 'contractor_proposal', stakeholder: 'Synthetic test', site: { bounds: [101.681, 3.131, 101.6816, 3.1316] } } })).json()
  const endpoint = `/api/v1/organisations/${org}/projects/${project.id}`
  const boundary = { type: 'Polygon', coordinates: [[[101.681, 3.131], [101.6816, 3.131], [101.6816, 3.1316], [101.681, 3.1316], [101.681, 3.131]]] }
  const roads = ['dirt', 'pavement', 'stone', 'gravel'].map((surface, i) => ({ id: randomUUID(), name: `${surface} road`, kind: 'area', status: 'proposed', geometry: null, source_note: 'Synthetic road', provenance: 'estimated', road: { mode: 'line', surface, width_m: 5, points: [[101.6811, 3.13110 + i * .00013], [101.6815, 3.13110 + i * .00013]] } }))
  const initial = { expected_revision: 0, boundary, boundary_source: 'Synthetic square', boundary_provenance: 'estimated', targets: [], scenarios: { baseline: { name: 'Baseline', items: [] }, option_a: { name: 'A', items: roads, ground_paint: [
    { texture: 'lawn', radius_m: 50, points: [[101.6813, 3.1313]] }, { texture: 'dry', radius_m: 12, points: [[101.68115, 3.1315]] }, { texture: 'deep', radius_m: 12, points: [[101.68145, 3.1312]] }, { texture: 'erase', radius_m: 3, points: [[101.6813, 3.1313]] },
  ] }, option_b: { name: 'B', items: [] } } }
  expect((await request.post(`${endpoint}/workspace`, { headers, data: initial })).ok()).toBeTruthy()
  const original = await (await request.get(`${endpoint}/workspace`, { headers })).json()
  await page.goto('/'); await page.getByLabel('Email address').fill('fixture@example.invalid'); await page.getByLabel('Password', { exact: true }).fill('fixture-only'); await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  const organisation = page.getByLabel('Active organisation', { exact: true }); await expect(organisation).toBeVisible(); if (await organisation.inputValue() !== org) await organisation.selectOption(org)
  await page.getByRole('button', { name: /3D surface textures/ }).click(); await openDetailedWorkspace(page); await page.getByLabel('Embed design on map', { exact: true }).check()
  const studio = page.getByRole('region', { name: 'Studio canvas', exact: true })
  const canvas = page.getByRole('region', { name: 'Geometry drawing canvas', exact: true }).locator('.mapboxgl-canvas')
  await studio.getByRole('button', { name: '3D design scene', exact: true }).click()
  await expect(canvas).toHaveAttribute('data-road-textures', 'dirt,gravel,pavement,stone')
  await expect(canvas).toHaveAttribute('data-ground-texture', 'true')
  if (live) await expect.poll(() => tiles, { timeout: 45000 }).toBeGreaterThan(0)
  await mkdir('artifacts', { recursive: true })
  await canvas.screenshot({ path: `artifacts/scene-textures-flat${suffix}.png` })
  await studio.getByRole('button', { name: 'Site map', exact: true }).click()
  await studio.getByRole('button', { name: '3D design scene', exact: true }).click()
  await expect(canvas).toHaveAttribute('data-ground-texture', 'true')
  expect((await (await request.get(`${endpoint}/workspace`, { headers })).json()).data).toEqual(original.data)
  // Now add bounded terrain through the normal panel, retaining all saved looks.
  const terrain = page.getByRole('region', { name: 'Terrain builder', exact: true })
  await terrain.getByLabel('Surface source / assumption', { exact: true }).fill('Synthetic flat start for texture-drape test')
  await terrain.getByLabel('I confirm this flat starting assumption.', { exact: true }).check()
  await terrain.getByRole('button', { name: 'Prepare terrain', exact: true }).click()
  await expect(terrain.getByLabel('Terrain brush size', { exact: true })).toBeEnabled()
  await terrain.getByLabel('Terrain brush speed', { exact: true }).press('End')
  const changed = page.waitForResponse(response => response.url().endsWith('/object-preview') && response.request().method() === 'POST')
  await terrain.getByRole('button', { name: 'Apply brush at site centre (1 second)', exact: true }).click(); expect((await changed).ok()).toBeTruthy()
  await expect(canvas).toHaveAttribute('data-road-textures', 'dirt,gravel,pavement,stone')
  await expect(canvas).toHaveAttribute('data-ground-texture', 'true')
  await page.getByRole('button', { name: 'Map view', exact: true }).click()
  await openStudioTool(page, 'Terrain')
  await terrain.getByRole('button', { name: 'Explore', exact: true }).click()
  await page.getByRole('button', { name: 'Collapse working panel', exact: true }).click()
  await page.screenshot({ path: `artifacts/scene-textures-terrain${suffix}.png` })
  await openListView(page)
  await page.getByLabel('Embed design on map', { exact: true }).uncheck()
  const local = studio.getByRole('img', { name: 'Interactive 3D object scene', exact: true })
  await expect(local).toHaveAttribute('data-road-textures', 'dirt,gravel,pavement,stone')
  await expect(local).toHaveAttribute('data-ground-texture', 'true')
  await local.screenshot({ path: `artifacts/scene-textures-metric${suffix}.png` })
  const ground = page.getByRole('region', { name: 'Ground geometry workspace', exact: true })
  await ground.getByRole('button', { name: 'B', exact: true }).click()
  await expect(local).toHaveAttribute('data-road-textures', '')
  await expect(local).toHaveAttribute('data-ground-texture', 'false')
  await ground.getByRole('button', { name: 'A', exact: true }).click()
  await expect(local).toHaveAttribute('data-ground-texture', 'true')
  await page.getByRole('button', { name: 'Validate & save workspace', exact: true }).click()
  await expect(page.getByText('Workspace revision 2 saved.', { exact: false })).toBeVisible()
  const saved = await (await request.get(`${endpoint}/workspace`, { headers })).json()
  expect(saved.data.scenarios.option_a.ground_paint).toEqual(original.data.scenarios.option_a.ground_paint)
  expect(saved.data.scenarios.option_a.items.map(item => item.quantity)).toEqual(original.data.scenarios.option_a.items.map(item => item.quantity))
  await page.reload(); await openDetailedWorkspace(page); await page.getByLabel('Embed design on map', { exact: true }).check(); await studio.getByRole('button', { name: '3D design scene', exact: true }).click()
  await expect(canvas).toHaveAttribute('data-road-textures', 'dirt,gravel,pavement,stone')
  await expect(canvas).toHaveAttribute('data-ground-texture', 'true')
  expect(errors).toEqual([])
})
