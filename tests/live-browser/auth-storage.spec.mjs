import {test,expect} from '@playwright/test'
import {readFile,mkdir} from 'node:fs/promises'
import {createHash,randomUUID} from 'node:crypto'

test('real local Supabase login refresh private photo edit/download and foreign denial',async({page,request})=>{
 test.setTimeout(90000)
 const fixture=JSON.parse(await readFile('.local/live-browser-fixture.json','utf8'))
 const authHeaders={apikey:fixture.public_key}
 const login=async(user)=>{const response=await request.post(`${fixture.supabase_url}/auth/v1/token?grant_type=password`,{headers:authHeaders,data:{email:user.email,password:user.password}});expect(response.ok()).toBeTruthy();return response.json()}
 const owner=await login(fixture.users[0]),foreign=await login(fixture.users[1])
 const headers={Authorization:`Bearer ${owner.access_token}`}
 const session=await request.get('/api/v1/session',{headers});expect(session.status()).toBe(200)
 const org=(await session.json()).organisations[0].id
 const base=`/api/v1/organisations/${org}/projects`
 const created=await request.post(base,{headers,data:{name:'Live private evidence fixture',purpose:'developer_decision',stakeholder:'Fixture only',site:{bounds:[101.681,3.131,101.683,3.133]}}})
 expect(created.status()).toBe(201);const project=await created.json();const endpoint=`${base}/${project.id}`
 const geometry={type:'Polygon',coordinates:[[[101.681,3.131],[101.683,3.131],[101.683,3.133],[101.681,3.133],[101.681,3.131]]]}
 const target={id:randomUUID(),name:'Courtyard fixture',geometry,provenance:'estimated',source_note:'Fixture only'}
 expect((await request.post(`${endpoint}/workspace`,{headers,data:{expected_revision:0,boundary:geometry,boundary_provenance:'estimated',boundary_source:'Fixture',targets:[target],scenarios:{baseline:{name:'Baseline',items:[]},option_a:{name:'Option A',items:[]},option_b:{name:'Option B',items:[]}}}})).status()).toBe(200)
 await page.goto('/')
 await page.getByLabel('Email address').fill(fixture.users[0].email);await page.getByLabel('Password',{exact:true}).fill(fixture.users[0].password)
 await page.getByRole('button',{name:'Sign in',exact:true}).click()
 await page.getByRole('button',{name:/Live private evidence fixture/}).click()
 await page.getByRole('button',{name:'Open geometry workspace'}).click()
 await page.getByText('Private site evidence',{exact:true}).click()
 await page.getByLabel('Photo',{exact:true}).setInputFiles('.local/live-evidence-fixture.png')
 await page.getByLabel('Photo description',{exact:true}).fill('Green fixture')
 await page.getByLabel('Source, date and permission note',{exact:true}).fill('Generated test pixels; no real site or personal data')
 await page.getByRole('checkbox',{name:'I have permission to store and use this photo.',exact:true}).check()
 const upload=page.waitForResponse(response=>response.url().endsWith('/evidence')&&response.request().method()==='POST')
 await page.getByRole('button',{name:'Upload private photo',exact:true}).click()
 const response=await upload;expect(response.status()).toBe(201);const photo=await response.json()
 expect(photo.object_path).toBeUndefined()
 await page.getByRole('button',{name:'Preview photo Green fixture',exact:true}).click()
 await expect(page.getByRole('img',{name:'Green fixture',exact:true})).toBeVisible()
 await expect.poll(()=>page.getByRole('img',{name:'Green fixture',exact:true}).evaluate(image=>image.naturalWidth)).toBe(20)
 await page.getByRole('button',{name:'Edit evidence Green fixture',exact:true}).click()
 await page.getByLabel('Site observations',{exact:true}).fill('Fixture observation saved through real services')
 await page.getByRole('checkbox',{name:'Courtyard fixture',exact:true}).check()
 await page.getByRole('button',{name:'Save evidence notes',exact:true}).click()
 await expect(page.getByText('Linked targets: Courtyard fixture',{exact:true})).toBeVisible()
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Download photo Green fixture',exact:true}).click()
 const bytes=await readFile(await (await download).path())
 expect(createHash('sha256').update(bytes).digest('hex')).toBe(photo.sha256)
 expect(bytes[0]).toBe(255);expect(bytes[1]).toBe(216)
 expect((await request.get(`${endpoint}/evidence/${photo.id}/content`)).status()).toBe(401)
 expect((await request.get(`${endpoint}/evidence/${photo.id}/content`,{headers:{Authorization:`Bearer ${foreign.access_token}`}})).status()).toBe(404)
 const direct=await request.get(`${fixture.supabase_url}/storage/v1/object/public/evidence/${org}/${project.id}/${photo.id}.jpg`,{headers:authHeaders})
 expect(direct.status()).not.toBe(200)
 const refreshed=await request.post(`${fixture.supabase_url}/auth/v1/token?grant_type=refresh_token`,{headers:authHeaders,data:{refresh_token:owner.refresh_token}})
 expect(refreshed.status()).toBe(200)
 expect((await request.get('/api/v1/session',{headers:{Authorization:`Bearer ${(await refreshed.json()).access_token}`}})).status()).toBe(200)
 await mkdir('artifacts',{recursive:true});await page.getByRole('img',{name:'Green fixture',exact:true}).screenshot({path:'artifacts/live-private-photo.png'})
 await page.reload();await page.getByRole('button',{name:/Live private evidence fixture/}).click();await page.getByRole('button',{name:'Open geometry workspace'}).click();await page.getByText('Private site evidence',{exact:true}).click()
 await expect(page.getByText('Fixture observation saved through real services',{exact:true})).toBeVisible()
 await page.getByRole('button',{name:'Sign out',exact:true}).click();await expect(page.getByLabel('Email address')).toBeVisible()
})


