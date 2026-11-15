import { test, expect } from '@playwright/test'

test('L02 selected extent creates a new persisted project without changing existing geometry', async ({ page, request }) => {
  const login = await request.post(`${process.env.INFRA_TEST_API_URL || 'http://127.0.0.1:8000'}/auth/v1/token`, { data: { email: 'fixture@example.invalid', password: 'fixture-only' } })
  const headers = { Authorization: `Bearer ${(await login.json()).access_token}` }
  const org = (await (await request.get('/api/v1/session', { headers })).json()).organisations[0].id
  const base = `/api/v1/organisations/${org}/projects`
  const original = await (await request.post(base, { headers, data: { name: 'L02 protected original', purpose: 'contractor_proposal', stakeholder: 'Fixture', site: { bounds: [101.681, 3.131, 101.683, 3.133] } } })).json()
  const boundary = { type: 'Polygon', coordinates: [[[101.681,3.131],[101.683,3.131],[101.683,3.133],[101.681,3.133],[101.681,3.131]]] }
  const workspace = await (await request.post(`${base}/${original.id}/workspace`, { headers, data: { expected_revision: 0, boundary, boundary_provenance: 'estimated', boundary_source: 'Fixture only', targets: [], scenarios: { baseline: { name: 'Baseline', items: [] }, option_a: { name: 'A', items: [] }, option_b: { name: 'B', items: [] } } } })).json()
  expect(workspace.revision).toBe(1)
  // Compare like with like: GET adds derived read fields (for example site_area_m2) to the save response.
  const before = await (await request.get(`${base}/${original.id}/workspace`, { headers })).json()
  await page.goto('/')
  await page.getByLabel('Email address').fill('fixture@example.invalid')
  await page.getByLabel('Password', { exact: true }).fill('fixture-only')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.getByRole('button', { name: /L02 protected original/ }).click()
  await page.getByRole('navigation').getByRole('button', { name: 'Explore Map', exact: true }).click()
  const bounds = [100.954,4.382,100.962,4.39]
  for (const [i, label] of ['West longitude','South latitude','East longitude','North latitude'].entries()) await page.getByLabel(label, { exact: true }).fill(String(bounds[i]))
  await page.getByRole('button', { name: 'Apply coordinates', exact: true }).click()
  await page.getByRole('button', { name: 'Continue with this site', exact: true }).click()
  await page.getByLabel('Project name', { exact: false }).fill('L02 new selected site')
  await page.getByLabel('Client / customer', { exact: false }).fill('New client')
  await page.getByRole('button', { name: 'Create project', exact: true }).click()
  // A new project opens in the immersive studio (h2 title); the project page h1 sits behind it, inert.
  await expect(page.getByRole('heading', { level: 2, name: 'L02 new selected site', exact: true })).toBeVisible()
  await expect(page.locator('h1', { hasText: 'L02 new selected site' }).locator('xpath=ancestor-or-self::*[@inert]')).toHaveCount(1)
  const saved = (await (await request.get(`${base}?query=L02%20new%20selected%20site`, { headers })).json()).items[0]
  expect(saved.site.bounds).toEqual(bounds)
  expect(saved.id).not.toBe(original.id)
  expect((await (await request.get(`${base}/${saved.id}/workspace`, { headers })).json()).revision).toBe(0)
  expect(await (await request.get(`${base}/${original.id}/workspace`, { headers })).json()).toEqual(before)
  expect((await (await request.get(`${base}/${original.id}`, { headers })).json()).revision).toBe(1)
})
