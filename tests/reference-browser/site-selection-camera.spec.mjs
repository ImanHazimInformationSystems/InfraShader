import { test, expect } from '@playwright/test'

for (const [device, size] of Object.entries({
  desktop: { width: 1280, height: 900 },
  phone: { width: 390, height: 844 },
})) {
  test(`${device}: selecting after panning uses the viewed location and preserves Cancel`, async ({ page }) => {
    await page.setViewportSize(size)
    await page.route('https://photon.komoot.io/api/**', route => route.fulfill({
      json: { features: [{ geometry: { type: 'Point', coordinates: [100.3354, 5.4141] },
        properties: { name: 'George Town', state: 'Penang' } }] },
    }))
    await page.goto('/')
    await page.getByRole('button', { name: 'Open Browser Demo' }).click()
    const menu = page.getByRole('button', { name: 'Open workspace navigation' })
    if (await menu.isVisible()) await menu.click()
    await page.getByRole('navigation', {
      name: device === 'phone' ? 'Mobile workspace navigation' : 'Main navigation',
    }).getByRole('button', { name: 'Explore Map', exact: true }).click()
    const names = ['West longitude', 'South latitude', 'East longitude', 'North latitude']
    const coordinates = () => Promise.all(names.map(name => page.getByLabel(name, { exact: true }).inputValue()))
    await page.getByLabel('Search for a place', { exact: true }).fill('George Town Penang')
    await page.getByRole('button', { name: 'Search places', exact: true }).click()
    await page.getByRole('button', { name: 'George Town, Penang', exact: true }).click()
    const original = await coordinates()
    const select = page.getByRole('button', { name: 'Select site on map', exact: true })
    await expect(select).toBeEnabled({ timeout: 30000 })
    await page.getByRole('button', { name: 'Hide site controls', exact: true }).click()
    const canvas = page.getByRole('region', { name: 'Explore site map' }).locator('canvas').first()
    await canvas.focus()
    // Keyboard map pans have no pointer inertia; move several view widths east.
    for (let i = 0; i < 18; i++) await page.keyboard.press('ArrowRight', { delay: 350 })
    const view = await canvas.boundingBox()
    await page.mouse.move(view.x + view.width * 0.75, view.y + view.height * 0.4)
    await page.mouse.down()
    await page.mouse.move(view.x + view.width * 0.25, view.y + view.height * 0.4, { steps: 20 })
    await page.mouse.up()
    await expect(page.getByRole('region', { name: 'Explore site map' }))
      .toHaveAttribute('data-rendered-site-features', '0')
    await select.click()
    const panel = page.getByRole('region', { name: 'Site selection controls' })
    const move = page.getByRole('button', { name: 'Move site', exact: true })
    await expect(move).toBeInViewport()
    const start = await move.boundingBox()
    await page.screenshot({ path: `artifacts/site-selection-camera-${device}.png` })
    await move.focus()
    await page.keyboard.press('ArrowRight')
    await panel.getByRole('button', { name: 'Reset', exact: true }).click()
    await expect.poll(async () => (await move.boundingBox()).x).toBeCloseTo(start.x, 0)
    // An ordinary resize must not reframe the old search extent either.
    await page.setViewportSize({ width: size.width, height: size.height - 20 })
    await panel.getByRole('button', { name: 'Cancel', exact: true }).click()
    expect(await coordinates()).toEqual(original)
    await select.click()
    await panel.getByRole('button', { name: 'Apply site shape', exact: true }).click()
    const applied = (await coordinates()).map(Number)
    expect(applied[0]).toBeGreaterThan(Number(original[2]))
    expect(applied[2] - applied[0]).toBeGreaterThan(0)
    expect(applied[2] - applied[0]).toBeLessThanOrEqual(0.2)
    // Reopening an applied outline still edits its exact geometry.
    await select.click()
    await panel.getByRole('button', { name: 'Apply site shape', exact: true }).click()
    expect((await coordinates()).map(Number)).toEqual(applied)
  })
}
