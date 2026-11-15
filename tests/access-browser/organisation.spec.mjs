import {test,expect} from '@playwright/test'
import {readFile,mkdir} from 'node:fs/promises'
import { openWorkspaceProjects, openProjectRecords } from '../studio-helpers.mjs'

test('real identity onboarding, invitation, explicit project grant and workspace switching',async({page,browser,request})=>{
 const fixture=JSON.parse(await readFile('.local/live-browser-fixture.json','utf8'))
 const owner=fixture.users[0],recipient=fixture.users[1]
 const errors=[];page.on('pageerror',e=>errors.push(e.message))
 const login=async(p,u)=>{await p.goto('/');await p.getByLabel('Email address').fill(u.email);await p.getByLabel('Password',{exact:true}).fill(u.password);await p.getByRole('button',{name:'Sign in',exact:true}).click()}
 const context=await browser.newContext({viewport:{width:390,height:844}}), guest=await context.newPage()
 await login(guest,recipient)
 await expect(guest.getByRole('heading',{name:'Create or join an organisation',exact:true})).toBeVisible()
 await mkdir('artifacts',{recursive:true});await guest.getByLabel('Organisation display name').fill('Unsaved organisation draft');await guest.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(guest.getByLabel('Organisation display name')).toHaveValue('Unsaved organisation draft');await guest.screenshot({path:'artifacts/access-onboarding-phone.png',fullPage:true})
 await page.goto('/')
 await page.evaluate(id=>localStorage.setItem(`infrashader.access.${id}`, 'null'),owner.id)
 await login(page,owner)
 // Sign-in lands on the account Home; organisation tools live under the workspace's "Change workspace".
 await openWorkspaceProjects(page,'studio')
 await page.getByText('Change workspace',{exact:true}).click()
 await page.getByRole('button',{name:'Create or join organisation',exact:true}).click()
 await page.getByLabel('Organisation display name').fill('Dual workspace fixture')
 await page.getByLabel('Intended workspace').selectOption('both')
 await page.getByRole('button',{name:'Create organisation',exact:true}).click()
 // Select the new organisation explicitly; creation must not mutate another tenant.
 await page.getByRole('region',{name:'Active organisation and workspace'}).getByRole('combobox',{name:'Organisation',exact:true}).selectOption({label:'Dual workspace fixture / administrator'})
 await page.getByRole('combobox',{name:'Workspace',exact:true}).selectOption('review')
 await expect(page.getByRole('heading',{name:'Organisation Review',exact:true})).toBeVisible()
 await expect(page.getByRole('navigation').getByRole('button',{name:'Explore Map',exact:true})).toBeHidden()
 await expect(page.getByRole('heading',{name:'No assigned projects yet',exact:true})).toBeVisible()
 await page.screenshot({path:'artifacts/access-review-desktop.png',fullPage:true})
 await page.getByRole('button',{name:'New project',exact:true}).click()
 await page.getByLabel('Project name').fill('Granted review brief')
 await page.getByLabel('Internal sponsor').fill('Owner team')
 await page.getByRole('button',{name:'Create project',exact:true}).click()
 await expect(page.getByRole('heading',{name:'Granted review brief',exact:true})).toBeVisible()
 const projectURL=page.url()
 await page.getByRole('navigation').getByRole('button',{name:'Settings and members',exact:true}).click()
 await page.getByLabel('Recipient account email').fill(recipient.email)
 await page.getByRole('checkbox',{name:/^reviewer /}).check()
 await page.getByRole('button',{name:'Create invitation link',exact:true}).click()
 const invitation=await page.getByLabel('Copy invitation link', {exact:true}).inputValue()
 await guest.getByLabel('Invitation link or token').fill(invitation)
 await guest.getByRole('button',{name:'Accept invitation',exact:true}).click()
 // Acceptance returns to Home, which now offers only the granted Organisation Review workspace.
 await expect(guest.getByRole('button',{name:'Open Design Studio'})).toHaveCount(0)
 await openWorkspaceProjects(guest,'review')
 await expect(guest.getByRole('heading',{name:'Granted review brief',exact:true})).toHaveCount(0)
 await page.goto(projectURL)
 await openProjectRecords(page)
 await page.getByText('Project access',{exact:true}).click()
 const member=page.locator('form').filter({has:page.locator('legend').filter({hasText:recipient.id})})
 await member.getByRole('checkbox',{name:'read project',exact:true}).check()
 await member.getByRole('checkbox',{name:'review project',exact:true}).check()
 await member.getByRole('button',{name:'Save project access',exact:true}).click()
 await expect(page.getByRole('status').filter({hasText:`Project access saved for ${recipient.id}.`})).toBeVisible()
 await guest.getByRole('button',{name:'Refresh',exact:true}).click()
 await guest.getByRole('button',{name:/Granted review brief/}).click()
 await expect(guest.getByRole('button',{name:'Edit brief',exact:true})).toBeHidden()
 await expect(guest.getByRole('button',{name:'Open project review',exact:true})).toBeVisible()
 await guest.goto('/studio')
 await expect(guest.getByText('This workspace is not permitted for your membership. Choose an available workspace or Settings.',{exact:true})).toBeVisible()
 // On a project page the sidebar's workspace switcher changes workspace.
 await page.getByRole('combobox',{name:'Switch workspace',exact:true}).selectOption('studio')
 await expect(page.getByRole('heading',{name:'Design Studio',exact:true})).toBeVisible()
 await page.reload();await expect(page.getByRole('combobox',{name:'Switch workspace',exact:true})).toHaveValue('studio')
 await page.screenshot({path:'artifacts/access-studio-desktop.png',fullPage:true})
 // Administration-only membership must retain Settings without project visibility.
 const auth=await (await request.post(`${fixture.supabase_url}/auth/v1/token?grant_type=password`,{headers:{apikey:fixture.public_key},data:{email:owner.email,password:owner.password}})).json()
 const headers={Authorization:`Bearer ${auth.access_token}`}
 const org=new URL(projectURL).pathname.split('/organisations/')[1].split('/')[0]
 const base=`/api/v1/organisations/${org}`
 let membership=(await (await request.get(`${base}/members`,{headers})).json()).items.find(m=>m.user_id===recipient.id)
 expect((await request.patch(`${base}/members/${membership.id}`,{headers,data:{expected_revision:membership.revision,role:'administrator',active:true,capabilities:['manage_members']}})).status()).toBe(200)
 await guest.reload()
 // 390 px: navigation lives in the mobile workspace navigation dialog.
 await guest.getByRole('button',{name:'Open workspace navigation',exact:true}).click()
 await guest.getByRole('navigation',{name:'Mobile workspace navigation'}).getByRole('button',{name:'Settings and members',exact:true}).click()
 await expect(guest.getByLabel('Recipient account email')).toBeVisible()
 await guest.goto(projectURL)
 await expect(guest.getByRole('heading',{name:'Granted review brief',exact:true})).toHaveCount(0)
 // Revocation is reflected on reload; no stale tenant project remains.
 membership=(await (await request.get(`${base}/members`,{headers})).json()).items.find(m=>m.user_id===recipient.id)
 expect((await request.patch(`${base}/members/${membership.id}`,{headers,data:{expected_revision:membership.revision,role:'member',active:false,capabilities:[]}})).status()).toBe(200)
 await guest.reload()
 await expect(guest.getByRole('heading',{name:'Create or join an organisation',exact:true})).toBeVisible()
 // A server-rejected current session exposes reauthentication instead of private content.
 await page.route('**/api/v1/session',route=>route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({error:{code:'invalid_session',message:'Sign in again.'}})}))
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')))
 await expect(page.getByRole('button',{name:'Sign in',exact:true})).toBeVisible()
 await expect(page.getByRole('heading',{name:'Granted review brief',exact:true})).toHaveCount(0)
 await context.close()
 expect(errors).toEqual([])
})
