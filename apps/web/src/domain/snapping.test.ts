import { describe, expect, it } from 'vitest'
import { snapPosition } from './snapping'
import { coordinateText, parseCoordinates, type Geometry } from './workspace'
const project = ([x, y]: [number, number]) => ({ x, y })
const unproject = ({ x, y }: { x: number; y: number }): [number, number] => [x, y]
describe('spatial snap acquisition and ring preservation', () => {
  const line: Geometry = {
    type: 'LineString',
    coordinates: [
      [-100, 0],
      [100, 0],
    ],
  }
  it('snaps to edges only when enabled and within acquisition distance', () => {
    expect(snapPosition([0, 5], [line], project, unproject, true)).toEqual([0, 0])
    expect(snapPosition([0, 5], [line], project, unproject, false)).toEqual([0, 5])
    expect(snapPosition([0, 20], [line], project, unproject, true)).toEqual([0, 20])
    expect(snapPosition([-99, 1], [line], project, unproject, false)).toEqual([-100, 0])
  })
  it('preserves polygon holes through numeric editing', () => {
    const geometry: Geometry = {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10],
          [0, 0],
        ],
        [
          [2, 2],
          [3, 2],
          [3, 3],
          [2, 3],
          [2, 2],
        ],
      ],
    }
    expect(parseCoordinates(coordinateText(geometry), 'Polygon')).toEqual(geometry)
    expect(() => parseCoordinates('0,0\n\n1,1', 'LineString')).toThrow()
  })
})
