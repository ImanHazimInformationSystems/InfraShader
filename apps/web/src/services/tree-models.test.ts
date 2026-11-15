import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { createTreeResources, treeChoices } from './tree-models'

describe('original planted tree geometry', () => {
  it('builds four distinct, finite trunk/foliage models with normalized display bounds', () => {
    const resources = createTreeResources()
    const signatures = new Set<string>()
    for (const choice of treeChoices) {
      const model = resources.make(choice.id)
      expect(model.children).toHaveLength(2)
      const bounds = new THREE.Box3().setFromObject(model)
      expect(bounds.min.z).toBeCloseTo(0, 5)
      expect(bounds.max.z).toBeCloseTo(1, 5)
      expect(Math.max(bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y)).toBeCloseTo(1, 5)
      const leaves = (model.children[1] as THREE.Mesh).geometry.getAttribute('position')
      expect(leaves.count).toBeGreaterThan(100)
      expect(Array.from(leaves.array).every(Number.isFinite)).toBe(true)
      signatures.add(`${leaves.count}:${Array.from(leaves.array).slice(0, 24).join(',')}`)
    }
    expect(signatures.size).toBe(4)
    resources.dispose()
  })
})
