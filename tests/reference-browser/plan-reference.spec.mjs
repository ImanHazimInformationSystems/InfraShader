import { openDetailedWorkspace } from '../studio-helpers.mjs'
import {test,expect} from '@playwright/test'
import {mkdir} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'

test('L05 FIXTURE STORAGE plan calibration, overlay, persistence and replacement review',async({page,request})=>{
  test.setTimeout(120000)
  const login=await request.post('http://127.0.0.1:8001/auth/v1/token',{data:{email:'fixture@example.invalid',password:'fixture-only'}})
  expect(login.ok()).toBeTruthy()
  const headers={Authorization:`Bearer ${(await login.json()).access_token}`}
  const org=(await (await request.get('/api/v1/session',{headers})).json()).organisations[0].id
  const result=await request.post(`/api/v1/organisations/${org}/projects`,{headers,data:{name:'L05 synthetic reference',purpose:'contractor_proposal',stakeholder:'Test only',site:{bounds:[101.681,3.131,101.683,3.133]}}})
  expect(result.status()).toBe(201)
  const project=await result.json(),endpoint=`/api/v1/organisations/${org}/projects/${project.id}`
  const polygon={type:'Polygon',coordinates:[[[101.681,3.131],[101.683,3.131],[101.683,3.133],[101.681,3.133],[101.681,3.131]]]}
  const target={id:randomUUID(),name:'Traced target',geometry:polygon,provenance:'estimated',source_note:'Synthetic control plan'}
  const data={expected_revision:0,boundary:polygon,boundary_provenance:'estimated',boundary_source:'Synthetic',targets:[target],scenarios:{baseline:{name:'Baseline',items:[]},option_a:{name:'A',items:[]},option_b:{name:'B',items:[]}}}
  expect((await request.post(`${endpoint}/workspace`,{headers,data})).ok()).toBeTruthy()
  await page.goto('/')
  await page.getByLabel('Email address').fill('fixture@example.invalid')
  await page.getByLabel('Password',{exact:true}).fill('fixture-only')
  await page.getByRole('button',{name:'Sign in',exact:true}).click()
  const organisation=page.getByRole('combobox',{name:'Active organisation',exact:true})
  await expect(organisation).toBeVisible()
  if(await organisation.inputValue()!==org) await organisation.selectOption(org)
  await page.getByRole('button',{name:/L05 synthetic reference/}).click()
  await openDetailedWorkspace(page)
  await page.getByLabel('Plan PNG / JPEG / PDF').setInputFiles('tests/fixtures/l05-green.png')
  await page.getByLabel('Plan source and revision').fill('Synthetic image; no real survey claim')
  await page.getByLabel('I have permission to use this plan.').check()
  await page.getByRole('button',{name:'Upload reference page',exact:true}).click()
  await expect(page.getByAltText('Private plan calibration preview')).toBeVisible()
  await page.getByLabel('Known distance A–B (m)',{exact:true}).fill('20')
  await page.getByRole('button',{name:'Apply and lock calibration'}).click()
  await expect(page.getByRole('button',{name:'Unlock calibration'})).toBeVisible()
  await page.getByRole('button',{name:'Validate & save workspace'}).click()
  await expect(page.getByText('Workspace revision 2 saved.',{exact:false})).toBeVisible()
  const saved=(await (await request.get(`${endpoint}/workspace`,{headers})).json()).data
  expect(saved.plan_reference.metres_per_pixel).toBe(1)
  expect(saved.plan_reference.corners).toHaveLength(4)
  await page.reload()
  await openDetailedWorkspace(page)
  await expect(page.getByAltText('Private plan calibration preview')).toBeVisible()
  await mkdir('artifacts',{recursive:true})
  await page.getByRole('region',{name:'Geometry drawing canvas'}).screenshot({path:'artifacts/l05-calibrated-map.png'})
  // Tag the target through the actual editor, then replace calibration through the UI.
  await page.getByRole('button',{name:'Edit target',exact:true}).click()
  await page.getByLabel('Link applied work geometry to this calibrated reference').check()
  await page.getByRole('button',{name:'Apply item changes',exact:true}).click()
  await page.getByRole('button',{name:'Validate & save workspace'}).click()
  await expect(page.getByText('Workspace revision 3 saved.',{exact:false})).toBeVisible()
  await page.reload();await openDetailedWorkspace(page)
  await page.getByRole('button',{name:'Unlock calibration'}).click()
  await page.getByLabel('Known distance A–B (m)',{exact:true}).fill('25')
  await page.getByRole('button',{name:'Apply and lock calibration'}).click()
  await expect(page.getByText('Traced target: reference replaced or recalibrated',{exact:false})).toBeVisible()
  await page.getByRole('button',{name:'Validate & save workspace'}).click()
  await expect(page.getByText('Workspace revision 4 saved.',{exact:false})).toBeVisible()
  const changed=(await (await request.get(`${endpoint}/workspace`,{headers})).json()).data
  expect(changed.targets[0].reference_review_required).toBe(true)
  expect(changed.targets[0].geometry).toEqual(polygon)
  // Selected-page PDF is rendered locally, then its raster goes through private Storage.
  await page.getByLabel('Plan PNG / JPEG / PDF').setInputFiles('tests/fixtures/l05-reference.pdf')
  await page.getByLabel('PDF page',{exact:true}).fill('2')
  await page.getByLabel('Plan source and revision').fill('Synthetic PDF revision 2; selected page 2')
  await page.getByLabel('I have permission to use this plan.').check()
  await page.getByRole('button',{name:'Upload reference page',exact:true}).click()
  await expect(page.getByText(/l05-reference.pdf.*page 2/)).toBeVisible({timeout:20000})
  await page.getByRole('button',{name:'Apply and lock calibration'}).click()
  await page.getByRole('button',{name:'Validate & save workspace'}).click()
  await expect(page.getByText('Workspace revision 5 saved.',{exact:false})).toBeVisible()
  const pdf=(await (await request.get(`${endpoint}/workspace`,{headers})).json()).data.plan_reference
  expect(pdf.page).toBe(2);expect(pdf.source_name).toBe('l05-reference.pdf')
  await page.getByRole('button',{name:'Fit reference plan'}).click()
  await page.getByRole('region',{name:'Geometry drawing canvas'}).screenshot({path:'artifacts/l05-pdf-map.png'})
  await page.getByText(/Existing-plan reference.*L05/).locator('..').screenshot({path:'artifacts/l05-reference-controls.png'})
})

