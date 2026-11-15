import mapboxgl from 'mapbox-gl'
import type { Geometry, GroundStroke } from '../domain/workspace'

export const grassTextures = [
  { id: 'lawn', name: 'Fresh lawn', color: '#729d4a', accent: '#92b867' },
  { id: 'meadow', name: 'Meadow', color: '#8caa54', accent: '#c0c66b' },
  { id: 'fine', name: 'Fine turf', color: '#79a86c', accent: '#a0c38a' },
  { id: 'dry', name: 'Dry grass', color: '#b0a56a', accent: '#d4c58c' },
  { id: 'deep', name: 'Deep green', color: '#426e43', accent: '#669350' },
  { id: 'wild', name: 'Wild grass', color: '#6c8750', accent: '#a1ae6e' },
] as const

/** Original procedural presentation textures; no external imagery or species data. */
export function grassTile(id: GroundStroke['texture']): HTMLCanvasElement {
  const texture = grassTextures.find((entry) => entry.id === id) ?? grassTextures[0]
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 64
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = texture.color
  ctx.fillRect(0, 0, 64, 64)
  if (id === 'lawn') {
    ctx.fillStyle = '#ffffff12'
    for (let x = 0; x < 64; x += 16) ctx.fillRect(x, 0, 8, 64)
  }
  let seed = (grassTextures.findIndex((entry) => entry.id === id) + 1) * 7919
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 4294967296
  }
  const count = id === 'fine' ? 480 : 260
  for (let i = 0; i < count; i++) {
    const x = random() * 64,
      y = random() * 64
    ctx.strokeStyle = i % 3 ? texture.accent : '#233b2038'
    ctx.globalAlpha = 0.25 + random() * 0.45
    ctx.lineWidth = id === 'fine' ? 0.6 : 1
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + (random() - 0.5) * 4, y - random() * (id === 'wild' ? 9 : 4) - 1)
    ctx.stroke()
  }
  return canvas
}

export function paintFrame(boundary: Geometry) {
  if (boundary.type !== 'Polygon') throw new Error('Ground paint requires a selected site polygon.')
  const ring = boundary.coordinates[0].map((point) => mapboxgl.MercatorCoordinate.fromLngLat(point))
  const west = Math.min(...ring.map((point) => point.x)),
    east = Math.max(...ring.map((point) => point.x))
  const north = Math.min(...ring.map((point) => point.y)),
    south = Math.max(...ring.map((point) => point.y))
  const position = (point: [number, number]): [number, number] => {
    const p = mapboxgl.MercatorCoordinate.fromLngLat(point)
    return [((p.x - west) / (east - west)) * 1024, ((p.y - north) / (south - north)) * 1024]
  }
  const corners = [
    [west, north],
    [east, north],
    [east, south],
    [west, south],
  ].map(([x, y]) => {
    const p = new mapboxgl.MercatorCoordinate(x, y).toLngLat()
    return [p.lng, p.lat] as [number, number]
  }) as [[number, number], [number, number], [number, number], [number, number]]
  return { position, corners, west, north, spanX: east - west, spanY: south - north, boundary }
}

export function renderGround(
  canvas: HTMLCanvasElement,
  frame: ReturnType<typeof paintFrame>,
  strokes: GroundStroke[],
) {
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, 1024, 1024)
  ctx.save()
  ctx.beginPath()
  if (frame.boundary.type === 'Polygon')
    for (const ring of frame.boundary.coordinates) {
      ring.forEach((p, i) => {
        const [x, y] = frame.position(p)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.closePath()
    }
  ctx.clip('evenodd')
  const patterns = new Map<string, CanvasPattern>()
  for (const stroke of strokes) {
    ctx.globalCompositeOperation = stroke.texture === 'erase' ? 'destination-out' : 'source-over'
    if (!patterns.has(stroke.texture))
      patterns.set(stroke.texture, ctx.createPattern(grassTile(stroke.texture), 'repeat')!)
    ctx.fillStyle = stroke.texture === 'erase' ? '#000' : patterns.get(stroke.texture)!
    const meter = mapboxgl.MercatorCoordinate.fromLngLat(
      stroke.points[0],
    ).meterInMercatorCoordinateUnits()
    const rx = ((stroke.radius_m * meter) / frame.spanX) * 1024,
      ry = ((stroke.radius_m * meter) / frame.spanY) * 1024
    const stamp = (x: number, y: number) => {
      ctx.beginPath()
      ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
      ctx.fill()
    }
    let previous = frame.position(stroke.points[0])
    stamp(...previous)
    for (const point of stroke.points.slice(1)) {
      const next = frame.position(point)
      const steps = Math.min(
        2048,
        Math.max(
          1,
          Math.ceil(
            Math.hypot(next[0] - previous[0], next[1] - previous[1]) /
              Math.max(1, Math.min(rx, ry) / 2),
          ),
        ),
      )
      for (let step = 1; step <= steps; step++)
        stamp(
          previous[0] + ((next[0] - previous[0]) * step) / steps,
          previous[1] + ((next[1] - previous[1]) * step) / steps,
        )
      previous = next
    }
  }
  ctx.restore()
}
