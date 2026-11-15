import { describe, it, expect } from 'vitest'
import {
  contours,
  groundHeight,
  sculpt,
  slope,
  terrainChanged,
  terrainStroke,
  terrainDab, pondAt, defaultTerrainBrush,
  parseGroundGrid,
  type Terrain,
} from './terrain'
const grid = (): Terrain => ({
  datum: 'Local assumed',
  source: 'Synthetic',
  metric_crs: 'EPSG:32647',
  bounds: [0, 0, 80, 80],
  size: 9,
  base_elevation: 10,
  heights: Array(81).fill(10),
  ponds: [],
})
describe('concept terrain', () => {
  it('imports exact supplied grids and erases back to their local elevations', () => {
    const heights = parseGroundGrid(Array.from({ length: 9 }, () => Array(9).fill('12').join(',')).join('\n'), 9)
    expect(heights).toHaveLength(81)
    expect(() => parseGroundGrid('x,y,z', 9)).toThrow('exactly')
    const t = { ...grid(), heights, reference_heights: [...heights], reference_source: 'Synthetic existing ground' }
    t.heights[40] = 13
    let result = t
    for (let i = 0; i < 20; i++) result = terrainDab(result, [[4, 4]], { ...defaultTerrainBrush, mode: 'erase', speed: 2 }, .1) as typeof t
    expect(result.heights[40]).toBe(12)
  })
  it('interpolates ground contact and bounded contours on a sloping plane', () => {
    const t = grid()
    t.heights = t.heights.map((_, i) => i % 9)
    expect(groundHeight(t, 2.5, 4.25)).toBeCloseTo(2.5)
    const lines = contours(t, 2)
    expect(lines.step).toBe(2)
    expect(lines.path).toContain('M50,')
    expect(contours(grid(), 1).path).toBe('')
    expect(contours(t, 0.1).step).toBe(0.4)
  })
  it('raises/lowers with metric radius and falloff without mutating source', () => {
    const t = grid(),
      n = sculpt(t, 4, 4, 'raise', 20, 2, 0, true)
    expect(n.heights[40]).toBe(12)
    expect(n.heights[41]).toBe(11)
    expect(n.heights[42]).toBe(10)
    expect(t.heights[40]).toBe(10)
    expect(sculpt(n, 4, 4, 'lower', 20, 2, 0, true).heights).toEqual(t.heights)
  })
  it('flattens exact numeric region and smooths from immutable neighbours', () => {
    const t = grid(),
      n = sculpt(t, 0, 0, 'flatten', 1, 1, 5, false, [2, 2, 5, 5])
    expect(n.heights[20]).toBe(5)
    expect(n.heights[0]).toBe(10)
    const s = sculpt(n, 2, 2, 'smooth', 10, 1, 0, false)
    expect(s.heights[20]).toBeGreaterThan(5)
    expect(s.heights[20]).toBeLessThan(10)
    expect(terrainChanged(n)).toBe(true)
    expect(terrainChanged(t)).toBe(false)
  })
  it('calculates planar slope in metric spacing and caps heights', () => {
    const t = grid()
    t.heights = t.heights.map((_, i) => (i % 9) * 10)
    expect(slope(t, 4, 4)).toBeCloseTo(45)
    expect(sculpt(t, 4, 4, 'raise', 1, 10000, 0, false).heights[40]).toBe(9000)
  })
})

describe('continuous terrain strokes', () => {
  it('holds a timed brush until its height limit, digs, and erases without changing the source', () => {
    const source = grid()
    let t = source
    const brush = { ...defaultTerrainBrush, mode: 'raise' as const, radius: 20, target: 1, speed: 2 }
    for (let i = 0; i < 20; i++) t = terrainDab(t, [[4, 4]], brush, .1)
    expect(t.heights[40]).toBe(11)
    expect(source.heights[40]).toBe(10)
    for (let i = 0; i < 20; i++) t = terrainDab(t, [[4, 4]], { ...brush, mode: 'lower', target: -1 }, .1)
    expect(t.heights[40]).toBe(9)
    for (let i = 0; i < 20; i++) t = terrainDab(t, [[4, 4]], { ...brush, mode: 'erase' }, .1)
    expect(t.heights[40]).toBe(10)
    const square = terrainDab(source, [[4, 4]], { ...brush, radius: 11, shape: 'square', soft: false }, .1)
    const circle = terrainDab(source, [[4, 4]], { ...brush, radius: 11, shape: 'circle', soft: false }, .1)
    expect(square.heights[30]).toBeGreaterThan(10)
    expect(circle.heights[30]).toBe(10)
  })
  it('adds water only to a lowered region and keeps source water unchanged', () => {
    const t = grid(), brush = { ...defaultTerrainBrush, mode: 'water' as const, radius: 10, target: -1 }
    expect(() => pondAt(t, [4, 4], brush)).toThrow('Dig this whole pond area')
    const dug = { ...t, heights: t.heights.map(() => 8) }
    const wet = pondAt(dug, [4, 4], brush)
    expect(wet.ponds[0].water_level).toBe(9)
    expect(wet.ponds[0].shape).toBe('circle')
    expect(t.ponds).toEqual([])
  })
  it('is independent of pointer event subdivision and does not accumulate repeated stationary samples', () => {
    const t = grid()
    const a = terrainStroke(
      t,
      [
        [2, 4],
        [6, 4],
      ],
      'raise',
      20,
      2,
      0,
    )
    const b = terrainStroke(
      t,
      [
        [2, 4],
        [3, 4],
        [4, 4],
        [4, 4],
        [5, 4],
        [6, 4],
      ],
      'raise',
      20,
      2,
      0,
    )
    expect(a.heights).toEqual(b.heights)
    expect(a.heights[40]).toBe(12)
    expect(t.heights.every((h) => h === 10)).toBe(true)
    expect(a.ponds).toEqual(t.ponds)
  })
  it('handles lower, flatten, smooth and invalid radius without corrupting heights', () => {
    const t = grid()
    expect(terrainStroke(t, [[4, 4]], 'lower', 20, 2, 0).heights[40]).toBe(8)
    expect(terrainStroke(t, [[4, 4]], 'flatten', 20, 2, 15).heights[40]).toBe(15)
    t.heights[40] = 19
    expect(terrainStroke(t, [[4, 4]], 'smooth', 20, 2, 0).heights[40]).toBe(11)
    expect(terrainStroke(t, [[4, 4]], 'raise', NaN, 2, 0)).toBe(t)
  })
})
