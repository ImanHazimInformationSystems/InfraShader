import { describe, expect, it } from 'vitest'
import { readOSMTrees, readTreeGeoJSON, loadMappedTrees } from './tree-context'
import { treeShadowPreview } from './tree-scene'

const feature = {
  type: 'Feature',
  id: 'survey-1',
  properties: { name: 'Tree A' },
  geometry: { type: 'Point', coordinates: [100.33, 5.41] },
}
const collection = (features = [feature]) => JSON.stringify({ type: 'FeatureCollection', features })
describe('separately sourced tree context', () => {
  it('requires attribution, preserves unknowns and gives stable import identities', async () => {
    await expect(readTreeGeoJSON(collection(), '', '')).rejects.toThrow('source')
    const [first] = await readTreeGeoJSON(collection(), 'Survey A', 'Owner permission')
    const [again] = await readTreeGeoJSON(
      collection([
        { ...feature, geometry: { ...feature.geometry, coordinates: [100.331, 5.411] } },
      ]),
      'Survey A',
      'Owner permission',
    )
    expect(again.id).toBe(first.id)
    expect(first.height_m).toBeNull()
    expect(first.species).toBe('')
    await expect(
      readTreeGeoJSON(collection([feature, feature]), 'Survey A', 'Owner permission'),
    ).rejects.toThrow('Duplicate')
  })
  it('rejects invalid geometry, oversized input and non-WGS84 positions', async () => {
    for (const text of [
      collection([{ ...feature, geometry: { type: 'LineString', coordinates: [100, 5] } }]),
      collection([{ ...feature, geometry: { type: 'Point', coordinates: [500000, 600000] } }]),
      ' '.repeat(2_000_001),
    ])
      await expect(readTreeGeoJSON(text, 'Inventory', 'Permission')).rejects.toThrow()
  })
  it('reports partial mapped inventories and rejects server timeout remarks', () => {
    expect(readOSMTrees({ elements: [] })).toEqual({ trees: [], limited: false })
    expect(() => readOSMTrees({ elements: [], remark: 'runtime error' })).toThrow('incomplete')
    const result = readOSMTrees({
      elements: Array.from({ length: 501 }, (_, i) => ({
        type: 'node',
        id: i + 1,
        lon: 100.33,
        lat: 5.41,
        tags: { natural: 'tree', height: 'unknown', diameter_crown: '4 m' },
      })),
    })
    expect(result.limited).toBe(true)
    expect(result.trees).toHaveLength(500)
    expect(result.trees[0].height_m).toBeNull()
    expect(result.trees[0].crown_diameter_m).toBe(4)
  })
  it('bounds public lookups before making a request', async () => {
    await expect(loadMappedTrees([0, 0, 1, 1], new AbortController().signal)).rejects.toThrow(
      'bounded',
    )
  })
  it('only previews retained trees with explicit dimensions and available daylight', async () => {
    const [unknown] = await readTreeGeoJSON(collection(), 'Test', 'Test permission')
    const measured = {
      ...unknown,
      context: false,
      height_m: 10,
      crown_diameter_m: 6,
      dimensions_source: 'Fixture dimensions',
    }
    const sun = { azimuth_deg: 90, elevation_deg: 45 }
    expect(
      treeShadowPreview(
        [
          { ...unknown, context: false },
          { ...measured, status: 'remove' },
        ],
        sun,
      ).features,
    ).toHaveLength(0)
    expect(treeShadowPreview([measured], null).features).toHaveLength(0)
    expect(treeShadowPreview([measured], { ...sun, elevation_deg: 4 }).features).toHaveLength(0)
    const ring = treeShadowPreview([measured], sun).features[0].geometry.coordinates[0]
    expect(ring[0]).toEqual(ring.at(-1))
    expect(ring.reduce((sum, p) => sum + p[0], 0) / ring.length).toBeLessThan(measured.longitude)
  })
})
