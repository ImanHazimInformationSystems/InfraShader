import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { openWorkspaceProjects, signInFixture } from '../studio-helpers.mjs'

const shots = 'test-results/examples'
const money = (value) => `RM ${Number(value).toLocaleString('en-MY', { minimumFractionDigits: 2 })}`

test('three Studio examples and the review comparing them, with matching plans and prices', async ({ page, request }) => {
  test.setTimeout(240000)
  await mkdir(shots, { recursive: true })
  const login = await request.post(`${process.env.INFRA_TEST_API_URL}/auth/v1/token`, { data: { email: 'fixture@example.invalid', password: 'fixture-only' } })
  const headers = { Authorization: `Bearer ${(await login.json()).access_token}` }
  const org = (await (await request.get('/api/v1/session', { headers })).json()).organisations[0].id
  const previews = await (await request.get(`/api/v1/organisations/${org}/examples/previews`, { headers })).json()

  await page.goto('/')
  await signInFixture(page)
  await openWorkspaceProjects(page, 'studio')
  const set = page.getByRole('region', { name: 'Three ways to design the same park' })
  await expect(set).toBeVisible()
  for (const letter of ['A', 'B', 'C']) {
    const tile = set.getByRole('article', { name: `Example ${letter}` })
    await expect(tile.getByRole('img', { name: new RegExp(`Example ${letter} plan`) })).toBeVisible()
    await expect(tile.getByText(money(previews[`studio_${letter.toLowerCase()}`].total))).toBeVisible()
  }
  await set.screenshot({ path: `${shots}/studio-examples.png` })
  await set.getByRole('button', { name: 'Open Example B' }).click()
  await expect(page.getByRole('heading', { name: 'Example B: Shaded garden park, Shah Alam' }).first()).toBeVisible({ timeout: 120000 })
  const banner = page.getByRole('complementary', { name: 'About this example project' })
  await expect(banner).toContainText('You are in Example B of 3: Shaded garden park')
  await expect(banner.getByRole('img', { name: /Example B site plan/ })).toBeVisible()
  await page.screenshot({ path: `${shots}/studio-example-b.png`, fullPage: true })

  // All three were created once; the Studio estimate equals the preview total (tally).
  const index = await (await request.get(`/api/v1/organisations/${org}/examples`, { headers })).json()
  for (const key of ['studio_a', 'studio_b', 'studio_c']) {
    expect(index[key]).toBeTruthy()
    const artifacts = (await (await request.get(`/api/v1/organisations/${org}/projects/${index[key]}/artifacts`, { headers })).json()).items
    const estimate = artifacts.find((a) => a.kind === 'estimate' && !a.stale && a.payload.scenario === 'option_a')
    expect(estimate.payload.selling_total).toBe(previews[key].total)
  }

  await page.goto('/')
  await openWorkspaceProjects(page, 'review')
  await expect(page.getByRole('region', { name: 'How Organisation Review works' })).toBeVisible()
  // The review folder lists reviews only, never the Studio contractor projects.
  await expect(page.getByRole('button', { name: /Example A: Community park/ })).toHaveCount(0)
  const reviewSet = page.getByRole('region', { name: 'Compare 3 proposals for one park' })
  await expect(reviewSet.getByRole('img')).toHaveCount(3)
  await reviewSet.getByRole('button', { name: 'Open the example review' }).click()
  const overview = page.getByRole('region', { name: 'Overview of proposals' })
  await expect(overview).toBeVisible({ timeout: 120000 })
  await expect(page.getByRole('button', { name: 'Overview of proposals' })).toHaveAttribute('aria-current', 'step')
  await expect(overview.getByRole('article')).toHaveCount(3)
  const first = overview.getByRole('article', { name: 'Proposal from Example Landscape Studio' })
  await expect(first).toContainText('Ranked 1st')
  await expect(first).toContainText(money(previews.studio_a.total))
  await expect(first.getByRole('img', { name: /Example Landscape Studio site plan/ })).toBeVisible()
  const kenari = overview.getByRole('article', { name: 'Proposal from Kenari Build & Plant (fictional)' })
  await expect(kenari).toContainText('Not ranked')
  await expect(kenari).toContainText("Not included: Children's play area")
  await expect(kenari.getByRole('img')).toBeVisible()
  await expect(overview.getByRole('region', { name: 'Prices side by side' }).getByRole('cell', { name: 'Not included' })).toBeVisible()
  await expect(overview.getByRole('region', { name: 'What each proposal puts on the site' })).toContainText('New trees')
  await page.screenshot({ path: `${shots}/review-overview.png`, fullPage: true })
  await overview.getByRole('button', { name: /Show the site plan of Taman Indah/ }).click()
  const focus = overview.getByRole('region', { name: 'Site plan, larger view' })
  await expect(focus).toContainText('Example B: Shaded garden park')
  await focus.screenshot({ path: `${shots}/review-plan-focus.png` })

  const guide = page.getByRole('region', { name: 'Review guide' })
  await expect(guide).toContainText('5 of 6 stages complete')
  const review = page.getByRole('region', { name: 'Owner proposal review' })
  await review.getByRole('button', { name: 'Preferences', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Review preferences' })
  await dialog.getByLabel(/Show tips on each step/).uncheck()
  await dialog.getByLabel(/Compact tables/).check()
  await dialog.getByRole('button', { name: 'Done' }).click()
  await review.getByRole('button', { name: '1. Basis' }).click()
  await expect(review.getByRole('complementary', { name: /^Tips for/ })).toHaveCount(0)
  await page.reload()
  const reloaded = page.getByRole('region', { name: 'Owner proposal review' })
  await expect(reloaded).toBeVisible({ timeout: 60000 })
  await expect(reloaded).toHaveClass(/density-compact/)
})
