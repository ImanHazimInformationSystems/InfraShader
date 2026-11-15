import { describe, expect, it } from 'vitest'
import { readBuildingContext } from './building-context'
const bounds: [number, number, number, number] = [101.68, 3.13, 101.69, 3.14]
const ring = [
  [101.681, 3.131],
  [101.682, 3.131],
  [101.682, 3.132],
  [101.681, 3.131],
]
const input = (height: unknown) =>
  JSON.stringify({
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { height },
        geometry: { type: 'Polygon', coordinates: [ring] },
      },
    ],
  })
describe('sourced context extract', () => {
  it('preserves known height but never guesses unknown or invalid height', () => {
    expect(
      readBuildingContext(input(12), bounds, 'Overture / ODbL').features[0].properties?.height,
    ).toBe(12)
    for (const height of [null, '12', -1, 1001])
      expect(
        readBuildingContext(input(height), bounds, 'Overture / ODbL').features[0].properties
          ?.height,
      ).toBe(0)
  })
  it('rejects wrong CRS, missing attribution, malformed rings and oversized input', () => {
    expect(() => readBuildingContext(input(10), bounds, '')).toThrow(/attribution/)
    expect(() =>
      readBuildingContext(input(10).replace('101.681', '500000'), bounds, 'source'),
    ).toThrow(/WGS84/)
    expect(() => readBuildingContext(' '.repeat(8000001), bounds, 'source')).toThrow(/8 MB/)
    expect(() => readBuildingContext(input(10), [0, 0, 1, 1], 'source')).toThrow(/No footprints/)
  })
})
