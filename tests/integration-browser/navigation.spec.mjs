import { test, expect } from '@playwright/test'
import { randomUUID } from 'node:crypto'

test('project URLs reload, back navigation protects unsaved work and foreign routes deny access', async ({ page, request }) => {
  const login = await request.post('http://127.0.0.1:8000/auth/v1/token', { data: { email: 'fixture@example.invalid', password: 'fixture-only' } })
  const headers = { Authorization: `Bearer ${(await login.json()).access_token}` }
  const org = (await (await request.get('/api/v1/session', { headers })).json()).organisations[0].id
  const project = await (await request.post(`/api/v1/organisations/${org}/projects`, { headers, data: { name: 'URL navigation fixture', purpose: 'developer_decision', stakeholder: 'Route test', site: { bounds: [101.681, 3.131, 101.683, 3.133] } } })).json()
  const url = `/organisations/${org}/projects/${project.id}`
  await page.goto(url)
  await page.getByLabel('Email address').fill('fixture@example.invalid')
  await page.getByLabel('Password', { exact: true }).fill('fixture-only')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'URL navigation fixture', exact: true })).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`${project.id}$`))
  await page.reload()
  await expect(page.getByRole('heading', { name: 'URL navigation fixture', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Edit brief', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`${project.id}/edit$`))
  await page.getByRole('textbox', { name: /^Project name/ }).fill('Unsaved URL change')
  page.once('dialog', dialog => dialog.dismiss())
  await page.goBack()
  await expect(page).toHaveURL(new RegExp(`${project.id}/edit$`))
  await expect(page.getByRole('textbox', { name: /^Project name/ })).toHaveValue('Unsaved URL change')
  page.once('dialog', dialog => dialog.accept())
  await page.goBack()
  await expect(page.getByRole('heading', { name: 'URL navigation fixture', exact: true })).toBeVisible()
  await page.goto(`/organisations/${randomUUID()}/projects/${project.id}`)
  await expect(page.getByRole('alert')).toContainText('unavailable to your account')
  await expect(page.getByRole('heading', { name: 'URL navigation fixture', exact: true, level: 1 })).toHaveCount(0)
  await page.getByRole('navigation').getByRole('button', { name: 'Explore Map', exact: true }).click()
  await expect(page).toHaveURL(/\/explore$/)
})
