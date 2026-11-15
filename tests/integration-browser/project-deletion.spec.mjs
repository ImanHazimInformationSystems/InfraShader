import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
const API = process.env.INFRA_TEST_API_URL || 'http://127.0.0.1:8000'

test('delete a draft project with explicit name confirmation and preserve another project', async ({ page, request }) => {
  const login = await request.post(`${API}/auth/v1/token`, { data: { email:'fixture@example.invalid', password:'fixture-only' } })
  const headers = { Authorization:`Bearer ${(await login.json()).access_token}` }
  const org = (await (await request.get('/api/v1/session', { headers })).json()).organisations[0].id
  const create = async name => (await (await request.post(`/api/v1/organisations/${org}/projects`, { headers, data: {
    name, purpose:'contractor_proposal', stakeholder:'Test client', site:{ bounds:[101.68,3.13,101.681,3.131] }
  } })).json())
  const project = await create(`Delete fixture ${Date.now()}`)
  const kept = await create(`Keep fixture ${Date.now()}`)
  const url = `/api/v1/organisations/${org}/projects/${project.id}`
  await page.goto(`/studio/organisations/${org}/projects/${project.id}`)
  await page.getByLabel('Email address').fill('fixture@example.invalid')
  await page.getByLabel('Password', {exact:true}).fill('fixture-only')
  await page.getByRole('button', {name:'Sign in',exact:true}).click()
  await page.getByRole('button', {name:'Delete project',exact:true}).click()
  const dialog = page.getByRole('dialog', {name:'Delete this project permanently?'})
  await expect(dialog).toBeVisible()
  const field = dialog.getByLabel('Type the project name to confirm')
  await expect(field).toBeVisible()
  await expect(dialog.getByRole('button', {name:'Delete permanently',exact:true})).toBeDisabled()
  await field.fill('wrong')
  await expect(dialog.getByRole('button', {name:'Delete permanently',exact:true})).toBeDisabled()
  await mkdir('test-results/project-deletion', {recursive:true})
  for (const [width,height] of [[1440,900],[820,1100],[390,844]]) {
    await page.setViewportSize({width,height})
    await page.emulateMedia({reducedMotion:'reduce'})
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({path:`test-results/project-deletion/confirmation-${width}.png`})
  }
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  expect((await request.get(url, {headers})).ok()).toBeTruthy()
  await page.getByRole('button', {name:'Delete project',exact:true}).click()
  await field.fill(project.name)
  await dialog.getByRole('button', {name:'Delete permanently',exact:true}).click()
  await expect(dialog).not.toBeVisible()
  await expect(page.getByText('Project permanently deleted.', {exact:true})).toBeVisible()
  expect((await request.get(url, {headers})).status()).toBe(404)
  expect((await request.get(`/api/v1/organisations/${org}/projects/${kept.id}`, {headers})).ok()).toBeTruthy()
  await page.reload()
  await expect(page.getByText(project.name, {exact:true})).toHaveCount(0)
})
