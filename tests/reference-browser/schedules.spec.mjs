import { openDetailedWorkspace } from '../studio-helpers.mjs'
import {test,expect} from '@playwright/test'
import {mkdir} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'

test('L09 L10 and L31 sourced planting, material and road-layer schedules estimate and export',async({page,request})=>{
  test.setTimeout(120000)
  const login=await request.post('http://127.0.0.1:8001/auth/v1/token',{data:{email:'fixture@example.invalid',password:'fixture-only'}})
  expect(login.ok()).toBeTruthy()
  const headers={Authorization:`Bearer ${(await login.json()).access_token}`}
  const org=(await (await request.get('/api/v1/session',{headers})).json()).organisations[0].id
  const result=await request.post(`/api/v1/organisations/${org}/projects`,{headers,data:{name:'Plant material schedule',purpose:'contractor_proposal',stakeholder:'Test only',site:{bounds:[101.681,3.131,101.683,3.133]}}})
  expect(result.status()).toBe(201)
  const project=await result.json(),endpoint=`/api/v1/organisations/${org}/projects/${project.id}`
  const polygon={type:'Polygon',coordinates:[[[101.681,3.131],[101.683,3.131],[101.683,3.133],[101.681,3.133],[101.681,3.131]]]}
  const target={id:randomUUID(),name:'Traced target',geometry:polygon,provenance:'estimated',source_note:'Synthetic control plan'}
  const data={expected_revision:0,boundary:polygon,boundary_provenance:'estimated',boundary_source:'Synthetic',targets:[target],scenarios:{baseline:{name:'Baseline',items:[]},option_a:{name:'A',items:[{id:randomUUID(),name:'Courtyard area',kind:'area',geometry:{type:'Polygon',coordinates:[[[101.6812,3.1312],[101.6813,3.1312],[101.6813,3.1313],[101.6812,3.1313],[101.6812,3.1312]]]},provenance:'estimated',source_note:'Synthetic object'}]},option_b:{name:'B',items:[]}}}
  expect((await request.post(`${endpoint}/workspace`,{headers,data})).ok()).toBeTruthy()
  const rateResponse=await request.post(`/api/v1/organisations/${org}/rates`,{headers,data:{code:'BASE',description:'Synthetic layer rate',unit:'m3',basis:'cost',amount:'10',effective_date:'2026-10-30',source_note:'Test fixture, not market data'}})
  expect(rateResponse.ok()).toBeTruthy()
  const rate=await rateResponse.json()
  await page.goto('/')
  await page.getByLabel('Email address').fill('fixture@example.invalid')
  await page.getByLabel('Password',{exact:true}).fill('fixture-only')
  await page.getByRole('button',{name:'Sign in',exact:true}).click()
  const organisation=page.getByRole('combobox',{name:'Active organisation',exact:true})
  await expect(organisation).toBeVisible()
  if(await organisation.inputValue()!==org) await organisation.selectOption(org)
  await page.getByRole('button',{name:/Plant material schedule/}).click()
  await openDetailedWorkspace(page)
  await page.getByRole('button',{name:'A',exact:true}).first().click()
  const panel=page.getByRole('group',{name:'Planting and materials',exact:true})
  await panel.getByRole('combobox',{name:'Schedule item',exact:true}).selectOption(data.scenarios.option_a.items[0].id)
  for(const [label,value] of Object.entries({'Plant code':'P01','Plant scientific name':'Synthetic species','Plant common name':'Fixture plant','Plant source':'Synthetic fixture source','Plant nursery size':'Test pot'})) await panel.getByLabel(label,{exact:true}).fill(value)
  await panel.getByLabel('Plant spacing m',{exact:true}).fill('2')
  await panel.getByRole('combobox',{name:'Plant count method',exact:true}).selectOption('square_spacing')
  await expect(page.getByRole('button',{name:'Validate & save workspace',exact:true})).toBeDisabled()
  await panel.getByRole('button',{name:'Validate and apply source record',exact:true}).click()
  await expect(panel.getByText('31 item',{exact:true})).toBeVisible()
  await page.getByRole('button',{name:'Validate & save workspace',exact:true}).click()
  await expect(page.getByText('Workspace revision 2 saved.',{exact:false})).toBeVisible()
  let saved=(await (await request.get(`${endpoint}/workspace`,{headers})).json()).data
  expect(saved.scenarios.option_a.items[0].quantity.value).toBe(31)
  await panel.getByRole('combobox',{name:'Record type',exact:true}).selectOption('material')
  for(const [label,value] of Object.entries({'Assembly code':'A01','Assembly material':'Test base','Assembly finish':'Test finish','Assembly source':'Approved synthetic recipe'})) await panel.getByLabel(label,{exact:true}).fill(value)
  await panel.getByRole('combobox',{name:'Assembly pricing',exact:true}).selectOption('components')
  await panel.getByRole('combobox',{name:'Assembly use',exact:true}).selectOption('road')
  await panel.getByRole('combobox',{name:'Component 1 basis',exact:true}).selectOption('volume')
  await panel.getByRole('combobox',{name:'Component 1 unit',exact:true}).selectOption('m3')
  await panel.getByLabel('Component 1 thickness_mm',{exact:true}).fill('100')
  await panel.getByLabel('Component 1 wastage_percent',{exact:true}).fill('10')
  await panel.getByRole('combobox',{name:'Component 1 rate',exact:true}).selectOption(rate.id)
  await panel.getByLabel('I reviewed and approve this quantity recipe').check()
  await panel.getByRole('button',{name:'Validate and apply source record',exact:true}).click()
  await expect(panel.getByText(/Validated draft schedule/)).toBeVisible()
  await expect(panel.getByText(/Draw a polygon for the proposed road surface/)).toBeVisible()
  await page.getByRole('button',{name:'Validate & save workspace',exact:true}).click()
  await expect(page.getByText('Workspace revision 3 saved.',{exact:false})).toBeVisible()
  saved=(await (await request.get(`${endpoint}/workspace`,{headers})).json()).data
  expect(saved.scenarios.option_a.items[0].assembly.use).toBe('road')
  expect(saved.scenarios.option_a.items[0].schedule[0].unit).toBe('m3')
  expect(saved.scenarios.option_a.items[0].schedule[0].formula).toContain('thickness 100')
  await expect(panel.getByText('priced',{exact:true})).toBeVisible()
  const estimate=await request.post(`${endpoint}/estimates`,{headers,data:{expected_revision:3,request_key:randomUUID(),scenario:'option_a',method:'markup',percent:'0',wastage_percent:'50',charges:[]}})
  expect(estimate.ok()).toBeTruthy()
  const payload=(await estimate.json()).payload
  expect(payload.complete).toBe(true)
  const schedule=(await (await request.get(`${endpoint}/schedule?scenario=option_a`,{headers})).json())
  expect(schedule.rows[0].total).toBe(payload.lines[0].cost_total)
  expect(schedule.changes[0].fields).toContain('assembly')
  const downloadPromise=page.waitForEvent('download')
  await panel.getByRole('button',{name:'Export saved BOQ CSV',exact:true}).click()
  const download=await downloadPromise
  expect(download.suggestedFilename()).toBe('schedule-option_a-r3.csv')
  await mkdir('artifacts',{recursive:true})
  await download.saveAs('artifacts/l09-l10-schedule.csv')
  await panel.screenshot({path:'artifacts/l09-l10-schedule.png'})
  await page.reload();await openDetailedWorkspace(page)
  await page.getByRole('button',{name:'A',exact:true}).first().click()
  await expect(panel.getByText('priced',{exact:true})).toBeVisible()
  await panel.getByRole('button',{name:'Locate Courtyard area / Finish layer',exact:true}).click()
  await expect(page.getByLabel('Geometry name',{exact:true})).toHaveValue('Courtyard area')
})
