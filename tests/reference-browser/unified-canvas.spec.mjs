import {test,expect} from '@playwright/test'
import { openListView } from '../studio-helpers.mjs'
import {randomUUID} from 'node:crypto'
import {mkdir} from 'node:fs/promises'

test('L04 shared canvas preserves general selection and a draft through WebGL loss and revision conflict',async({page,request})=>{
  const login=await request.post('http://127.0.0.1:8001/auth/v1/token',{data:{email:'fixture@example.invalid',password:'fixture-only'}})
  expect(login.ok()).toBeTruthy()
  const headers={Authorization:`Bearer ${(await login.json()).access_token}`}
  const org=(await (await request.get('/api/v1/session',{headers})).json()).organisations[0].id
  const result=await request.post(`/api/v1/organisations/${org}/projects`,{headers,data:{name:'Unified canvas workflow',purpose:'contractor_proposal',stakeholder:'Test only',site:{bounds:[101.681,3.131,101.683,3.133]}}})
  expect(result.status()).toBe(201)
  const project=await result.json(),endpoint=`/api/v1/organisations/${org}/projects/${project.id}`
  const polygon={type:'Polygon',coordinates:[[[101.681,3.131],[101.683,3.131],[101.683,3.133],[101.681,3.133],[101.681,3.131]]]}
  const target={id:randomUUID(),name:'Traced target',geometry:polygon,provenance:'estimated',source_note:'Synthetic control plan'}
  const data={expected_revision:0,boundary:polygon,boundary_provenance:'estimated',boundary_source:'Synthetic',targets:[target],scenarios:{baseline:{name:'Baseline',items:[]},option_a:{name:'A',items:[{id:randomUUID(),name:'Concept bench',kind:'bench',geometry:{type:'Point',coordinates:[101.6815,3.1325]},provenance:'estimated',source_note:'Synthetic object'}]},option_b:{name:'B',items:[]}}}
  expect((await request.post(`${endpoint}/workspace`,{headers,data})).ok()).toBeTruthy()
  await page.goto('/')
  await page.getByLabel('Email address').fill('fixture@example.invalid')
  await page.getByLabel('Password',{exact:true}).fill('fixture-only')
  await page.getByRole('button',{name:'Sign in',exact:true}).click()
  const organisation=page.getByRole('combobox',{name:'Active organisation',exact:true})
  await expect(organisation).toBeVisible()
  if(await organisation.inputValue()!==org) await organisation.selectOption(org)
  await page.getByRole('button',{name:'Open Design Studio',exact:true}).click()
  await page.getByRole('button',{name:/Unified canvas workflow/}).click()
  await openListView(page)
  await page.getByLabel('Embed design on map',{exact:true}).uncheck()
  await page.getByRole('group', { name: 'Scenario selection' }).getByRole('button', { name: 'A', exact: true }).click()

  const studio=page.getByRole('region',{name:'Studio canvas'})
  // This case isolates ordinary-work picking; site/target fitting and visibility
  // are exercised separately by spatial-connected.spec.mjs.
  await page.getByLabel('Show boundary layer',{exact:true}).uncheck()
  await page.getByLabel('Show target layer',{exact:true}).uncheck()
  await studio.getByRole('button',{name:'3D design scene',exact:true}).click()
  await expect(studio.getByText(/1 work geometries/)).toBeVisible()
  const canvas=studio.getByRole('img',{name:'Interactive 3D object scene'})
  await canvas.click({position:{x:(await canvas.boundingBox()).width/2,y:180}})
  await expect(studio.getByRole('status').filter({hasText:'Selected:'})).toContainText('Concept bench')
  await studio.getByRole('button',{name:'Site map',exact:true}).click()
  await expect(studio.getByRole('status').filter({hasText:'Selected:'})).toContainText('Concept bench')
  const tools=page.locator('details').filter({has:page.locator('summary',{hasText:'Spatial editing tools'})})
  await tools.getByLabel('East offset (m)',{exact:true}).fill('5')
  await tools.getByRole('button',{name:'Apply spatial operation',exact:true}).click()
  await expect(tools.getByRole('status')).toContainText('Validated operation')
  await studio.getByRole('button',{name:'3D design scene',exact:true}).click()
  await expect(studio.getByText(/1 work geometries/)).toBeVisible()
  await canvas.evaluate(node=>node.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext())
  await expect(studio.getByRole('status').filter({hasText:'3D context lost'})).toBeVisible()
  await studio.getByRole('button',{name:'Fit / retry 3D scene',exact:true}).click()
  await expect(studio.getByText(/1 work geometries/)).toBeVisible()
  await mkdir('artifacts',{recursive:true})
  await studio.screenshot({path:'artifacts/l04-unified-3d.png'})
  await studio.getByRole('button',{name:'Site map',exact:true}).click()
  await expect(page.getByRole('button',{name:'Undo workspace edit',exact:true})).toBeEnabled()
  data.expected_revision=1
  expect((await request.post(`${endpoint}/workspace`,{headers,data})).ok()).toBeTruthy()
  await page.getByRole('button',{name:'Validate & save workspace',exact:true}).click()
  await expect(page.getByRole('alert').filter({hasText:/changed|revision|conflict/i})).toBeVisible()
  await expect(page.getByRole('button',{name:'Undo workspace edit',exact:true})).toBeEnabled()
  await expect(tools.getByLabel('East offset (m)',{exact:true})).toHaveValue('5')
  await mkdir('artifacts',{recursive:true})
  await studio.screenshot({path:'artifacts/l04-unified-desktop.png'})
  await page.setViewportSize({width:390,height:844})
  await studio.screenshot({path:'artifacts/l04-unified-phone.png'})
  page.once('dialog', dialog => dialog.accept())
  await tools.getByRole('combobox',{name:'Spatial operation',exact:true}).selectOption('delete')
  await tools.getByRole('button',{name:'Apply spatial operation',exact:true}).click()
  await expect(studio.getByRole('status').filter({hasText:'Selected:'})).toContainText('None')
  await page.getByRole('button',{name:'Undo workspace edit',exact:true}).click()
  await expect(tools.getByRole('checkbox',{name:'Select Concept bench',exact:true})).toBeVisible()
})

