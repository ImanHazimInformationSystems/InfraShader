import { test, expect } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import { openDetailedWorkspace } from '../studio-helpers.mjs'

// S07 CORE: measure (not certify) the catalogue section 10 D1 fixture on this local machine.
// Goals in section 10 are proposed, not achieved benchmarks; results here are a local measurement.
const API = process.env.INFRA_TEST_API_URL || 'http://127.0.0.1:8000'
const RECEIVED = '2026-11-10T10:00:00+08:00'
const pct = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]
}

test('D1 fixture: 10 offers x 500 lines and concurrent project lists', async ({ page, request, playwright }) => {
  test.setTimeout(600000)
  const login = await request.post(`${API}/auth/v1/token`, { data: { email: 'fixture@example.invalid', password: 'fixture-only' } })
  const token = (await login.json()).access_token
  const headers = { Authorization: `Bearer ${token}` }
  const session = await (await request.get('/api/v1/session', { headers })).json()
  const org = session.organisations[0].id
  const results = { machine: { cpus: os.cpus().length, cpu: os.cpus()[0]?.model, memory_gb: Math.round(os.totalmem() / 2 ** 30), platform: `${os.platform()} ${os.release()}` }, browser: 'Microsoft Edge (Playwright channel msedge), production bundle via vite preview', database: 'local PostgreSQL/PostGIS 17 disposable schema' }

  // 1. Server-backed list under 10 concurrent clients (200 projects present).
  for (let i = 0; i < 200; i += 1) {
    const created = await request.post(`/api/v1/organisations/${org}/projects`, { headers, data: { name: `Perf list ${i} ${Date.now()}`, purpose: i % 2 ? 'contractor_proposal' : 'developer_decision', stakeholder: `Stakeholder ${i}`, site: { bounds: [101.681, 3.131, 101.683, 3.133] } } })
    expect(created.status()).toBe(201)
  }
  const clients = await Promise.all(Array.from({ length: 10 }, () => playwright.request.newContext({ baseURL: test.info().project.use.baseURL, extraHTTPHeaders: headers })))
  const listTimes = []
  await Promise.all(clients.map(async (client, index) => {
    for (let i = 0; i < 20; i += 1) {
      const started = performance.now()
      const response = await client.get(`/api/v1/organisations/${org}/projects?limit=24&offset=${(i * 24) % 192}&query=${index % 2 ? 'Perf' : ''}`)
      listTimes.push(performance.now() - started)
      expect(response.ok()).toBeTruthy()
    }
  }))
  await Promise.all(clients.map((client) => client.dispose()))
  results.project_list = { workload: '10 concurrent clients x 20 sequential GET /projects?limit=24 (200+ projects)', requests: listTimes.length, p50_ms: Math.round(pct(listTimes, 50)), p95_ms: Math.round(pct(listTimes, 95)), max_ms: Math.round(Math.max(...listTimes)), goal: 'p95 <= 1000 ms (proposed)' }

  // 2. Owner D1 fixture: 10 offers, 500 confirmed lines each, locked rubric, scores.
  const project = await (await request.post(`/api/v1/organisations/${org}/projects`, { headers, data: { name: `Perf owner ${Date.now()}`, purpose: 'developer_decision', stakeholder: 'Owner', site: { bounds: [101.681, 3.131, 101.683, 3.133] } } })).json()
  const base = `/api/v1/organisations/${org}/projects/${project.id}/owner-review`
  const me = (await (await request.get(base, { headers })).json()).user_id
  const scope = Array.from({ length: 50 }, (_, i) => ({ code: `S${i}`, description: `Scope item ${i}`, unit: 'm2' }))
  expect((await request.put(`${base}/basis`, { headers, data: { expected_revision: 0, title: 'Perf basis', tax_basis: 'exclusive', self_approval: 'permitted', reviewers: [me], scope_items: scope, budget: '9000000.00' } })).ok()).toBeTruthy()
  const criteria = [['PRICE', '60'], ['TECH', '40']].map(([code, weight]) => ({ code, name: code, weight, direction: 'higher_better', scale_min: 0, scale_max: 10 }))
  expect((await request.put(`${base}/rubric`, { headers, data: { expected_revision: 0, criteria, missing_score_rule: 'not_ranked', reviewer_aggregation: 'mean' } })).ok()).toBeTruthy()
  expect((await request.post(`${base}/rubric/lock`, { headers, data: { expected_revision: 1 } })).ok()).toBeTruthy()
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n')
  const saveTimes = []
  for (let o = 0; o < 10; o += 1) {
    const created = await (await request.post(`${base}/submissions`, { headers, data: { bidder_name: `Bidder ${o}`, channel: 'external_document', sender: `Bidder ${o}`, received_at: RECEIVED, receipt_evidence: 'Perf fixture' } })).json()
    const file = await (await request.post(`${base}/submissions/${created.key}/file`, { headers, multipart: { description: 'Original', file: { name: `offer-${o}.pdf`, mimeType: 'application/pdf', buffer: pdf } } })).json()
    const src = { document_id: file.id, location: 'page 1' }
    const lines = Array.from({ length: 500 }, (_, i) => ({ line_id: crypto.randomUUID(), original_text: `Line ${i} paving and planting works as described in schedule`, original_amount: '100.00', source: { ...src, location: `page ${1 + Math.floor(i / 25)} row ${i % 25}` }, scope_code: `S${i % 50}`, state: 'included', mapping_confirmed: true }))
    const fields = Object.fromEntries(['validity_until', 'duration_days', 'warranty', 'exclusions', 'annual_maintenance'].map((n) => [n, { state: 'not_provided' }]))
    const started = performance.now()
    const saved = await request.put(`${base}/submissions/${created.key}`, { headers, data: { expected_revision: 1, fields: { ...fields, quoted_total: { state: 'confirmed', value: '50000.00', source: src }, tax_basis: { state: 'confirmed', value: 'exclusive', source: src } }, lines } })
    saveTimes.push(performance.now() - started)
    expect(saved.ok(), await saved.text()).toBeTruthy()
    expect((await request.put(`${base}/scores/${created.key}`, { headers, data: { expected_revision: 0, rubric_revision: 2, conflict: 'none', state: 'submitted', scores: criteria.map((c) => ({ criterion: c.code, score: 5 + (o % 5), rationale: 'Perf' })) } })).ok()).toBeTruthy()
  }
  const timed = async (path) => { const started = performance.now(); const response = await request.get(path, { headers }); const body = await response.body(); expect(response.ok()).toBeTruthy(); return { ms: Math.round(performance.now() - started), kib: Math.round(body.length / 1024) } }
  const evaluation = []
  for (let i = 0; i < 5; i += 1) evaluation.push(await timed(`${base}/evaluation`))
  const stateTimes = []
  for (let i = 0; i < 5; i += 1) stateTimes.push(await timed(base))
  results.owner_d1 = { fixture: '10 offers x 500 confirmed lines, 50 scope items, locked 2-criterion rubric, 1 reviewer', submission_save_ms: { p50: Math.round(pct(saveTimes, 50)), max: Math.round(Math.max(...saveTimes)) }, evaluation_ms: evaluation.map((e) => e.ms), evaluation_kib: evaluation[0].kib, state_ms: stateTimes.map((e) => e.ms), state_kib: stateTimes[0].kib }

  // 3. Browser: time to interactive tables for the same fixture.
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message.slice(0, 300)))
  page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 300)) })
  await page.goto(`/review/organisations/${org}/projects/${project.id}`)
  await page.getByLabel('Email address').fill('fixture@example.invalid')
  await page.getByLabel('Password', { exact: true }).fill('fixture-only')
  const signed = performance.now()
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  const panel = page.getByRole('region', { name: 'Owner proposal review' })
  await expect(panel.getByRole('button', { name: '1. Basis' })).toBeVisible({ timeout: 60000 })
  const loaded = performance.now()
  await panel.getByRole('button', { name: '6. Evaluation & decision' }).click()
  await expect(panel.getByRole('row', { name: /Bidder 9/ })).toBeVisible({ timeout: 60000 })
  const evaluated = performance.now()
  const offersClicked = performance.now()
  await panel.getByRole('button', { name: '3. Offers' }).click()
  // The first offer opens by default, paginated 50 lines at a time.
  await expect(panel.getByLabel('Line 1 scope item')).toBeVisible({ timeout: 60000 })
  await expect(panel.getByText(/Lines 1–50 of 500/)).toBeVisible()
  const offerOpened = performance.now()
  await panel.getByLabel('Line page', { exact: true }).selectOption({ label: '451–500' })
  await expect(panel.getByLabel('Line 500 scope item')).toBeVisible()
  const lastPage = performance.now()
  const second = panel.locator('summary', { hasText: 'Bidder 1 — package v1' })
  const switched = performance.now()
  await second.click()
  await expect(panel.locator('details[open] summary', { hasText: 'Bidder 1 — package v1' })).toBeVisible()
  await expect(panel.getByLabel('Line 1 scope item')).toBeVisible({ timeout: 60000 })
  const secondOpened = performance.now()
  results.browser = { sign_in_to_owner_review_ms: Math.round(loaded - signed), open_evaluation_table_ms: Math.round(evaluated - loaded), open_offers_step_with_500_line_editor_ms: Math.round(offerOpened - offersClicked), jump_to_last_line_page_ms: Math.round(lastPage - offerOpened), switch_to_other_500_line_offer_ms: Math.round(secondOpened - switched), goal: 'interactive table <= 300 ms on reference fixture (proposed)' }
  await mkdir('test-results/performance', { recursive: true })
  await page.screenshot({ path: 'test-results/performance/offer-500-lines.png' })
  await writeFile('test-results/performance/s07-measurement.json', JSON.stringify(results, null, 1))
  console.log(JSON.stringify(results, null, 1))
})

