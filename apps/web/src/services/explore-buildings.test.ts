import { describe, expect, it } from 'vitest'
import type { Feature, Polygon } from 'geojson'
import { collectBuildings } from './explore-buildings'

function building(height: unknown, x = 101.68): Feature<Polygon> {
  return {
    type: 'Feature',
    properties: { height },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [x, 3.13],
          [x + 0.0001, 3.13],
          [x + 0.0001, 3.1301],
          [x, 3.1301],
          [x, 3.13],
        ],
      ],
    },
  }
}
describe('loaded provider coverage', () => {
  it('distinguishes unknown heights, unsupported parts and duplicate tiles without inventing heights', () => {
    const valid = building(12)
    const courtyard = building(8)
    courtyard.geometry.coordinates.push(courtyard.geometry.coordinates[0])
    const result = collectBuildings(
      [valid, valid, building(null), building('missing'), building(1200), courtyard],
      { lng: 101.68, lat: 3.13 },
    )
    expect(result.buildings).toHaveLength(1)
    expect(result.coverage).toEqual({
      loaded: 5,
      unknownHeight: 2,
      unsupported: 2,
      limited: 0,
      used: 1,
    })
  })
  it('bounds payloads and counts the omitted capacity separately', () => {
    const result = collectBuildings(
      Array.from({ length: 510 }, (_, i) => building(12, 101.68 + i * 0.000001)),
      { lng: 101.68, lat: 3.13 },
    )
    expect(result.buildings).toHaveLength(500)
    expect(result.coverage.limited).toBe(10)
  })
  it('does not send coordinates outside the analytical latitude range', () => {
    const high = building(10)
    high.geometry.coordinates[0] = high.geometry.coordinates[0].map(([x]) => [x, 82])
    expect(collectBuildings([high], { lng: 101.68, lat: 82 }).coverage.unsupported).toBe(1)
  })
})
