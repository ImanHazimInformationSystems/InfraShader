import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { createPlantResources, plantChoices, plantLook } from './plant-models'
import type { WorkItem } from '../domain/workspace'

describe('six original shrub and flower models', () => {
  it('builds finite distinct metre-sized geometry for all choices and supports old markers', () => {
    const resources = createPlantResources(), signatures = new Set<string>()
    expect(plantChoices.filter((choice) => choice.kind === 'shrub')).toHaveLength(3)
    expect(plantChoices.filter((choice) => choice.kind === 'flowers')).toHaveLength(3)
    for (const choice of plantChoices) {
      const model = resources.make(choice.id), bounds = new THREE.Box3().setFromObject(model)
      expect(bounds.min.z).toBeCloseTo(0, 5)
      expect(bounds.max.z).toBeCloseTo(choice.height, 5)
      expect(Math.max(bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y)).toBeCloseTo(choice.width, 5)
      const positions = (model.children[0] as THREE.Mesh).geometry.getAttribute('position')
      expect(positions.count).toBeGreaterThan(100)
      expect(Array.from(positions.array).every(Number.isFinite)).toBe(true)
      signatures.add(`${positions.count}:${Array.from(positions.array).slice(0, 24).join(',')}`)
    }
    expect(signatures.size).toBe(6)
    expect(plantLook({ layout_plant: 'shrub' } as WorkItem).id).toBe('leafy')
    expect(plantLook({ layout_plant: 'flowers' } as WorkItem).id).toBe('daisy')
    resources.dispose()
  })
})
