import { test, expect } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'

test('weather renderer recovers after WebGL context loss', async ({page}) => {
  const errors=[]; page.on('pageerror',e=>errors.push(e.message))
  await page.goto('/')
  await page.getByRole('button',{name:'Open Browser Demo'}).click()
  await page.getByRole('navigation').getByRole('button',{name:'Explore Map'}).click()
  await page.getByRole('button',{name:'Hide site controls',exact:true}).click()
  await page.getByText('Environment · Clear',{exact:true}).click()
  await page.getByRole('button',{name:'Storm',exact:true}).click()
  const supported = await page.evaluate(()=>{
    const gl=document.querySelector('.map-canvas canvas').getContext('webgl2')
    const extension=gl.getExtension('WEBGL_lose_context')
    if (!extension) return false
    extension.loseContext()
    setTimeout(()=>extension.restoreContext(),1200)
    return true
  })
  expect(supported).toBe(true)
  await expect(page.locator('.environment-indicator')).toContainText('GPU effect unavailable')
  await expect(page.locator('.environment-indicator')).not.toContainText('GPU effect unavailable',{timeout:15000})
  const canvas=page.locator('.map-canvas canvas')
  const count=Number(await canvas.getAttribute('data-weather-frames'))
  await expect.poll(async()=>Number(await canvas.getAttribute('data-weather-frames')),{timeout:15000}).toBeGreaterThan(count)
  expect(errors).toEqual([])
})

test('outside-Malaysia offset, Now, polar events and reduced weather motion', async ({page}) => {
  await page.clock.setFixedTime(new Date('2026-10-17T23:30:00Z'))
  await page.goto('/')
  await page.getByRole('button', {name:'Open Browser Demo'}).click()
  await page.getByRole('navigation').getByRole('button', {name:'Explore Map'}).click()
  for (const [label,value] of Object.entries({'West longitude':'-74.01','South latitude':'40.7','East longitude':'-73.99','North latitude':'40.72'})) await page.getByLabel(label,{exact:true}).fill(value)
  await page.getByRole('button',{name:'Apply coordinates',exact:true}).click()
  await page.getByRole('button',{name:'Hide site controls',exact:true}).click()
  await page.getByLabel('Shadow UTC offset',{exact:true}).fill('-4')
  await page.getByRole('button',{name:'Now',exact:true}).click()
  await expect(page.getByLabel('Shadow date',{exact:true})).toHaveValue('2026-10-17')
  await expect(page.getByLabel('Shadow time',{exact:true})).toHaveValue('19:30')
  const sun=page.getByRole('region',{name:'Sun and shadow explorer'})
  await expect(sun).toHaveAttribute('data-solar-phase','Night')
  await page.getByRole('button',{name:'Show site controls',exact:true}).click()
  for (const [label,value] of Object.entries({'West longitude':'14.99','South latitude':'77.99','East longitude':'15.01','North latitude':'78.01'})) await page.getByLabel(label,{exact:true}).fill(value)
  await page.getByRole('button',{name:'Apply coordinates',exact:true}).click()
  await page.getByRole('button',{name:'Hide site controls',exact:true}).click()
  await page.getByLabel('Shadow UTC offset',{exact:true}).fill('1')
  await page.getByLabel('Shadow date',{exact:true}).fill('2026-06-21')
  await page.getByLabel('Shadow time',{exact:true}).fill('00:00')
  await expect(sun).toHaveAttribute('data-solar-phase','Daylight')
  await expect(page.getByRole('button',{name:'Sunrise',exact:true})).toBeDisabled()
  await expect(page.getByRole('button',{name:'Sunset',exact:true})).toBeDisabled()
  await page.getByText('Environment · Clear',{exact:true}).click()
  await page.getByRole('button',{name:'Storm',exact:true}).click()
  await page.emulateMedia({reducedMotion:'reduce'})
  await expect(page.getByText('Reduced motion: continuous weather and timeline playback are disabled.')).toBeVisible()
  await page.waitForTimeout(600)
  const canvas=page.locator('.map-canvas canvas')
  await expect(canvas).toHaveAttribute('data-weather-animating','false')
  const frames=await canvas.getAttribute('data-weather-time')
  await page.waitForTimeout(400)
  expect(await canvas.getAttribute('data-weather-time')).toBe(frames)
})

