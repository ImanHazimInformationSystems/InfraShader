import { z } from 'zod'
import type { Bounds } from './projects'
import type { SiteOutline } from './site-selection'

export const treeSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .max(160)
      .regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/),
    name: z.string().trim().min(1).max(160),
    longitude: z.number().finite().min(-180).max(180),
    latitude: z.number().finite().min(-85).max(85),
    status: z.enum(['retain', 'remove']).default('retain'),
    origin: z.enum(['manual', 'geojson', 'osm']).default('manual'),
    source: z.string().trim().min(1).max(500),
    attribution: z.string().trim().min(1).max(500),
    source_id: z.string().max(200).default(''),
    species: z.string().max(160).default(''),
    form: z.enum(['broadleaf', 'conifer', 'palm', 'unknown']).default('unknown'),
    height_m: z.number().finite().positive().max(120).nullable().default(null),
    crown_diameter_m: z.number().finite().positive().max(80).nullable().default(null),
    dimensions_source: z.string().trim().max(500).default(''),
    uncertainty: z.string().max(1000).default(''),
    removal_reason: z.string().max(1000).default(''),
  })
  .refine(
    (t) => (t.height_m === null && t.crown_diameter_m === null) || !!t.dimensions_source,
    'Record the source or explicit assumption for tree dimensions.',
  )
export type SiteTree = z.infer<typeof treeSchema>
export type TreeSite = { bounds: Bounds; outline?: SiteOutline | null; trees?: SiteTree[] }
export const treeInventorySchema = z
  .array(treeSchema)
  .max(500)
  .refine(
    (trees) => new Set(trees.map((t) => t.id)).size === trees.length,
    'Tree IDs must be unique.',
  )

// Geographic containment only. No areas, lengths or quantities are calculated here.
export function treeInside(
  tree: Pick<SiteTree, 'longitude' | 'latitude'>,
  site: TreeSite,
): boolean {
  const x = tree.longitude,
    y = tree.latitude,
    [w, s, e, n] = site.bounds
  if (x < w || x > e || y < s || y > n) return false
  const ring = site.outline?.coordinates[0]
  if (!ring) return true
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, ay] = ring[j],
      [bx, by] = ring[i]
    const cross = (x - ax) * (by - ay) - (y - ay) * (bx - ax)
    if (
      Math.abs(cross) < 1e-14 &&
      x >= Math.min(ax, bx) &&
      x <= Math.max(ax, bx) &&
      y >= Math.min(ay, by) &&
      y <= Math.max(ay, by)
    )
      return true
    if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside
  }
  return inside
}

export function setTreeStatus(
  trees: SiteTree[],
  site: TreeSite,
  status: SiteTree['status'],
  id?: string,
) {
  return trees.map((t) => (treeInside(t, site) && (!id || t.id === id) ? { ...t, status } : t))
}

export function adoptTrees(trees: SiteTree[], context: SiteTree[], site: TreeSite) {
  const ids = new Set(trees.map((t) => t.id))
  return treeInventorySchema.parse([
    ...trees,
    ...context.filter((t) => !ids.has(t.id) && treeInside(t, site)),
  ])
}
