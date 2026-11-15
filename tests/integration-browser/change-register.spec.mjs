import { test, expect } from '@playwright/test'
import { openProjectRecords } from '../studio-helpers.mjs'
import { mkdir, readFile } from 'node:fs/promises'

// K03/L26/K02: real disposable PostGIS + test-signed identity (not Supabase Auth acceptance).
const API = process.env.INFRA_TEST_API_URL || 'http://127.0.0.1:8000'
const square = (east) => ({ type: 'Polygon', coordinates: [[[101.6812, 3.1312], [east, 3.1312], [east, 3.1313], [101.6812, 3.1313], [101.6812, 3.1312]]] })

test('revised work area shows changed-since-issue impact and a reviewed change request', async ({ page, request }) => {
  test.setTimeout(120000)
  await mkdir('test-results/change-register', { recursive: true })
  const login = await request.post(`${API}/auth/v1/token`, { data: { email: 'fixture@example.invalid', password: 'fixture-only' } })
  const headers = { Authorization: `Bearer ${(await login.json()).access_token}` }
  const org = (await (await request.get('/api/v1/session', { headers })).json()).organisations[0].id
  const name = `Terrace change ${Date.now()}`
  const project = await (await request.post(`/api/v1/organisations/${org}/projects`, { headers, data: { name, purpose: 'contractor_proposal', stakeholder: 'Client', problem: 'Hot terrace', intended_users: 'Staff', desired_outcome: 'Shaded paving', use_periods: 'Weekday lunch', site: { bounds: [101.681, 3.131, 101.683, 3.133] } } })).json()
  const base = `/api/v1/organisations/${org}/projects/${project.id}`
  const rate = await (await request.post(`/api/v1/organisations/${org}/rates`, { headers, data: { code: `PAVE${Date.now()}`, description: 'Fixture paving (test only)', unit: 'm2', basis: 'cost', amount: '100', effective_date: '2026-11-01', valid_until: '2027-06-30', source_note: 'Browser fixture only; not a market price' } })).json()
  const itemId = crypto.randomUUID()
  const design = (revision, east) => ({ expected_revision: revision, boundary: square(101.6816), boundary_provenance: 'estimated', boundary_source: 'Fixture', targets: [{ id: crypto.randomUUID(), name: 'Terrace', geometry: square(101.6816), source_note: 'Fixture', provenance: 'estimated' }], scenarios: { baseline: { name: 'Baseline', items: [] }, option_a: { name: 'Option A', items: [{ id: itemId, name: 'Terrace paving', kind: 'area', geometry: square(east), source_note: 'Fixture', provenance: 'estimated', rate_id: rate.id }] }, option_b: { name: 'Option B', items: [] } } })
  expect((await request.post(`${base}/workspace`, { headers, data: design(0, 101.6813) })).ok()).toBeTruthy()
  const estimate = async (revision) => (await (await request.post(`${base}/estimates`, { headers, data: { expected_revision: revision, request_key: crypto.randomUUID(), scenario: 'option_a', method: 'markup', percent: 20 } })).json())
  const first = await estimate(1)
  const valid = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10)
  const issued = await request.post(`${base}/proposals`, { headers, data: { request_key: crypto.randomUUID(), estimate_id: first.id, expected_project_revision: 1, preferred_option: 'option_a', criteria: ['Scope'], review_notes: 'Reviewed', customer_narrative: 'Terrace paving', assumptions: 'Site check', exclusions: 'No shade claims', confirmed: true, valid_until: valid, programme: 'After approval', maintenance: 'Not included', pricing_override_reason: 'Fixture review' } })
  expect(issued.ok(), await issued.text()).toBeTruthy()
  const v1 = await issued.json()
  // Revise the work area (about double) and recalculate.
  expect((await request.post(`${base}/workspace`, { headers, data: design(1, 101.6814) })).ok()).toBeTruthy()
  await estimate(2)

  await page.goto(`/studio/organisations/${org}/projects/${project.id}`)
  await page.getByLabel('Email address').fill('fixture@example.invalid')
  await page.getByLabel('Password', { exact: true }).fill('fixture-only')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await openProjectRecords(page)
  const panel = page.getByRole('region', { name: 'Change register' })
  await expect(panel).toBeVisible({ timeout: 15000 })
  await expect(panel.getByText(/Compared with issued proposal v1/)).toContainText('1 item change(s)')
  const row = panel.getByRole('row', { name: /Terrace paving/ })
  await expect(row).toContainText('changed')
  await expect(panel.getByText(/Issued selling total MYR .*; current MYR .*\(difference MYR /)).toBeVisible()

  await panel.getByText('Record a change request').click()
  await panel.getByLabel('Requested by').fill('Client facilities lead')
  await panel.getByLabel('Requested on').fill('2026-11-12')
  await panel.getByLabel('Reason').fill('Extend terrace paving east')
  await panel.getByLabel('Proposed additions').fill('One additional bay of paving')
  await panel.getByLabel('Time effect (stated assumption)').fill('+2 working days (contractor assumption)')
  await panel.getByRole('button', { name: 'Record change request' }).click()
  await expect(panel.getByText('Change request recorded as prepared (internal).')).toBeVisible()
  await panel.getByText(/\[Prepared \(internal\)\] 2026-11-12/).click()
  await panel.getByLabel('New state').selectOption('reviewed')
  await panel.getByLabel('Note (required)').fill('Quantities and price checked')
  await panel.getByRole('button', { name: 'Record state change' }).click()
  await expect(panel.getByText(/Impact frozen at internal review/)).toBeVisible()
  // A client outcome cannot be recorded without evidence.
  await panel.getByLabel('New state').selectOption('sent')
  await panel.getByLabel('Note (required)').fill('Sent summary')
  await panel.getByLabel('Sent by (method)').fill('Email')
  await panel.getByRole('button', { name: 'Record state change' }).click()
  await expect(panel.getByText(/\[Sent to client\]/)).toBeVisible()
  await panel.getByLabel('New state').selectOption('acknowledged')
  await panel.getByLabel('Note (required)').fill('Client agreed verbally')
  await panel.getByRole('button', { name: 'Record state change' }).click()
  await expect(panel.getByRole('alert')).toContainText('external person, date and attached evidence')
  await page.screenshot({ path: 'test-results/change-register/register-desktop.png', fullPage: true })

  const download = page.waitForEvent('download')
  await panel.getByRole('button', { name: 'Download change register (CSV)' }).click()
  const csv = await readFile(await (await download).path(), 'utf8')
  expect(csv).toContain('Extend terrace paving east')
  expect(csv).toContain(',sent,')
  // Issued v1 is unchanged.
  const artifacts = await (await request.get(`${base}/artifacts`, { headers })).json()
  const kept = (artifacts.items ?? artifacts).find((a) => a.id === v1.id)
  expect(kept.payload.version).toBe(1)
  expect(kept.payload.selected_scope[0].quantity).toBe(v1.payload.selected_scope[0].quantity)
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(panel).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
  await page.screenshot({ path: 'test-results/change-register/register-narrow.png', fullPage: true })
})