test('real local recovery email and password update in browser',async({page,request})=>{
 test.setTimeout(60000)
 const fixture=JSON.parse(await readFile('.local/live-browser-fixture.json','utf8'))
 const user=fixture.users[0]
 await page.goto('/')
 await page.getByRole('button',{name:'Forgot your password?',exact:true}).click()
 await page.getByLabel('Email address',{exact:true}).fill(user.email)
 await page.getByRole('button',{name:'Send recovery link',exact:true}).click()
 await expect(page.getByRole('status').filter({hasText:'If this address has an account'})).toBeVisible()
 let mail
 await expect.poll(async()=>{
  const inbox=await (await request.get('http://127.0.0.1:54334/api/v1/messages')).json()
  mail=inbox.messages.find(message=>message.To?.some(recipient=>recipient.Address===user.email))
  return Boolean(mail)
 },{timeout:20000}).toBe(true)
 const message=await (await request.get(`http://127.0.0.1:54334/api/v1/message/${mail.ID}`)).json()
 const links=[...message.HTML.matchAll(/href="([^"]+)"/g)].map(match=>match[1].replaceAll('&amp;','&'))
 const link=links.find(value=>value.includes('/auth/v1/verify'))
 expect(new URL(link).origin).toBe(fixture.supabase_url)
 await page.goto(link)
 await expect(page.getByRole('heading',{name:'Choose a new password',exact:true})).toBeVisible()
 const password=`Changed-${randomUUID()}`
 await page.getByLabel('New password',{exact:true}).fill(password)
 await page.getByRole('button',{name:'Update password',exact:true}).click()
 await expect(page.getByRole('heading',{name:'Your projects',exact:true})).toBeVisible()
 await page.getByRole('button',{name:'Sign out',exact:true}).click()
 await page.getByLabel('Email address',{exact:true}).fill(user.email)
 await page.getByLabel('Password',{exact:true}).fill(password)
 await page.getByRole('button',{name:'Sign in',exact:true}).click()
 await expect(page.getByRole('heading',{name:'Your projects',exact:true})).toBeVisible()
 const old=await request.post(`${fixture.supabase_url}/auth/v1/token?grant_type=password`,{headers:{apikey:fixture.public_key},data:{email:user.email,password:user.password}})
 expect(old.status()).toBe(400)
 await request.delete('http://127.0.0.1:54334/api/v1/messages',{data:{IDs:[mail.ID]}})
})
