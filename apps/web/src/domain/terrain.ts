import { z } from 'zod'

export const terrainSchema = z.object({
  datum: z.string().min(3).max(200),
  source: z.string().min(3).max(1000),
  metric_crs: z.string(),
  bounds: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  size: z.number().int().min(5).max(33),
  base_elevation: z.number().finite().min(-500).max(9000),
  heights: z.array(z.number().finite().min(-500).max(9000)).max(1089),
  reference_heights: z.array(z.number().finite().min(-500).max(9000)).max(1089).nullable().optional(),
  reference_source: z.string().optional(),
  ponds: z
    .array(
      z.object({
        name: z.string(),
        region: z.tuple([z.number(), z.number(), z.number(), z.number()]),
        water_level: z.number().finite(),
        shape: z.enum(['circle', 'square']).optional(),
      }),
    )
    .max(8),
})
export type Terrain = z.infer<typeof terrainSchema>
export function parseGroundGrid(text: string, size: number): number[] {
  const rows = text.trim().split(/\r?\n/).map(row => /[,;]/.test(row) ? row.split(/[,;]/).map(value => value.trim()) : row.trim().split(/\s+/))
  if (rows.length !== size || rows.some(row => row.length !== size)) throw new Error(`Provide exactly ${size} rows of ${size} elevations, without headers.`)
  if (rows.some(row => row.some(value => !value))) throw new Error('Missing elevation cells are not allowed.')
  const heights = rows.flat().map(Number)
  if (heights.some(value => !Number.isFinite(value) || value < -500 || value > 9000)) throw new Error('Ground elevations must be finite metres between -500 and 9000 in the declared datum.')
  return heights
}
export function groundHeight(t: Terrain, x: number, y: number) {
  const gx = Math.max(0, Math.min(t.size - 1, x)),
    gy = Math.max(0, Math.min(t.size - 1, y))
  const a = Math.min(Math.floor(gx), t.size - 2),
    b = Math.min(Math.floor(gy), t.size - 2),
    fx = gx - a,
    fy = gy - b,
    h = t.heights,
    n = t.size
  return (
    (h[b * n + a] * (1 - fx) + h[b * n + a + 1] * fx) * (1 - fy) +
    (h[(b + 1) * n + a] * (1 - fx) + h[(b + 1) * n + a + 1] * fx) * fy
  )
}
export function contours(t: Terrain, interval: number) {
  const low = Math.min(...t.heights),
    high = Math.max(...t.heights)
  const step = Math.max(interval, (high - low) / 20, 0.1),
    segments: string[] = []
  for (let y = 0; y < t.size - 1; y++)
    for (let x = 0; x < t.size - 1; x++) {
      const points = [
        [x, y],
        [x + 1, y],
        [x + 1, y + 1],
        [x, y + 1],
      ]
      for (const ids of [
        [0, 1, 2],
        [0, 2, 3],
      ]) {
        const tri = ids.map((i) => points[i])
        for (let level = Math.ceil(low / step) * step; level <= high; level += step) {
          const hits: number[][] = []
          for (let i = 0; i < 3; i++) {
            const a = tri[i],
              b = tri[(i + 1) % 3],
              ha = t.heights[a[1] * t.size + a[0]],
              hb = t.heights[b[1] * t.size + b[0]]
            if ((ha < level && hb >= level) || (hb < level && ha >= level)) {
              const f = (level - ha) / (hb - ha)
              hits.push([
                10 + 20 * (a[0] + f * (b[0] - a[0])),
                10 + 20 * (a[1] + f * (b[1] - a[1])),
              ])
            }
          }
          if (hits.length === 2) segments.push(`M${hits[0].join(',')}L${hits[1].join(',')}`)
        }
      }
    }
  return { step, path: segments.join(' ') }
}
export type Brush = 'raise' | 'lower' | 'smooth' | 'flatten'
export type TerrainBrush = {
  mode: 'navigate' | Brush | 'erase' | 'water'
  shape: 'circle' | 'square'
  radius: number
  speed: number
  target: number
  soft: boolean
}
export const defaultTerrainBrush: TerrainBrush = {
  mode: 'navigate', shape: 'circle', radius: 15, speed: 1, target: 3, soft: true,
}
export function pondCovers(pond: Terrain['ponds'][number], x: number, y: number) {
  const [a, b, c, d] = pond.region
  return x >= a && x <= c && y >= b && y <= d && (pond.shape !== 'circle' ||
    ((x - (a + c) / 2) / ((c - a) / 2)) ** 2 + ((y - (b + d) / 2) / ((d - b) / 2)) ** 2 <= 1.000001)
}
export function pondOutline(pond: Terrain['ponds'][number]): [number, number][] {
  const [a, b, c, d] = pond.region
  if (pond.shape !== 'circle') return [[a, b], [c, b], [c, d], [a, d]]
  return Array.from({ length: 48 }, (_, i) => [(a + c) / 2 + (c - a) / 2 * Math.cos(i / 48 * Math.PI * 2), (b + d) / 2 + (d - b) / 2 * Math.sin(i / 48 * Math.PI * 2)])
}

