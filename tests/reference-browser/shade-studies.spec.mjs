import { openDetailedWorkspace, openStudiesStep } from '../studio-helpers.mjs'
import {test,expect} from '@playwright/test'
import {randomUUID} from 'node:crypto'
import {mkdir} from 'node:fs/promises'

test('L11 saved weighted study, source drilldown, heatmap, reload and stale suppression',async({page,request})=>{
  test.setTimeout(90000)
  const login=await request.post('http://127.0.0.1:8001/auth/v1/token',{data:{email:'fixture@example.invalid',password:'fixture-only'}})
  expect(login.ok()).toBeTruthy()
  const headers={Authorization:`Bearer ${(await login.json()).access_token}`}
  const org=(await (await request.get('/api/v1/session',{headers})).json()).organisations[0].id
  const result=await request.post(`/api/v1/organisations/${org}/projects`,{headers,data:{name:'Shade study workflow',purpose:'contractor_proposal',stakeholder:'Test only',site:{bounds:[101.681,3.131,101.683,3.133]}}})
  expect(result.status()).toBe(201)
  const project=await result.json(),endpoint=`/api/v1/organisations/${org}/projects/${project.id}`
  const polygon={type:'Polygon',coordinates:[[[101.681,3.131],[101.683,3.131],[101.683,3.133],[101.681,3.133],[101.681,3.131]]]}
  const target={id:randomUUID(),name:'Traced target',geometry:polygon,provenance:'estimated',source_note:'Synthetic control plan'}
  const data={expected_revision:0,boundary:polygon,boundary_provenance:'estimated',boundary_source:'Synthetic',targets:[target],scenarios:{baseline:{name:'Baseline',items:[]},option_a:{name:'A',items:[{id:randomUUID(),name:'Concept bench',kind:'canopy',height_m:3,height_source:'Declared fixture roof',geometry:polygon,provenance:'estimated',source_note:'Synthetic object'}]},option_b:{name:'B',items:[]}}}
  expect((await request.post(`${endpoint}/workspace`,{headers,data})).ok()).toBeTruthy()
  await page.goto('/')
  await page.getByLabel('Email address').fill('fixture@example.invalid')
  await page.getByLabel('Password',{exact:true}).fill('fixture-only')
  await page.getByRole('button',{name:'Sign in',exact:true}).click()
  const organisation=page.getByRole('combobox',{name:'Active organisation',exact:true})
  await expect(organisation).toBeVisible()
  if(await organisation.inputValue()!==org) await organisation.selectOption(org)
  await page.getByRole('button',{name:/Shade study workflow/}).click()
  await openDetailedWorkspace(page)
  await page.getByRole('group',{name:'Scenario selection'}).getByRole('button',{name:'A',exact:true}).click()

  // The optional Shade study is its own Studies step.
  await openStudiesStep(page,'shade')
  const study=page.getByRole('region',{name:'Shade and use-time studies',exact:true})
  await study.getByLabel('Band 1 start',{exact:true}).fill('2026-03-21T10:00:00+08:00')
  await study.getByLabel('Band 1 end',{exact:true}).fill('2026-03-21T11:30:00+08:00')
  await study.getByRole('button',{name:'Calculate & save study',exact:true}).click()
  await expect(study.getByRole('status')).toContainText('Study saved',{timeout:30000})
  await expect(study.getByText(/Supported daylight: 90 min/)).toBeVisible()
  await expect(study.getByRole('img',{name:'Target shade heatmap schematic'})).toBeVisible()
  await study.getByText('Sources, method and exclusions',{exact:true}).click()
  await expect(study.getByText(/height source: Declared fixture roof/)).toBeVisible()
  await study.getByRole('button',{name:'Show study heatmap on site plan',exact:true}).click()
  const canvas=page.getByRole('region',{name:'Geometry drawing canvas'})
  await canvas.scrollIntoViewIfNeeded()
  await expect(canvas).toHaveAttribute('data-rendered-shadows',/^[1-9]/)
  await mkdir('artifacts',{recursive:true})
  await canvas.screenshot({path:'artifacts/l11-site-heatmap.png'})
  await study.screenshot({path:'artifacts/l11-study-desktop.png'})
  await page.setViewportSize({width:390,height:844})
  await study.screenshot({path:'artifacts/l11-study-phone.png'})
  const records=await (await request.get(`${endpoint}/shade-studies`,{headers})).json()
  expect(records.items).toHaveLength(1)
  expect(records.items[0].payload.samples.map(s=>s.minutes)).toEqual([60,30])
  await page.reload()
  await openDetailedWorkspace(page)
  await openStudiesStep(page,'shade')
  await expect(study.getByRole('status')).toContainText('Study saved')
  data.expected_revision=1
  expect((await request.post(`${endpoint}/workspace`,{headers,data})).ok()).toBeTruthy()
  await page.reload()
  await openDetailedWorkspace(page)
  await openStudiesStep(page,'shade')
  await expect(study.getByRole('status')).toContainText('Stale study')
  await expect(study.getByRole('button',{name:'Show study heatmap on site plan',exact:true})).toBeDisabled()
})
