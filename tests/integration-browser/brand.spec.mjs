import { test, expect } from '@playwright/test'

// Refinement WP4 4.3: favicon, Apple touch icon, manifest, theme colour and sharing metadata are
// served by the production bundle and resolve to real files (not the SPA fallback page).
test('brand icons, manifest and sharing metadata resolve from the production bundle', async ({ page, request }) => {
  await page.goto('/')
  await expect(page).toHaveTitle('InfraShader · Outdoor possibilities, grounded')
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#701f36')
  const links = await page.locator('link[rel="icon"], link[rel="apple-touch-icon"], link[rel="manifest"], meta[property="og:image"]').evaluateAll((nodes) => nodes.map((n) => n.getAttribute('href') ?? n.getAttribute('content')))
  expect(links).toEqual(['/favicon.svg', '/favicon-32.png', '/apple-touch-icon.png', '/site.webmanifest', '/social-card.png'])
  for (const [href, type] of [['/favicon.svg', 'image/svg+xml'], ['/favicon-32.png', 'image/png'], ['/apple-touch-icon.png', 'image/png'], ['/social-card.png', 'image/png']]) {
    const response = await request.get(href)
    expect(response.status(), href).toBe(200)
    expect(response.headers()['content-type'], href).toContain(type)
  }
  const manifest = await (await request.get('/site.webmanifest')).json()
  expect(manifest).toMatchObject({ name: 'InfraShader', theme_color: '#701f36' })
  for (const icon of manifest.icons) expect((await request.get(icon.src)).status(), icon.src).toBe(200)
})
