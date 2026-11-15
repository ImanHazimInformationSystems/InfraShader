const { chromium, expect } = require('@playwright/test')
const path = require('node:path')
;(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: true,
  })
  try {
    const page = await browser.newPage({
      viewport: { width: 1600, height: 1040 },
      deviceScaleFactor: 2,
    })
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto('http://127.0.0.1:5173/report-preview.html')
    await expect(page.locator('#studio-map')).toHaveAttribute('data-ready', 'true', {
      timeout: 30000,
    })
    await page.getByRole('button', { name: 'Option B', exact: true }).click()
    await expect(page.locator('.preview-total')).toContainText('112,000')
    await page.getByRole('button', { name: 'Baseline', exact: true }).click()
    await expect(page.locator('#quantities')).toContainText('No proposed work shown')
    await page.getByRole('button', { name: 'Option A', exact: true }).click()
    await expect(page.locator('.preview-total')).toContainText('95,000')
    await page.getByRole('button', { name: 'Lower', exact: true }).click()
    await expect(page.locator('#terrain-status')).toContainText('Lower selected')
    await page.getByRole('button', { name: 'Raise', exact: true }).click()
    await page.getByRole('button', { name: 'Hide proposed layout', exact: true }).click()
    await page.getByRole('button', { name: 'Show proposed layout', exact: true }).click()
    await page.getByRole('button', { name: 'Save preview choice', exact: true }).click()
    await expect(page.locator('#studio-status')).toContainText('remembered in this browser only')
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
    await page.getByRole('button', { name: 'Reset site view', exact: true }).click()
    await page.waitForTimeout(2000)
    await page.screenshot({
      path: path.join(__dirname, '06-design-studio-maplibre.png'),
      fullPage: true,
    })
    await page.getByLabel('Preview workspace').selectOption('review')
    await expect(page.locator('#map-A')).toHaveAttribute('data-ready', 'true', { timeout: 30000 })
    await expect(page.locator('#map-B')).toHaveAttribute('data-ready', 'true', { timeout: 30000 })
    await page.getByRole('button', { name: 'Prefer Option B', exact: true }).click()
    await expect(page.locator('#preferred')).toHaveValue('B')
    await page.getByRole('button', { name: 'Save preview review', exact: true }).click()
    await page.reload()
    await expect(page.locator('#preferred')).toHaveValue('B')
    await page.getByRole('button', { name: 'Prefer Option A', exact: true }).click()
    await page.getByRole('button', { name: 'Save preview review', exact: true }).click()
    await expect(page.locator('#map-B')).toHaveAttribute('data-ready', 'true', { timeout: 30000 })
    await page.waitForTimeout(2000)
    await page.screenshot({
      path: path.join(__dirname, '07-organisation-review-maplibre.png'),
      fullPage: true,
    })
    if (errors.length) throw Error(errors.join('\n'))
    console.log(
      'PASS: studio options, baseline, terrain selector, layers, zoom/reset, local choice; review preferences, save/reload; two screenshots; zero page errors.',
    )
  } finally {
    await browser.close()
  }
})().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
