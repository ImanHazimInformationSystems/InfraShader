// Regenerate PNG fallbacks and the social card from apps/web/public/favicon.svg.
// Usage: node scripts/render-brand-assets.mjs   (uses the Playwright browser already in devDependencies)
import { chromium } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const pub = path.resolve('apps/web/public')
const svg = await readFile(path.join(pub, 'favicon.svg'), 'utf8')
const channel = process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined)
const browser = await chromium.launch({ channel })
const page = await browser.newPage()

// Square icons: browser fallback, Apple touch icon (opaque, no rounded mask needed) and manifest sizes.
for (const [name, size, inset] of [['favicon-32.png', 32, 0], ['apple-touch-icon.png', 180, 0], ['icon-192.png', 192, 0], ['icon-512.png', 512, 0]]) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(`<html><body style="margin:0;background:#701f36">${svg.replace('<svg ', `<svg width="${size - inset * 2}" height="${size - inset * 2}" style="display:block;margin:${inset}px" `)}</body></html>`)
  await page.screenshot({ path: path.join(pub, name), omitBackground: false })
}

// Social sharing card (1200x630). Text only states what the product is; no claims or customer names.
await page.setViewportSize({ width: 1200, height: 630 })
await page.setContent(`<html><body style="margin:0;width:1200px;height:630px;display:flex;align-items:center;gap:56px;padding:0 96px;box-sizing:border-box;background:linear-gradient(135deg,#431322,#701f36 60%,#8b2946);font-family:'Segoe UI',system-ui,sans-serif;color:#f4f5f7">
  ${svg.replace('<svg ', '<svg width="220" height="220" style="flex:none;border-radius:44px;box-shadow:0 18px 40px rgba(0,0,0,.35)" ')}
  <div><div style="font-size:30px;letter-spacing:.18em;text-transform:uppercase;color:#c9ccd3">InfraShader</div>
  <div style="font-size:58px;font-weight:700;line-height:1.1;margin-top:14px">Plan outdoor work.<br>Explain the price.<br>Deliver a clearer proposal.</div>
  <div style="font-size:26px;margin-top:22px;color:#d7d9de">Design Studio for contractors · Organisation Review for owners</div></div>
</body></html>`)
await page.screenshot({ path: path.join(pub, 'social-card.png') })
await browser.close()
console.log('Rendered favicon-32.png, apple-touch-icon.png, icon-192.png, icon-512.png, social-card.png')
