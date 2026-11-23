import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { openStudiesStep, openStudioTool } from '../studio-helpers.mjs'

// L13/L14/L16/L24 pricing home on the real disposable PostGIS test API (not field or customer
// acceptance). Every quantity, price and subtotal is calculated by the API.
const API = process.env.INFRA_TEST_API_URL || 'http://127.0.0.1:8000'
const shots = 'test-results/pricing-home'
const box = (w, s, e, n) => ({ type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] })
const point = (x, y) => ({ type: 'Point', coordinates: [x, y] })
const base = (over) => ({ source_note: 'Browser fixture only', provenance: 'estimated', ...over })
// Choose the option whose text contains a rate code (labels also carry amount and supplier).
async function pick(select, text) {
  await expect(select.locator('option', { hasText: text })).toHaveCount(1)
  await select.selectOption(await select.locator('option', { hasText: text }).getAttribute('value'))
}
const tree = (name, x, stock) =>
  base({ id: crypto.randomUUID(), name, kind: 'tree', layout_plant: 'tree', count: 1, category: 'Proposed trees', geometry: point(x, 3.1322), tree_design: { variant: 'canopy', scale: 1, rotation_deg: 0, stock_spec: stock, rate_reviewed: false } })

test('price a bench, reuse its rate, bulk-price matching trees and price road layers by volume', async ({ page, request }) => {
  test.setTimeout(300000)
  await mkdir(shots, { recursive: true })
  const stamp = Date.now()
  const login = await request.post(`${API}/auth/v1/token`, { data: { email: 'fixture@example.invalid', password: 'fixture-only' } })
  const headers = { Authorization: `Bearer ${(await login.json()).access_token}` }
  const org = (await (await request.get('/api/v1/session', { headers })).json()).organisations[0].id
  const rates = `/api/v1/organisations/${org}/rates`
  const future = new Date(Date.now() + 120 * 864e5).toISOString().slice(0, 10)
  const today = new Date().toISOString().slice(0, 10)
  const rate = async (data) => {
    const response = await request.post(rates, { headers, data: { basis: 'cost', effective_date: '2026-11-01', valid_until: future, source_note: 'Browser fixture only; not a market price', ...data } })
    expect(response.ok(), await response.text()).toBeTruthy()
    return response.json()
  }
  await rate({ code: `BENCH${stamp}`, description: 'Timber bench, 1.8 m (fixture)', unit: 'item', amount: '850', source_type: 'supplier_quote', supplier_name: 'Fixture Furniture Sdn Bhd', quote_reference: 'Q-2026-114', exclusions: 'Delivery beyond 20 km' })
  await rate({ code: `TREE${stamp}`, description: 'Tabebuia 3 m, 45 L bag, planted (fixture)', unit: 'item', amount: '420', includes: ['labour'] })
  await rate({ code: `PREMIX${stamp}`, description: 'Premix wearing course (fixture)', unit: 'm3', amount: '480' })

  const project = await (await request.post(`/api/v1/organisations/${org}/projects`, { headers, data: { name: `Pricing home ${stamp}`, purpose: 'contractor_proposal', stakeholder: 'Client', problem: 'Plain lawn', intended_users: 'Residents', desired_outcome: 'Shaded seating', use_periods: 'Evenings', site: { bounds: [101.681, 3.131, 101.683, 3.133] } } })).json()
  const endpoint = `/api/v1/organisations/${org}/projects/${project.id}`
  const layer = (code, name, thickness) => ({ code, name, category: 'material', basis: 'volume', unit: 'm3', factor: 1, thickness_mm: thickness, wastage_percent: 0, rate_id: null })
  const workspace = {
    expected_revision: 0,
    boundary: box(101.6812, 3.1312, 101.6828, 3.1328),
    boundary_provenance: 'estimated',
    boundary_source: 'Fixture',
    targets: [],
    scenarios: {
      baseline: { name: 'Baseline', items: [base({ id: crypto.randomUUID(), name: 'Existing rain tree', kind: 'tree', status: 'existing', geometry: point(101.6814, 3.1314), provenance: 'measured' })] },
      option_a: {
        name: 'Option A',
        items: [
          base({ id: crypto.randomUUID(), name: 'Bench 1', kind: 'bench', category: 'Furniture', geometry: point(101.6816, 3.1318) }),
          base({ id: crypto.randomUUID(), name: 'Bench 2', kind: 'bench', category: 'Furniture', geometry: point(101.6818, 3.1318) }),
          tree('Tabebuia 1', 101.6815, 'Tabebuia 3 m, 45 L bag'),
          tree('Tabebuia 2', 101.6817, 'Tabebuia 3 m, 45 L bag'),
          tree('Palm', 101.6819, 'Foxtail palm 2 m, root ball'),
          base({ id: crypto.randomUUID(), name: 'Shrub bed', kind: 'area', category: 'Softscape', geometry: box(101.6821, 3.1314, 101.6822, 3.1315), plant: { code: 'P01', scientific_name: 'Fixture species', common_name: 'Fixture shrub', source: 'Fixture', nursery_size: '4 L pot', spacing_m: 0.5, method: 'square_spacing', sun_water: 'Unverified', suitability: 'Unverified', maintenance: 'Fixture' } }),
          base({ id: crypto.randomUUID(), name: 'Driveway', kind: 'area', category: 'Roads', geometry: box(101.6823, 3.1314, 101.6826, 3.1316), assembly: { code: 'DRV', material: 'Premix on crusher-run', finish: 'Rolled', source: 'Fixture recipe', use: 'road', pricing: 'components', approved: true, components: [layer('wear', 'Premix wearing course', 50), layer('base', 'Crusher-run base', 200)] } }),
        ],
      },
      option_b: { name: 'Option B', items: [] },
    },
  }
  const created = await request.post(`${endpoint}/workspace`, { headers, data: workspace })
  expect(created.ok(), await created.text()).toBeTruthy()

  await page.goto(`/studio/organisations/${org}/projects/${project.id}`)
  await page.getByLabel('Email address').fill('fixture@example.invalid')
  await page.getByLabel('Password', { exact: true }).fill('fixture-only')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  const entry = page.getByRole('button', { name: /^(Open|Close) design map$/ })
  await expect(entry).toBeVisible({ timeout: 30000 })
  if ((await entry.textContent()).includes('Open')) await entry.click()
  const dock = page.getByRole('navigation', { name: 'Studio tools' })
  await expect(dock).toBeVisible({ timeout: 30000 })
  // The journey: 1 Site, 2 Design, 3 Prices, 4 Proposal. One option picker on the map.
  const steps = page.getByRole('navigation', { name: 'Proposal steps' })
  await expect(steps).toContainText('7 need a price')
  // Step 1 Site: estimated area is never called a survey; existing items are shared and unpriced.
  await openStudioTool(page, 'Site records')
  const site = page.getByRole('region', { name: 'Site summary' })
  await expect(site).toContainText('not a survey; verify before construction')
  await expect(site).toContainText('1 existing item. Shared by both options and never priced.')
  await expect(site).toContainText(/A local metric grid \(EPSG:\d+\)/)
  // Pricing (step 3) prices Option A or B, never the existing-site baseline.
  await openStudioTool(page, 'Pricing')
  await page.getByRole('group', { name: 'Option being edited' }).getByRole('button', { name: 'Option A' }).click()

  // 1. Select a bench in Layout: the map card offers "Price this item".
  await openStudioTool(page, 'Layout')
  const inspector = page.getByRole('complementary', { name: 'Studio working panel' })
  await inspector.getByRole('button', { name: 'Select', exact: true }).click()
  await inspector.getByRole('button', { name: /^Bench 1/ }).first().click()
  const card = page.getByRole('region', { name: 'Selected item' })
  await expect(card).toContainText('Bench 1')
  await expect(card).toContainText('No price yet')
  await card.getByRole('button', { name: 'Price this item' }).click()

  let dialog = page.getByRole('dialog', { name: 'Price Bench 1' })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('Showing per-item rates')
  // A per-m³ rate never fits a bench.
  await expect(dialog.getByRole('radio', { name: new RegExp(`PREMIX${stamp}`) })).toHaveCount(0)
  await dialog.getByRole('radio', { name: new RegExp(`BENCH${stamp} v1`) }).check()
  await expect(dialog).toContainText('From a supplier quotation · Fixture Furniture Sdn Bhd · Ref. Q-2026-114')
  await expect(dialog.getByRole('status')).toContainText('Subtotal RM 850.00 = 1 each × RM 850.00', { timeout: 15000 })
  await dialog.screenshot({ path: `${shots}/price-bench.png` })
  await dialog.getByRole('button', { name: 'Apply to draft' }).click()
  await expect(dialog).toBeHidden()

  const board = page.getByRole('region', { name: 'Pricing', exact: true })
  await expect(board).toBeVisible()
  const benchCard = board.getByRole('listitem').filter({ hasText: 'Bench 1' })
  await expect(benchCard).toContainText('Priced', { timeout: 15000 })
  await expect(benchCard).toContainText('RM 850.00')
  await expect(board.getByRole('status').first()).toContainText('Includes unsaved changes')

  // 2. Reuse: the second bench shows which item already uses the rate; the person picks it.
  await board.getByRole('button', { name: 'Price Bench 2' }).click()
  dialog = page.getByRole('dialog', { name: 'Price Bench 2' })
  const reuse = dialog.getByRole('radio', { name: new RegExp(`BENCH${stamp} v1`) })
  await expect(
    dialog.locator('label').filter({ has: page.getByRole('radio', { name: new RegExp(`BENCH${stamp} v1`) }) }),
  ).toContainText('Already used for Bench 1')
  await reuse.check()
  await dialog.getByRole('button', { name: 'Apply to draft' }).click()

  // 3. Bulk: one tree rate for matching stock; the palm and benches are reviewed and skipped.
  for (const name of ['Tabebuia 1', 'Tabebuia 2', 'Palm']) await board.getByRole('checkbox', { name: `Select ${name}` }).check()
  await board.getByRole('region', { name: 'Selected items' }).getByRole('button', { name: 'Apply one rate…' }).click()
  dialog = page.getByRole('dialog', { name: 'Apply one rate to selected items' })
  await pick(dialog.getByLabel('Rate to apply'), `TREE${stamp}`)
  await expect(dialog.getByRole('region', { name: 'Will change' })).toContainText('Tabebuia 1')
  await expect(dialog.getByRole('region', { name: 'Will change' })).toContainText('Tabebuia 2')
  await expect(dialog.getByRole('region', { name: 'Skipped' })).toContainText('Palm: Different purchased stock')
  await expect(dialog.getByRole('button', { name: 'Apply to 0 items' })).toBeDisabled()
  await dialog.getByRole('checkbox', { name: /purchased stock “Tabebuia 3 m, 45 L bag”/ }).check()
  await dialog.screenshot({ path: `${shots}/bulk-trees.png` })
  await dialog.getByRole('button', { name: 'Apply to 2 items' }).click()
  await expect(board.getByRole('listitem').filter({ hasText: 'Tabebuia 2' })).toContainText('RM 420.00', { timeout: 15000 })
  await expect(board.getByRole('listitem').filter({ hasText: 'Palm' })).toContainText('Needs rate')

  // 4. Road layers: area × thickness = m³, one saved rate and one new supplier price-list rate.
  await board.getByRole('button', { name: 'Price Driveway' }).click()
  dialog = page.getByRole('dialog', { name: 'Price Driveway' })
  await expect(dialog.getByRole('row', { name: /Premix wearing course/ })).toContainText(/Area [\d.,]+ m² × 50 mm thick = [\d.,]+ m³/)
  await pick(dialog.getByLabel('Rate for layer Premix wearing course'), `PREMIX${stamp}`)
  await dialog.getByRole('row', { name: /Crusher-run base/ }).getByRole('button', { name: 'New per-m³ rate' }).click()
  const form = dialog.getByRole('form', { name: 'New rate' })
  await form.getByLabel('Rate code').fill(`BASE${stamp}`)
  await form.getByLabel('Product or service').fill('Crusher-run road base, delivered (fixture)')
  await form.getByLabel(/Internal cost \(MYR per m³\)/).fill('95')
  await form.getByLabel('Effective from').fill(today)
  await form.getByLabel('Valid until (if known)').fill(future)
  await form.getByLabel('Where the price came from').selectOption('price_list')
  await form.getByLabel(/Supplier or vendor/).fill('Fixture Quarry Sdn Bhd')
  await form.getByLabel('Not included (exclusions)').fill('Compaction testing')
  await form.getByLabel('Source note').fill('Fixture price list, browser test only')
  await form.getByRole('button', { name: 'Save rate' }).click()
  await expect(form).toBeHidden()
  await expect(dialog.getByRole('status')).toContainText(/Priced\s+Subtotal RM [\d,]+\.\d\d/, { timeout: 15000 })
  await dialog.screenshot({ path: `${shots}/price-road-layers.png` })
  await dialog.getByRole('button', { name: 'Apply to draft' }).click()

  // 5. Planting: the count method is explained in plain words; leaving it unpriced is allowed.
  await board.getByRole('button', { name: 'Price Shrub bed' }).click()
  dialog = page.getByRole('dialog', { name: 'Price Shrub bed' })
  await expect(dialog).toContainText(/Planting area [\d.,]+ m² ÷ \(0\.5 m × 0\.5 m spacing\) = [\d,]+ plants, rounded up\./)
  await expect(dialog).toContainText('not a planting layout or horticultural advice')
  await dialog.getByRole('button', { name: 'Cancel' }).click()

  // The running figure never claims to be a total while lines are unpriced.
  const stats = board.getByRole('definition').nth(1)
  await expect(board.getByLabel('Pricing summary')).toContainText('Incomplete: 2 lines not priced. This is not a total.')
  await expect(stats).toContainText('RM')
  await expect(board).toContainText('1 existing site item is shown on the map for context and never priced')
  await board.getByLabel('Pricing summary').scrollIntoViewIfNeeded()
  await page.screenshot({ path: `${shots}/board-desktop.png` })

  // 6. Save through the normal revision workflow, then estimate: still visibly incomplete.
  await page.getByRole('button', { name: 'Save design' }).click()
  await expect(board.getByText(/Matches the saved design \(version 2\)\./)).toBeVisible({ timeout: 30000 })
  const saved = await (await request.get(`${endpoint}/workspace`, { headers })).json()
  const items = saved.data.scenarios.option_a.items
  const named = (name) => items.find((item) => item.name === name)
  expect(named('Tabebuia 1').tree_design).toMatchObject({ stock_spec: 'Tabebuia 3 m, 45 L bag', rate_reviewed: true })
  expect(named('Palm').rate_id).toBeNull()
  expect(named('Bench 2').rate_id).toBe(named('Bench 1').rate_id)
  expect(named('Driveway').assembly.components.every((component) => component.rate_id)).toBe(true)
  expect(named('Existing rain tree').rate_id).toBeNull()

  await board.getByRole('button', { name: 'Next: review and total' }).click()
  await openStudiesStep(page, 'estimate')
  await page.getByRole('button', { name: 'Calculate selected option estimate' }).click()
  await expect(page.getByRole('region', { name: 'Pricing readiness' })).toBeVisible({ timeout: 30000 })
  const artifacts = await (await request.get(`${endpoint}/artifacts`, { headers })).json()
  const estimate = artifacts.items.find((item) => item.kind === 'estimate')
  expect(estimate.payload.complete).toBe(false)
  expect(estimate.payload.missing_rates.map((row) => row.name).sort()).toEqual(['Palm', 'Shrub bed'])
  // The saved schedule's running figure equals the estimate's priced direct-cost lines.
  const schedule = await (await request.get(`${endpoint}/schedule?scenario=option_a`, { headers })).json()
  expect(schedule.summary).toMatchObject({ complete: false, unpriced: 2 })
  const sum = estimate.payload.takeoff.reduce((total, row) => total + Math.round(Number(row.line_total) * 100), 0) / 100
  expect(Number(schedule.summary.priced_subtotal)).toBeCloseTo(sum, 2)

  // 6b. Review (step 4): each outstanding item links straight to its fix, and Option A / B are
  // only called comparable when both saved totals are complete and current.
  await openStudiesStep(page, 'overview')
  const review = page.getByRole('region', { name: 'Before you can issue' }).filter({ visible: true })
  await expect(review).toContainText('Palm: add a compatible price or specification.')
  await expect(review).toContainText('Shrub bed: add a compatible price or specification.')
  await expect(review).toContainText('Price all missing work, then recalculate the total.')
  await expect(page.getByRole('region', { name: 'Compare options' })).toContainText('Not comparable yet.')
  await expect(steps).toContainText('2 need a price')
  await expect(steps).toContainText('things to fix')
  await page.screenshot({ path: `${shots}/review-step.png` })
  await review.getByRole('button', { name: /Fix it: Palm/ }).click()
  dialog = page.getByRole('dialog', { name: 'Price Palm' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Cancel' }).click()

  // 7. Narrow screen: the board and dialog fit without sideways scrolling.
  await openStudioTool(page, 'Pricing')
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(board).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
  await page.screenshot({ path: `${shots}/board-narrow.png` })
  await board.getByRole('button', { name: 'Price Driveway' }).click()
  dialog = page.getByRole('dialog', { name: 'Price Driveway' })
  await expect(dialog.getByRole('status')).toContainText('Priced', { timeout: 15000 })
  await expect(dialog.getByLabel('Rate for layer Crusher-run base').locator('option:checked')).toContainText(`BASE${stamp}`)
  await page.screenshot({ path: `${shots}/dialog-narrow.png` })
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
})
