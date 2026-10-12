import {test,expect} from '@playwright/test'
import {mkdir} from 'node:fs/promises'
test('live OpenFreeMap context and Photon search (external availability check)',async({page},testInfo)=>{
 test.setTimeout(60000)
 await page.goto('/');await page.getByRole('button',{name:'Open Browser Demo'}).click()
 await page.getByRole('navigation').getByRole('button',{name:'Explore Map'}).click()
 const map=page.getByRole('region',{name:'Explore site map'})
 await expect.poll(async()=>Number(await map.getAttribute('data-rendered-context-features')),{timeout:30000}).toBeGreaterThan(10)
 await expect(map.locator('.maplibregl-ctrl-attrib')).toContainText('OpenStreetMap')
 await page.getByLabel('Search for a place').fill('Kuala Lumpur')
 await page.getByRole('button',{name:'Search places',exact:true}).click()
 await expect(page.getByText('Choose a result, then refine your site extent.',{exact:true})).toBeVisible({timeout:15000})
 await mkdir('artifacts',{recursive:true});await page.screenshot({path:`artifacts/live-map-${testInfo.project.name}.png`,fullPage:true})
})
