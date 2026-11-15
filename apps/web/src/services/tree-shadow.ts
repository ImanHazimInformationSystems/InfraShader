import * as THREE from 'three'
import type { Solar } from './environment'

/** Solid crown silhouette on flat ground. Display assumption, never analytical shade. */
export function treeShadowFootprint(height: number, width: number, solar: Solar | null) {
  if (!solar || !Number.isFinite(solar.azimuth_deg) || !Number.isFinite(solar.elevation_deg) ||
      solar.elevation_deg < 5 || solar.elevation_deg > 90 ||
      !Number.isFinite(height) || !Number.isFinite(width) || height <= 0 || width <= 0) return null
  const az = solar.azimuth_deg * Math.PI / 180
  const tangent = Math.tan(solar.elevation_deg * Math.PI / 180)
  const distance = height * 0.65 / tangent
  return {
    east: -Math.sin(az) * distance,
    north: -Math.cos(az) * distance,
    radius: width / 2,
    along: Math.hypot(width / 2, height * 0.35 / tangent),
    angle: -az,
  }
}

export function createTreeShadowResources() {
  const geometry = new THREE.CircleGeometry(1, 40)
  const material = new THREE.MeshBasicMaterial({
    color: '#26352a', transparent: true, opacity: 0.23, depthWrite: false,
    side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1,
  })
  return {
    make: () => new THREE.Mesh(geometry, material),
    dispose: () => { geometry.dispose(); material.dispose() },
  }
}

/** Mesh uses east/north/up axes; its parent locates it at the trunk base. */
export function updateTreeShadow(mesh: THREE.Mesh, height: number, width: number, solar: Solar | null) {
  const footprint = treeShadowFootprint(height, width, solar)
  mesh.visible = Boolean(footprint)
  if (!footprint) return
  mesh.position.set(footprint.east, footprint.north, 0.08)
  mesh.scale.set(footprint.radius, footprint.along, 1)
  mesh.rotation.z = footprint.angle
}
