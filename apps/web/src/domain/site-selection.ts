import type { Bounds } from './projects'
export type Position = [number, number]
export type SiteOutline = { type: 'Polygon'; coordinates: Position[][] }
export const projectPoint = ([lng, lat]: Position): Position => [
  (lng * Math.PI) / 180,
  Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)),
]
export const unprojectPoint = ([x, y]: Position): Position => [
  (x * 180) / Math.PI,
  ((2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180) / Math.PI,
]
export function extent(points: Position[]): Bounds {
  return [
    Math.min(...points.map((p) => p[0])),
    Math.min(...points.map((p) => p[1])),
    Math.max(...points.map((p) => p[0])),
    Math.max(...points.map((p) => p[1])),
  ]
}
export function centre(points: Position[]): Position {
  const [w, s, e, n] = extent(points.map(projectPoint))
  return [(w + e) / 2, (s + n) / 2]
}
export function transformSelection(
  points: Position[],
  rotation = 0,
  scaleX = 1,
  scaleY = scaleX,
  offset: Position = [0, 0],
): Position[] {
  const [cx, cy] = centre(points),
    angle = (rotation * Math.PI) / 180
  return points.map(projectPoint).map(([x, y]) => {
    const dx = (x - cx) * scaleX,
      dy = (y - cy) * scaleY
    return unprojectPoint([
      cx + dx * Math.cos(angle) - dy * Math.sin(angle) + offset[0],
      cy + dx * Math.sin(angle) + dy * Math.cos(angle) + offset[1],
    ])
  })
}
export function presetSelection(bounds: Bounds, kind: 'rectangle' | 'ellipse'): Position[] {
  const [w, s] = projectPoint([bounds[0], bounds[1]]),
    [e, n] = projectPoint([bounds[2], bounds[3]])
  if (kind === 'rectangle')
    return [
      [bounds[0], bounds[1]],
      [bounds[2], bounds[1]],
      [bounds[2], bounds[3]],
      [bounds[0], bounds[3]],
    ]
  return Array.from({ length: 48 }, (_, i) =>
    unprojectPoint([
      (w + e) / 2 + ((e - w) / 2) * Math.cos((i * Math.PI) / 24),
      (s + n) / 2 + ((n - s) / 2) * Math.sin((i * Math.PI) / 24),
    ]),
  )
}
export function selectionError(points: Position[]): string {
  if (points.length < 3 || points.length > 64) return 'Use between 3 and 64 corners.'
  if (
    points.some(
      ([x, y]) =>
        !Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 180 || Math.abs(y) > 85,
    )
  )
    return 'Keep the site within supported longitude/latitude limits.'
  const [w, s, e, n] = extent(points)
  if (e - w > 0.2 || n - s > 0.2)
    return 'Zoom in: the site must be no more than 0.2 degrees wide or high.'
  const cross = (a: Position, b: Position, c: Position) =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
  const intersects = (a: Position, b: Position, c: Position, d: Position) => {
    const o = [cross(a, b, c), cross(a, b, d), cross(c, d, a), cross(c, d, b)]
    const within = (a: Position, b: Position, p: Position) =>
      p[0] >= Math.min(a[0], b[0]) &&
      p[0] <= Math.max(a[0], b[0]) &&
      p[1] >= Math.min(a[1], b[1]) &&
      p[1] <= Math.max(a[1], b[1])
    return (
      (o[0] * o[1] < 0 && o[2] * o[3] < 0) ||
      (o[0] === 0 && within(a, b, c)) ||
      (o[1] === 0 && within(a, b, d)) ||
      (o[2] === 0 && within(c, d, a)) ||
      (o[3] === 0 && within(c, d, b))
    )
  }
  let area = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length]
    if (a[0] === b[0] && a[1] === b[1]) return 'Remove duplicate corners.'
    area += cross(points[0], a, b)
    for (let j = i + 1; j < points.length; j++) {
      if (j === i + 1 || (i === 0 && j === points.length - 1)) continue
      if (intersects(a, b, points[j], points[(j + 1) % points.length]))
        return 'Edges cannot cross. Move a corner or undo the last change.'
    }
  }
  return Math.abs(area) <= 2e-14 ? 'Select an area with non-zero width and height.' : ''
}
export const outlineFromPoints = (points: Position[]): SiteOutline => ({
  type: 'Polygon',
  coordinates: [[...points, points[0]]],
})
