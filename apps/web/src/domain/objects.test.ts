import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import catalogue from '../../public/objects/catalogue.json'
import { catalogueSchema, objectInstanceSchema } from './objects'
import { draftWorkspace, itemSchema, workspaceInput } from './workspace'

describe('admitted 3D object primitives', () => {
  it('matches actual Three mesh bounds, ground pivot and triangle counts for every preset', () => {
    for (const preset of catalogueSchema.parse(catalogue)) {
      const group = new THREE.Group()
      let triangles = 0
      for (const part of preset.parts) {
        const geo =
          part.shape === 'box'
            ? new THREE.BoxGeometry(1, 1, 1)
            : part.shape === 'cylinder'
              ? new THREE.CylinderGeometry(0.5, 0.5, 1, 8, 1)
              : new THREE.SphereGeometry(0.5, 8, 6)
        triangles += (geo.index?.count ?? geo.attributes.position.count) / 3
        const mesh = new THREE.Mesh(geo)
        mesh.position.set(...part.position)
        mesh.scale.set(...part.size)
        group.add(mesh)
      }
      const bounds = new THREE.Box3().setFromObject(group),
        size = bounds.getSize(new THREE.Vector3())
      size.toArray().forEach((v, i) => expect(v).toBeCloseTo(preset.dimensions[i], 5))
      expect(bounds.min.y).toBeCloseTo(0, 5)
      expect(triangles).toBe(preset.triangles)
      expect(triangles * 150).toBeLessThanOrEqual(38400)
      group.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose()
          ;(o.material as THREE.Material).dispose()
        }
      })
    }
  })
  it('preserves instance and rate links while stripping derived poses from writes', () => {
    const data = draftWorkspace([101.681, 3.131, 101.683, 3.133]),
      id = crypto.randomUUID()
    const object = objectInstanceSchema.parse({
      asset_id: 'bench',
      longitude: 101.682,
      latitude: 3.132,
      group: 'Garden',
    })
    data.scenarios.option_a.items.push(
      itemSchema.parse({
        id,
        name: 'Bench',
        kind: 'object',
        geometry: null,
        status: 'proposed',
        count: 1,
        height_m: null,
        height_source: '',
        quantity_override: null,
        provenance: 'estimated',
        source_note: 'Test',
        rate_id: id,
        object_instance: object,
        object_pose: {
          x: 1,
          y: 2,
          ground_elevation_m: 0,
          elevation_m: 0,
          dimensions: [1.8, 1, 0.55],
          footprint: { type: 'Polygon', coordinates: [] },
          license: 'MIT',
          asset_sha256: 'test',
          metric_crs: 'EPSG:32647',
        },
      }),
    )
    const result = workspaceInput(data, 3).scenarios.option_a.items[0]
    expect(result.object_instance?.group).toBe('Garden')
    expect(result.rate_id).toBe(id)
    expect(result.object_pose).toBeUndefined()
    expect(data.scenarios.option_a.items[0].object_pose).toBeDefined()
  })
  it('rejects nonfinite or out-of-range instance transforms', () => {
    for (const patch of [
      { scale: 3 },
      { scale: 0 },
      { rotation_deg: 360 },
      { elevation_offset_m: 11 },
      { snap_m: NaN },
    ])
      expect(
        objectInstanceSchema.safeParse({ asset_id: 'bench', longitude: 101, latitude: 3, ...patch })
          .success,
      ).toBe(false)
  })
})
