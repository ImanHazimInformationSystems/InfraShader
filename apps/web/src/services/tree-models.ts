import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { WorkItem } from '../domain/workspace'

export type TreeVariant = 'canopy' | 'columnar' | 'evergreen' | 'palm'
export const treeChoices = [
  {
    id: 'canopy',
    name: 'Canopy tree',
    detail: 'Open branches · broad foliage',
    height: 8,
    width: 7,
    color: '#608448',
  },
  {
    id: 'columnar',
    name: 'Columnar tree',
    detail: 'Upright · narrow foliage',
    height: 10,
    width: 3,
    color: '#81954c',
  },
  {
    id: 'evergreen',
    name: 'Evergreen',
    detail: 'Layered boughs · pointed crown',
    height: 9,
    width: 5,
    color: '#366750',
  },
  {
    id: 'palm',
    name: 'Palm',
    detail: 'Curved trunk · spreading fronds',
    height: 8,
    width: 6,
    color: '#648a40',
  },
] as const

export const defaultTreeDesign = {
  variant: 'canopy' as TreeVariant,
  scale: 1,
  rotation_deg: 0,
  stock_spec: '',
  rate_reviewed: false,
}
export function designForTree(item: WorkItem) {
  return (
    item.tree_design ?? {
      ...defaultTreeDesign,
      stock_spec: item.plant
        ? `${item.plant.common_name}; ${item.plant.nursery_size}; ${item.plant.source}`
        : '',
    }
  )
}

