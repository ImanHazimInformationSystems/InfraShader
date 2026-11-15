import { describe, expect, it } from 'vitest'
import {
  extent,
  outlineFromPoints,
  presetSelection,
  selectionError,
  transformSelection,
} from './site-selection'
import { projectInputSchema, emptyBrief } from './projects'

describe('site outline transformations and validation', () => {
  const bounds: [number, number, number, number] = [101.681, 3.131, 101.683, 3.133]
  it('rotates in map space, retains closure and round-trips without losing shape', () => {
    const rectangle = presetSelection(bounds, 'rectangle'),
      rotated = transformSelection(rectangle, 35)
    expect(selectionError(rotated)).toBe('')
    expect(extent(rotated)[0]).toBeLessThan(bounds[0])
    transformSelection(rotated, -35).forEach((p, i) =>
      p.forEach((v, j) => expect(v).toBeCloseTo(rectangle[i][j], 9)),
    )
    const site = { bounds: extent(rotated), crs: 'EPSG:4326', outline: outlineFromPoints(rotated) }
    const result = projectInputSchema.parse({
      ...emptyBrief(bounds),
      name: 'Shape',
      stakeholder: 'Client',
      site,
    })
    expect(result.site.outline).toEqual(site.outline)
  })
  it('builds bounded ellipse and supports independent axis scaling', () => {
    const ellipse = presetSelection(bounds, 'ellipse')
    expect(ellipse).toHaveLength(48)
    expect(selectionError(ellipse)).toBe('')
    const smaller = transformSelection(ellipse, 0, 0.5, 0.8)
    expect(extent(smaller)[2] - extent(smaller)[0]).toBeCloseTo(0.001, 8)
    expect(selectionError(smaller)).toBe('')
  })
  it('rejects crossed, touching, duplicate, degenerate, overlarge and invalid coordinates', () => {
    for (const points of [
      [
        [0, 0],
        [0.01, 0.01],
        [0, 0.01],
        [0.01, 0],
      ],
      [
        [0, 0],
        [0.01, 0],
        [0.005, 0],
      ],
      [
        [0, 0],
        [0, 0],
        [0.01, 0.01],
      ],
      [
        [0, 0],
        [1, 0],
        [0, 1],
      ],
      [
        [NaN, 0],
        [0.01, 0],
        [0, 0.01],
      ],
      [
        [0, 86],
        [0.01, 86],
        [0, 86.01],
      ],
    ] as [number, number][][])
      expect(selectionError(points)).not.toBe('')
  })
  it('accepts concave polygons and rejects unclosed persisted rings', () => {
    const points: [number, number][] = [
      [0, 0],
      [0.02, 0],
      [0.01, 0.01],
      [0.02, 0.02],
      [0, 0.02],
    ]
    expect(selectionError(points)).toBe('')
    const outline = outlineFromPoints(points)
    outline.coordinates[0].pop()
    expect(
      projectInputSchema.safeParse({
        ...emptyBrief([0, 0, 0.02, 0.02]),
        name: 'Test',
        stakeholder: 'Test',
        site: { bounds: [0, 0, 0.02, 0.02], crs: 'EPSG:4326', outline },
      }).success,
    ).toBe(false)
  })
})