test('L04 missing WebGL retains validated numeric editing and save',async({page,request})=>{
  const login=await request.post('http://127.0.0.1:8001/auth/v1/token',{data:{email:'fixture@example.invalid',password:'fixture-only'}})
  expect(login.ok()).toBeTruthy()
  const headers={Authorization:`Bearer ${(await login.json()).access_token}`}
  const org=(await (await request.get('/api/v1/session',{headers})).json()).organisations[0].id
  const result=await request.post(`/api/v1/organisations/${org}/projects`,{headers,data:{name:'Numeric fallback workflow',purpose:'contractor_proposal',stakeholder:'Test only',site:{bounds:[101.681,3.131,101.683,3.133]}}})
  expect(result.status()).toBe(201)
  const project=await result.json(),endpoint=`/api/v1/organisations/${org}/projects/${project.id}`
  const polygon={type:'Polygon',coordinates:[[[101.681,3.131],[101.683,3.131],[101.683,3.133],[101.681,3.133],[101.681,3.131]]]}
  const target={id:randomUUID(),name:'Traced target',geometry:polygon,provenance:'estimated',source_note:'Synthetic control plan'}
  const data={expected_revision:0,boundary:polygon,boundary_provenance:'estimated',boundary_source:'Synthetic',targets:[target],scenarios:{baseline:{name:'Baseline',items:[]},option_a:{name:'A',items:[{id:randomUUID(),name:'Concept bench',kind:'bench',geometry:{type:'Point',coordinates:[101.6815,3.1325]},provenance:'estimated',source_note:'Synthetic object'}]},option_b:{name:'B',items:[]}}}
  expect((await request.post(`${endpoint}/workspace`,{headers,data})).ok()).toBeTruthy()
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function(type, ...args) {
      return type === 'webgl' || type === 'webgl2' ? null : original.call(this, type, ...args)
    }
  })
  await page.goto('/')
  await page.getByLabel('Email address').fill('fixture@example.invalid')
  await page.getByLabel('Password',{exact:true}).fill('fixture-only')
  await page.getByRole('button',{name:'Sign in',exact:true}).click()
  const organisation=page.getByRole('combobox',{name:'Active organisation',exact:true})
  await expect(organisation).toBeVisible()
  if(await organisation.inputValue()!==org) await organisation.selectOption(org)
  await page.getByRole('button',{name:'Open Design Studio',exact:true}).click()
  await page.getByRole('button',{name:/Numeric fallback workflow/}).click()
  await openListView(page)
  await page.getByLabel('Embed design on map',{exact:true}).uncheck()
  await page.getByRole('group', { name: 'Scenario selection' }).getByRole('button', { name: 'A', exact: true }).click()


  const studio=page.getByRole('region',{name:'Studio canvas'})
  await studio.getByRole('button',{name:'3D design scene',exact:true}).click()
  await expect(studio.getByRole('status').filter({hasText:'3D unavailable'})).toBeVisible()
  const tools=page.locator('details').filter({has:page.locator('summary',{hasText:'Spatial editing tools'})})
  await tools.getByRole('checkbox',{name:'Select Concept bench',exact:true}).check()
  await tools.getByLabel('East offset (m)',{exact:true}).fill('5')
  await tools.getByRole('button',{name:'Apply spatial operation',exact:true}).click()
  await expect(tools.getByRole('status')).toContainText('Validated operation')
  await page.getByRole('button',{name:'Validate & save workspace',exact:true}).click()
  await expect(page.getByText('Workspace revision 2 saved.',{exact:false})).toBeVisible()
  const saved=await (await request.get(`${endpoint}/workspace`,{headers})).json()
  expect(saved.data.scenarios.option_a.items[0].geometry.coordinates[0]).toBeGreaterThan(101.6815)
})
