import { test, expect } from '@playwright/test'
import { readFile, mkdir } from 'node:fs/promises'
const catalogue = JSON.parse(
  await readFile(new URL('../../apps/web/src/product/catalogue.json', import.meta.url), 'utf8'),
)
const groupNames = {
  site: 'Site & evidence',
  design: 'Design workspace',
  studies: 'Studies & checks',
  pricing: 'Quantities & pricing',
  delivery: 'Proposals & delivery',
  business: 'Opportunities',
  portfolio: 'Portfolio & outcomes',
  briefs: 'Briefs & submissions',
  evaluation: 'Evaluate & compare',
  decisions: 'Decisions & reports',
  assistant: 'Assistance',
  inbox: 'Inbox & tasks',
  records: 'Files & history',
  organisation: 'Organisation & access',
  preferences: 'Preferences',
  system: 'Jobs & recovery',
  privacy: 'Privacy & AI controls',
  help: 'Help & feedback',
}
async function start(page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Open Browser Demo' }).click()
}
async function navigation(page) {
  const mobile = page.getByRole('button', { name: 'Open workspace navigation' })
  if (await mobile.isVisible()) {
    await mobile.click()
    return page.getByRole('navigation', { name: 'Mobile workspace navigation' })
  }
  return page.getByRole('navigation', { name: 'Main navigation' })
}
async function area(page, group) {
  const nav = await navigation(page)
  const button = nav.getByRole('button', { name: groupNames[group], exact: group !== 'assistant' })
  // Studio feature previews and the shared workspace are collapsed groups; open only the group
  // that holds the button (clicking an open group's summary would close it).
  // Role queries skip content inside a closed <details>, so match the group by its button text.
  const holder = nav.locator('details').filter({
    has: page.locator('button', { hasText: groupNames[group] }),
  })
  if ((await holder.count()) && !(await holder.evaluate((node) => node.open)))
    await holder.locator('summary').click()
  await button.click()
}
async function workspace(page, mode) {
  const mobile = page.getByRole('button', { name: 'Open workspace navigation' })
  if (await mobile.isVisible()) {
    await mobile.click()
    await page.getByLabel('Switch workspace on mobile').selectOption(mode)
  } else await page.getByLabel('Switch workspace', { exact: true }).selectOption(mode)
}
test('all 85 roadmap features are reachable in their workspace with honest readiness and no domain writes', async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== 'desktop',
    'Complete ID traversal once; responsive tasks are tested separately.',
  )
  test.setTimeout(120000)
  const errors = [],
    writes = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('request', (r) => {
    if (r.method() !== 'GET' && /\/api\//.test(r.url())) writes.push(r.url())
  })
  await start(page)
  await mkdir('artifacts/product-ui', { recursive: true })
  let currentMode = 'studio',
    currentGroup = ''
  for (const feature of catalogue) {
    const mode = feature.id.startsWith('O') ? 'review' : 'studio'
    if (mode !== currentMode) {
      await workspace(page, mode)
      currentMode = mode
      currentGroup = ''
    }
    if (feature.group !== currentGroup) {
      await area(page, feature.group)
      currentGroup = feature.group
    }
    await page
      .getByRole('navigation', { name: 'Feature sections' })
      .getByRole('button', { name: new RegExp(`^${feature.id} `) })
      .click()
    await expect(page.locator(`[data-feature-id="${feature.id}"]`)).toBeVisible()
    await expect(
      page.getByRole('heading', { name: feature.name, exact: true, level: 2 }),
    ).toBeVisible()
    if (feature.id === 'L04') {
      await expect(page.locator('.product-disclosure')).toContainText(
        'Browser Demo has limited local drawing only.',
      )
      await expect(
        page.getByRole('button', { name: 'Choose a project', exact: true }),
      ).toBeVisible()
      await expect(page.getByRole('button', { name: 'Apply to preview', exact: true })).toHaveCount(
        0,
      )
    } else {
      await expect(page.locator('.product-disclosure')).toContainText(
        /preview|not connected|before connecting/i,
      )
      await expect(page.getByLabel(feature.fields[0] + ' *', { exact: true })).toBeVisible()
    }
    if (['L04', 'L24', 'O08', 'A01'].includes(feature.id)) {
      await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }))
      await page.screenshot({
        path: `artifacts/product-ui/desktop-${feature.id}.png`,
        fullPage: true,
        animations: 'disabled',
      })
    }
  }
  expect(writes).toEqual([])
  expect(errors).toEqual([])
  const deepLink = page.url()
  await page.reload()
  await page.getByRole('button', { name: 'Open Browser Demo' }).click()
  await expect(page).toHaveURL(deepLink)
  await expect(page.locator(`[data-feature-id="${catalogue.at(-1).id}"]`)).toBeVisible()
})
test('preview forms, sample filters, pagination, unsaved guard, modal focus and workspace switching work responsively', async ({
  page,
}, info) => {
  test.setTimeout(60000)
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await start(page)
  const mobileMenu = page.getByRole('button', { name: 'Open workspace navigation' })
  if (await mobileMenu.isVisible()) {
    await mobileMenu.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('dialog', { name: 'Workspace navigation' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(mobileMenu).toBeFocused()
  }
  await area(page, 'pricing')
  await expect(
    page.getByRole('heading', { name: 'Professional boq and takeoff workbook', exact: true }),
  ).toBeVisible()
  await page.getByLabel('Show illustrative rows').check()
  await page.getByLabel('Search preview records').fill('Walkway')
  await expect(page.locator('tbody tr')).toHaveCount(1)
  await page.getByLabel('Search preview records').fill('')
  for (let i = 0; i < 6; i++) {
    await page.getByLabel('BOQ item *', { exact: true }).fill(`Preview item ${i}`)
    await page.getByLabel('Measurement method *', { exact: true }).fill('Manual concept method')
    await page
      .getByLabel('Measurement source *', { exact: true })
      .fill('Illustrative source; not surveyed')
    await page.getByRole('button', { name: 'Apply to preview', exact: true }).click()
  }
  await expect(
    page.getByRole('status').filter({ hasText: 'Applied to this preview only' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Next preview page' }).click()
  await expect(page.locator('.product-pagination')).toContainText('2 / 2')
  await page.getByRole('button', { name: 'Format guide' }).click()
  await expect(page.getByRole('dialog', { name: 'Keep the original context.' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Format guide' })).toBeFocused()
  await page.getByLabel('BOQ item *', { exact: true }).fill('Unapplied input')
  page.once('dialog', (d) => d.dismiss())
  await page
    .getByRole('navigation', { name: 'Feature sections' })
    .getByRole('button', { name: /^L14 / })
    .click()
  await expect(page.getByLabel('BOQ item *', { exact: true })).toHaveValue('Unapplied input')
  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'Clear inputs', exact: true }).click()
  await page.getByRole('button', { name: 'Workflow guide' }).click()
  await expect(page.getByRole('complementary', { name: 'Workflow guide' })).toBeVisible()
  await mkdir('artifacts/product-ui', { recursive: true })
  await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }))
  await page.screenshot({
    path: `artifacts/product-ui/${info.project.name}-studio.png`,
    fullPage: true,
    animations: 'disabled',
  })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
  await workspace(page, 'review')
  await area(page, 'evaluation')
  await page
    .getByRole('navigation', { name: 'Feature sections' })
    .getByRole('button', { name: /^O09 / })
    .click()
  await page.getByLabel('Rubric title *', { exact: true }).fill('Illustrative rubric')
  await page.getByLabel('Missing-data policy *', { exact: true }).fill('Human review required')
  await page.getByLabel('Evidence requirement *', { exact: true }).fill('Original proposal pages')
  await page.getByLabel('Technical approach weight').fill('50')
  await page.getByRole('button', { name: 'Apply to preview', exact: true }).click()
  await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }))
  await expect(page.getByRole('alert')).toContainText('total 100%')
  await page.getByLabel('Technical approach weight').fill('40')
  await page.getByRole('button', { name: 'Apply to preview', exact: true }).click()
  await page.screenshot({
    path: `artifacts/product-ui/${info.project.name}-review.png`,
    fullPage: true,
    animations: 'disabled',
  })
  await area(page, 'assistant')
  await page.getByRole('button', { name: 'Check assistant availability' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'no AI request was sent' })).toBeVisible()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(page.locator('.product-feature-panel')).toHaveCSS('animation-name', 'none')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
  expect(errors).toEqual([])
})
test('saved Demo project still opens existing map tools from a feature workbench', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'Existing saved-project entry smoke once.')
  await start(page)
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Explore Map', exact: true })
    .click()
  await page.getByRole('button', { name: 'Continue with this site' }).click()
  await page.getByLabel('Project name *', { exact: true }).fill('UI connection smoke')
  await page.getByLabel('Internal sponsor *', { exact: true }).fill('Browser-only fixture')
  await page.getByRole('button', { name: 'Create project', exact: true }).click()
  await page.getByRole('button', { name: 'Open design map', exact: true }).click()
  await expect(page.getByRole('navigation', { name: 'Studio tools' })).toBeVisible()
  await page.getByRole('button', { name: 'Project details', exact: true }).click()
  await area(page, 'design')
  await page
    .getByLabel('Project context', { exact: true })
    .selectOption({ label: 'UI connection smoke' })
  await page.getByRole('button', { name: 'Open spatial editor', exact: true }).click()
  await expect(page.getByRole('navigation', { name: 'Studio tools' })).toBeVisible()
  await expect(page.getByRole('complementary', { name: 'Studio working panel' })).toBeVisible()
  await page.getByRole('button', { name: 'Start building on this site', exact: true }).click()
  await expect(page.getByLabel('Geometry name', { exact: true })).toBeVisible()
})
