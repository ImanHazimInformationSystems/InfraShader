import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { openStudioTool } from '../studio-helpers.mjs'

// Refinement WP1 (S06/S07/L04 reliability) on the real disposable PostGIS test API.
// A failed save must read as failed (not merely "unsaved"), keep the draft, show a short server
// reference, and a later successful save must clear the failure. Server failures are injected
// with Playwright routing; the recovery save goes to the real API.
const API = process.env.INFRA_TEST_API_URL || 'http://127.0.0.1:8000'
const shots = 'test-results/reliability'
const point = (x, y) => ({ type: 'Point', coordinates: [x, y] })
const box = (w, s, e, n) => ({ type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] })

test('failed, conflicting and recovered saves are distinguishable and keep the draft', async ({ page, request }) => {
  test.setTimeout(180000)
  await mkdir(shots, { recursive: true })
  const stamp = Date.now()
  const login = await request.post(`${API}/auth/v1/token`, { data: { email: 'fixture@example.invalid', password: 'fixture-only' } })
  const headers = { Authorization: `Bearer ${(await login.json()).access_token}` }
  const org = (await (await request.get('/api/v1/session', { headers })).json()).organisations[0].id
  const future = new Date(Date.now() + 120 * 864e5).toISOString().slice(0, 10)
  const rate = await request.post(`/api/v1/organisations/${org}/rates`, { headers, data: { code: `RBENCH${stamp}`, description: 'Bench (fixture)', unit: 'item', amount: '500', basis: 'cost', effective_date: '2026-11-01', valid_until: future, source_note: 'Browser fixture only; not a market price' } })
  expect(rate.ok(), await rate.text()).toBeTruthy()
  const project = await (await request.post(`/api/v1/organisations/${org}/projects`, { headers, data: { name: `Reliability ${stamp}`, purpose: 'contractor_proposal', stakeholder: 'Client', problem: 'Plain lawn', intended_users: 'Residents', desired_outcome: 'Seating', use_periods: 'Evenings', site: { bounds: [101.681, 3.131, 101.683, 3.133] } } })).json()
  const endpoint = `/api/v1/organisations/${org}/projects/${project.id}`
  const bench = { id: crypto.randomUUID(), name: 'Bench R', kind: 'bench', category: 'Furniture', geometry: point(101.6816, 3.1318), source_note: 'Browser fixture only', provenance: 'estimated' }
  const created = await request.post(`${endpoint}/workspace`, { headers, data: { expected_revision: 0, boundary: box(101.6812, 3.1312, 101.6828, 3.1328), boundary_provenance: 'estimated', boundary_source: 'Fixture', targets: [], scenarios: { baseline: { name: 'Baseline', items: [] }, option_a: { name: 'Option A', items: [bench] }, option_b: { name: 'Option B', items: [] } } } })
  expect(created.ok(), await created.text()).toBeTruthy()

  await page.goto(`/studio/organisations/${org}/projects/${project.id}`)
  await page.getByLabel('Email address').fill('fixture@example.invalid')
  await page.getByLabel('Password', { exact: true }).fill('fixture-only')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  const entry = page.getByRole('button', { name: /^(Open|Close) design map$/ })
  await expect(entry).toBeVisible({ timeout: 30000 })
  if ((await entry.textContent()).includes('Open')) await entry.click()
  const status = page.locator('.studio-save-state')
  await expect(status).toHaveText('All changes saved (version 1)', { timeout: 30000 })

  // Make a real draft change: price the bench (applied to the draft only).
  await openStudioTool(page, 'Layout')
  const inspector = page.getByRole('complementary', { name: 'Studio working panel' })
  await inspector.getByRole('button', { name: 'Select', exact: true }).click()
  await inspector.getByRole('button', { name: /^Bench R/ }).first().click()
  await page.getByRole('region', { name: 'Selected item' }).getByRole('button', { name: 'Price this item' }).click()
  const dialog = page.getByRole('dialog', { name: 'Price Bench R' })
  await dialog.getByRole('radio', { name: new RegExp(`RBENCH${stamp} v1`) }).check()
  await dialog.getByRole('button', { name: 'Apply to draft' }).click()
  await expect(dialog).toBeHidden()
  await expect(status).toHaveText('Unsaved changes')
  const save = page.getByRole('button', { name: 'Save design', exact: true })

  // 1. Server failure: readable message with a short reference; the draft is not discarded.
  await page.route(`**${endpoint}/workspace`, (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({ status: 500, contentType: 'application/json', headers: { 'X-Request-ID': 'feedc0de-1111-2222' }, body: JSON.stringify({ error: { code: 'internal_error', message: 'The operation failed on the server. Retry shortly; if it continues, report the reference.' }, request_id: 'feedc0de-1111-2222' }) })
      : route.continue(),
  )
  await save.click()
  await expect(status).toHaveText('Save failed: not saved')
  await expect(status).toHaveAttribute('data-tone', 'warning')
  await expect(page.getByRole('alert').filter({ hasText: 'Reference: feedc0de.' })).toContainText('Your unsaved changes are still in this tab.')
  await page.screenshot({ path: `${shots}/save-failed.png` })

  // 2. Revision conflict is named separately from a generic failure.
  await page.unroute(`**${endpoint}/workspace`)
  await page.route(`**${endpoint}/workspace`, (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: { code: 'revision_conflict', message: 'The workspace changed. Reload before saving again.' } }) })
      : route.continue(),
  )
  await save.click()
  await expect(status).toHaveText('Not saved: newer version exists')

  // 3. A slow or unreachable server is not reported as success; then the real save recovers.
  await page.unroute(`**${endpoint}/workspace`)
  await page.route(`**${endpoint}/workspace`, (route) => (route.request().method() === 'POST' ? route.abort('connectionrefused') : route.continue()))
  await save.click()
  await expect(status).toHaveText('Save failed: not saved')
  await expect(page.getByRole('alert').filter({ hasText: 'could not be reached' })).toBeVisible()
  await page.unroute(`**${endpoint}/workspace`)
  await save.click()
  await expect(status).toHaveText('All changes saved (version 2)', { timeout: 20000 })
  await expect(status).not.toHaveAttribute('data-tone', 'warning')
  const saved = await (await request.get(`${endpoint}/workspace`, { headers })).json()
  expect(saved.revision).toBe(2)
})
