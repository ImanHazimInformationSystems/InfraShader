import { expect, it } from 'vitest'
import * as THREE from 'three'
import { terrainGeometry, updateTerrainGeometry } from './terrain-mesh'
import { drapedSurface, updateDrapedSurface } from './draped-surface'
import type { Terrain } from '../domain/terrain'

it('keeps a road continuously above uneven rendered triangles before and after sculpting', () => {
  const t: Terrain = { datum: 'Synthetic', source: 'Test', metric_crs: 'EPSG:32647', bounds: [0, 0, 10, 10], size: 5, base_elevation: 0, heights: Array.from({ length: 25 }, (_, i) => (i % 2) * 3), ponds: [] }
  const ground = terrainGeometry(t, undefined, 0, 0, 0)
  const road = drapedSurface({ type: 'Polygon', coordinates: [[[1, 3], [9, 3], [9, 7], [1, 7], [1, 3]]] }, ground, 0, 0)
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
  const groundMesh = new THREE.Mesh(ground, material), roadMesh = new THREE.Mesh(road, material)
  roadMesh.position.y = .08; groundMesh.updateMatrixWorld(); roadMesh.updateMatrixWorld()
  function check() {
    for (let x = 1.3; x < 9; x += .7) for (let y = 3.2; y < 7; y += .6) {
      const ray = new THREE.Raycaster(new THREE.Vector3(x, 30, -y), new THREE.Vector3(0, -1, 0))
      const land = ray.intersectObject(groundMesh)[0], surface = ray.intersectObject(roadMesh)[0]
      expect(surface).toBeDefined()
      expect(surface.point.y - land.point.y).toBeCloseTo(.08, 4)
    }
  }
  check()
  t.heights = t.heights.map((_, i) => Math.sin(i) * 4)
  updateTerrainGeometry(ground, t, 0, 0, 0); updateDrapedSurface(road, ground)
  check()
  t.heights.fill(9)
  updateTerrainGeometry(ground, t, 0, 0, 0); updateDrapedSurface(road, ground)
  expect(ground.boundingBox!.max.y).toBe(9)
  expect(road.boundingBox!.max.y).toBeCloseTo(9)
  check()
  ground.dispose(); road.dispose(); material.dispose()
})