test('map: largest admitted design scene (100 buildings + 50 proposed areas = 150-item cap) frame intervals', async ({ page, request }) => {
  test.setTimeout(240000)
  const login = await request.post(`${API}/auth/v1/token`, { data: { email: 'fixture@example.invalid', password: 'fixture-only' } })
  const headers = { Authorization: `Bearer ${(await login.json()).access_token}` }
  const org = (await (await request.get('/api/v1/session', { headers })).json()).organisations[0].id
  const project = await (await request.post(`/api/v1/organisations/${org}/projects`, { headers, data: { name: `Perf map ${Date.now()}`, purpose: 'contractor_proposal', stakeholder: 'Client', site: { bounds: [101.680, 3.130, 101.684, 3.134] } } })).json()
  const square = (w, s, d) => ({ type: 'Polygon', coordinates: [[[w, s], [w + d, s], [w + d, s + d], [w, s + d], [w, s]]] })
  const grid = (n, offset) => Array.from({ length: n }, (_, i) => [101.6802 + (i % 15) * 0.00024, 3.1302 + Math.floor(i / 15) * 0.00012 + offset])
  const buildings = grid(100, 0).map(([w, s], i) => ({ id: crypto.randomUUID(), name: `Building ${i}`, kind: 'building', status: 'existing', geometry: square(w, s, 0.00008), height_m: 6 + (i % 5) * 3, height_source: 'Perf fixture', source_note: 'Perf fixture', provenance: 'estimated' }))
  const areas = grid(50, 0.0018).map(([w, s], i) => ({ id: crypto.randomUUID(), name: `Paving ${i}`, kind: 'area', geometry: square(w, s, 0.0001), source_note: 'Perf fixture', provenance: 'estimated' }))
  const boundary = square(101.6801, 3.1301, 0.0038)
  const saved = await request.post(`/api/v1/organisations/${org}/projects/${project.id}/workspace`, { headers, data: { expected_revision: 0, boundary, boundary_provenance: 'estimated', boundary_source: 'Perf', targets: [], scenarios: { baseline: { name: 'Baseline', items: buildings }, option_a: { name: 'Option A', items: areas }, option_b: { name: 'Option B', items: [] } } } })
  expect(saved.ok(), await saved.text()).toBeTruthy()
  await page.goto(`/studio/organisations/${org}/projects/${project.id}`)
  await page.getByLabel('Email address').fill('fixture@example.invalid')
  await page.getByLabel('Password', { exact: true }).fill('fixture-only')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await openDetailedWorkspace(page)
  const region = page.getByRole('region', { name: 'Geometry drawing canvas' })
  await region.scrollIntoViewIfNeeded()
  await page.getByRole('button', { name: '3D buildings', exact: true }).click()
  await expect(region).toHaveAttribute('data-rendered-buildings', /^[1-9]/, { timeout: 30000 })
  const sample = await page.evaluate(() => new Promise((resolve) => {
    const times = []
    let last = performance.now()
    const start = last
    const tick = (now) => {
      times.push(now - last); last = now
      if (now - start < 4000) requestAnimationFrame(tick); else resolve(times.slice(5))
    }
    requestAnimationFrame(tick)
  }))
  const sorted = [...sample].sort((a, b) => a - b)
  const mean = sample.reduce((a, b) => a + b, 0) / sample.length
  const rendered = await region.getAttribute('data-rendered-buildings')
  const result = { scene: '100 extruded existing buildings (Baseline) + 50 Option A areas (150-item option cap); offline coordinate style; 1280x900; headless Edge', rendered_buildings: Number(rendered), frames: sample.length, mean_frame_ms: Math.round(mean * 10) / 10, p95_frame_ms: Math.round(sorted[Math.floor(sorted.length * 0.95)] * 10) / 10, approx_fps: Math.round(1000 / mean), note: 'Idle-scene requestAnimationFrame intervals; camera not animated. The 1,000-instanced-object goal is not reachable with the current 150-item workspace cap and was not measured.' }
  await mkdir('test-results/performance', { recursive: true })
  await writeFile('test-results/performance/s07-map.json', JSON.stringify(result, null, 1))
  await region.screenshot({ path: 'test-results/performance/map-150-items.png' })
  console.log(JSON.stringify(result))
})
