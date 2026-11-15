import { describe, expect, it } from 'vitest'
import { createTreeShadowResources, treeShadowFootprint, updateTreeShadow } from './tree-shadow'

describe('illustrative flat-ground tree shadows', () => {
  it('casts away from the sun and grows with height or lower elevation', () => {
    const eastSun = treeShadowFootprint(10, 6, { azimuth_deg: 90, elevation_deg: 45 })!
    expect(eastSun.east).toBeCloseTo(-6.5)
    expect(eastSun.north).toBeCloseTo(0)
    const westSun = treeShadowFootprint(10, 6, { azimuth_deg: 270, elevation_deg: 45 })!
    expect(westSun.east).toBeCloseTo(6.5)
    expect(treeShadowFootprint(10, 6, { azimuth_deg: 0, elevation_deg: 45 })!.north).toBeCloseTo(-6.5)
    expect(treeShadowFootprint(10, 6, { azimuth_deg: 180, elevation_deg: 45 })!.north).toBeCloseTo(6.5)
    expect(Math.abs(treeShadowFootprint(20, 12, { azimuth_deg: 90, elevation_deg: 45 })!.east)).toBeCloseTo(13)
    expect(treeShadowFootprint(10, 6, { azimuth_deg: 90, elevation_deg: 15 })!.along).toBeGreaterThan(eastSun.along)
    expect(treeShadowFootprint(10, 6, { azimuth_deg: 90, elevation_deg: 90 })!.east).toBeCloseTo(0)
  })
  it('hides unavailable, night, low-sun and invalid previews without keeping the previous shadow', () => {
    const resources = createTreeShadowResources(), mesh = resources.make()
    updateTreeShadow(mesh, 10, 6, { azimuth_deg: 90, elevation_deg: 45 })
    expect(mesh.visible).toBe(true)
    expect(mesh.position.x).toBeCloseTo(-6.5)
    expect(mesh.scale.x).toBe(3)
    for (const solar of [null, { azimuth_deg: 0, elevation_deg: -10 }, { azimuth_deg: 0, elevation_deg: 4.9 }, { azimuth_deg: NaN, elevation_deg: 45 }]) {
      updateTreeShadow(mesh, 10, 6, solar)
      expect(mesh.visible).toBe(false)
    }
    expect(treeShadowFootprint(0, 6, { azimuth_deg: 0, elevation_deg: 45 })).toBeNull()
    resources.dispose()
  })
})
