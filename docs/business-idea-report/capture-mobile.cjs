const {chromium,expect}=require('@playwright/test')
const path=require('node:path')
;(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true})
 try {
 const page=await browser.newPage({viewport:{width:430,height:932},deviceScaleFactor:3,isMobile:true,hasTouch:true})
 const errors=[];page.on('pageerror',e=>errors.push(e.message))
 for(const view of ['studio','review']){
 await page.goto('http://127.0.0.1:5173/report-preview.html?view='+view)
 await expect(page.locator(view==='studio'?'#studio-map':'#map-B')).toHaveAttribute('data-ready','true',{timeout:30000})
 if(view==='studio'){
 await page.getByRole('button',{name:'Option B',exact:true}).click()
 await expect(page.locator('.preview-total')).toContainText('112,000')
 await page.getByRole('button',{name:'Option A',exact:true}).click()
 }else{
 await page.getByRole('button',{name:'Prefer Option B',exact:true}).click()
 await expect(page.locator('#preferred')).toHaveValue('B')
 await page.getByRole('button',{name:'Prefer Option A',exact:true}).click()
 }
 await page.evaluate(()=>scrollTo(0,0))
 await page.waitForTimeout(1500)
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)) throw Error('Horizontal overflow: '+view)
 await page.screenshot({path:path.join(__dirname,view==='studio'?'08-mobile-design-studio.png':'09-mobile-organisation-review.png'),fullPage:true})
 }
 if(errors.length)throw Error(errors.join('\n'))
 console.log('PASS: two 430px touch previews, live maps, option/budget switching, preferred-option control, no horizontal overflow or page errors.')
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1})
