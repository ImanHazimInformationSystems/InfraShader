import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { writeFile, mkdir } from 'node:fs/promises'
import { signInFixture, openWorkspaceProjects, openDetailedWorkspace } from '../studio-helpers.mjs'

// S08: automated WCAG 2.1 A/AA scan (axe-core) of the main connected screens. Automated checks
// do not replace keyboard/assistive-technology testing with real users.
const API = process.env.INFRA_TEST_API_URL || 'http://127.0.0.1:8000'
const report = []
async function scan(page, name) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .exclude('canvas')
    .analyze()
  const serious = result.violations.filter((v) => ['serious', 'critical'].includes(v.impact))
  report.push({ name, violations: result.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, sample: v.nodes.slice(0, 3).map((n) => n.target.join(' ') + ' :: ' + (n.any[0]?.message ?? '').slice(0, 160)) })) })
  return serious
}

test('main screens have no serious or critical automated WCAG 2.1 AA violations', async ({ page, request }) => {
  test.setTimeout(180000)
  const login = await request.post(`${API}/auth/v1/token`, { data: { email: 'fixture@example.invalid', password: 'fixture-only' } })
  const headers = { Authorization: `Bearer ${(await login.json()).access_token}` }
  const org = (await (await request.get('/api/v1/session', { headers })).json()).organisations[0].id
  const studio = await (await request.post(`/api/v1/organisations/${org}/projects`, { headers, data: { name: `A11y studio ${Date.now()}`, purpose: 'contractor_proposal', stakeholder: 'Client', site: { bounds: [101.681, 3.131, 101.683, 3.133] } } })).json()
  const owner = await (await request.post(`/api/v1/organisations/${org}/projects`, { headers, data: { name: `A11y owner ${Date.now()}`, purpose: 'developer_decision', stakeholder: 'Owner', site: { bounds: [101.681, 3.131, 101.683, 3.133] } } })).json()
  const failures = []
  await page.goto('/')
  await expect(page.getByLabel('Email address')).toBeVisible()
  failures.push(...(await scan(page, 'sign-in')))
  // Keyboard: the skip link is the first stop and moves focus to the main content.
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('#main-content')).toBeFocused()
  await page.keyboard.press('Tab')
  expect(await page.evaluate(() => document.activeElement?.closest('main') !== null)).toBe(true)
  await signInFixture(page)
  await expect(page.getByRole('heading', { level: 1, name: /^Good (morning|afternoon|evening)/ })).toBeVisible()
  failures.push(...(await scan(page, 'home')))
  await openWorkspaceProjects(page, 'studio')
  failures.push(...(await scan(page, 'studio-projects')))
  await page.goto(`/studio/organisations/${org}/projects/${studio.id}`)
  await expect(page.getByRole('heading', { level: 1, name: studio.name })).toBeVisible()
  failures.push(...(await scan(page, 'studio-project')))
  await openDetailedWorkspace(page)
  failures.push(...(await scan(page, 'studio-detailed-workspace')))
  await page.goto(`/review/organisations/${org}/projects/${owner.id}`)
  const panel = page.getByRole('region', { name: 'Owner proposal review' })
  await expect(panel).toBeVisible({ timeout: 15000 })
  for (const step of ['1. Basis', '2. Rubric', '3. Offers', '4. Scores', '5. Clarifications', '6. Evaluation & decision']) {
    const button = panel.getByRole('button', { name: step })
    if (await button.count()) {
      await button.click()
      failures.push(...(await scan(page, `owner-${step}`)))
    }
  }
  await page.goto('/review')
  failures.push(...(await scan(page, 'review-dashboard')))
  await mkdir('test-results/a11y', { recursive: true })
  await writeFile('test-results/a11y/report.json', JSON.stringify(report, null, 1))
  expect(failures.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([])
})
