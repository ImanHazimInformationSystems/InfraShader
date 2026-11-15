import { expect, it } from 'vitest'
import * as THREE from 'three'
import { roadImage, roadSurfaces } from './layout-textures'
import { roadTexture, roadUvs, groundUvs, groundSurface } from './scene-surfaces'
import type { MapFrame } from './map-frame'
import type { Terrain } from '../domain/terrain'

const triangle = () => new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 10, 0, 0, 0, 0, 10], 3))

it('reuses each original map road pattern as a repeating colour-correct 3D texture', () => {
  const signatures = new Set<string>()
  for (const surface of roadSurfaces) {
    const pixels = roadImage(surface.id), texture = roadTexture(surface.id)
    expect(texture.image.data).toEqual(pixels.data)
    expect(texture.image.width).toBe(32)
    expect(texture.wrapS).toBe(THREE.RepeatWrapping)
    expect(texture.colorSpace).toBe(THREE.SRGBColorSpace)
    signatures.add(Array.from(pixels.data.slice(0, 64)).join(','))
    texture.dispose()
  }
  expect(signatures.size).toBe(4)
})

it('anchors road patterns in the metric frame rather than stretching them per polygon', () => {
  const geo = triangle()
  roadUvs(geo, 100, 200, [100, 200])
  const uv = geo.getAttribute('uv')
  expect([uv.getX(0), uv.getY(0)]).toEqual([0, 0])
  expect([uv.getX(1), uv.getY(1)]).toEqual([5, 0])
  expect([uv.getX(2), uv.getY(2)]).toEqual([0, -5])
  geo.dispose()
})

it('transfers the geographic grass canvas with correct north/south orientation and convergence', () => {
  const geo = triangle()
  const frame: MapFrame = { origin: [100, 200], mercator: [.1, .2], east: [.01, 0], north: [0, -.01], scale: .01, supported: true, residual_m: 0 }
  const paint = { west: .1, north: .2, spanX: .1, spanY: .1 }
  groundUvs(geo, 100, 200, frame, paint)
  let uv = geo.getAttribute('uv')
  expect([uv.getX(0), uv.getY(0)]).toEqual([0, 1])
  expect([uv.getX(1), uv.getY(1)]).toEqual([1, 1])
  expect(uv.getY(2)).toBeCloseTo(0)
  groundUvs(geo, 100, 200, { ...frame, east: [.009, .001], north: [.001, -.009] }, paint)
  uv = geo.getAttribute('uv')
  expect(uv.getX(1)).toBeCloseTo(.9)
  expect(uv.getY(1)).toBeCloseTo(.9)
  geo.dispose()
})

it('keeps a clipped painted surface on the existing terrain and admits a display-only flat fallback', () => {
  const boundary = { type: 'Polygon' as const, coordinates: [[[0, 0] as [number, number], [10, 0] as [number, number], [0, 10] as [number, number], [0, 0] as [number, number]]] }
  const t: Terrain = { datum: 'Synthetic', source: 'Test', metric_crs: 'EPSG:32647', bounds: [0, 0, 10, 10], size: 5, heights: Array.from({ length: 25 }, (_, i) => i % 5), base_elevation: 0, ponds: [] }
  const before = structuredClone(t)
  const draped = groundSurface(boundary, t, 0, 0, 0), flat = groundSurface(boundary, null, 0, 0, 0)
  const positions = draped.getAttribute('position')
  for (let i = 0; i < positions.count; i++) {
    expect(positions.getX(i) - positions.getZ(i)).toBeLessThanOrEqual(10.0001)
    expect(positions.getY(i)).toBeCloseTo(positions.getX(i) / 2.5)
  }
  const fp = flat.getAttribute('position')
  for (let i = 0; i < fp.count; i++) expect(fp.getY(i)).toBe(0)
  expect(t).toEqual(before)
  draped.dispose(); flat.dispose()
})