test('real UTP solar timeline, weather and preserved site workflow', async ({ page }, info) => {
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  let shadowCalls = 0
  page.on('request', (r) => {
    if (r.url().endsWith('/explore/shadows')) shadowCalls++
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Open Browser Demo' }).click()
  await page.getByRole('navigation').getByRole('button', { name: 'Explore Map' }).click()
  for (const [label, value] of Object.entries({
    'West longitude': '100.954',
    'South latitude': '4.382',
    'East longitude': '100.962',
    'North latitude': '4.390',
  }))
    await page.getByLabel(label, { exact: true }).fill(value)
  await page.getByRole('button', { name: 'Apply coordinates', exact: true }).click()
  await page.getByRole('button', { name: 'Hide site controls', exact: true }).click()
  const sun = page.getByRole('region', { name: 'Sun and shadow explorer' })
  const map = page.getByRole('region', { name: 'Explore site map' })
  await page.getByLabel('Shadow date', { exact: true }).fill('2026-10-17')
  await page.getByLabel('Shadow time', { exact: true }).fill('12:00')
  await expect(sun).toHaveAttribute('data-solar-phase', 'Daylight')
  await page.getByRole('button', { name: 'Explore in 3D', exact: true }).click()
  await expect
    .poll(async () => Number(await map.getAttribute('data-rendered-buildings')), { timeout: 30000 })
    .toBeGreaterThan(0)
  await expect(sun.getByRole('status')).toContainText('Estimated shadows from', { timeout: 30000 })
  await mkdir('artifacts', { recursive: true })
  await page.screenshot({ path: `artifacts/environment-day-${info.project.name}.png` })
  await page.getByRole('button', { name: 'Sunset', exact: true }).click()
  await expect(sun).toHaveAttribute('data-solar-phase', 'Twilight')
  await expect(sun.getByRole('status')).toContainText('No direct sunlight')
  await page.screenshot({ path: `artifacts/environment-sunset-${info.project.name}.png` })
  await page.getByLabel('Shadow time', { exact: true }).fill('00:00')
  await expect(sun).toHaveAttribute('data-solar-phase', 'Night')
  await expect(sun.getByRole('status')).toContainText('No direct sunlight')
  await page.screenshot({ path: `artifacts/environment-night-${info.project.name}.png` })
  await page.getByLabel('Shadow time', { exact: true }).fill('15:00')
  await expect(sun.getByRole('status')).toContainText('Estimated shadows from')
  await page.getByText('Environment · Clear', { exact: true }).click()
  const before = shadowCalls
  for (const preset of [
    'Partly Cloudy',
    'Overcast',
    'Light Rain',
    'Heavy Rain',
    'Storm',
    'Clear',
  ]) {
    await page.getByRole('button', { name: preset, exact: true }).click()
    await expect(page.locator('.environment-indicator')).toContainText(preset)
    await expect(page.getByRole('button', { name: preset, exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    if (['Heavy Rain', 'Storm'].includes(preset))
      await page.screenshot({
        path: `artifacts/environment-${preset.replaceAll(' ', '-')}-${info.project.name}.png`,
      })
  }
  expect(shadowCalls - before).toBeLessThanOrEqual(1)
  await page.getByRole('button', { name: 'Heavy Rain', exact: true }).click()
  await page.getByText('Advanced weather controls', { exact: true }).click()
  await page.getByRole('spinbutton', { name: 'Rain intensity', exact: true }).fill('45')
  await page
    .getByRole('spinbutton', { name: 'Wind direction (toward, degrees from north)', exact: true })
    .fill('270')
  await expect(page.locator('.environment-indicator')).toContainText('Custom')
  await page.getByText('Advanced weather controls', { exact: true }).click()
  await page.getByRole('button', { name: 'Heavy Rain', exact: true }).click()
  const profile = await page.evaluate(async () => {
    const intervals = []
    let last = performance.now()
    const start = last
    const initialFrames = Number(
      document.querySelector('.map-canvas canvas').dataset.weatherFrames || 0,
    )
    await new Promise((resolve) => {
      function frame(now) {
        intervals.push(now - last)
        last = now
        if (now - start < 3000) requestAnimationFrame(frame)
        else resolve()
      }
      requestAnimationFrame(frame)
    })
    intervals.sort((a, b) => a - b)
    const c = document.querySelector('.map-canvas canvas'),
      g = c.getContext('webgl2'),
      ext = g?.getExtension('WEBGL_debug_renderer_info')
    return {
      browser: navigator.userAgent,
      renderer: ext ? g.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unavailable',
      viewport: [innerWidth, innerHeight],
      weatherRenderFps: (Number(c.dataset.weatherFrames) - initialFrames) / ((last - start) / 1000),
      frames: intervals.length,
      meanFrameMs: intervals.reduce((a, b) => a + b, 0) / intervals.length,
      p95FrameMs: intervals[Math.floor(intervals.length * 0.95)],
    }
  })
  await writeFile(
    `artifacts/environment-profile-${info.project.name}.json`,
    JSON.stringify(profile, null, 2),
  )
  await page.getByLabel('Pause weather animation', { exact: true }).check()
  // Tile/style paints may continue; the weather simulation clock must stay paused.
  await page.waitForTimeout(400)
  await expect(map.locator('canvas')).toHaveAttribute('data-weather-animating','false')
  const pausedFrames = await map.locator('canvas').getAttribute('data-weather-time')
  await page.waitForTimeout(400)
  expect(await map.locator('canvas').getAttribute('data-weather-time')).toBe(pausedFrames)
  await page.getByLabel('Weather effects', { exact: true }).uncheck()
  await expect(page.locator('.environment-indicator')).toContainText('Effects off')
  await page.getByText('Environment · Heavy Rain', { exact: true }).click()
  await page.getByLabel('Shadow time', { exact: true }).fill('23:59')
  await page.getByRole('button', { name: 'Play time', exact: true }).click()
  await expect(page.getByLabel('Shadow date', { exact: true })).toHaveValue('2026-10-18')
  await page.getByRole('button', { name: 'Pause time', exact: true }).click()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(page.getByRole('button', { name: 'Play time', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Show site controls', exact: true }).click()
  await expect(page.getByLabel('West longitude', { exact: true })).toHaveValue('100.954')
  await page.getByRole('button', { name: 'Continue with this site', exact: true }).click()
  await expect(page.getByLabel('Relevant use times')).toHaveValue(/Explore time context/)
  expect(errors).toEqual([])
})

test('stale responses, solar outage, style reload and navigation cleanup', async ({ page }) => {
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await page.getByRole('button', { name: 'Open Browser Demo' }).click()
  await page.getByRole('navigation').getByRole('button', { name: 'Explore Map' }).click()
  await page.getByRole('button', { name: 'Hide site controls', exact: true }).click()
  const sun = page.getByRole('region', { name: 'Sun and shadow explorer' })
  await page.getByLabel('Shadow date', { exact: true }).fill('2026-10-17')
  await expect(sun).toHaveAttribute('data-solar-phase', 'Daylight')
  let delayed = false
  await page.route('**/api/v1/explore/shadows', async (route) => {
    const response = await route.fetch()
    if (!delayed) {
      delayed = true
      await new Promise((resolve) => setTimeout(resolve, 1800))
    }
    await route.fulfill({ response }).catch(() => {})
  })
  await page.getByLabel('Shadow time', { exact: true }).fill('10:00')
  await expect.poll(() => delayed).toBe(true)
  await page.getByLabel('Shadow time', { exact: true }).fill('00:00')
  await expect(sun.getByRole('status')).toContainText('No direct sunlight')
  await page.waitForTimeout(2000)
  await expect(sun.getByRole('status')).toContainText('No direct sunlight')
  await page.getByText('Preview data & limits', { exact: true }).click()
  await page.getByRole('button', { name: 'Reload map rendering' }).click()
  await expect(sun.getByRole('status')).toContainText('No direct sunlight')
  await page.getByLabel('Shadow time', { exact: true }).fill('07:15')
  await page.getByRole('button', { name: 'Face sun direction' }).click()
  await expect(page.locator('.solar-disc')).toBeVisible()
  await page.getByLabel('Show sun path (visible sky only)').check()
  await expect.poll(() => page.locator('.solar-path-point').count()).toBeGreaterThan(0)
  await page.route('**/api/v1/explore/solar-day', (route) =>
    route.fulfill({ status: 503, json: {} }),
  )
  await page.getByLabel('Shadow date', { exact: true }).fill('2026-10-18')
  await expect(sun).toHaveAttribute('data-solar-phase', 'Solar unavailable')
  await expect(sun.getByRole('status')).toContainText('request failed')
  await page.getByRole('button', { name: 'Select site on map', exact: true }).click()
  const selection = page.getByRole('region', { name: 'Site selection controls' })
  await selection.getByRole('button', { name: 'Rectangle', exact: true }).click()
  await selection.getByRole('button', { name: 'Apply site shape', exact: true }).click()
  await expect(page.getByText('Site shape applied. Continue to create your project.', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Projects', exact: false }).first().click()
  await page.getByRole('navigation').getByRole('button', { name: 'Explore Map' }).click()
  await expect(page.locator('.map-canvas canvas')).toHaveCount(1)
  await expect(page.locator('.environment-indicator')).toHaveCount(1)
  expect(errors).toEqual([])
})
