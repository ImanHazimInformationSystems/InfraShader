import { expect } from '@playwright/test'

// Existing detailed editing workflows retain their numeric control coverage.
// New map-first interaction is exercised independently in studio-shell.spec.mjs.
export async function openDetailedWorkspace(page) {
  const entry = page.getByRole('button', { name: /^(Open|Close) design map$/ })
  await expect(entry).toBeVisible()
  if ((await entry.textContent()).includes('Open')) await entry.click()
  // Design Studio: the one-page list view is under More tools; Map view returns.
  await page.getByRole('navigation', { name: 'Studio tools' }).getByRole('button', { name: 'More tools', exact: true }).click()
  await page.getByRole('group', { name: 'More tools' }).getByRole('button', { name: /^List view/ }).click()
  await expect(page.getByRole('button', { name: 'Map view', exact: true })).toBeVisible()
  const embed = page.getByLabel('Embed design on map', { exact: true })
  if (await embed.count()) await embed.uncheck()
}

// Signing in lands on the account Home start page (workspace cards); a workspace
// project list is opened deliberately from there.
export async function signInFixture(page) {
  await page.getByLabel('Email address').fill('fixture@example.invalid')
  await page.getByLabel('Password', { exact: true }).fill('fixture-only')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
}

export async function openWorkspaceProjects(page, workspace = 'studio') {
  const name = workspace === 'studio' ? 'Open Design Studio' : 'Open Organisation Review'
  await page.getByRole('button', { name, exact: false }).click()
  await expect(page.getByRole('heading', { level: 1, name: workspace === 'studio' ? 'Design Studio' : 'Organisation Review' })).toBeVisible()
}

// Explore Map is in the sidebar on desktop and in the workspace navigation dialog on tablet/phone.
export async function openExploreMap(page) {
  const desktop = page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Explore Map' })
  if (await desktop.isVisible()) return desktop.click()
  await page.getByRole('button', { name: 'Open workspace navigation', exact: true }).click()
  await page.getByRole('navigation', { name: 'Mobile workspace navigation' }).getByRole('button', { name: 'Explore Map' }).click()
}

// Any workspace navigation button, desktop sidebar or tablet/phone navigation dialog.
export async function navigate(page, name) {
  const desktop = page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name, exact: true })
  if (await desktop.isVisible()) return desktop.click()
  await page.getByRole('button', { name: 'Open workspace navigation', exact: true }).click()
  await page.getByRole('navigation', { name: 'Mobile workspace navigation' }).getByRole('button', { name, exact: true }).click()
}

// Design Studio groups its tools into four steps (Site, Design, Prices, Proposal); optional
// tools (Terrain, Shade study) are under More tools. Open a dock tool through its step.
const TOOL_STAGE = {
  'Site records': /Site/,
  Layout: /Design/, Trees: /Design/, Objects: /Design/, Materials: /Design/,
  Pricing: /Prices/, 'Saved rates': /Prices/,
  'Review & issue': /Proposal|Decision brief/,
}
export async function openStudioTool(page, name) {
  const dock = page.getByRole('navigation', { name: 'Studio tools' })
  if (name === 'Terrain' || name === 'Shade study') {
    await dock.getByRole('button', { name: 'More tools', exact: true }).click()
    return page.getByRole('group', { name: 'More tools' }).getByRole('button', { name: new RegExp(`^${name}`) }).click()
  }
  await page.getByRole('navigation', { name: 'Proposal steps' }).getByRole('button', { name: TOOL_STAGE[name] }).click()
  await dock.getByRole('button', { name, exact: true }).click()
}

// The Studies steps are reached from different places in the map view: Saved rates (step 3),
// Review / Total / Proposal (step 4) and the optional Shade study. The list view shows all of
// them in one step bar. Steps keep their form state while another is shown.
export async function openStudiesStep(page, step) {
  const listView = await page.getByRole('button', { name: 'Map view', exact: true }).isVisible()
  if (!listView) {
    if (step === 'prices') return openStudioTool(page, 'Saved rates')
    if (step === 'shade') return openStudioTool(page, 'Shade study')
    await openStudioTool(page, 'Review & issue')
  }
  const label = { prices: /Saved rates/, shade: /Shade/, overview: /^Review/, estimate: /^Total/, proposal: /Proposal|Decision brief/ }[step]
  await page.getByRole('navigation', { name: 'Studies steps' }).getByRole('button', { name: label }).click()
}

// Map view -> one-page list view (More tools -> List view).
export async function openListView(page) {
  await page.getByRole('navigation', { name: 'Studio tools' }).getByRole('button', { name: 'More tools', exact: true }).click()
  await page.getByRole('group', { name: 'More tools' }).getByRole('button', { name: /^List view/ }).click()
}

// Design Studio project page: brief agreement, change register, history, access and templates
// are in one disclosure below the site. Opens it once; harmless if already open.
export async function openProjectRecords(page) {
  // Organisation Review keeps the same records in its "Project details, site and settings" disclosure.
  if (new URL(page.url()).pathname.startsWith('/review/')) {
    const details = page.locator('details.review-project-details').first()
    await details.waitFor({ state: 'attached', timeout: 20000 })
    if (!(await details.evaluate((node) => node.open))) await details.locator('summary').first().click()
    return
  }
  const records = page.locator('details.project-records')
  // The disclosure renders with the loaded project; wait for it rather than racing the load.
  await records.waitFor({ state: 'attached', timeout: 20000 })
  // Opening a project shows the full-screen design map; return to the project page first.
  const back = page.getByRole('button', { name: 'Project details', exact: true })
  if (await back.isVisible()) await back.click()
  if (!(await records.evaluate((node) => node.open))) await records.locator('summary').first().click()
}

// Concept terrain creation and numeric edits are in the collapsed "Precision terrain controls"
// disclosure under the Terrain builder. Opens it once; harmless if already open.
export async function openPrecisionTerrain(page) {
  const precision = page.locator('details.terrain-precision')
  await precision.waitFor({ state: 'attached', timeout: 20000 })
  if (!(await precision.evaluate((node) => node.open))) await precision.locator('summary').first().click()
}
