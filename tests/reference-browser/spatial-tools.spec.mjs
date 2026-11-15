import { openDetailedWorkspace } from '../studio-helpers.mjs'
import {test,expect} from '@playwright/test'
import {mkdir} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'

test('Spatial tools selection, atomic edits, undo, locks and saved selection',async({page,request})=>{
  test.setTimeout(120000)
  const login=await request.post('http://127.0.0.1:8001/auth/v1/token',{data:{email:'fixture@example.invalid',password:'fixture-only'}})
  expect(login.ok()).toBeTruthy()
  const headers={Authorization:`Bearer ${(await login.json()).access_token}`}
  const org=(await (await request.get('/api/v1/session',{headers})).json()).organisations[0].id
  const result=await request.post(`/api/v1/organisations/${org}/projects`,{headers,data:{name:'Spatial editing workflow',purpose:'contractor_proposal',stakeholder:'Test only',site:{bounds:[101.681,3.131,101.683,3.133]}}})
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
  await page.getByRole('button',{name:/Spatial editing workflow/}).click()
  await openDetailedWorkspace(page)
  await page.getByRole('group', { name: 'Scenario selection' }).getByRole('button', { name: 'A', exact: true }).click()
  const tools=page.locator('details').filter({has:page.locator('summary',{hasText:'Spatial editing tools'})})
  await tools.getByRole('checkbox',{name:'Select Concept bench',exact:true}).check()
  await tools.getByLabel('East offset (m)',{exact:true}).fill('5')
  await tools.getByRole('button',{name:'Apply spatial operation',exact:true}).click()
  await expect(tools.getByRole('status')).toContainText('Validated operation')
  await page.getByRole('button',{name:'Undo workspace edit',exact:true}).click()
  await page.getByRole('button',{name:'Redo workspace edit',exact:true}).click()
  // Naming and reusing a selection is in the collapsed "Save and reuse a selection" disclosure.
  const savedSelections=tools.locator('details.spatial-saved-selections')
  if(!(await savedSelections.evaluate(node=>node.open))) await savedSelections.locator('summary').click()
  await tools.getByLabel('Selection name',{exact:true}).fill('Bench selection')
  await tools.getByRole('button',{name:'Save selection',exact:true}).click()
  await tools.getByRole('combobox',{name:'Spatial operation',exact:true}).selectOption('lock')
  await tools.getByRole('button',{name:'Apply spatial operation',exact:true}).click()
  await expect(tools.getByRole('checkbox',{name:'Select Concept bench (locked)',exact:true})).toBeChecked()
  await tools.getByRole('combobox',{name:'Spatial operation',exact:true}).selectOption('move')
  await tools.getByRole('button',{name:'Apply spatial operation',exact:true}).click()
  await expect(tools.getByRole('alert')).toContainText('Unlock')
  await page.getByRole('button',{name:'Validate & save workspace',exact:true}).click()
  await expect(page.getByText('Workspace revision 2 saved.',{exact:false})).toBeVisible()
  const saved=(await (await request.get(`${endpoint}/workspace`,{headers})).json()).data
  expect(saved.scenarios.option_a.items[0].editor_locked).toBe(true)
  expect(saved.scenarios.option_a.items[0].geometry.coordinates[0]).toBeGreaterThan(101.6815)
  await page.reload()
  await openDetailedWorkspace(page)
  await page.getByRole('group', { name: 'Scenario selection' }).getByRole('button', { name: 'A', exact: true }).click()
  if(!(await savedSelections.evaluate(node=>node.open))) await savedSelections.locator('summary').click()
  await tools.getByRole('combobox',{name:'Saved selection',exact:true}).selectOption('Bench selection')
  await expect(tools.getByRole('checkbox',{name:'Select Concept bench (locked)',exact:true})).toBeChecked()
  await tools.getByRole('combobox',{name:'Spatial operation',exact:true}).selectOption('unlock')
  await tools.getByRole('button',{name:'Apply spatial operation',exact:true}).click()
  await expect(tools.getByRole('checkbox',{name:'Select Concept bench',exact:true})).toBeChecked()
  await tools.getByRole('combobox',{name:'Spatial operation',exact:true}).selectOption('duplicate')
  await tools.getByLabel('East offset (m)',{exact:true}).fill('5')
  await tools.getByLabel('Number of additional copies',{exact:true}).fill('2')
  await tools.getByRole('button',{name:'Apply spatial operation',exact:true}).click()
  await expect(tools.getByRole('checkbox',{name:'Select Concept bench copy 2',exact:true})).toBeVisible()
  await page.getByRole('button',{name:'Validate & save workspace',exact:true}).click()
  await expect(page.getByText('Workspace revision 3 saved.',{exact:false})).toBeVisible()
  await mkdir('artifacts',{recursive:true})
  await tools.screenshot({path:'artifacts/l04-spatial-tools.png'})
})
