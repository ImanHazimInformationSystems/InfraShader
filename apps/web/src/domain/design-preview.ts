import { z } from 'zod'

/** Schematic plan of a saved design option in local metres (API: app/design_preview.py). */
const geometry = z.object({
  type: z.enum(['Point', 'LineString', 'Polygon', 'MultiPolygon']),
  coordinates: z.any(),
})
export const designPreviewSchema = z.object({
  format: z.literal('infrashader-design-preview-v1'),
  crs: z.string(),
  option_name: z.string(),
  extent_m: z.object({ width: z.number(), height: z.number() }),
  site: z.object({ geometry, area_m2: z.number() }),
  items: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      kind: z.string(),
      category: z.string(),
      status: z.string(),
      geometry,
      quantity: z.number(),
      unit: z.string(),
      crown_m: z.number().optional(),
      mature_crown_m: z.number().optional(),
      variant: z.string().optional(),
      asset: z.string().optional(),
      width_m: z.number().optional(),
      road_surface: z.string().optional(),
    }),
  ),
  paint: z.array(
    z.object({
      texture: z.string(),
      radius_m: z.number(),
      points: z.array(z.tuple([z.number(), z.number()])),
    }),
  ),
  counts: z.record(z.string(), z.number()),
  notice: z.string(),
})
export type DesignPreview = z.infer<typeof designPreviewSchema>
export type PreviewItem = DesignPreview['items'][number]

/** Native design file attached to a proposal (JSON retained with the offer). */
export const designSnapshotSchema = z.object({
  format: z.literal('infrashader-design-snapshot-v1'),
  bidder: z.string(),
  design_title: z.string(),
  summary: z.string(),
  currency: z.string(),
  total: z.string(),
  scope_amounts: z.record(z.string(), z.string().nullable()),
  programme_days: z.number().optional(),
  preview: designPreviewSchema,
  notice: z.string(),
})
export type DesignSnapshot = z.infer<typeof designSnapshotSchema>

export const examplePreviewsSchema = z.record(
  z.string(),
  z.object({
    key: z.string(),
    letter: z.string(),
    title: z.string(),
    contractor: z.string(),
    summary: z.string(),
    total: z.string(),
    programme_days: z.number(),
    scope: z.record(z.string(), z.string().nullable()),
    preview: designPreviewSchema,
  }),
)
export type ExamplePreviews = z.infer<typeof examplePreviewsSchema>

/** Plain-language "what's on site" figures for side-by-side comparison. */
export function siteSummary(preview: DesignPreview) {
  const proposed = preview.items.filter((item) => item.status !== 'existing')
  const count = (test: (item: PreviewItem) => boolean) => proposed.filter(test).length
  const sum = (test: (item: PreviewItem) => boolean) =>
    Math.round(proposed.filter(test).reduce((total, item) => total + item.quantity, 0))
  return [
    { label: 'New trees', value: count((i) => i.kind === 'tree'), unit: '' },
    {
      label: 'Existing trees kept',
      value: preview.items.filter((i) => i.status === 'existing' && i.kind === 'tree').length,
      unit: '',
    },
    { label: 'Benches', value: count((i) => i.kind === 'bench'), unit: '' },
    { label: 'Lights', value: count((i) => i.asset === 'light'), unit: '' },
    { label: 'Litter bins', value: count((i) => i.asset === 'bin'), unit: '' },
    {
      label: 'Shelters, gazebos and pergolas',
      value: count((i) => i.kind === 'canopy' || ['gazebo', 'pergola'].includes(i.asset ?? '')),
      unit: '',
    },
    { label: 'Play equipment', value: count((i) => i.asset === 'play'), unit: '' },
    {
      label: 'Paths and walkways',
      value: sum((i) => i.kind === 'path' && i.unit === 'm' && i.category === 'Hardscape'),
      unit: 'm',
    },
    {
      label: 'Lawn',
      value: sum((i) => i.category === 'Softscape' && i.name.toLowerCase().includes('lawn')),
      unit: 'm²',
    },
    {
      label: 'Play surfacing',
      value: sum((i) => i.category === 'Play' && i.unit === 'm2'),
      unit: 'm²',
    },
  ]
}
