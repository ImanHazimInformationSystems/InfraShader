import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { openStudiesStep } from '../studio-helpers.mjs'

// S03/L25/O05 on real disposable PostGIS with two TEST-ONLY signed identities in separate
// organisations (owner = fixture@, contractor = contractor@). Not Supabase Auth acceptance.
const API = process.env.INFRA_TEST_API_URL || 'http://127.0.0.1:8000'
const shots = 'test-results/opportunities'
const square = (east) => ({ type: 'Polygon', coordinates: [[[101.6812, 3.1312], [east, 3.1312], [east, 3.1313], [101.6812, 3.1313], [101.6812, 3.1312]]] })
const local = (date) => {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

async function login(request, email) {
  const response = await request.post(`${API}/auth/v1/token`, { data: { email, password: 'fixture-only' } })
  const headers = { Authorization: `Bearer ${(await response.json()).access_token}` }
  const org = (await (await request.get('/api/v1/session', { headers })).json()).organisations[0].id
  return { headers, org }
}

async function signIn(page, email) {
  await page.getByLabel('Email address').fill(email)
  await page.getByLabel('Password', { exact: true }).fill('fixture-only')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
}

test('owner invites a contractor, who accepts, submits, revises; owner receives both versions', async ({ page, browser, request }) => {
  test.setTimeout(240000)
  await mkdir(shots, { recursive: true })
  const stamp = Date.now()
  const owner = await login(request, 'fixture@example.invalid')
  const contractor = await login(request, 'contractor@example.invalid')
  expect(owner.org).not.toBe(contractor.org)

  // Owner review project and comparison basis (budget is owner-only and must never be shared).
  const review = await (await request.post(`/api/v1/organisations/${owner.org}/projects`, { headers: owner.headers, data: { name: `Courtyard tender ${stamp}`, purpose: 'developer_decision', stakeholder: 'Facilities', problem: 'Hot courtyard', intended_users: 'Staff', desired_outcome: 'Shaded seating', use_periods: 'Lunch', site: { bounds: [101.681, 3.131, 101.683, 3.133] } } })).json()
  const ownerBase = `/api/v1/organisations/${owner.org}/projects/${review.id}`
  const basis = await request.put(`${ownerBase}/owner-review/basis`, { headers: owner.headers, data: { expected_revision: 0, title: 'Courtyard paving', tax_basis: 'exclusive', budget: '987654.00', self_approval: 'prohibited', scope_items: [{ code: 'PAV', description: 'Paving', unit: 'm2', quantity: '10' }] } })
  expect(basis.ok(), await basis.text()).toBeTruthy()

  // Contractor's private project, priced with its own rate (never sent to the owner).
  const cproject = await (await request.post(`/api/v1/organisations/${contractor.org}/projects`, { headers: contractor.headers, data: { name: `Paving offer ${stamp}`, purpose: 'contractor_proposal', stakeholder: 'Facilities', problem: 'Hot courtyard', intended_users: 'Staff', desired_outcome: 'Shaded seating', use_periods: 'Lunch', site: { bounds: [101.681, 3.131, 101.683, 3.133] } } })).json()
  const cBase = `/api/v1/organisations/${contractor.org}/projects/${cproject.id}`
  const rate = await (await request.post(`/api/v1/organisations/${contractor.org}/rates`, { headers: contractor.headers, data: { code: `SECRET${stamp}`, description: 'Private paving cost (test only)', unit: 'm2', basis: 'cost', amount: '123.45', effective_date: '2026-11-01', valid_until: '2099-06-30', source_note: 'Private supplier source (fixture)' } })).json()
  const design = (revision, east) => ({ expected_revision: revision, boundary: square(101.6816), boundary_provenance: 'estimated', boundary_source: 'Fixture', targets: [{ id: crypto.randomUUID(), name: 'Courtyard', geometry: square(101.6816), source_note: 'Fixture', provenance: 'estimated' }], scenarios: { baseline: { name: 'Baseline', items: [] }, option_a: { name: 'Option A', items: [{ id: crypto.randomUUID(), name: 'Courtyard paving', kind: 'area', geometry: square(east), source_note: 'Private supplier note (fixture)', provenance: 'estimated', rate_id: rate.id }] }, option_b: { name: 'Option B', items: [] } } })
  expect((await request.post(`${cBase}/workspace`, { headers: contractor.headers, data: design(0, 101.6813) })).ok()).toBeTruthy()
  const valid = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10)
  async function issueAndRetain(revision, summary) {
    const estimate = await (await request.post(`${cBase}/estimates`, { headers: contractor.headers, data: { expected_revision: revision, request_key: crypto.randomUUID(), scenario: 'option_a', method: 'markup', percent: 20 } })).json()
    const issued = await request.post(`${cBase}/proposals`, { headers: contractor.headers, data: { request_key: crypto.randomUUID(), estimate_id: estimate.id, expected_project_revision: 1, preferred_option: 'option_a', criteria: ['Scope'], review_notes: 'Reviewed', customer_narrative: 'Courtyard paving', assumptions: 'Site check', exclusions: 'No shade claims', confirmed: true, valid_until: valid, programme: 'After approval', maintenance: 'Not included', change_summary: summary } })
    expect(issued.ok(), await issued.text()).toBeTruthy()
    const output = await issued.json()
    const status = await (await request.get(`${cBase}/outputs/${output.id}/file`, { headers: contractor.headers })).json()
    const retained = await request.post(`${cBase}/outputs/${output.id}/file`, { headers: contractor.headers, multipart: { manifest_hash: status.manifest_hash, pdf: { name: 'proposal.pdf', mimeType: 'application/pdf', buffer: Buffer.from(`%PDF-1.7\nfixture issued proposal ${output.id}\n%%EOF`) } } })
    expect(retained.ok(), await retained.text()).toBeTruthy()
    return output
  }

  // 1. Owner prepares and issues the invitation in Organisation Review.
  await page.goto(`/review/organisations/${owner.org}/projects/${review.id}`)
  await signIn(page, 'fixture@example.invalid')
  const panel = page.getByRole('region', { name: 'Invite contractors to submit' })
  await expect(panel).toBeVisible({ timeout: 30000 })
  await panel.getByText('New invitation', { exact: true }).click()
  await panel.getByLabel("Contractor's account email").fill('contractor@example.invalid')
  await panel.getByLabel('Closing date and time (your local time)').fill(local(new Date(Date.now() + 7 * 864e5)))
  await panel.getByLabel('Submission instructions').fill('One offer for paving, test only.')
  await panel.getByLabel('Evaluation criteria (names and weights only)').check()
  await panel.getByRole('button', { name: 'Save draft invitation' }).click()
  const card = panel.getByRole('listitem', { name: 'Invitation to contractor@example.invalid' })
  await expect(card).toContainText('Draft (not shared yet)')
  await card.getByRole('button', { name: /Preview what will be shared/ }).click()
  const shared = card.getByLabel('Shared brief')
  await expect(shared).toContainText('Courtyard paving')
  await expect(shared).not.toContainText('987654')
  page.once('dialog', (dialog) => dialog.accept())
  await card.getByRole('button', { name: 'Issue invitation link' }).click()
  const linkBox = panel.getByRole('status').filter({ hasText: 'Invitation link (shown once)' })
  await expect(linkBox).toBeVisible()
  // The link must be in view right after clicking Issue, not hidden above the fold.
  await expect(linkBox).toBeInViewport()
  const link = (await linkBox.locator('code').textContent()).trim()
  expect(link).toContain('#opportunity=')
  // The owner's own email app can be opened with the link; InfraShader sends nothing itself.
  await expect(linkBox.getByRole('link', { name: 'Open in my email app' })).toHaveAttribute('href', /^mailto:contractor%40example\.invalid\?subject=/)
  await page.screenshot({ path: `${shots}/owner-invite.png`, fullPage: true })

  // A lost link is replaced; the first link then stops working.
  await linkBox.getByRole('button', { name: 'Done' }).click()
  page.once('dialog', (dialog) => dialog.accept())
  await card.getByRole('button', { name: 'Issue a new link' }).click()
  await expect(linkBox).toBeVisible()
  await expect(linkBox).toBeInViewport()
  const newLink = (await linkBox.locator('code').textContent()).trim()
  expect(newLink).not.toBe(link)

  // 2. Contractor: the old link is refused, but the invitation is waiting after sign-in
  //    (no link needed) and can be reviewed and accepted from the projects page.
  const other = await browser.newContext({ baseURL: page.url().split('/').slice(0, 3).join('/'), viewport: { width: 1280, height: 900 } })
  const cpage = await other.newPage()
  await cpage.goto(link.replace(/^https?:\/\/[^/]+/, ''))
  await expect(cpage).not.toHaveURL(/opportunity=/) // token removed from the visible URL
  await signIn(cpage, 'contractor@example.invalid')
  await expect(cpage.getByRole('alert').filter({ hasText: /not valid/ })).toBeVisible({ timeout: 30000 })
  await cpage.getByRole('button', { name: 'Close' }).click()
  await cpage.goto('/studio')
  const waiting = cpage.getByRole('status', { name: 'Invitations waiting for you' })
  await expect(waiting).toContainText('You have 1 invitation waiting', { timeout: 30000 })
  await waiting.getByRole('button', { name: 'Review invitation' }).click()
  const accept = cpage.getByRole('region', { name: /Courtyard tender/ })
  await expect(accept).toBeVisible({ timeout: 30000 })
  await expect(accept).toContainText('You do not join the owner\'s organisation')
  await expect(accept).not.toContainText('987654')
  await cpage.screenshot({ path: `${shots}/contractor-accept.png`, fullPage: true })
  await accept.getByRole('button', { name: 'Accept invitation' }).click()
  const opportunities = cpage.getByRole('region', { name: 'Invited opportunities' })
  await expect(opportunities).toBeVisible({ timeout: 30000 })
  const opportunity = opportunities.getByRole('listitem').first()
  await opportunity.getByLabel('Link an existing Design Studio project').selectOption({ label: `Paving offer ${stamp}` })
  await opportunity.getByRole('button', { name: 'Link project' }).click()
  await expect(opportunity.getByRole('button', { name: /Open linked project/ })).toBeVisible()

  // Neither side can read the other's private data, even directly through the API.
  const ownerState = await request.get(`${ownerBase}/owner-review`, { headers: contractor.headers })
  expect(ownerState.status()).toBe(404)
  expect((await request.get(`${cBase}`, { headers: owner.headers })).status()).toBe(404)

  // 3. Contractor issues privately, then deliberately submits from the Proposal step.
  await issueAndRetain(1, '')
  await opportunity.getByRole('button', { name: /Open linked project/ }).click()
  const entry = cpage.getByRole('button', { name: /^(Open|Close) design map$/ })
  await expect(entry).toBeVisible({ timeout: 30000 })
  if ((await entry.textContent()).includes('Open')) await entry.click()
  await openStudiesStep(cpage, 'proposal')
  const submit = cpage.getByRole('region', { name: /Submit to Browser integration fixture/ })
  await expect(submit).toBeVisible({ timeout: 30000 })
  // A supporting document is staged and sent only with the submission.
  await submit.getByLabel('Document', { exact: true }).setInputFiles({ name: 'insurance.pdf', mimeType: 'application/pdf', buffer: Buffer.from(['%PDF-1.4', 'insurance certificate (test only)', '%%EOF'].join(String.fromCharCode(10))) })
  await submit.getByLabel('What it is', { exact: true }).fill('Insurance certificate')
  await submit.getByRole('button', { name: 'Add document' }).click()
  await expect(submit.getByLabel(/insurance\.pdf · Insurance certificate/)).toBeChecked()
  await submit.getByRole('button', { name: 'Preview what the owner will receive' }).click()
  const outgoing = submit.getByRole('region', { name: 'Outgoing package preview' })
  await expect(outgoing).toContainText('First submission')
  await expect(outgoing).toContainText('1 supporting document')
  await expect(outgoing).not.toContainText('123.45') // internal cost rate never shown or sent
  await expect(outgoing).not.toContainText('Private supplier')
  await outgoing.getByLabel(/I am authorised to submit this offer/).check()
  await outgoing.getByRole('button', { name: 'Submit to organisation' }).click()
  await expect(submit.getByRole('status').filter({ hasText: /Received\. Receipt RCPT-/ })).toBeVisible({ timeout: 30000 })
  await cpage.screenshot({ path: `${shots}/contractor-receipt.png`, fullPage: true })

  // 4. Owner sees the received package in the existing inbox, not the contractor's project.
  await page.reload()
  const panelAgain = page.getByRole('region', { name: 'Invite contractors to submit' })
  await expect(panelAgain).toContainText('Received · current', { timeout: 30000 })
  await expect(page.getByText('1 offers · 1 need confirmation')).toBeVisible()
  await page.getByRole('button', { name: '3. Offers', exact: true }).click()
  await expect(page.getByText(/submitted through InfraShader \(receipt RCPT-/).first()).toBeVisible()
  const pkg = await (await request.get(`${ownerBase}/opportunities`, { headers: owner.headers })).json()
  const received = await (await request.get(`${ownerBase}/opportunities/${pkg.items[0].id}/packages/1`, { headers: owner.headers })).json()
  const raw = JSON.stringify(received)
  for (const secret of ['123.45', 'Private supplier', `SECRET${stamp}`, 'cost_base', 'estimate_id']) expect(raw).not.toContain(secret)
  expect(received.package.documents.attachments[0].filename).toBe('insurance.pdf')
  const inbox = await (await request.get(`${ownerBase}/owner-review`, { headers: owner.headers })).json()
  expect(inbox.files.filter((f) => f.submission_key === pkg.items[0].submission_key)).toHaveLength(3)

  // 5. Contractor issues and submits a revision with a reason; v1 remains received.
  expect((await request.post(`${cBase}/workspace`, { headers: contractor.headers, data: design(1, 101.6814) })).ok()).toBeTruthy()
  await issueAndRetain(2, 'Paving area enlarged')
  // "Go to Submit" on the projects page opens the project map straight at Proposal.
  await cpage.goto('/studio')
  const listed = cpage.getByRole('region', { name: 'Invited opportunities' }).getByRole('listitem').first()
  await expect(listed).toContainText('Go to Submit, preview what the owner receives', { timeout: 30000 })
  await listed.getByRole('button', { name: 'Go to Submit' }).click()
  const submit2 = cpage.getByRole('region', { name: /Submit to Browser integration fixture/ })
  await submit2.getByRole('radio', { name: /Version 2/ }).check()
  await submit2.getByRole('button', { name: 'Preview what the owner will receive' }).click()
  const revision = submit2.getByRole('region', { name: 'Outgoing package preview' })
  await expect(revision).toContainText('Revised submission')
  await revision.getByLabel(/What changed in this revision/).fill('Paving area enlarged')
  await revision.getByLabel(/I am authorised to submit this offer/).check()
  await revision.getByRole('button', { name: 'Submit to organisation' }).click()
  await expect(submit2.getByRole('status').filter({ hasText: /submission version 2/ })).toBeVisible({ timeout: 30000 })

  await page.reload()
  const history = page.getByRole('region', { name: 'Invite contractors to submit' })
  await expect(history).toContainText('Received · superseded', { timeout: 30000 })
  await expect(history).toContainText('Received · current')
  await expect(history).toContainText('Paving area enlarged')
  await page.screenshot({ path: `${shots}/owner-received.png`, fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
  await page.screenshot({ path: `${shots}/owner-received-phone.png`, fullPage: true })
  await other.close()
})
