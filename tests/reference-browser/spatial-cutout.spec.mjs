import { openDetailedWorkspace } from '../studio-helpers.mjs'
import {test,expect} from '@playwright/test'
import {mkdir} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'

test('Work area cutout, fixed dimensions and narrow editor',async({page,request})=>{
  test.setTimeout(120000)
  const login=await request.post('http://127.0.0.1:8001/auth/v1/token',{data:{email:'fixture@example.invalid',password:'fixture-only'}})
  expect(login.ok()).toBeTruthy()
  const headers={Authorization:`Bearer ${(await login.json()).access_token}`}
  const org=(await (await request.get('/api/v1/session',{headers})).json()).organisations[0].id
  const result=await request.post(`/api/v1/organisations/${org}/projects`,{headers,data:{name:'Work area cutout workflow',purpose:'contractor_proposal',stakeholder:'Test only',site:{bounds:[101.681,3.131,101.683,3.133]}}})
  expect(result.status()).toBe(201)
  const project=await result.json(),endpoint=`/api/v1/organisations/${org}/projects/${project.id}`
  const polygon={type:'Polygon',coordinates:[[[101.681,3.131],[101.683,3.131],[101.683,3.133],[101.681,3.133],[101.681,3.131]]]}
  const target={id:randomUUID(),name:'Traced target',geometry:polygon,provenance:'estimated',source_note:'Synthetic control plan'}
  const data={expected_revision:0,boundary:polygon,boundary_provenance:'estimated',boundary_source:'Synthetic',targets:[target],scenarios:{baseline:{name:'Baseline',items:[]},option_a:{name:'A',items:[{id:randomUUID(),name:'Outer area',kind:'area',geometry:{type:'Polygon',coordinates:[[[101.6812,3.1312],[101.6828,3.1312],[101.6828,3.1328],[101.6812,3.1328],[101.6812,3.1312]]]},provenance:'estimated',source_note:'Synthetic object'}]},option_b:{name:'B',items:[]}}}
  data.scenarios.option_a.items.push({id:randomUUID(),name:'Inner area',kind:'area',geometry:{type:'Polygon',coordinates:[[[101.6817,3.1317],[101.6823,3.1317],[101.6823,3.1323],[101.6817,3.1323],[101.6817,3.1317]]]},provenance:'estimated',source_note:'Synthetic object'})
  expect((await request.post(`${endpoint}/workspace`,{headers,data})).ok()).toBeTruthy()
  await page.goto('/')
  await page.getByLabel('Email address').fill('fixture@example.invalid')
  await page.getByLabel('Password',{exact:true}).fill('fixture-only')
  await page.getByRole('button',{name:'Sign in',exact:true}).click()
  const organisation=page.getByRole('combobox',{name:'Active organisation',exact:true})
  await expect(organisation).toBeVisible()
  if(await organisation.inputValue()!==org) await organisation.selectOption(org)
  await page.getByRole('button',{name:'Open Design Studio',exact:true}).click()
  await page.getByRole('button',{name:/Work area cutout workflow/}).click()
  await openDetailedWorkspace(page)
  await page.getByRole('group', { name: 'Scenario selection' }).getByRole('button', { name: 'A', exact: true }).click()
  const tools=page.locator('details').filter({has:page.locator('summary',{hasText:'Spatial editing tools'})})
  await tools.getByRole('checkbox',{name:'Select Outer area',exact:true}).check()
  await tools.getByRole('checkbox',{name:'Select Inner area',exact:true}).check()
  await tools.getByRole('combobox',{name:'Spatial operation',exact:true}).selectOption('cutout')
  await tools.getByRole('button',{name:'Apply spatial operation',exact:true}).click()
  await expect(tools.getByRole('checkbox',{name:'Select Inner area',exact:true})).toHaveCount(0)
  await tools.getByRole('combobox',{name:'Spatial operation',exact:true}).selectOption('fix_dimensions')
  await tools.getByRole('button',{name:'Apply spatial operation',exact:true}).click()
  await expect(tools.getByRole('status')).toContainText('Validated operation')
  await tools.getByRole('combobox',{name:'Spatial operation',exact:true}).selectOption('resize')
  await tools.getByLabel('Grid width (m)',{exact:true}).fill('20')
  await tools.getByRole('button',{name:'Apply spatial operation',exact:true}).click()
  await expect(tools.getByRole('alert')).toContainText('Fixed grid dimensions')
  await page.getByRole('button',{name:'Validate & save workspace',exact:true}).click()
  await expect(page.getByText('Workspace revision 2 saved.',{exact:false})).toBeVisible()
  const saved=(await (await request.get(`${endpoint}/workspace`,{headers})).json()).data
  expect(saved.scenarios.option_a.items).toHaveLength(1)
  expect(saved.scenarios.option_a.items[0].geometry.coordinates).toHaveLength(2)
  expect(saved.scenarios.option_a.items[0].editor_dimensions.width_m).toBeGreaterThan(100)
  await page.getByRole('region',{name:'Geometry drawing canvas',exact:true}).screenshot({path:'artifacts/l04-cutout-map.png'})
  await page.setViewportSize({width:390,height:844})
  await tools.screenshot({path:'artifacts/l04-spatial-phone.png'})
})
