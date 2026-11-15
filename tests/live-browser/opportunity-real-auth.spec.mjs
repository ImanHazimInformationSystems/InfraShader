import { test, expect } from '@playwright/test'
import { readFile, mkdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { openStudiesStep } from '../studio-helpers.mjs'

// S03/L25/O05 with REAL local Supabase Auth: three confirmed throwaway accounts created by
// tests/live_server.py (owner-organisation administrator, foreign with no membership, contractor in
// its own organisation).
// The API resolves each verified email through Supabase /auth/v1/user, not a fixture override.
// Local services only; this is not hosted-deployment or user acceptance.
const shots = 'test-results/opportunity-real-auth'
const square = (east) => ({ type: 'Polygon', coordinates: [[[101.6812, 3.1312], [east, 3.1312], [east, 3.1313], [101.6812, 3.1313], [101.6812, 3.1312]]] })
const local = (date) => {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

test('real accounts: owner invites, contractor accepts without the link and submits, owner receives', async ({ page, browser, request }) => {
  test.setTimeout(240000)
  await mkdir(shots, { recursive: true })
  const fixture = JSON.parse(await readFile('.local/live-browser-fixture.json', 'utf8'))
  // users[3]: owner-organisation administrator reserved for this test (users[0]'s password is
  // changed by the recovery test in auth-storage.spec.mjs).
  const [, foreignUser, contractorUser, ownerUser] = fixture.users
  const login = async (user) => {
    const response = await request.post(`${fixture.supabase_url}/auth/v1/token?grant_type=password`, { headers: { apikey: fixture.public_key }, data: { email: user.email, password: user.password } })
    expect(response.ok()).toBeTruthy()
    return { Authorization: `Bearer ${(await response.json()).access_token}` }
  }
  const owner = await login(ownerUser), foreign = await login(foreignUser), contractor = await login(contractorUser)
  const orgOf = async (headers, name) => (await (await request.get('/api/v1/session', { headers })).json()).organisations.find((o) => o.name === name).id
  const ownerOrg = await orgOf(owner, 'Real local services fixture')
  const contractorOrg = await orgOf(contractor, 'Real local contractor fixture')
  const stamp = Date.now()

  const review = await (await request.post(`/api/v1/organisations/${ownerOrg}/projects`, { headers: owner, data: { name: `Live tender ${stamp}`, purpose: 'developer_decision', stakeholder: 'Facilities', problem: 'Hot courtyard', intended_users: 'Staff', desired_outcome: 'Shaded seating', use_periods: 'Lunch', site: { bounds: [101.681, 3.131, 101.683, 3.133] } } })).json()
  const ownerBase = `/api/v1/organisations/${ownerOrg}/projects/${review.id}`
  expect((await request.put(`${ownerBase}/owner-review/basis`, { headers: owner, data: { expected_revision: 0, title: 'Courtyard paving', tax_basis: 'exclusive', budget: '987654.00', self_approval: 'prohibited', scope_items: [{ code: 'PAV', description: 'Paving', unit: 'm2', quantity: '10' }] } })).ok()).toBeTruthy()

  // Contractor's private project with an issued, retained proposal.
  const cproject = await (await request.post(`/api/v1/organisations/${contractorOrg}/projects`, { headers: contractor, data: { name: `Live paving offer ${stamp}`, purpose: 'contractor_proposal', stakeholder: 'Facilities', problem: 'Hot courtyard', intended_users: 'Staff', desired_outcome: 'Shaded seating', use_periods: 'Lunch', site: { bounds: [101.681, 3.131, 101.683, 3.133] } } })).json()
  const cBase = `/api/v1/organisations/${contractorOrg}/projects/${cproject.id}`
  const rate = await (await request.post(`/api/v1/organisations/${contractorOrg}/rates`, { headers: contractor, data: { code: `LIVE${stamp}`, description: 'Private paving cost (test only)', unit: 'm2', basis: 'cost', amount: '123.45', effective_date: '2026-11-01', valid_until: '2099-06-30', source_note: 'Private supplier source (fixture)' } })).json()
  expect((await request.post(`${cBase}/workspace`, { headers: contractor, data: { expected_revision: 0, boundary: square(101.6816), boundary_provenance: 'estimated', boundary_source: 'Fixture', targets: [{ id: randomUUID(), name: 'Courtyard', geometry: square(101.6816), source_note: 'Fixture', provenance: 'estimated' }], scenarios: { baseline: { name: 'Baseline', items: [] }, option_a: { name: 'Option A', items: [{ id: randomUUID(), name: 'Courtyard paving', kind: 'area', geometry: square(101.6813), source_note: 'Private supplier note (fixture)', provenance: 'estimated', rate_id: rate.id }] }, option_b: { name: 'Option B', items: [] } } } })).ok()).toBeTruthy()
  const estimate = await (await request.post(`${cBase}/estimates`, { headers: contractor, data: { expected_revision: 1, request_key: randomUUID(), scenario: 'option_a', method: 'markup', percent: 20 } })).json()
  const issued = await request.post(`${cBase}/proposals`, { headers: contractor, data: { request_key: randomUUID(), estimate_id: estimate.id, expected_project_revision: 1, preferred_option: 'option_a', criteria: ['Scope'], review_notes: 'Reviewed', customer_narrative: 'Courtyard paving', assumptions: 'Site check', exclusions: 'No shade claims', confirmed: true, valid_until: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10), programme: 'After approval', maintenance: 'Not included', change_summary: '' } })
  expect(issued.ok(), await issued.text()).toBeTruthy()
  const output = await issued.json()
  const status = await (await request.get(`${cBase}/outputs/${output.id}/file`, { headers: contractor })).json()
  expect((await request.post(`${cBase}/outputs/${output.id}/file`, { headers: contractor, multipart: { manifest_hash: status.manifest_hash, pdf: { name: 'proposal.pdf', mimeType: 'application/pdf', buffer: Buffer.from(`%PDF-1.7\nlive fixture proposal ${output.id}\n%%EOF`) } } })).ok()).toBeTruthy()

  // 1. Owner issues the invitation through the real sign-in and UI.
  await page.goto(`/review/organisations/${ownerOrg}/projects/${review.id}`)
  await page.getByLabel('Email address').fill(ownerUser.email)
  await page.getByLabel('Password', { exact: true }).fill(ownerUser.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  const panel = page.getByRole('region', { name: 'Invite contractors to submit' })
  await expect(panel).toBeVisible({ timeout: 30000 })
  await panel.getByText('New invitation', { exact: true }).click()
  await panel.getByLabel("Contractor's account email").fill(contractorUser.email)
  await panel.getByLabel('Closing date and time (your local time)').fill(local(new Date(Date.now() + 7 * 864e5)))
  await panel.getByLabel('Submission instructions').fill('One offer for paving, test only.')
  await panel.getByRole('button', { name: 'Save draft invitation' }).click()
  const card = panel.getByRole('listitem', { name: `Invitation to ${contractorUser.email}` })
  await expect(card).toContainText('Draft (not shared yet)')
  page.once('dialog', (dialog) => dialog.accept())
  await card.getByRole('button', { name: 'Issue invitation link' }).click()
  const linkBox = panel.getByRole('status').filter({ hasText: 'Invitation link (shown once)' })
  await expect(linkBox).toBeInViewport()
  const link = (await linkBox.locator('code').textContent()).trim()

  // 2. Real email matching: a different confirmed account learns nothing from the link or id.
  const invitation = (await (await request.get(`${ownerBase}/opportunities`, { headers: owner })).json()).items[0]
  expect((await (await request.get('/api/v1/opportunities/pending', { headers: foreign })).json()).items).toHaveLength(0)
  expect((await request.post('/api/v1/opportunities/preview', { headers: foreign, data: { invitation_id: invitation.id } })).status()).toBe(404)
  const token = decodeURIComponent(link.split('#opportunity=')[1])
  const foreignPreview = await request.post('/api/v1/opportunities/preview', { headers: foreign, data: { token } })
  expect(foreignPreview.status(), await foreignPreview.text()).toBeGreaterThanOrEqual(403)

  // 3. Contractor signs in for real and finds the invitation without the link.
  const other = await browser.newContext({ baseURL: page.url().split('/').slice(0, 3).join('/'), viewport: { width: 1280, height: 900 } })
  const cpage = await other.newPage()
  await cpage.goto('/studio')
  await cpage.getByLabel('Email address').fill(contractorUser.email)
  await cpage.getByLabel('Password', { exact: true }).fill(contractorUser.password)
  await cpage.getByRole('button', { name: 'Sign in', exact: true }).click()
  const waiting = cpage.getByRole('status', { name: 'Invitations waiting for you' })
  await expect(waiting).toContainText('You have 1 invitation waiting', { timeout: 30000 })
  await waiting.getByRole('button', { name: 'Review invitation' }).click()
  const accept = cpage.getByRole('region', { name: /Live tender/ })
  await expect(accept).toBeVisible({ timeout: 30000 })
  await expect(accept).not.toContainText('987654')
  await accept.getByRole('button', { name: 'Accept invitation' }).click()
  const opportunity = cpage.getByRole('region', { name: 'Invited opportunities' }).getByRole('listitem').first()
  await expect(opportunity).toBeVisible({ timeout: 30000 })
  await opportunity.getByLabel('Link an existing Design Studio project').selectOption({ label: `Live paving offer ${stamp}` })
  await opportunity.getByRole('button', { name: 'Link project' }).click()
  await opportunity.getByRole('button', { name: /Open linked project/ }).click()
  const entry = cpage.getByRole('button', { name: /^(Open|Close) design map$/ })
  await expect(entry).toBeVisible({ timeout: 30000 })
  if ((await entry.textContent()).includes('Open')) await entry.click()
  await openStudiesStep(cpage, 'proposal')
  const submit = cpage.getByRole('region', { name: /Submit to Real local services fixture/ })
  await expect(submit).toBeVisible({ timeout: 30000 })
  await submit.getByRole('button', { name: 'Preview what the owner will receive' }).click()
  const outgoing = submit.getByRole('region', { name: 'Outgoing package preview' })
  await expect(outgoing).not.toContainText('123.45')
  await outgoing.getByLabel(/I am authorised to submit this offer/).check()
  await outgoing.getByRole('button', { name: 'Submit to organisation' }).click()
  await expect(submit.getByRole('status').filter({ hasText: /Received\. Receipt RCPT-/ })).toBeVisible({ timeout: 30000 })
  await cpage.screenshot({ path: `${shots}/contractor-receipt.png`, fullPage: true })

  // 4. Owner receives it; neither side can read the other's private records.
  await page.reload()
  await expect(page.getByRole('region', { name: 'Invite contractors to submit' })).toContainText('Received · current', { timeout: 30000 })
  const received = await (await request.get(`${ownerBase}/opportunities/${invitation.id}/packages/1`, { headers: owner })).json()
  for (const secret of ['123.45', 'Private supplier', `LIVE${stamp}`]) expect(JSON.stringify(received)).not.toContain(secret)
  expect((await request.get(`${ownerBase}/owner-review`, { headers: contractor })).status()).toBe(404)
  expect((await request.get(cBase, { headers: owner })).status()).toBe(404)
  await page.screenshot({ path: `${shots}/owner-received.png`, fullPage: true })
  await other.close()
})
