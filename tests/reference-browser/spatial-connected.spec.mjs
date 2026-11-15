import { test, expect } from '@playwright/test'
import { openListView, openStudioTool } from '../studio-helpers.mjs'
import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'

async function fixture(request, name, reader = false) {
  const login = await request.post('http://127.0.0.1:8001/auth/v1/token', {
    data: { email: 'fixture@example.invalid', password: 'fixture-only' },
  })
  const identity = await login.json()
  const headers = { Authorization: `Bearer ${identity.access_token}` }
  const org = (await (await request.get('/api/v1/session', { headers })).json()).organisations[0].id
  const response = await request.post(`/api/v1/organisations/${org}/projects`, {
    headers,
    data: {
      name,
      purpose: 'contractor_proposal',
      stakeholder: 'Synthetic browser fixture',
      site: { bounds: [101.681, 3.131, 101.683, 3.133] },
    },
  })
  expect(response.status()).toBe(201)
  const project = await response.json()
  const endpoint = `/api/v1/organisations/${org}/projects/${project.id}`
  const polygon = (w, s, e, n) => ({
    type: 'Polygon',
    coordinates: [
      [
        [w, s],
        [e, s],
        [e, n],
        [w, n],
        [w, s],
      ],
    ],
  })
  const item = {
    id: randomUUID(),
    name: 'Proposed paving',
    kind: 'area',
    geometry: polygon(101.6818, 3.1318, 101.6822, 3.1322),
    provenance: 'estimated',
    source_note: 'Synthetic map trace; not surveyed',
  }
  const existing = {
    id: randomUUID(),
    name: 'Existing seat',
    kind: 'bench',
    status: 'existing',
    geometry: { type: 'Point', coordinates: [101.6817, 3.1317] },
    provenance: 'estimated',
    source_note: 'Synthetic existing context',
  }
  const data = {
    expected_revision: 0,
    boundary: polygon(101.681, 3.131, 101.683, 3.133),
    boundary_source: 'Synthetic site boundary',
    boundary_provenance: 'estimated',
    targets: [
      {
        id: randomUUID(),
        name: 'Shared target',
        geometry: polygon(101.6815, 3.1315, 101.6825, 3.1325),
        provenance: 'estimated',
        source_note: 'Synthetic target outline',
      },
    ],
    scenarios: {
      baseline: { name: 'Baseline', items: [existing] },
      option_a: { name: 'A', items: [item] },
      option_b: { name: 'B', items: [] },
    },
  }
  expect((await request.post(`${endpoint}/workspace`, { headers, data })).ok()).toBeTruthy()
  if (reader)
    expect(
      (
        await request.put(`${endpoint}/access`, {
          headers,
          data: { user_id: identity.user.id, capabilities: ['read_project'] },
        })
      ).ok(),
    ).toBeTruthy()
  return { headers, org, endpoint, project, data }
}

