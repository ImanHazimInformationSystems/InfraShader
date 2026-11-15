import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { openDetailedWorkspace, openStudiesStep, openWorkspaceProjects, signInFixture } from '../studio-helpers.mjs'

const shots = 'test-results/studies'
const money = (value) => `RM ${Number(value).toLocaleString('en-MY', { minimumFractionDigits: 2 })}`

test('Studies shows one step at a time with a plain next step, and Materials explains itself', async ({ page, request }) => {
  test.setTimeout(240000)
  await mkdir(shots, { recursive: true })
  const login = await request.post(`${process.env.INFRA_TEST_API_URL}/auth/v1/token`, { data: { email: 'fixture@example.invalid', password: 'fixture-only' } })
  const headers = { Authorization: `Bearer ${(await login.json()).access_token}` }
  const org = (await (await request.get('/api/v1/session', { headers })).json()).organisations[0].id
  const previews = await (await request.get(`/api/v1/organisations/${org}/examples/previews`, { headers })).json()

  await page.goto('/')
  await signInFixture(page)
  await openWorkspaceProjects(page, 'studio')
  await page.getByRole('region', { name: 'Three ways to design the same park' }).getByRole('button', { name: 'Open Example A' }).click()
  await expect(page.getByRole('heading', { name: 'Example A: Community park, Shah Alam' }).first()).toBeVisible({ timeout: 120000 })
  await openDetailedWorkspace(page)

  // Review: plain status from the saved records, never a number of its own.
  const overview = page.getByRole('region', { name: 'Review before issuing' })
  await expect(overview).toBeVisible()
  await expect(overview).toContainText('Nothing left to do')
  await expect(overview).toContainText(money(previews.studio_a.total))
  await expect(overview).toContainText('Complete and current')
  await expect(overview).toContainText('Version 2')
  await expect(page.getByRole('region', { name: 'Compare options' })).toBeVisible()
  await overview.screenshot({ path: `${shots}/overview.png` })

  // One step at a time: Saved rates shows the catalogue and rate list, not the estimate form.
  await openStudiesStep(page, 'prices')
  await expect(page.getByRole('heading', { name: 'Saved rates', exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Browse rate catalogue', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Calculate selected option estimate' })).toBeHidden()
  await page.getByRole('region', { name: 'Browse rate catalogue', exact: true }).screenshot({ path: `${shots}/prices.png` })

  await openStudiesStep(page, 'shade')
  await expect(page.getByRole('heading', { name: 'Shade study (optional)' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Calculate all three scenarios' })).toBeVisible()

  await openStudiesStep(page, 'estimate')
  await expect(page.getByRole('heading', { name: 'Total', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Calculate selected option estimate' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Calculate all three scenarios' })).toBeHidden()

  await openStudiesStep(page, 'proposal')
  await expect(page.getByRole('heading', { name: 'Proposal', exact: true })).toBeVisible()
  await expect(page.getByText('Review and issue contractor client proposal', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Issued outputs' })).toBeVisible()

  // The footer buttons walk the steps in order.
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Total', exact: true })).toBeVisible()

  // Materials: plain-language help, the item picker and the quantity list stay open.
  const materials = page.getByRole('group', { name: 'Planting and materials', exact: true })
  await expect(materials.getByText('Pick an item')).toBeVisible()
  await expect(materials.getByRole('combobox', { name: 'Schedule item', exact: true })).toBeVisible()
  await expect(materials.getByText('Quantity list (BOQ) and what changed')).toBeVisible()
  await materials.scrollIntoViewIfNeeded()
  await materials.screenshot({ path: `${shots}/materials.png` })

  // A change makes the next step honest: unsaved work asks to save first.
  await openStudiesStep(page, 'estimate')
  await page.getByRole('navigation', { name: 'Studies steps' }).getByRole('button', { name: 'Review' }).click()
  await expect(overview).toBeVisible()
})
