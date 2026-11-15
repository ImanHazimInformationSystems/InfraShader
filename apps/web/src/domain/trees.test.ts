import { describe, expect, it } from 'vitest'
import {
  adoptTrees,
  setTreeStatus,
  treeInside,
  treeInventorySchema,
  treeSchema,
  type TreeSite,
} from './trees'

const site: TreeSite = {
  bounds: [0, 0, 0.02, 0.02],
  outline: {
    type: 'Polygon',
    coordinates: [
      [
        [0, 0],
        [0.02, 0],
        [0.02, 0.01],
        [0.01, 0.01],
        [0.01, 0.02],
        [0, 0.02],
        [0, 0],
      ],
    ],
  },
}
const tree = (id: string, longitude = 0.005, latitude = 0.005) =>
  treeSchema.parse({
    id,
    name: id,
    longitude,
    latitude,
    source: 'Fixture observations',
    attribution: 'Test only',
  })
describe('project tree decisions', () => {
  it('uses the outline, including its edge, rather than its bounding box', () => {
    expect(treeInside(tree('inside'), site)).toBe(true)
    expect(treeInside(tree('edge', 0.01, 0.015), site)).toBe(true)
    expect(treeInside(tree('cutout', 0.015, 0.015), site)).toBe(false)
  })
  it('bulk and individual decisions preserve stable records, provenance and outside records', () => {
    const initial = [tree('a'), tree('b'), tree('outside', 0.015, 0.015)]
    const removed = setTreeStatus(initial, site, 'remove')
    expect(removed.map((t) => t.status)).toEqual(['remove', 'remove', 'retain'])
    expect(removed[0]).toEqual({ ...initial[0], status: 'remove' })
    expect(setTreeStatus(removed, site, 'retain', 'a')[1].status).toBe('remove')
    expect(initial[0].status).toBe('retain')
    expect(adoptTrees(removed, initial, site)).toEqual(removed)
  })
  it('rejects duplicate identities and unsupported dimensions; does not invent missing dimensions', () => {
    expect(tree('a').height_m).toBeNull()
    expect(treeInventorySchema.safeParse([tree('a'), tree('a')]).success).toBe(false)
    expect(treeSchema.safeParse({ ...tree('a'), height_m: 8 }).success).toBe(false)
    expect(treeSchema.safeParse({ ...tree('a'), latitude: Infinity }).success).toBe(false)
  })
})
