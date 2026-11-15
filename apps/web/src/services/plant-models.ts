import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { WorkItem } from '../domain/workspace'

export const plantChoices = [
  { id: 'leafy', kind: 'shrub', name: 'Leafy shrub', detail: 'Branches and broad leaves', width: 1.8, height: 1.3, color: '#56834b' },
  { id: 'hedge', kind: 'shrub', name: 'Low hedge', detail: 'Dense clipped foliage', width: 2, height: 1.1, color: '#46774d' },
  { id: 'grass', kind: 'shrub', name: 'Ornamental grass', detail: 'Arching green blades', width: 1.4, height: 1.1, color: '#8a9d4e' },
  { id: 'daisy', kind: 'flowers', name: 'Daisies', detail: 'White petals, golden centres', width: 1, height: 0.65, color: '#e6bd45' },
  { id: 'tulip', kind: 'flowers', name: 'Tulips', detail: 'Pink cups and upright leaves', width: 0.9, height: 0.7, color: '#cb6984' },
  { id: 'lavender', kind: 'flowers', name: 'Lavender', detail: 'Purple flowering spikes', width: 1.1, height: 0.85, color: '#9279b9' },
] as const
export type PlantVariant = typeof plantChoices[number]['id']
export function plantLook(item: WorkItem) {
  return plantChoices.find((choice) => choice.id === item.plant_variant) ??
    plantChoices[item.layout_plant === 'flowers' ? 3 : 0]
}

