import { openDetailedWorkspace, openStudiesStep } from '../studio-helpers.mjs'
import {checkOutputPdf} from '../check-output-pdf.mjs'
import {test,expect} from '@playwright/test'
import {mkdir, readFile} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'

test('L24 approved photo copy, proposal manifest and retained PDF',async({page,request})=>{
  test.setTimeout(120000)
  const login=await request.post('http://127.0.0.1:8001/auth/v1/token',{data:{email:'fixture@example.invalid',password:'fixture-only'}})
  expect(login.ok()).toBeTruthy()
  const headers={Authorization:`Bearer ${(await login.json()).access_token}`}
  const org=(await (await request.get('/api/v1/session',{headers})).json()).organisations[0].id
  const result=await request.post(`/api/v1/organisations/${org}/projects`,{headers,data:{name:'Proposal approved photo',purpose:'contractor_proposal',stakeholder:'Test only',problem:'Exposed site',intended_users:'Visitors',desired_outcome:'Reviewed scope',use_periods:'Weekdays',site:{bounds:[101.681,3.131,101.683,3.133]}}})
  expect(result.status()).toBe(201)
  const project=await result.json(),endpoint=`/api/v1/organisations/${org}/projects/${project.id}`
  const polygon={type:'Polygon',coordinates:[[[101.681,3.131],[101.683,3.131],[101.683,3.133],[101.681,3.133],[101.681,3.131]]]}
  const target={id:randomUUID(),name:'Traced target',geometry:polygon,provenance:'estimated',source_note:'Synthetic control plan'}
  const data={expected_revision:0,boundary:polygon,boundary_provenance:'estimated',boundary_source:'Synthetic',targets:[target],scenarios:{baseline:{name:'Baseline',items:[]},option_a:{name:'A',items:[{id:randomUUID(),name:'Courtyard area',kind:'area',geometry:{type:'Polygon',coordinates:[[[101.6812,3.1312],[101.6813,3.1312],[101.6813,3.1313],[101.6812,3.1313],[101.6812,3.1312]]]},provenance:'estimated',source_note:'Synthetic object'}]},option_b:{name:'B',items:[]}}}
  expect((await request.post(`${endpoint}/workspace`,{headers,data})).ok()).toBeTruthy()
  const rateResponse=await request.post(`/api/v1/organisations/${org}/rates`,{headers,data:{code:'BASE',description:'Synthetic layer rate',unit:'m2',basis:'cost',amount:'10',effective_date:'2020-01-01',valid_until:'2099-12-31',source_note:'Test fixture, not market data'}})
  expect(rateResponse.ok()).toBeTruthy()
  const rate=await rateResponse.json()

  data.scenarios.option_a.items[0].rate_id=rate.id
  data.expected_revision=1
  expect((await request.post(`${endpoint}/workspace`,{headers,data})).ok()).toBeTruthy()
  const estimated=await request.post(`${endpoint}/estimates`,{headers,data:{expected_revision:2,request_key:randomUUID(),scenario:'option_a',method:'markup',percent:'20'}})
  expect(estimated.ok()).toBeTruthy()
  const upload=await request.post(`${endpoint}/evidence`,{headers,multipart:{photo:{name:'fixture.png',mimeType:'image/png',buffer:await readFile('tests/fixtures/l05-green.png')},description:'Synthetic approval image',source_note:'Synthetic local fixture, not site evidence',rights_confirmed:'true'}})
  expect(upload.ok()).toBeTruthy()
  await page.goto('/')
  await page.getByLabel('Email address').fill('fixture@example.invalid')
  await page.getByLabel('Password',{exact:true}).fill('fixture-only')
  await page.getByRole('button',{name:'Sign in',exact:true}).click()
  await page.getByRole('button',{name:/Proposal approved photo/}).click()
  await openDetailedWorkspace(page)
  await page.getByRole('button',{name:'A',exact:true}).first().click()
  await openStudiesStep(page, 'proposal')
  await page.getByText('Review and issue contractor client proposal',{exact:true}).click()
  const totalPicker=page.getByLabel('Total to use')
  await totalPicker.selectOption(await totalPicker.locator('option',{hasText:'complete and current'}).first().getAttribute('value'))
  await page.getByLabel('Review criteria (one per line)').fill('Scope and affordability')
  await page.getByLabel('Reviewer notes',{exact:true}).fill('Fixture only')
  await page.getByLabel('Customer-facing scope narrative',{exact:true}).fill('Approved synthetic demonstration')
  await page.getByLabel('Proposal valid until',{exact:true}).fill('2099-12-31')
  await page.getByLabel('Programme and delivery assumptions',{exact:true}).fill('Agree before delivery')
  await page.getByLabel('Maintenance scope or exclusions',{exact:true}).fill('Excluded explicitly')
  await page.getByLabel('Assumptions',{exact:true}).fill('Synthetic site, verify before use')
  await page.getByLabel('Exclusions',{exact:true}).fill('No validated shade claims')
  await page.getByRole('button',{name:'Load available evidence'}).click()
  await page.getByLabel('Include Synthetic approval image',{exact:true}).check()
  await page.getByLabel('Include selected photos in the audience-facing output',{exact:true}).check()
  await page.getByRole('button',{name:'Preview draft PDF',exact:true}).click()
  await expect(page.getByRole('link',{name:'Download draft PDF',exact:true})).toBeVisible()
  await page.getByRole('button',{name:'Close preview'}).click()
  const response=page.waitForResponse(r=>r.url().endsWith('/proposals') && r.request().method()==='POST')
  page.once('dialog', d=>d.accept())
  await page.getByRole('button',{name:'Confirm and issue new version'}).click()
  const issued=await (await response).json()
  expect(issued.payload.site_evidence[0].image_data).toMatch(/^data:image\/jpeg;base64,/)
  expect(issued.payload.manifest.font_sha256).toHaveLength(64)
  await expect(page.getByText(/Original PDF retained/)).toBeVisible()
  const downloadPromise=page.waitForEvent('download')
  await page.getByRole('button',{name:'Download client proposal PDF'}).click()
  await (await downloadPromise).saveAs('artifacts/proposal-photo.pdf')
  checkOutputPdf('artifacts/proposal-photo.pdf', true)
  await page.getByRole('region',{name:'Retained output file'}).screenshot({path:'artifacts/pricing-retained-file.png'})
})