// Timed sculpting is bounded by a user-selected offset from the declared flat start.
export function terrainDab(t: Terrain, points: [number, number][], brush: TerrainBrush, seconds: number): Terrain {
  if (!points.length || brush.mode === 'navigate' || brush.mode === 'water' || !Number.isFinite(seconds) || seconds <= 0) return t
  const next = structuredClone(t), n = t.size
  const dx = (t.bounds[2] - t.bounds[0]) / (n - 1), dy = (t.bounds[3] - t.bounds[1]) / (n - 1)
  const step = Math.min(seconds, .1) * brush.speed
  if (![brush.radius, brush.speed, brush.target].every(Number.isFinite) || brush.radius <= 0 || step <= 0) return t
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    let distance = Infinity
    for (let j = 0; j < points.length; j++) {
      const a = points[Math.max(0, j - 1)], b = points[j]
      const vx = (b[0] - a[0]) * dx, vy = (b[1] - a[1]) * dy
      const px = (x - a[0]) * dx, py = (y - a[1]) * dy
      const f = Math.max(0, Math.min(1, (px * vx + py * vy) / (vx * vx + vy * vy || 1)))
      const xx = px - f * vx, yy = py - f * vy
      distance = Math.min(distance, brush.shape === 'square' ? Math.max(Math.abs(xx), Math.abs(yy)) : Math.hypot(xx, yy))
    }
    if (distance > brush.radius) continue
    const weight = brush.soft ? Math.max(0, 1 - distance / brush.radius) : 1
    const i = y * n + x, h = t.heights[i]
    const reference = t.reference_heights?.[i] ?? t.base_elevation
    let target = (brush.mode === 'raise' || brush.mode === 'lower' ? reference : t.base_elevation) + brush.target
    if (brush.mode === 'erase') target = reference
    if (brush.mode === 'smooth') {
      let sum = 0, count = 0
      for (let yy = Math.max(0, y - 1); yy <= Math.min(n - 1, y + 1); yy++)
        for (let xx = Math.max(0, x - 1); xx <= Math.min(n - 1, x + 1); xx++) { sum += t.heights[yy * n + xx]; count++ }
      target = sum / count
    }
    if (brush.mode === 'raise' && target <= h || brush.mode === 'lower' && target >= h) continue
    next.heights[i] = Math.max(-500, Math.min(9000, h + Math.sign(target - h) * Math.min(Math.abs(target - h), step * weight)))
  }
  return next
}

