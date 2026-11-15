const { chromium } = require('@playwright/test')
const fs = require('node:fs')
const path = require('node:path')
;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--disable-gpu'] })
  try {
    const page = await browser.newPage({ viewport: { width: 1560, height: 1290 }, deviceScaleFactor: 1 })
    for (const name of ['infrashader-layered-architecture', 'infrashader-local-deployment']) {
      await page.setContent('<html><body style="margin:0">' + fs.readFileSync(path.join(__dirname, name + '.svg'), 'utf8') + '</body></html>')
      await page.locator('svg').screenshot({ path: path.join(__dirname, name + '.png'), timeout: 15000 })
      const overflow = await page.locator('text').evaluateAll(elements => elements.filter(element => {
        const rect = element.getBBox()
        return rect.x + rect.width > 1540
      }).map(element => element.textContent))
      console.log(name, 'page text overflow:', overflow)
    }
    await page.setContent(fs.readFileSync(path.join(__dirname, 'REVIEW.html'), 'utf8'))
    console.log('Document:', await page.title(), 'diagrams:', await page.locator('svg').count(), 'tables:', await page.locator('table').count())
  } finally {
    await browser.close()
  }
})().catch(error => { console.error(error); process.exitCode = 1 })
