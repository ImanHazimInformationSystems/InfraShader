import * as THREE from 'three'
import type { Geometry } from '../domain/workspace'

type Point = [number, number]
type Face = { points: Point[]; ids: number[]; bounds: number[] }
const indexes = new WeakMap<THREE.BufferGeometry, { faces: Face[]; bins: Map<string, Set<number>>; cell: (x: number, z: number) => Point }>()
const cross = (a: Point, b: Point, p: Point) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])

function surfaceIndex(source: THREE.BufferGeometry) {
  const cached = indexes.get(source)
  if (cached) return cached
  source.computeBoundingBox()
  const box = source.boundingBox!, p = source.getAttribute('position')
  const cell = (x: number, z: number): Point => [Math.max(0, Math.min(15, Math.floor((x - box.min.x) / (box.max.x - box.min.x || 1) * 16))), Math.max(0, Math.min(15, Math.floor((z - box.min.z) / (box.max.z - box.min.z || 1) * 16)))]
  const faces: Face[] = [], bins = new Map<string, Set<number>>()
  for (let i = 0; i < (source.index?.count ?? p.count); i += 3) {
    const ids = [0, 1, 2].map(offset => source.index ? source.index.getX(i + offset) : i + offset)
    const points = ids.map(id => [p.getX(id), p.getZ(id)] as Point)
    const bounds = [Math.min(...points.map(v => v[0])), Math.min(...points.map(v => v[1])), Math.max(...points.map(v => v[0])), Math.max(...points.map(v => v[1]))]
    const a = cell(bounds[0], bounds[1]), b = cell(bounds[2], bounds[3]), id = faces.length
    faces.push({ points, ids, bounds })
    for (let x = a[0]; x <= b[0]; x++) for (let z = a[1]; z <= b[1]; z++) { const key = `${x}/${z}`; if (!bins.has(key)) bins.set(key, new Set()); bins.get(key)!.add(id) }
  }
  const result = { faces, bins, cell }; indexes.set(source, result); return result
}

/** Intersect the road's triangles with the rendered ground triangles, sharing their exact planes. */
export function drapedSurface(outline: Geometry, source: THREE.BufferGeometry, ox: number, oy: number) {
  if (outline.type !== 'Polygon') throw new Error('Draped surfaces require a polygon.')
  const shape = new THREE.Shape(outline.coordinates[0].map(([x, y]) => new THREE.Vector2(x - ox, oy - y)))
  for (const ring of outline.coordinates.slice(1)) shape.holes.push(new THREE.Path(ring.map(([x, y]) => new THREE.Vector2(x - ox, oy - y))))
  const flat = new THREE.ShapeGeometry(shape), p = flat.getAttribute('position'), index = flat.index!
  const base = surfaceIndex(source), vertices: number[] = [], ids: number[] = [], weights: number[] = []
  for (let i = 0; i < index.count; i += 3) {
    const road = [0, 1, 2].map(offset => [p.getX(index.getX(i + offset)), p.getY(index.getX(i + offset))] as Point)
    const bounds = [Math.min(...road.map(v => v[0])), Math.min(...road.map(v => v[1])), Math.max(...road.map(v => v[0])), Math.max(...road.map(v => v[1]))]
    const a = base.cell(bounds[0], bounds[1]), b = base.cell(bounds[2], bounds[3]), candidates = new Set<number>()
    for (let x = a[0]; x <= b[0]; x++) for (let z = a[1]; z <= b[1]; z++) for (const id of base.bins.get(`${x}/${z}`) ?? []) candidates.add(id)
    for (const id of candidates) {
      const face = base.faces[id], [a, b, c] = face.points
      if (bounds[2] < face.bounds[0] || bounds[0] > face.bounds[2] || bounds[3] < face.bounds[1] || bounds[1] > face.bounds[3]) continue
      const direction = Math.sign(cross(a, b, c))
      let polygon = road
      for (let edge = 0; edge < 3 && polygon.length; edge++) {
        const from = face.points[edge], to = face.points[(edge + 1) % 3], clipped: Point[] = []
        for (let j = 0; j < polygon.length; j++) {
          const p = polygon[j], q = polygon[(j + 1) % polygon.length], dp = cross(from, to, p) * direction, dq = cross(from, to, q) * direction
          if (dp >= -1e-8) clipped.push(p)
          if ((dp >= -1e-8) !== (dq >= -1e-8)) { const f = dp / (dp - dq); clipped.push([p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f]) }
        }
        polygon = clipped
      }
      for (let j = 1; j < polygon.length - 1; j++) {
        if (Math.abs(cross(polygon[0], polygon[j], polygon[j + 1])) < 1e-9) continue
        for (const v of [polygon[0], polygon[j], polygon[j + 1]]) {
          const den = cross(a, b, c), wa = cross(b, c, v) / den, wb = cross(c, a, v) / den
          vertices.push(v[0], 0, v[1]); ids.push(...face.ids); weights.push(wa, wb, 1 - wa - wb)
        }
      }
    }
  }
  flat.dispose()
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geometry.userData.groundIndices = new Uint32Array(ids)
  geometry.userData.groundWeights = new Float32Array(weights)
  updateDrapedSurface(geometry, source)
  return geometry
}

export function updateDrapedSurface(geometry: THREE.BufferGeometry, source: THREE.BufferGeometry) {
  const p = geometry.getAttribute('position'), ground = source.getAttribute('position')
  const ids = geometry.userData.groundIndices as Uint32Array, weights = geometry.userData.groundWeights as Float32Array
  for (let i = 0; i < p.count; i++) p.setY(i, [0, 1, 2].reduce((height, j) => height + ground.getY(ids[i * 3 + j]) * weights[i * 3 + j], 0))
  p.needsUpdate = true; geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere()
}
