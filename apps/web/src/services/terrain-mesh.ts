import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { Geometry } from '../domain/workspace'
import { groundHeight, type Terrain } from '../domain/terrain'
import type { TerrainWaterPreview } from '../domain/terrain-study'

export function runoffMeshes(t: Terrain, preview: TerrainWaterPreview, ox: number, oy: number, base: number): THREE.Object3D[] {
  const meshes: THREE.Object3D[] = []
  const waterGeometry: THREE.BufferGeometry[] = [], arrows: THREE.BufferGeometry[] = []
  const height = (x: number, y: number, level: number) => Math.max(level, groundHeight(t, (x - t.bounds[0]) / (t.bounds[2] - t.bounds[0]) * (t.size - 1), (t.bounds[3] - y) / (t.bounds[3] - t.bounds[1]) * (t.size - 1))) - base + .025
  for (const cell of preview.cells) {
    if (cell.geometry.type !== 'Polygon') continue
    const rings = cell.geometry.coordinates
    const shape = new THREE.Shape(rings[0].map(([x, y]) => new THREE.Vector2(x - ox, oy - y)))
    for (const ring of rings.slice(1)) shape.holes.push(new THREE.Path(ring.map(([x, y]) => new THREE.Vector2(x - ox, oy - y))))
    const geo = new THREE.ShapeGeometry(shape)
    const p = geo.getAttribute('position')
    for (let i = 0; i < p.count; i++) { const x = p.getX(i) + ox, y = oy - p.getY(i); p.setXYZ(i, x - ox, height(x, y, cell.level), oy - y) }
    geo.computeVertexNormals()
    const color = new THREE.Color('#71d8e5').lerp(new THREE.Color('#126298'), Math.min(1, cell.depth))
    geo.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: p.count }, () => color.toArray()).flat(), 3))
    waterGeometry.push(geo)
    if (cell.flowTo) {
      const ring = rings[0].slice(0, -1), x = ring.reduce((sum, p) => sum + p[0], 0) / ring.length, y = ring.reduce((sum, p) => sum + p[1], 0) / ring.length
      const vx = (cell.flowTo[0] - x) * .5, vy = (cell.flowTo[1] - y) * .5
      const endX = x + vx, endY = y + vy, z = height(x, y, cell.level) + .08
      const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x - ox, z, oy - y), new THREE.Vector3(endX - ox, z, oy - endY), new THREE.Vector3(endX - ox, z, oy - endY), new THREE.Vector3(endX - vx * .25 - vy * .2 - ox, z, oy - (endY - vy * .25 + vx * .2)), new THREE.Vector3(endX - ox, z, oy - endY), new THREE.Vector3(endX - vx * .25 + vy * .2 - ox, z, oy - (endY - vy * .25 - vx * .2))])
      arrows.push(geometry)
    }
  }
  if (waterGeometry.length) { const merged = mergeGeometries(waterGeometry)!; waterGeometry.forEach(geo => geo.dispose()); meshes.push(new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: .65, side: THREE.DoubleSide, roughness: .25 }))) }
  if (arrows.length) { const merged = mergeGeometries(arrows)!; arrows.forEach(geo => geo.dispose()); meshes.push(new THREE.LineSegments(merged, new THREE.LineBasicMaterial({ color: '#063c73' }))) }
  return meshes
}

// Subdivide the site's own outline, then sample the declared concept heightfield.
// This keeps the rendered ground inside the selected site, including outline holes.
export function terrainGeometry(t: Terrain, boundary: Geometry | undefined, ox: number, oy: number, base: number) {
  const rings = boundary?.type === 'Polygon' ? boundary.coordinates : [[
    [t.bounds[0], t.bounds[1]], [t.bounds[2], t.bounds[1]],
    [t.bounds[2], t.bounds[3]], [t.bounds[0], t.bounds[3]],
  ]]
  const shape = new THREE.Shape(rings[0].map(([x, y]) => new THREE.Vector2(x - ox, oy - y)))
  for (const ring of rings.slice(1)) shape.holes.push(new THREE.Path(ring.map(([x, y]) => new THREE.Vector2(x - ox, oy - y))))
  const flat = new THREE.ShapeGeometry(shape), pos = flat.getAttribute('position'), index = flat.index!
  const spacing = Math.min(t.bounds[2] - t.bounds[0], t.bounds[3] - t.bounds[1]) / (t.size - 1)
  const maxDepth = Math.max(0, Math.min(6, Math.floor(Math.log(16000 / Math.max(1, index.count / 3)) / Math.log(4))))
  const vertices: number[] = []
  function triangle(a: THREE.Vector2, b: THREE.Vector2, c: THREE.Vector2, depth: number) {
    if (depth < maxDepth && Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a)) > spacing * 1.5) {
      const ab = a.clone().add(b).multiplyScalar(.5), bc = b.clone().add(c).multiplyScalar(.5), ca = c.clone().add(a).multiplyScalar(.5)
      triangle(a, ab, ca, depth + 1); triangle(ab, b, bc, depth + 1)
      triangle(ca, bc, c, depth + 1); triangle(ab, bc, ca, depth + 1)
    } else for (const p of [a, b, c]) vertices.push(p.x, 0, p.y)
  }
  const point = (i: number) => new THREE.Vector2(pos.getX(i), pos.getY(i))
  for (let i = 0; i < index.count; i += 3) triangle(point(index.getX(i)), point(index.getX(i + 1)), point(index.getX(i + 2)), 0)
  flat.dispose()
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  updateTerrainGeometry(geometry, t, ox, oy, base)
  return geometry
}

export function updateTerrainGeometry(geometry: THREE.BufferGeometry, t: Terrain, ox: number, oy: number, base: number) {
  const positions = geometry.getAttribute('position')
  for (let i = 0; i < positions.count; i++) {
    const x = ((positions.getX(i) + ox - t.bounds[0]) / (t.bounds[2] - t.bounds[0])) * (t.size - 1)
    const y = ((t.bounds[3] - (oy - positions.getZ(i))) / (t.bounds[3] - t.bounds[1])) * (t.size - 1)
    positions.setY(i, groundHeight(t, x, y) - base)
  }
  positions.needsUpdate = true
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
}

export function pondMeshes(t: Terrain, ox: number, oy: number, base: number) {
  return t.ponds.map(pond => {
    const [x0, y0, x1, y1] = pond.region
    const w = t.bounds[0] + x0 / (t.size - 1) * (t.bounds[2] - t.bounds[0]) - ox
    const e = t.bounds[0] + x1 / (t.size - 1) * (t.bounds[2] - t.bounds[0]) - ox
    const n = oy - t.bounds[3] + y0 / (t.size - 1) * (t.bounds[3] - t.bounds[1])
    const s = oy - t.bounds[3] + y1 / (t.size - 1) * (t.bounds[3] - t.bounds[1])
    const shape = new THREE.Shape()
    if (pond.shape === 'circle') shape.absellipse((w + e) / 2, (n + s) / 2, (e - w) / 2, (s - n) / 2, 0, Math.PI * 2, false, 0)
    else { shape.moveTo(w, n); shape.lineTo(e, n); shape.lineTo(e, s); shape.lineTo(w, s); shape.closePath() }
    const geo = new THREE.ShapeGeometry(shape, 32)
    const position = geo.getAttribute('position')
    for (let i = 0; i < position.count; i++) position.setXYZ(i, position.getX(i), pond.water_level - base + .02, position.getY(i))
    geo.computeVertexNormals()
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#38a9b7', transparent: true, opacity: .72, roughness: .22, metalness: .18, side: THREE.DoubleSide }))
    mesh.name = pond.name
    return mesh
  })
}
