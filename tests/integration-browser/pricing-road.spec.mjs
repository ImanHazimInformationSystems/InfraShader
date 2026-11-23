import { test, expect } from '@playwright/test'
import { openStudioTool } from '../studio-helpers.mjs'

// Refinement WP2 2.3 (L13/L31) on the real disposable PostGIS test API: a road saved without
// material layers cannot take a single rate (the backend refuses it). The Price dialog explains
// why, offers no rate list, and links directly to the layer definition in Materials.
const API = process.env.INFRA_TEST_API_URL || 'http://127.0.0.1:8000'
const box = (w, s, e, n) => ({ type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] })

test('a road without layers explains layer pricing and opens Materials for that road', async ({ page, request }) => {
  test.setTimeout(180000)
  const stamp = Date.now()
  const login = await request.post(`${API}/auth/v1/token`, { data: { email: 'fixture@example.invalid', password: 'fixture-only' } })
  const headers = { Authorization: `Bearer ${(await login.json()).access_token}` }
  const org = (await (await request.get('/api/v1/session', { headers })).json()).organisations[0].id
  const project = await (await request.post(`/api/v1/organisations/${org}/projects`, { headers, data: { name: `Road layers ${stamp}`, purpose: 'contractor_proposal', stakeholder: 'Client', problem: 'Unpaved access', intended_users: 'Residents', desired_outcome: 'Paved driveway', use_periods: 'Daily', site: { bounds: [101.681, 3.131, 101.683, 3.133] } } })).json()
  const endpoint = `/api/v1/organisations/${org}/projects/${project.id}`
  const road = { id: crypto.randomUUID(), name: `Access road ${stamp}`, kind: 'area', status: 'proposed', geometry: null, road: { mode: 'line', width_m: 4, points: [[101.6814, 3.1316], [101.6824, 3.1316]] }, source_note: 'Browser fixture only; not surveyed', provenance: 'estimated' }
  const saved = await request.post(`${endpoint}/workspace`, { headers, data: { expected_revision: 0, boundary: box(101.6812, 3.1312, 101.6828, 3.1328), boundary_provenance: 'estimated', boundary_source: 'Fixture', targets: [], scenarios: { baseline: { name: 'Baseline', items: [] }, option_a: { name: 'Option A', items: [road] }, option_b: { name: 'Option B', items: [] } } } })
  expect(saved.ok(), await saved.text()).toBeTruthy()

  await page.goto(`/studio/organisations/${org}/projects/${project.id}`)
  await page.getByLabel('Email address').fill('fixture@example.invalid')
  await page.getByLabel('Password', { exact: true }).fill('fixture-only')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  const entry = page.getByRole('button', { name: /^(Open|Close) design map$/ })
  await expect(entry).toBeVisible({ timeout: 30000 })
  if ((await entry.textContent()).includes('Open')) await entry.click()
  await openStudioTool(page, 'Pricing')
  const board = page.getByRole('region', { name: 'Pricing', exact: true })
  await board.getByRole('button', { name: `Price ${road.name}` }).click()

  const dialog = page.getByRole('dialog', { name: `Price ${road.name}` })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('heading', { name: 'This road has no material layers yet' })).toBeVisible()
  await expect(dialog).toContainText('priced layer by layer')
  // No single-rate choice is offered for a road, so the backend refusal cannot be triggered here.
  await expect(dialog.getByRole('radio')).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: 'Apply to draft' })).toBeDisabled()
  await dialog.getByRole('button', { name: 'Define layers in Materials' }).click()
  await expect(dialog).toBeHidden()
  const schedule = page.getByLabel('Schedule item')
  await expect(schedule).toBeVisible()
  await expect(schedule.locator('option:checked')).toContainText(road.name)
})