/** Original procedural geometry with individual leaves/branches, not crown balls. Z is up. */
export function createTreeResources() {
  const models = new Map<
    TreeVariant,
    { bark: THREE.BufferGeometry; leaves: THREE.BufferGeometry }
  >()
  const barkMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 })
  const leafMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.95,
    side: THREE.DoubleSide,
  })
  for (const [index, choice] of treeChoices.entries()) {
    let seed = (index + 1) * 8123
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0
      return seed / 4294967296
    }
    const bark: THREE.BufferGeometry[] = [],
      leaves: THREE.BufferGeometry[] = []
    const tint = (geometry: THREE.BufferGeometry, color: THREE.Color) => {
      const rgb: number[] = []
      for (let i = 0; i < geometry.getAttribute('position').count; i++)
        rgb.push(color.r, color.g, color.b)
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(rgb, 3))
      return geometry
    }
    const branch = (a: THREE.Vector3, b: THREE.Vector3, radius: number) => {
      const direction = b.clone().sub(a),
        geometry = new THREE.CylinderGeometry(radius * 0.55, radius, direction.length(), 7)
      geometry.applyQuaternion(
        new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          direction.normalize(),
        ),
      )
      geometry.translate(...a.clone().add(b).multiplyScalar(0.5).toArray())
      bark.push(tint(geometry, new THREE.Color().setHSL(0.075, 0.25, 0.25 + rand() * 0.09)))
    }
    const leaf = (
      position: THREE.Vector3,
      length: number,
      angle: number,
      tilt: number,
      hue = 0.27,
    ) => {
      const shape = new THREE.Shape()
      shape.moveTo(0, 0)
      shape.quadraticCurveTo(length * 0.35, length * 0.4, 0, length)
      shape.quadraticCurveTo(-length * 0.35, length * 0.4, 0, 0)
      const geometry = new THREE.ShapeGeometry(shape, 2)
      geometry.rotateX(tilt)
      geometry.rotateZ(angle)
      geometry.translate(...position.toArray())
      leaves.push(
        tint(
          geometry,
          new THREE.Color().setHSL(hue + rand() * 0.045, 0.32 + rand() * 0.18, 0.22 + rand() * 0.2),
        ),
      )
    }
    if (choice.id === 'palm') {
      const top = new THREE.Vector3(0.09, 0, 0.78)
      for (let j = 0; j < 10; j++) {
        const a = j / 10,
          b = (j + 1) / 10
        branch(
          new THREE.Vector3(0.09 * a * a, 0, 0.78 * a),
          new THREE.Vector3(0.09 * b * b, 0, 0.78 * b),
          0.025 - a * 0.008,
        )
      }
      for (let j = 0; j < 9; j++) {
        const angle = (j * Math.PI * 2) / 9
        let previous = top.clone()
        for (let k = 1; k <= 9; k++) {
          const t = k / 9
          const p = new THREE.Vector3(
            top.x + Math.cos(angle) * 0.48 * t,
            Math.sin(angle) * 0.48 * t,
            top.z + Math.sin(t * Math.PI) * 0.18 - t * 0.12,
          )
          branch(previous, p, 0.008 * (1 - t * 0.7))
          previous = p
          leaf(p, 0.14 * (1 - t * 0.5), angle + Math.PI / 2, Math.PI / 2.4, 0.24)
          leaf(p, 0.14 * (1 - t * 0.5), angle - Math.PI / 2, -Math.PI / 2.4, 0.24)
        }
      }
    } else if (choice.id === 'evergreen') {
      branch(new THREE.Vector3(), new THREE.Vector3(0, 0, 0.97), 0.028)
      for (let level = 0; level < 7; level++) {
        const z = 0.18 + level * 0.105,
          radius = 0.44 * (1 - level / 8)
        const cone = new THREE.ConeGeometry(radius, 0.3, 11, 1, true).rotateX(Math.PI / 2)
        cone.translate(0, 0, z + 0.13)
        leaves.push(tint(cone, new THREE.Color().setHSL(0.39, 0.3, 0.22 + level * 0.013)))
        for (let j = 0; j < 7; j++) {
          const a = (j * Math.PI * 2) / 7 + level * 0.3
          branch(
            new THREE.Vector3(0, 0, z),
            new THREE.Vector3(Math.cos(a) * radius, Math.sin(a) * radius, z - 0.03),
            0.009,
          )
        }
      }
    } else {
      branch(new THREE.Vector3(), new THREE.Vector3(0.025, 0, 0.86), 0.045)
      for (let j = 0; j < 16; j++) {
        const a = j * 2.39996,
          level = 0.3 + j / 22,
          spread =
            choice.id === 'columnar'
              ? 0.19 * Math.sin(level * Math.PI)
              : 0.43 * Math.sin(level * Math.PI)
        const end = new THREE.Vector3(Math.cos(a) * spread, Math.sin(a) * spread, level + 0.07)
        branch(new THREE.Vector3(0, 0, level * 0.74), end, 0.014 - j * 0.0004)
        for (let k = 0; k < 64; k++) {
          const r = Math.sqrt(rand()),
            theta = rand() * Math.PI * 2
          const p = end
            .clone()
            .add(
              new THREE.Vector3(
                Math.cos(theta) * r * 0.17,
                Math.sin(theta) * r * 0.17,
                (rand() - 0.4) * 0.22,
              ),
            )
          leaf(
            p,
            0.09 + rand() * 0.09,
            rand() * Math.PI * 2,
            rand() * Math.PI,
            choice.id === 'columnar' ? 0.22 : 0.27,
          )
        }
      }
    }
    const trunk = mergeGeometries(bark, false)!,
      crown = mergeGeometries(leaves, false)!
    const box = new THREE.Box3()
    trunk.computeBoundingBox()
    crown.computeBoundingBox()
    box.union(trunk.boundingBox!).union(crown.boundingBox!)
    const size = box.getSize(new THREE.Vector3()),
      centre = box.getCenter(new THREE.Vector3())
    for (const geometry of [trunk, crown]) {
      geometry.translate(-centre.x, -centre.y, -box.min.z)
      geometry.scale(1 / Math.max(size.x, size.y), 1 / Math.max(size.x, size.y), 1 / size.z)
      geometry.computeVertexNormals()
    }
    models.set(choice.id, { bark: trunk, leaves: crown })
    for (const geometry of [...bark, ...leaves]) geometry.dispose()
  }
  return {
    batch(variant: TreeVariant, count: number) {
      const model = models.get(variant)!
      const bark = new THREE.InstancedMesh(model.bark, barkMaterial, Math.max(1, count))
      const leaves = new THREE.InstancedMesh(model.leaves, leafMaterial, Math.max(1, count))
      bark.count = leaves.count = count
      bark.frustumCulled = leaves.frustumCulled = false
      return { bark, leaves }
    },
    make(variant: TreeVariant, ghost = false) {
      const model = models.get(variant)!
      const group = new THREE.Group()
      const bark = ghost ? barkMaterial.clone() : barkMaterial,
        leaves = ghost ? leafMaterial.clone() : leafMaterial
      if (ghost)
        for (const material of [bark, leaves]) {
          material.transparent = true
          material.opacity = 0.5
          material.depthWrite = false
        }
      group.add(new THREE.Mesh(model.bark, bark), new THREE.Mesh(model.leaves, leaves))
      return group
    },
    dispose() {
      for (const model of models.values()) {
        model.bark.dispose()
        model.leaves.dispose()
      }
      barkMaterial.dispose()
      leafMaterial.dispose()
    },
  }
}
