import type { Geometry } from './workspace'
type Position = [number, number]
type Pixel = { x: number; y: number }

// Acquisition is screen-space, never a claim about survey precision.
export function snapPosition(
  point: Position,
  geometries: Geometry[],
  project: (p: Position) => Pixel,
  unproject: (p: Pixel) => Position,
  edges: boolean,
  radius = 12,
): Position {
  const p = project(point)
  let distance = radius,
    best = point
  const consider = (q: Pixel, coordinate: Position) => {
    const d = Math.hypot(p.x - q.x, p.y - q.y)
    if (d < distance) {
      distance = d
      best = coordinate
    }
  }
  for (const geometry of geometries) {
    const rings =
      geometry.type === 'Polygon'
        ? geometry.coordinates
        : [geometry.type === 'Point' ? [geometry.coordinates] : geometry.coordinates]
    for (const ring of rings) {
      ring.forEach((c) => consider(project(c), c))
      if (edges)
        for (let i = 1; i < ring.length; i++) {
          const a = project(ring[i - 1]),
            b = project(ring[i])
          const dx = b.x - a.x,
            dy = b.y - a.y,
            length = dx * dx + dy * dy
          if (length === 0) continue
          const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length))
          const q = { x: a.x + t * dx, y: a.y + t * dy }
          consider(q, unproject(q))
        }
    }
  }
  return [...best]
}
