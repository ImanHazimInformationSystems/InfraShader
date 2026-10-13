import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

test('catalogue search pages through real persisted rates and filters units', async ({ page, request }) => {
  const login = await request.post('http://127.0.0.1:8000/auth/v1/token', {data:{email:'fixture@example.invalid',password:'fixture-only'}})
  const headers = {Authorization:`Bearer ${(await login.json()).access_token}`}
  const session = await request.get('/api/v1/session',{headers})
  const org = (await session.json()).organisations[0].id
  const base = `/api/v1/organisations/${org}`
  for (let index=0; index<21; index++) {
    const response = await request.post(`${base}/rates`,{headers,data:{code:`PAGED-${String(index).padStart(2,'0')}`,description:'Pagination fixture only',unit:index===20?'item':'m2',basis:'indicative_budget',amount:'10',effective_date:'2026-10-12',source_note:'Not a market price'}})
    expect(response.status()).toBe(201)
  }
  const project = await (await request.post(`${base}/projects`,{headers,data:{name:'Catalogue paging fixture',purpose:'developer_decision',stakeholder:'Fixture',site:{bounds:[101.681,3.131,101.683,3.133]}}})).json()
  const geometry = {type:'Polygon',coordinates:[[[101.681,3.131],[101.683,3.131],[101.683,3.133],[101.681,3.133],[101.681,3.131]]]}
  expect((await request.post(`${base}/projects/${project.id}/workspace`,{headers,data:{expected_revision:0,boundary:geometry,boundary_provenance:'estimated',boundary_source:'Fixture',targets:[],scenarios:{baseline:{name:'Baseline',items:[]},option_a:{name:'Option A',items:[]},option_b:{name:'Option B',items:[]}}}})).status()).toBe(200)
  await page.goto('/')
  await page.getByLabel('Email address').fill('fixture@example.invalid')
  await page.getByLabel('Password',{exact:true}).fill('fixture-only')
  await page.getByRole('button',{name:'Sign in',exact:true}).click()
  await page.getByRole('button',{name:/Catalogue paging fixture/}).click()
  await page.getByRole('button',{name:'Open geometry workspace'}).click()
  await page.getByLabel('Search rate code or description').fill('PAGED-')
  await page.getByRole('button',{name:'Search catalogue',exact:true}).click()
  await expect(page.getByText('Rate versions 1-20 of 21',{exact:true})).toBeVisible()
  await page.getByRole('button',{name:'Next rate page',exact:true}).click()
  await expect(page.getByRole('button',{name:'Revise PAGED-20 v1',exact:true})).toBeVisible()
  await expect(page.getByRole('button',{name:'Next rate page',exact:true})).toBeDisabled()
  await page.getByRole('button',{name:'Previous rate page',exact:true}).click()
  await expect(page.getByText('Rate versions 1-20 of 21',{exact:true})).toBeVisible()
  await page.getByRole('combobox',{name:'Filter rate unit',exact:true}).selectOption('item')
  await page.getByRole('button',{name:'Search catalogue',exact:true}).click()
  await expect(page.getByText('Rate versions 1-1 of 1',{exact:true})).toBeVisible()
  page.once('dialog',dialog=>dialog.accept())
  await page.getByRole('button',{name:'Archive PAGED-20 v1',exact:true}).click()
  await expect(page.getByText('No matching rates.',{exact:true})).toBeVisible()
  await page.getByRole('checkbox',{name:'Show archived rate versions',exact:true}).check()
  await page.getByRole('button',{name:'Search catalogue',exact:true}).click()
  await expect(page.getByRole('button',{name:'Restore PAGED-20 v1',exact:true})).toBeVisible()
  page.once('dialog',dialog=>dialog.accept())
  await page.getByRole('button',{name:'Restore PAGED-20 v1',exact:true}).click()
  await page.getByRole('checkbox',{name:'Show archived rate versions',exact:true}).uncheck()
  await page.getByRole('button',{name:'Search catalogue',exact:true}).click()
  await expect(page.getByText('Rate versions 1-1 of 1',{exact:true})).toBeVisible()

  await page.getByText('Catalogue: add an explicit dated rate',{exact:true}).click()
  await page.getByLabel('Rate code',{exact:true}).fill('RECOVERED-RATE')
  await page.getByLabel('Description',{exact:true}).fill('Unsaved fixture rate')
  page.once('dialog',dialog=>dialog.accept())
  await page.reload()
  await page.getByRole('button',{name:'Open geometry workspace'}).click()
  await page.getByText('Catalogue: add an explicit dated rate',{exact:true}).click()
  await page.getByRole('button',{name:'Recover form draft',exact:true}).click()
  await expect(page.getByLabel('Rate code',{exact:true})).toHaveValue('RECOVERED-RATE')
  await expect(page.getByLabel('Description',{exact:true})).toHaveValue('Unsaved fixture rate')

  await mkdir('artifacts',{recursive:true})
  await page.getByRole('region',{name:'Browse rate catalogue',exact:true}).screenshot({path:'artifacts/catalogue-filtered.png'})
})