export function pondAt(t: Terrain, point: [number, number], brush: TerrainBrush): Terrain {
  if (t.ponds.length >= 8) throw new Error('Keep at most eight ponds. Remove a pond before adding another.')
  const dx = (t.bounds[2] - t.bounds[0]) / (t.size - 1), dy = (t.bounds[3] - t.bounds[1]) / (t.size - 1)
  const region: [number, number, number, number] = [
    Math.max(0, Math.floor(point[0] - brush.radius / dx)), Math.max(0, Math.floor(point[1] - brush.radius / dy)),
    Math.min(t.size - 1, Math.ceil(point[0] + brush.radius / dx)), Math.min(t.size - 1, Math.ceil(point[1] + brush.radius / dy)),
  ]
  if (region[2] <= region[0] || region[3] <= region[1]) throw new Error('Choose a larger water brush.')
  const water = t.base_elevation + brush.target
  const pond = { name: `Concept pond ${t.ponds.length + 1}`, region, water_level: water, shape: brush.shape }
  for (let y = region[1]; y <= region[3]; y++) for (let x = region[0]; x <= region[2]; x++) {
    if (pondCovers(pond, x, y) && t.heights[y * t.size + x] >= water) throw new Error('Dig this whole pond area below the water level first, or use a smaller water brush.')
  }
  return { ...t, ponds: [...t.ponds, pond] }
}
// A stroke uses maximum coverage of its swept path, not event-count accumulation.
// Splitting the same straight path into more pointer events gives identical heights.
export function terrainStroke(
  input: Terrain,
  points: [number, number][],
  mode: Brush,
  radius: number,
  strength: number,
  level: number,
): Terrain {
  if (
    !points.length ||
    !Number.isFinite(radius) ||
    radius <= 0 ||
    !Number.isFinite(strength) ||
    strength < 0 ||
    !Number.isFinite(level)
  )
    return input
  const next = structuredClone(input),
    n = input.size
  const dx = (input.bounds[2] - input.bounds[0]) / (n - 1)
  const dy = (input.bounds[3] - input.bounds[1]) / (n - 1)
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      let distance = Infinity
      for (let j = 0; j < points.length; j++) {
        const a = points[Math.max(0, j - 1)],
          b = points[j]
        const vx = (b[0] - a[0]) * dx,
          vy = (b[1] - a[1]) * dy
        const px = (x - a[0]) * dx,
          py = (y - a[1]) * dy
        const f = Math.max(0, Math.min(1, (px * vx + py * vy) / (vx * vx + vy * vy || 1)))
        distance = Math.min(distance, Math.hypot(px - f * vx, py - f * vy))
      }
      const weight = Math.max(0, 1 - distance / radius),
        i = y * n + x
      let target = level
      if (mode === 'raise' || mode === 'lower')
        target = input.heights[i] + (mode === 'raise' ? strength : -strength)
      if (mode === 'smooth') {
        let sum = 0,
          count = 0
        for (let yy = Math.max(0, y - 1); yy <= Math.min(n - 1, y + 1); yy++)
          for (let xx = Math.max(0, x - 1); xx <= Math.min(n - 1, x + 1); xx++) {
            sum += input.heights[yy * n + xx]
            count++
          }
        target = sum / count
      }
      next.heights[i] = Math.max(
        -500,
        Math.min(9000, input.heights[i] + (target - input.heights[i]) * weight),
      )
    }
  return next
}
export function sculpt(
  input: Terrain,
  cx: number,
  cy: number,
  mode: Brush,
  radius: number,
  strength: number,
  level: number,
  falloff: boolean,
  region?: number[],
) {
  const next = structuredClone(input),
    n = input.size
  const dx = (input.bounds[2] - input.bounds[0]) / (n - 1),
    dy = (input.bounds[3] - input.bounds[1]) / (n - 1)
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const distance = Math.hypot((x - cx) * dx, (y - cy) * dy)
      if (
        region
          ? x < region[0] || x > region[2] || y < region[1] || y > region[3]
          : distance > radius
      )
        continue
      const weight = region || !falloff ? 1 : Math.max(0, 1 - distance / radius),
        i = y * n + x
      let target = level
      if (mode === 'raise' || mode === 'lower')
        target = input.heights[i] + (mode === 'raise' ? strength : -strength)
      if (mode === 'smooth') {
        const neighbours: number[] = []
        for (let yy = Math.max(0, y - 1); yy <= Math.min(n - 1, y + 1); yy++)
          for (let xx = Math.max(0, x - 1); xx <= Math.min(n - 1, x + 1); xx++)
            neighbours.push(input.heights[yy * n + xx])
        target = neighbours.reduce((a, b) => a + b, 0) / neighbours.length
      }
      next.heights[i] = Math.max(
        -500,
        Math.min(9000, input.heights[i] + (target - input.heights[i]) * weight),
      )
    }
  return next
}
export function terrainChanged(t?: Terrain | null) {
  return Boolean(
    t && (t.ponds.length || t.heights.some((h) => Math.abs(h - t.base_elevation) > 1e-6)),
  )
}
export function slope(t: Terrain, x: number, y: number) {
  const n = t.size,
    dx = (t.bounds[2] - t.bounds[0]) / (n - 1),
    dy = (t.bounds[3] - t.bounds[1]) / (n - 1)
  const a = Math.max(0, x - 1),
    b = Math.min(n - 1, x + 1),
    c = Math.max(0, y - 1),
    d = Math.min(n - 1, y + 1)
  return (
    (Math.atan(
      Math.hypot(
        (t.heights[y * n + b] - t.heights[y * n + a]) / ((b - a) * dx),
        (t.heights[d * n + x] - t.heights[c * n + x]) / ((d - c) * dy),
      ),
    ) *
      180) /
    Math.PI
  )
}
