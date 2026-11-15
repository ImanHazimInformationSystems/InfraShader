import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

test('new users can reference the brief guide without changing their draft', async ({
  page,
}, testInfo) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Open Browser Demo' }).click()
  const mobileMenu = page.getByRole('button', { name: 'Open workspace navigation' })
  const mobile = await mobileMenu.isVisible()
  if (mobile) await mobileMenu.click()
  await page
    .getByRole('navigation', {
      name: mobile ? 'Mobile workspace navigation' : 'Main navigation',
    })
    .getByRole('button', { name: 'Explore Map' })
    .click()
  await page.getByRole('button', { name: 'Continue with this site' }).click()
  await expect(page).toHaveURL(/\/(?:studio\/)?create$/)
  const guide = page.getByRole('region', { name: 'Your first brief, step by step' })
  await expect(guide).toBeVisible()
  await page.getByLabel('Project name').fill('My own courtyard')
  const problem = page.getByLabel('What problem should this project address?')
  await problem.fill('Our own site observation')
  const example = guide.locator('summary').filter({ hasText: 'See an example:' })
  await example.focus()
  await page.keyboard.press('Enter')
  await expect(guide.getByText('Fictional example for reference.', { exact: false })).toBeVisible()
  await expect(
    guide.getByText('Deliverables (what you will prepare):', { exact: false }),
  ).toBeVisible()
  await expect(page.getByLabel('Project name')).toHaveValue('My own courtyard')
  await expect(problem).toHaveValue('Our own site observation')
  await guide.locator('summary').filter({ hasText: 'What does' }).click()
  await expect(guide.getByText('These optional fields help', { exact: false })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  )
  await mkdir('artifacts/brief-guide', { recursive: true })
  await guide.screenshot({ path: `artifacts/brief-guide/${testInfo.project.name}-example.png` })
  await example.click()
  await page.getByLabel('Internal sponsor').fill('Our facilities team')
  await page.getByRole('button', { name: 'Create project', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'My own courtyard', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Edit brief', exact: true }).click()
  await expect(problem).toHaveValue('Our own site observation')
  await expect(guide).toHaveCount(0)
})
