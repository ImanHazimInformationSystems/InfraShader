import { describe, expect, it } from 'vitest'
import { Matrix4, Vector2, Vector3 } from 'three'
import { mapModelMatrix, mapRay } from './map-frame'

describe('map/local frame', () => {
  it('preserves east, up, south axes including grid convergence', () => {
    const frame = {
      origin: [10, 20] as [number, number],
      mercator: [0.5, 0.5] as [number, number],
      east: [2e-8, 1e-9] as [number, number],
      north: [1e-9, -2e-8] as [number, number],
      scale: 2e-8,
      residual_m: 0.001,
      supported: true,
    }
    const matrix = mapModelMatrix(frame, 12, 23)
    const origin = new Vector3().applyMatrix4(matrix)
    const point = new Vector3(4, 5, -6).applyMatrix4(matrix)
    expect(point.x - origin.x).toBeCloseTo(4 * 2e-8 + 6e-9, 12)
    expect(point.z - origin.z).toBeCloseTo(5 * 2e-8, 12)
    expect(point.y - origin.y).toBeCloseTo(4e-9 - 6 * 2e-8, 12)
  })
  it('inverts a complete view projection for pointer rays', () => {
    const ray = mapRay(new Vector2(0.3, -0.2), new Matrix4())
    expect(ray.ray.origin.toArray()).toEqual([0.3, -0.2, -1])
    expect(ray.ray.direction.toArray()).toEqual([0, 0, 1])
  })
})
