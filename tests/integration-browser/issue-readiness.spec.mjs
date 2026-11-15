import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { openStudiesStep } from '../studio-helpers.mjs'
const API = process.env.INFRA_TEST_API_URL || 'http://127.0.0.1:8000'
const box = { type: 'Polygon', coordinates: [[[101.681,3.131],[101.682,3.131],[101.682,3.132],[101.681,3.132],[101.681,3.131]]] }

test('new contractor resolves every blocker through Fix it, then issues on the first attempt', async ({ page, request }) => {
  test.setTimeout(240000)
  const login = await request.post(`${API}/auth/v1/token`, { data: { email: 'fixture@example.invalid', password: 'fixture-only' } })
  const headers = { Authorization: `Bearer ${(await login.json()).access_token}` }
  const org = (await (await request.get('/api/v1/session', { headers })).json()).organisations[0].id
  const json = async (url, data) => {
    const response = await request.post(url, { headers, data })
    expect(response.ok(), await response.text()).toBeTruthy()
    return response.json()
  }
  const project = await json(`/api/v1/organisations/${org}/projects`, { name: `Issue checklist ${Date.now()}`, purpose: 'contractor_proposal', stakeholder: 'Fixture client', site: { bounds: [101.681,3.131,101.682,3.132] } })
  const endpoint = `/api/v1/organisations/${org}/projects/${project.id}`
  const rate = await json(`/api/v1/organisations/${org}/rates`, { code: `READY${Date.now()}`, description: 'Fixture bench', unit: 'item', amount: '100', basis: 'cost', effective_date: '2020-01-01', valid_until: '2099-12-31', source_note: 'Synthetic test price, not a supplier quotation' })
  await json(`${endpoint}/workspace`, { expected_revision: 0, boundary: box, boundary_provenance: 'estimated', boundary_source: 'Fixture boundary, not a survey', targets: [], scenarios: {
    baseline: { name: 'Baseline', items: [] }, option_a: { name: 'Option A', items: [{ id: crypto.randomUUID(), name: 'Bench', kind: 'bench', geometry: { type: 'Point', coordinates: [101.6815,3.1315] }, provenance: 'estimated', source_note: 'Fixture', rate_id: rate.id }] }, option_b: { name: 'Option B', items: [] }
  } })
  await json(`${endpoint}/estimates`, { expected_revision: 1, request_key: crypto.randomUUID(), scenario: 'option_a', method: 'markup', percent: '12', wastage_percent: '0', charges: [] })
  await page.goto(`/studio/organisations/${org}/projects/${project.id}`)
  await page.getByLabel('Email address').fill('fixture@example.invalid')
  await page.getByLabel('Password', { exact: true }).fill('fixture-only')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.getByRole('button', { name: 'Open design map', exact:true }).click()
  await expect(page.getByRole('navigation', { name: 'Studio tools' })).toBeVisible({ timeout: 30000 })
  await page.getByRole('group', { name: 'Option being edited' }).getByRole('button', { name: 'Option A' }).click()
  await openStudiesStep(page, 'overview')
  const checklist = () => page.getByRole('region', { name: 'Before you can issue', exact: true }).filter({ visible: true })
  const fix = async text => { await checklist().getByRole('button', { name: new RegExp(`^Fix it: ${text}`) }).first().click() }
  await expect(checklist()).toContainText('Complete the problem to solve')
  await expect(checklist()).toContainText('Mark the area')
  await mkdir('test-results/issue-readiness', { recursive: true })
  for (const [width,height] of [[1440,900],[820,1100],[390,844]]) {
    await page.setViewportSize({ width,height })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect(checklist()).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: `test-results/issue-readiness/checklist-${width}.png` })
    if (width === 390) {
      await checklist().getByRole('button').first().scrollIntoViewIfNeeded()
      await page.screenshot({ path: 'test-results/issue-readiness/phone-fix.png' })
    }
  }
  await page.setViewportSize({ width:1440,height:900 })
  // Fix target: user reviews and confirms the boundary, then deliberately saves.
  await fix('Mark the area')
  await page.getByRole('button', { name: 'Use the site boundary as the proposal area', exact:true }).click()
  await expect(page.getByRole('group', { name:'Confirm proposal area' })).toContainText('estimated, not a survey')
  await page.getByRole('button', { name:'Confirm this proposal area', exact:true }).click()
  await openStudiesStep(page, 'overview')
  await fix('Save the design')
  await expect(checklist()).not.toContainText('Mark the area this proposal covers.')
  // One inline brief editor highlights all missing brief fields and retains proposal state.
  const briefFixButton = checklist().getByRole('button', {name: /^Fix it: Complete the problem/})
  await briefFixButton.focus()
  await page.keyboard.press('Enter')
  const dialog = page.locator('dialog[open]')
  await expect(dialog.locator('#brief-fix-problem')).toBeFocused()
  await dialog.getByLabel('Problem to solve', { exact:false }).fill('No resting place')
  await dialog.getByLabel('Who will use the site', { exact:false }).fill('Visitors')
  await dialog.getByLabel('Intended outcome', { exact:false }).fill('A place to sit')
  await dialog.getByLabel('When the site will be used', { exact:false }).fill('Daytime')
  await dialog.getByRole('button', { name:'Save brief', exact:true }).click()
  await expect(dialog).toHaveCount(0)
  // Select the existing total to demonstrate that a changed brief makes it stale.
  await fix('Calculate and select')
  await page.getByRole('button', { name:'Calculate selected option estimate', exact:true }).click()
  await openStudiesStep(page, 'overview')
  const wording = [
    ['Enter a proposal validity', 'Proposal valid until', '2099-01-01'],
    ['Scope for the client', 'Customer-facing scope narrative', 'Supply and install one fixture bench.'],
    ['Programme:', 'Programme and delivery assumptions', 'After site approval.'],
    ['Maintenance:', 'Maintenance scope or exclusions', 'Client maintains after handover.'],
    ['Review criteria:', 'Review criteria (one per line)', 'Scope and budget'],
    ['Review notes:', 'Reviewer notes', 'Reviewed the site and scope.'],
    ['Assumptions:', 'Assumptions', 'Access during agreed daytime hours.'],
    ['Exclusions:', 'Exclusions', 'No electrical works.'],
  ]
  for (const [text,label,value] of wording) {
    await fix(text)
    const field = page.getByLabel(label, { exact:true })
    await expect(field).toBeFocused()
    await field.fill(value)
    await expect(checklist()).not.toContainText(`${text} not provided yet.`)
    await openStudiesStep(page, 'overview')
  }
  await expect(checklist()).toContainText('Ready to issue.')
  // A subsequent brief edit invalidates the selected estimate; direct Recalculate uses current inputs.
  const brief = await (await request.get(endpoint, { headers })).json()
  const updated = await request.patch(endpoint, { headers, data: { expected_revision:brief.revision, problem:'Updated site purpose' } })
  expect(updated.ok(), await updated.text()).toBeTruthy()
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await fix('Reload and review')
  await dialog.getByRole('button', { name:'Cancel', exact:true }).click()
  await expect(checklist()).toContainText('total is out of date')
  await page.getByRole('button', { name:'Recalculate total', exact:true }).click()
  await expect(checklist()).toContainText('Ready to issue.')
  await openStudiesStep(page, 'proposal')
  await expect(page.getByRole('button', { name:'Confirm and issue new version' })).toBeEnabled()
  let attempts = 0
  page.on('request', r => { if (r.method() === 'POST' && r.url().endsWith('/proposals')) attempts++ })
  page.once('dialog', d => d.accept())
  await page.getByRole('button', { name:'Confirm and issue new version' }).click()
  await expect(page.getByRole('status').filter({hasText:'issued and its PDF saved'})).toBeVisible({timeout:60000})
  expect(attempts).toBe(1)
  await page.screenshot({ path:'test-results/issue-readiness/issued-desktop.png' })
  // Separate race: a teammate changes the brief after readiness passed, before clicking.
  await page.getByLabel('Changes since previous proposal', { exact:true }).fill('Review of a later version.')
  await expect(page.getByRole('button', { name:'Confirm and issue new version' })).toBeEnabled()
  const latestBrief = await (await request.get(endpoint, { headers })).json()
  const raceEdit = await request.patch(endpoint, { headers, data: { expected_revision: latestBrief.revision, problem:'' } })
  expect(raceEdit.ok(), await raceEdit.text()).toBeTruthy()
  page.once('dialog', d => d.accept())
  await page.getByRole('button', { name:'Confirm and issue new version' }).click()
  const refusal = page.getByRole('alert').filter({hasText:'Not issued.'})
  await expect(refusal).toContainText('Reload and review the updated project brief.')
  await expect(refusal).not.toContainText('stale_brief')
  await refusal.getByRole('button', {name:'Fix it', exact:true}).click()
  await expect(page.locator('dialog[open]').getByLabel('Problem to solve', {exact:false})).toHaveValue('')
  await page.locator('dialog[open]').getByRole('button', {name:'Cancel', exact:true}).click()
})
