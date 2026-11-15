import { expect, it } from 'vitest'
import { terrainGeometry, updateTerrainGeometry, pondMeshes, runoffMeshes } from './terrain-mesh'
import * as THREE from 'three'
import type { Terrain } from '../domain/terrain'

it('clips a sculpted mesh to a triangular site and updates heights and round water', () => {
  const t: Terrain = { datum: 'Local assumed', source: 'Synthetic', metric_crs: 'EPSG:32647', bounds: [0, 0, 80, 80], size: 9, base_elevation: 10, heights: Array(81).fill(10), ponds: [] }
  const geo = terrainGeometry(t, { type: 'Polygon', coordinates: [[[0, 0], [80, 0], [0, 80], [0, 0]]] }, 0, 0, 10)
  const p = geo.getAttribute('position')
  for (let i = 0; i < p.count; i++) { expect(p.getX(i) - p.getZ(i)).toBeLessThanOrEqual(80.0001); expect(p.getY(i)).toBe(0) }
  t.heights = t.heights.map(() => 12)
  updateTerrainGeometry(geo, t, 0, 0, 10)
  expect(p.getY(0)).toBe(2)
  t.ponds = [{ name: 'Pond', region: [2, 2, 4, 4], water_level: 13, shape: 'circle' }]
  const water = pondMeshes(t, 0, 0, 10)
  expect(water[0].geometry.getAttribute('position').getY(0)).toBeCloseTo(3.02)
  geo.dispose(); water[0].geometry.dispose(); water[0].material.dispose()
})

it('merges wet-cell surfaces and flow arrows into two draw objects', () => {
  const t: Terrain = { datum: 'Local', source: 'Synthetic', metric_crs: 'EPSG:32647', bounds: [0, 0, 80, 80], size: 9, base_elevation: 10, heights: Array(81).fill(10), ponds: [] }
  const cells = Array.from({ length: 4 }, (_, i) => ({ geometry: { type: 'Polygon' as const, coordinates: [[[i * 10, 0] as [number, number], [(i + 1) * 10, 0] as [number, number], [(i + 1) * 10, 10] as [number, number], [i * 10, 10] as [number, number], [i * 10, 0] as [number, number]]] }, level: 10.1, depth: .1, flowTo: [40, 10] as [number, number] }))
  const objects = runoffMeshes(t, { signature: 'synthetic', cells }, 0, 0, 10)
  expect(objects).toHaveLength(2)
  for (const object of objects) if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) { expect(object.geometry.getAttribute('position').count).toBeGreaterThan(0); object.geometry.dispose(); (object.material as THREE.Material).dispose() }
})
