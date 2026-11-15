import * as THREE from 'three'
import type { Geometry, GroundStroke } from '../domain/workspace'
import type { Terrain } from '../domain/terrain'
import type { MapFrame } from './map-frame'
import { roadImage, type RoadSurface } from './layout-textures'
import { paintFrame, renderGround } from './ground-paint'
import { terrainGeometry } from './terrain-mesh'

export function roadTexture(surface: RoadSurface) {
  const pixels = roadImage(surface)
  const texture = new THREE.DataTexture(pixels.data, pixels.width, pixels.height)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.generateMipmaps = true
  texture.needsUpdate = true
  return texture
}

export function roadUvs(geometry: THREE.BufferGeometry, ox: number, oy: number, origin: [number, number]) {
  const p = geometry.getAttribute('position'), uv: number[] = []
  // A 2 m visual tile; this is not a specified construction block dimension.
  for (let i = 0; i < p.count; i++) uv.push((p.getX(i) + ox - origin[0]) / 2, (oy - p.getZ(i) - origin[1]) / 2)
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
}

export function groundTexture(boundary: Geometry, strokes: GroundStroke[]) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 1024
  const frame = paintFrame(boundary)
  renderGround(canvas, frame, strokes)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return { texture, frame }
}

export function groundUvs(geometry: THREE.BufferGeometry, ox: number, oy: number, map: MapFrame, paint: Pick<ReturnType<typeof paintFrame>, 'west' | 'north' | 'spanX' | 'spanY'>) {
  const p = geometry.getAttribute('position'), uv: number[] = []
  for (let i = 0; i < p.count; i++) {
    const dx = p.getX(i) + ox - map.origin[0], dy = oy - p.getZ(i) - map.origin[1]
    const x = map.mercator[0] + dx * map.east[0] + dy * map.north[0]
    const y = map.mercator[1] + dx * map.east[1] + dy * map.north[1]
    uv.push((x - paint.west) / paint.spanX, 1 - (y - paint.north) / paint.spanY)
  }
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
}

export function groundSurface(boundary: Geometry, terrain: Terrain | null | undefined, ox: number, oy: number, base: number) {
  if (boundary.type !== 'Polygon') throw new Error('A textured ground surface requires the site polygon.')
  const points = boundary.coordinates[0]
  // Render-only flat surface when no terrain was created. Never saved as measured ground.
  const flat: Terrain = { datum: 'Scene display plane', source: 'Presentation only', size: 5, metric_crs: '', base_elevation: base,
    bounds: [Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1])), Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1]))], heights: Array(25).fill(base), ponds: [] }
  return terrainGeometry(terrain ?? flat, boundary, ox, oy, base)
}