/** Original reusable, metre-sized concept geometry. Z is up; no billable dimensions. */
export function createPlantResources() {
  const models = new Map<PlantVariant, THREE.BufferGeometry>()
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide })
  for (const [index, choice] of plantChoices.entries()) {
    let seed = 1739 + index * 100
    const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
    const parts: THREE.BufferGeometry[] = []
    const add = (g: THREE.BufferGeometry, color: string) => {
      if (g.index) { const original = g; g = g.toNonIndexed(); original.dispose() }
      g.deleteAttribute('uv')
      const c = new THREE.Color(color).multiplyScalar(0.8 + rand() * 0.4)
      const colors = new Float32Array(g.getAttribute('position').count * 3)
      for (let i = 0; i < colors.length; i += 3) colors.set([c.r, c.g, c.b], i)
      g.setAttribute('color', new THREE.BufferAttribute(colors, 3)); parts.push(g)
    }
    const stem = (a: THREE.Vector3, b: THREE.Vector3, radius = 0.012, color = '#497547') => {
      const d = b.clone().sub(a)
      const g = new THREE.CylinderGeometry(radius * 0.65, radius, d.length(), 5)
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()))
      g.translate(...a.clone().add(b).multiplyScalar(0.5).toArray()); add(g, color)
    }
    const leaf = (p: THREE.Vector3, length: number, angle: number, color = '#528448') => {
      const g = new THREE.IcosahedronGeometry(1, 0)
      g.scale(length * 0.3, length, length * 0.07)
      g.rotateX(0.2 + rand() * 1.1); g.rotateZ(angle); g.translate(...p.toArray()); add(g, color)
    }
    const blade = (x: number, y: number, angle: number, height: number, spread: number) => {
      const points: number[] = []
      for (let k = 0; k <= 7; k++) {
        const t = k / 7, w = (1 - t) * 0.045
        const r = spread * t * t, z = height * (t - 0.25 * t * t)
        for (const side of [-1, 1]) points.push(x + Math.cos(angle) * r - Math.sin(angle) * w * side, y + Math.sin(angle) * r + Math.cos(angle) * w * side, z)
      }
      const indices: number[] = []
      for (let k = 0; k < 7; k++) { const a = k * 2; indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2) }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(points, 3)); g.setIndex(indices); g.computeVertexNormals(); add(g, choice.color)
    }
    if (choice.id === 'grass') {
      for (let j = 0; j < 60; j++) blade((rand() - 0.5) * 0.2, (rand() - 0.5) * 0.2, j * 2.39996, 0.6 + rand() * 0.6, 0.2 + rand() * 0.5)
    } else if (choice.kind === 'shrub') {
      for (let j = 0; j < 20; j++) {
        const a = j * 2.39996, r = Math.sqrt(rand()) * 0.55
        const top = new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r * 0.65, 0.35 + rand() * 0.55)
        if (choice.id === 'hedge') top.set((j % 5 / 4 - 0.5) * 1.1, (Math.floor(j / 5) / 3 - 0.5) * 0.5, 0.7)
        stem(new THREE.Vector3(top.x * 0.4, top.y * 0.4, 0), top, 0.018, '#7c6846')
        for (let k = 0; k < 20; k++) {
          const p = top.clone().add(new THREE.Vector3((rand() - 0.5) * 0.45, (rand() - 0.5) * 0.4, (rand() - 0.5) * 0.3))
          if (choice.id === 'hedge') p.z = Math.min(p.z, 0.75)
          leaf(p, 0.08 + rand() * 0.08, rand() * Math.PI * 2, choice.color)
        }
      }
    } else {
      const count = choice.id === 'lavender' ? 28 : 15
      for (let j = 0; j < count; j++) {
        const a = j * 2.39996, r = Math.sqrt(rand()) * 0.35
        const top = new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0.4 + rand() * 0.25)
        stem(new THREE.Vector3(top.x * 0.5, top.y * 0.5, 0), top, 0.007)
        leaf(new THREE.Vector3(top.x, top.y, top.z * 0.4), 0.13, a)
        leaf(new THREE.Vector3(top.x, top.y, top.z * 0.25), 0.16, a + Math.PI)
        if (choice.id === 'lavender') {
          for (let k = 0; k < 9; k++) for (let side = 0; side < 3; side++) {
            const g = new THREE.IcosahedronGeometry(0.028, 0), angle = side * Math.PI * 2 / 3 + k
            g.scale(0.8, 0.8, 1.5); g.translate(top.x + Math.cos(angle) * 0.025, top.y + Math.sin(angle) * 0.025, top.z + k * 0.019); add(g, choice.color)
          }
        } else if (choice.id === 'daisy') {
          for (let k = 0; k < 10; k++) {
            const angle = k * Math.PI * 2 / 10
            leaf(top.clone().add(new THREE.Vector3(Math.cos(angle) * 0.065, Math.sin(angle) * 0.065, 0)), 0.07, angle - Math.PI / 2, '#fff4dc')
          }
          const disc = new THREE.CylinderGeometry(0.033, 0.033, 0.018, 10).rotateX(Math.PI / 2)
          disc.translate(...top.clone().add(new THREE.Vector3(0, 0, 0.02)).toArray()); add(disc, '#e9b331')
        } else {
          for (let k = 0; k < 6; k++) {
            const angle = k * Math.PI / 3
            const petal = new THREE.SphereGeometry(1, 6, 4, 0, Math.PI * 2, 0, Math.PI * 0.75)
            petal.scale(0.045, 0.045, 0.08); petal.rotateZ(angle)
            petal.translate(top.x + Math.cos(angle) * 0.025, top.y + Math.sin(angle) * 0.025, top.z); add(petal, choice.color)
          }
        }
      }
    }
    const geometry = mergeGeometries(parts, false)!
    geometry.computeBoundingBox()
    const box = geometry.boundingBox!, size = box.getSize(new THREE.Vector3()), centre = box.getCenter(new THREE.Vector3())
    geometry.translate(-centre.x, -centre.y, -box.min.z)
    geometry.scale(choice.width / Math.max(size.x, size.y), choice.width / Math.max(size.x, size.y), choice.height / size.z)
    geometry.computeVertexNormals(); models.set(choice.id, geometry)
    for (const part of parts) part.dispose()
  }
  return {
    make: (variant: PlantVariant) => { const group = new THREE.Group(); group.add(new THREE.Mesh(models.get(variant)!, material)); return group },
    dispose: () => { for (const geometry of models.values()) geometry.dispose(); material.dispose() },
  }
}
