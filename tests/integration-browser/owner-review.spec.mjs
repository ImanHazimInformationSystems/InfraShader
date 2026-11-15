import { test, expect } from '@playwright/test'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { checkOutputPdf, pdfText } from '../check-output-pdf.mjs'

// D1B: real disposable PostGIS + test-signed identity (not Supabase Auth acceptance).
const API = process.env.INFRA_TEST_API_URL || 'http://127.0.0.1:8000'
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n')
const RECEIVED = '2026-11-10T10:00:00+08:00'
// Minimal single-page PDF with a Helvetica text layer (fixture for O06 suggestions).
function textPdf(lines) {
  const NL = '\n'
  const text = `BT /F1 11 Tf 50 750 Td 14 TL ${lines.map((l) => `(${l}) Tj T*`).join(' ')} ET`
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', ['<< /Length ' + text.length + ' >>', 'stream', text, 'endstream'].join(NL)]
  let out = '%PDF-1.4' + NL
  const offsets = objects.map((body, i) => { const at = out.length; out += [`${i + 1} 0 obj`, body, 'endobj', ''].join(NL); return at })
  const xref = out.length
  out += ['xref', `0 ${objects.length + 1}`, '0000000000 65535 f ', ...offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n `), `trailer << /Size ${objects.length + 1} /Root 1 0 R >>`, 'startxref', String(xref), '%%EOF', ''].join(NL)
  return Buffer.from(out, 'latin1')
}

test('owner compares three offers including a document-only external offer and retains a decision pack', async ({ page, request }) => {
  test.setTimeout(120000)
  await mkdir('test-results/owner-review', { recursive: true })
  const login = await request.post(`${API}/auth/v1/token`, { data: { email: 'fixture@example.invalid', password: 'fixture-only' } })
  const headers = { Authorization: `Bearer ${(await login.json()).access_token}` }
  const session = await (await request.get('/api/v1/session', { headers })).json()
  const org = session.organisations[0].id
  const name = `Owner courtyard tender ${Date.now()}`
  const project = await (await request.post(`/api/v1/organisations/${org}/projects`, { headers, data: { name, purpose: 'developer_decision', stakeholder: 'Facilities owner', problem: 'Replace failing paving and planting', site: { bounds: [101.681, 3.131, 101.683, 3.133] } } })).json()
  const base = `/api/v1/organisations/${org}/projects/${project.id}/owner-review`

  await page.goto(`/review/organisations/${org}/projects/${project.id}`)
  await page.getByLabel('Email address').fill('fixture@example.invalid')
  await page.getByLabel('Password', { exact: true }).fill('fixture-only')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { name, exact: true }).first()).toBeVisible()
  const panel = page.getByRole('region', { name: 'Owner proposal review' })
  await expect(panel).toBeVisible()

  // 1. Comparison basis through the UI; policy selects have no default.
  await panel.getByLabel('Basis title').fill('Courtyard landscape works')
  await panel.getByLabel('Comparison tax basis').selectOption('exclusive')
  await panel.getByLabel('Owner budget (MYR, optional)').fill('80000.00')
  await panel.getByLabel('Evaluation horizon, years (optional)').fill('10')
  await panel.getByRole('button', { name: 'Save comparison basis' }).click()
  await expect(panel.getByRole('alert')).toContainText('self_approval')
  await panel.getByLabel(/Self-approval policy/).selectOption('permitted')
  await panel.getByLabel('You').check()
  await panel.getByLabel('Scope 1 code').fill('PAV')
  await panel.getByLabel('Scope 1 description').fill('Paving')
  await panel.getByLabel('Scope 1 unit').fill('m2')
  await panel.getByLabel('Scope 1 quantity').fill('100')
  await panel.getByRole('button', { name: 'Add requirement' }).click()
  await panel.getByLabel('Requirement 1 code').fill('INS')
  await panel.getByLabel('Requirement 1 text').fill('Insurance certificate')
  await panel.getByRole('button', { name: 'Save comparison basis' }).click()
  await expect(panel.getByRole('status').filter({ hasText: 'Comparison basis saved.' })).toBeVisible()

  // 2. Rubric draft, exact weight total, lock.
  await panel.getByRole('button', { name: '2. Rubric' }).click()
  await panel.getByLabel('Criterion 1 code').fill('PRICE')
  await panel.getByLabel('Criterion 1 name').fill('Price and value')
  await panel.getByLabel('Criterion 1 weight').fill('60')
  await panel.getByRole('button', { name: 'Add criterion' }).click()
  await panel.getByLabel('Criterion 2 code').fill('TECH')
  await panel.getByLabel('Criterion 2 name').fill('Technical approach')
  await panel.getByLabel('Criterion 2 weight').fill('40')
  await expect(panel.getByText('Weight total: 100.00 (valid)')).toBeVisible()
  await panel.getByLabel('Missing reviewer score rule').selectOption('not_ranked')
  await panel.getByLabel('Reviewer score aggregation').selectOption('mean')
  await panel.getByRole('button', { name: 'Save rubric draft' }).click()
  await expect(panel.getByText('Rubric draft saved.')).toBeVisible()
  await panel.getByRole('button', { name: 'Lock rubric for scoring' }).click()
  await expect(panel.getByText(/Version 2 locked/)).toBeVisible()

  // 3. External, unregistered document-only offer received and confirmed through the UI.
  await panel.getByRole('button', { name: '3. Offers' }).click()
  await panel.getByText('Record a received offer').click()
  await panel.getByLabel('Bidder name').fill('Unregistered Paving')
  await panel.getByLabel('Sender').first().fill('Estimator by email')
  await panel.getByLabel('Received at (UTC+08:00)').first().fill('2026-11-10T10:00')
  await panel.getByLabel(/Receipt evidence/).first().fill('Owner inbox message 2026-11-10')
  await panel.getByRole('button', { name: 'Record receipt' }).click()
  await expect(panel.getByText(/Unregistered Paving — package v1 · document only · unregistered supplier/)).toBeVisible()
  await panel.getByText(/Unregistered Paving — package v1/).click()
  await panel.getByLabel('Original document').setInputFiles({ name: 'paving-offer.pdf', mimeType: 'application/pdf', buffer: PDF })
  await panel.getByLabel('Document description').fill('Signed offer letter')
  await panel.getByRole('button', { name: 'Retain original' }).click()
  await expect(panel.getByText(/paving-offer\.pdf · v1/)).toBeVisible()
  await panel.getByRole('button', { name: 'View beside fields' }).click()
  await expect(panel.locator('iframe[title="Retained document paving-offer.pdf"]')).toBeVisible()
  const docOption = await panel.getByLabel('quoted_total source document').locator('option').nth(1).getAttribute('value')
  await panel.getByLabel('quoted_total value').fill('60000.00')
  await panel.getByLabel('quoted_total state').selectOption('confirmed')
  await panel.getByLabel('quoted_total source document').selectOption(docOption)
  await panel.getByLabel('quoted_total source location').fill('page 1 total')
  await panel.getByLabel('tax basis value').selectOption('exclusive')
  await panel.getByLabel('tax_basis state').selectOption('confirmed')
  await panel.getByLabel('tax_basis source document').selectOption(docOption)
  await panel.getByLabel('tax_basis source location').fill('page 1 note 2')
  for (const name of ['validity_until', 'duration_days', 'warranty', 'exclusions', 'annual_maintenance'])
    await panel.getByLabel(`${name} state`).selectOption('not_provided')
  await panel.getByRole('button', { name: 'Add offer line' }).click()
  await panel.getByLabel('Line 1 original text').fill('Interlocking pavers supply and lay')
  await panel.getByLabel('Line 1 amount').fill('60000.00')
  await panel.getByLabel('Line 1 source location').fill('page 2 row 4')
  await panel.getByLabel('Line 1 scope item').selectOption('PAV')
  await panel.getByLabel('Line 1 mapping confirmed').check()
  await panel.getByLabel('INS response state').selectOption('absent')
  await panel.getByRole('button', { name: 'Save confirmed offer values' }).click()
  await expect(panel.getByText('Confirmed values saved as a new revision.')).toBeVisible()

  // Two further offers via the same API (native snapshot and XLSX-free PDF), confirmed by the owner.
  const state = await (await request.get(base, { headers })).json()
  const external = state.submissions[0].key
  const offers = {}
  for (const [bidder, channel] of [['Native Landscapes', 'native_upload'], ['Garden Works', 'external_document']]) {
    const created = await (await request.post(`${base}/submissions`, { headers, data: { bidder_name: bidder, channel, sender: bidder, received_at: RECEIVED, receipt_evidence: 'Owner inbox' } })).json()
    const file = await (await request.post(`${base}/submissions/${created.key}/file`, { headers, multipart: { description: 'Original', file: channel === 'native_upload' ? { name: 'native.json', mimeType: 'application/json', buffer: Buffer.from('{"proposal":"native snapshot"}') } : { name: 'garden.pdf', mimeType: 'application/pdf', buffer: textPdf(['Garden Works offer', 'Hardscape lump sum 72,000.00']) } } })).json()
    const src = { document_id: file.id, location: 'page 1' }
    const amount = bidder === 'Native Landscapes' ? '70000.00' : '72000.00'
    const fields = Object.fromEntries(['validity_until', 'duration_days', 'warranty', 'exclusions', 'annual_maintenance'].map((n) => [n, { state: 'not_provided' }]))
    const update = await request.put(`${base}/submissions/${created.key}`, { headers, data: { expected_revision: 1, fields: { ...fields, quoted_total: { state: 'confirmed', value: amount, source: src }, tax_basis: { state: 'confirmed', value: 'exclusive', source: src } }, lines: [{ line_id: crypto.randomUUID(), original_text: 'Paving', original_amount: amount, source: src, scope_code: 'PAV', state: 'included', mapping_confirmed: true }], responses: [{ code: 'INS', state: 'accepted', source: src, note: 'Certificate checked' }] } })
    expect(update.ok()).toBeTruthy()
    offers[bidder] = created.key
  }
  const rubric = 2
  // Hand-worked: Native PRICE 7 ->42, TECH 9 ->36 = 78.00; Garden PRICE 8 ->48, TECH 6 ->24 = 72.00
  const scores = { 'Native Landscapes': { PRICE: 7, TECH: 9 }, 'Garden Works': { PRICE: 8, TECH: 6 } }
  for (const [bidder, values] of Object.entries(scores)) {
    const saved = await request.put(`${base}/scores/${offers[bidder]}`, { headers, data: { expected_revision: 0, rubric_revision: rubric, conflict: 'none', state: 'submitted', scores: Object.entries(values).map(([criterion, score]) => ({ criterion, score, rationale: `${criterion} evidence reviewed` })) } })
    expect(saved.ok()).toBeTruthy()
  }

  // 4. Score the external offer through the UI.
  await page.reload()
  await panel.getByRole('button', { name: '4. Scores' }).click()
  await panel.getByText(/Unregistered Paving \(package v1\) — my sheet: not started/).click()
  await panel.getByLabel('PRICE score for Unregistered Paving').fill('10')
  await panel.getByLabel('PRICE rationale for Unregistered Paving').fill('Lowest quoted total')
  await panel.getByLabel('TECH score for Unregistered Paving').fill('5')
  await panel.getByLabel('TECH rationale for Unregistered Paving').fill('Method statement thin')
  await panel.getByRole('button', { name: 'Submit sheet' }).click()
  await expect(panel.getByText('Score sheet submitted.')).toBeVisible()

  // 5. Evaluation: the cheapest offer lacks insurance evidence and is not silently best value.
  await panel.getByRole('button', { name: '6. Evaluation & decision' }).click()
  await expect(panel.getByText('Official evaluation (locked rubric)')).toBeVisible()
  const rows = panel.locator('table.owner-table').first().locator('tbody tr')
  await expect(rows.filter({ hasText: 'Native Landscapes' })).toContainText('78.00')
  await expect(rows.filter({ hasText: 'Native Landscapes' }).locator('td').nth(2)).toHaveText('1')
  await expect(rows.filter({ hasText: 'Garden Works' })).toContainText('72.00')
  const ext = rows.filter({ hasText: 'Unregistered Paving' })
  await expect(ext).toContainText('(document only)')
  await expect(ext).toContainText('Needs clarification')
  await expect(ext).toContainText('Not ranked')
  await expect(ext).toContainText('Mandatory requirement INS is absent.')
  await page.screenshot({ path: 'test-results/owner-review/evaluation-desktop.png', fullPage: true })

  // 6. Recommendation, signoff and retained pack download.
  await panel.getByLabel('Recommended offer').selectOption({ label: 'Native Landscapes (rank 1)' })
  await panel.getByLabel('Rationale').fill('Highest weighted score among comparable offers; within budget')
  await panel.getByRole('button', { name: 'Submit for approval' }).click()
  await expect(panel.getByText('State: submitted')).toBeVisible()
  await panel.getByLabel('Reason (required)').fill('Approved under delegated authority')
  await panel.getByRole('button', { name: 'Approve', exact: true }).click()
  await expect(panel.getByText('State: approved')).toBeVisible()
  const downloadPromise = page.waitForEvent('download')
  await panel.getByRole('button', { name: /decision-pack\.json/ }).click()
  const download = await downloadPromise
  const pack = JSON.parse(await readFile(await download.path(), 'utf8'))
  expect(pack.decision.state).toBe('approved')
  expect(pack.source_manifest).toHaveLength(3)
  expect(pack.evaluation.results.find((r) => r.bidder_name === 'Native Landscapes').weighted_score).toBe('78.00')
  expect(pack.decision.history.map((h) => h.action)).toEqual(['submit', 'approve'])

  // O17: readable memorandum rendered from the retained, hash-checked pack and retained once.
  await panel.getByRole('button', { name: 'Create retained decision memorandum (PDF)' }).click()
  const memoButton = panel.getByRole('button', { name: 'Decision memorandum (PDF)' })
  await expect(memoButton).toBeVisible({ timeout: 30000 })
  const memoDownload = page.waitForEvent('download')
  await memoButton.click()
  const memoFile = 'artifacts/decision-memorandum.pdf'
  await mkdir('artifacts', { recursive: true })
  await writeFile(memoFile, await readFile(await (await memoDownload).path()))
  checkOutputPdf(memoFile)
  const memoText = pdfText(memoFile)
  for (const expected of ['DECISION MEMORANDUM', 'Native Landscapes', 'Reviewer rationale', 'Unresolved qualifications', 'document-only', 'Approved under delegated authority', pack.evaluation.hash.slice(0, 32)]) {
    expect(memoText).toContain(expected)
  }
  const memoMeta = (await (await request.get(base, { headers })).json()).files.filter((f) => f.purpose === 'decision_memo')
  expect(memoMeta).toHaveLength(1)

  // External offer original is still byte-identical.
  const original = state.files.find((f) => f.submission_key === external)
  const bytes = await (await request.get(`${base}/files/${original.id}`, { headers })).body()
  expect(Buffer.compare(bytes, PDF)).toBe(0)

  // Dashboard and narrow-screen inspection.
  await page.goto('/review')
  const board = page.getByRole('region', { name: 'Owner review dashboard' })
  await expect(board.getByRole('row', { name: new RegExp(name) })).toContainText('approved')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`/review/organisations/${org}/projects/${project.id}`)
  await panel.getByRole('button', { name: '6. Evaluation & decision' }).click()
  await expect(panel.getByText('State: approved')).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(1)
  await page.screenshot({ path: 'test-results/owner-review/evaluation-narrow.png', fullPage: true })

  // O06/O08 at desktop width: explicit failure for a file without a text layer, unconfirmed suggestions
  // from a text PDF, and two retained documents side by side.
  await page.setViewportSize({ width: 1280, height: 900 })
  await panel.getByRole('button', { name: '3. Offers' }).click()
  const compare = panel.locator('details.owner-compare')
  await compare.locator('summary').click()
  await compare.getByLabel('Left document').selectOption({ label: 'Unregistered Paving — paving-offer.pdf (package v1)' })
  await compare.getByLabel('Right document').selectOption({ label: 'Garden Works — garden.pdf (package v1)' })
  await expect(compare.locator('iframe[title="Left compared document"]')).toBeVisible()
  await expect(compare.locator('iframe[title="Right compared document"]')).toBeVisible()
  await expect(compare.getByText(/no geometric equivalence, scale or matching scope is inferred/)).toBeVisible()
  await page.screenshot({ path: 'test-results/owner-review/compare-documents.png' })
  await panel.getByRole('button', { name: 'Suggest lines from text' }).first().click()
  const suggestions = panel.getByRole('region', { name: 'Unverified text suggestions' })
  await expect(suggestions.getByRole('status')).toContainText(/text layer|could not be read/)
  await suggestions.getByRole('button', { name: 'Close suggestions' }).click()
  await panel.locator('summary', { hasText: 'Garden Works — package v1' }).click()
  await panel.getByRole('button', { name: 'Suggest lines from text' }).last().click()
  await suggestions.getByLabel(/Hardscape lump sum — MYR 72000\.00/).check()
  await suggestions.getByRole('button', { name: 'Add 1 selected as unconfirmed lines' }).click()
  await expect(panel.getByLabel('Line 2 original text')).toHaveValue('Hardscape lump sum')
  await expect(panel.getByLabel('Line 2 mapping confirmed')).not.toBeChecked()
  await page.screenshot({ path: 'test-results/owner-review/suggestions.png' })
})