async function openL04(page, org, name) {
  await page.goto('/')
  await page.getByLabel('Email address').fill('fixture@example.invalid')
  await page.getByLabel('Password', { exact: true }).fill('fixture-only')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  const organisation = page.getByRole('combobox', { name: 'Active organisation', exact: true })
  await expect(organisation).toBeVisible()
  if ((await organisation.inputValue()) !== org) await organisation.selectOption(org)
  await page.getByRole('button', { name: 'Open Design Studio', exact: true }).click()
  // Design Studio catalogue areas are in the collapsed Feature previews group.
  const mainNav = page.getByRole('navigation', { name: 'Main navigation' })
  await mainNav.getByText(/FEATURE PREVIEWS/).click()
  await mainNav.getByRole('button', { name: 'Design workspace', exact: true }).click()
  await page.getByLabel('Project context', { exact: true }).selectOption({ label: name })
  await expect(page.locator('[data-feature-id="L04"]')).toContainText('Connected spatial tools')
  await expect(page.getByRole('button', { name: 'Apply to preview', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Open spatial editor', exact: true }).click()
  await openListView(page)
  await page.getByLabel('Embed design on map', { exact: true }).uncheck()
  await page.getByRole('group', { name: 'Scenario selection' }).getByRole('button', { name: 'A', exact: true }).click()
}

test('L04 connected editing retains metric quantities, site layers, history and independent options', async ({
  page,
  request,
}) => {
  test.setTimeout(120000)
  const { org, endpoint, headers, data } = await fixture(request, 'Connected spatial project')
  await openL04(page, org, 'Connected spatial project')
  const canvas = page.getByRole('region', { name: 'Studio canvas', exact: true })
  await page.getByRole('button', { name: 'Edit target', exact: true }).click()
  await canvas.getByRole('button', { name: '3D design scene', exact: true }).click()
  await expect(
    canvas.getByRole('status').filter({ hasText: '2 site/target outlines' }),
  ).toBeVisible()
  await expect(canvas.getByRole('status').filter({ hasText: 'Selected:' })).toContainText(
    'Shared target',
  )
  await page.getByLabel('Show boundary layer', { exact: true }).uncheck()
  await expect(
    canvas.getByRole('status').filter({ hasText: '1 site/target outlines' }),
  ).toBeVisible()
  await page.getByLabel('Show target layer', { exact: true }).uncheck()
  await expect(
    canvas.getByRole('status').filter({ hasText: '0 site/target outlines' }),
  ).toBeVisible()
  await page.getByLabel('Show boundary layer', { exact: true }).check()
  await page.getByLabel('Show target layer', { exact: true }).check()
  await canvas.getByRole('button', { name: 'Site map', exact: true }).click()
  const tools = page
    .locator('details')
    .filter({ has: page.locator('summary', { hasText: 'Spatial editing tools' }) })
  await tools.getByRole('checkbox', { name: 'Select Proposed paving', exact: true }).check()
  await tools.getByLabel('East offset (m)', { exact: true }).fill('5')
  await tools.getByRole('button', { name: 'Apply spatial operation', exact: true }).click()
  await expect(tools.getByRole('status')).toContainText('Validated operation')
  await page.getByRole('button', { name: 'Validate & save workspace', exact: true }).click()
  await expect(page.getByText('Workspace revision 2 saved.', { exact: false })).toBeVisible()
  const saved = await (await request.get(`${endpoint}/workspace`, { headers })).json()
  expect(saved.data.metric_crs).toBe('EPSG:32647')
  const paving = saved.data.scenarios.option_a.items.find((i) => i.name === 'Proposed paving')
  expect(paving.geometry.coordinates[0][0][0]).toBeGreaterThan(
    data.scenarios.option_a.items[0].geometry.coordinates[0][0][0],
  )
  expect(paving.quantity.value).toBeGreaterThan(1900)
  expect(paving.rate_id).toBeNull()
  expect(saved.data.scenarios.option_b.items).toEqual(saved.data.scenarios.baseline.items)
  const history = await (await request.get(`${endpoint}/workspace/history`, { headers })).json()
  expect(history.items.map((entry) => entry.revision)).toEqual([2, 1])
  expect(
    history.items[1].data.scenarios.option_a.items.find((i) => i.id === paving.id).geometry,
  ).toEqual(data.scenarios.option_a.items[0].geometry)
  await canvas.getByRole('button', { name: '3D design scene', exact: true }).click()
  await expect(
    canvas.getByRole('status').filter({ hasText: '2 site/target outlines' }),
  ).toBeVisible()
  await mkdir('artifacts', { recursive: true })
  await page.getByLabel('Show work layer', { exact: true }).uncheck()
  await expect(canvas.getByRole('status').filter({ hasText: '0 work geometries' })).toBeVisible()
  await page.getByLabel('Show work layer', { exact: true }).check()
  await expect(canvas.getByRole('status').filter({ hasText: '2 work geometries' })).toBeVisible()
  await canvas.screenshot({ path: 'artifacts/l04-connected-context.png' })
  await page.getByRole('button', { name: 'Edit Existing seat', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Baseline', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(canvas.getByRole('status').filter({ hasText: 'Selected:' })).toContainText(
    'Selected: Existing seat',
  )
  await canvas.getByRole('button', { name: 'Site map', exact: true }).click()
  await expect(canvas.getByRole('status').filter({ hasText: 'Selected:' })).toContainText(
    'Existing seat',
  )
  await page.getByRole('button', { name: 'Map view', exact: true }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  await openStudioTool(page, 'Layout')
  await page.screenshot({ path: 'artifacts/l04-connected-phone.png', animations: 'disabled' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
})

test('L04 project readers can view scenarios, inspect and toggle context without mutation', async ({
  page,
  request,
}) => {
  test.setTimeout(90000)
  const { org, endpoint, headers, data } = await fixture(request, 'Spatial read only project', true)
  await openL04(page, org, 'Spatial read only project')
  await expect(page.getByText('Read-only: you can view this design', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Edit Proposed paving', exact: true }).click()
  await expect(page.getByLabel('Geometry name', { exact: true })).toHaveValue('Proposed paving')
  await expect(page.getByLabel('Geometry name', { exact: true })).toBeDisabled()
  const canvas = page.getByRole('region', { name: 'Studio canvas', exact: true })
  await canvas.getByRole('button', { name: '3D design scene', exact: true }).click()
  await expect(
    canvas.getByRole('status').filter({ hasText: '2 site/target outlines' }),
  ).toBeVisible()
  await page.getByLabel('Show boundary layer', { exact: true }).uncheck()
  await expect(
    canvas.getByRole('status').filter({ hasText: '1 site/target outlines' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Validate & save workspace', exact: true }),
  ).toBeDisabled()
  await expect(
    page.getByRole('button', { name: 'Apply spatial operation', exact: true }),
  ).toBeDisabled()
  expect(
    (
      await request.post(`${endpoint}/workspace`, {
        headers,
        data: { ...data, expected_revision: 1 },
      })
    ).status(),
  ).toBe(403)
  expect((await (await request.get(`${endpoint}/workspace`, { headers })).json()).revision).toBe(1)
  await canvas.getByRole('button', { name: 'Site map', exact: true }).click()
  await page.getByRole('group', { name: 'Scenario selection' }).getByRole('button', { name: 'B', exact: true }).click()
  await expect(canvas.getByRole('group', { name: 'Option being edited' }).getByRole('button', { name: 'Edit B', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(canvas.getByRole('status').filter({ hasText: 'Selected:' })).toContainText(
    'Selected: None',
  )
  await mkdir('artifacts', { recursive: true })
  await page.screenshot({ path: 'artifacts/l04-reader.png', fullPage: true })
})
