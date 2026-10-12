import { z } from 'zod'
import { geometrySchema } from './workspace'

const money = z.string().regex(/^\d+(\.\d+)?$/)
export const rateSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  version: z.number().int(),
  description: z.string(),
  unit: z.enum(['m2', 'm', 'item']),
  currency: z.literal('MYR'),
  basis: z.enum(['cost', 'indicative_budget']),
  amount: money.optional(),
  effective_date: z.string(),
  source_note: z.string(),
  includes: z.array(z.string()),
})
export const rateListSchema = z.object({
  items: z.array(rateSchema),
  limit: z.number(),
  offset: z.number(),
  total: z.number(),
})
export type Rate = z.infer<typeof rateSchema>
const artifactBase = {
  id: z.uuid(),
  workspace_revision: z.number().int(),
  project_revision: z.number().int(),
  created_at: z.string(),
  stale: z.boolean(),
}
const scopeItem = z.object({
  id: z.uuid(),
  name: z.string(),
  kind: z.string(),
  status: z.string(),
  quantity: money,
  unit: z.enum(['m2', 'm', 'item']),
  source_note: z.string(),
  provenance: z.string(),
})
export const snapshotSchema = z.object({
  version: z.number().int(),
  issued_at: z.string(),
  title: z.string(),
  project_name: z.string(),
  stakeholder: z.string(),
  problem: z.string(),
  intended_users: z.string(),
  desired_outcome: z.string(),
  use_periods: z.string(),
  timezone: z.string(),
  preferred_option: z.enum(['option_a', 'option_b']),
  baseline: z.array(scopeItem),
  selected_scope: z.array(scopeItem),
  site_boundary: geometrySchema,
  targets: z.array(z.object({ name: z.string(), geometry: geometrySchema })),
  currency: z.string(),
  estimate_id: z.uuid(),
  assumptions: z.string(),
  exclusions: z.string(),
  shade: z.object({ status: z.literal('omitted'), reason: z.string() }),
  visual_source: z.string(),
  source_workspace_revision: z.number(),
  source_project_revision: z.number(),
  indicative_budget: money.optional(),
  selling_total: money.optional(),
  criteria: z.array(z.string()).optional(),
  review_notes: z.string().optional(),
  reviewer_id: z.string().optional(),
  reviewed_at: z.string().optional(),
  option_a: z.array(scopeItem).optional(),
  option_b: z.array(scopeItem).optional(),
})
export type Snapshot = z.infer<typeof snapshotSchema>
const shadowPosition = z.tuple([z.number().finite(), z.number().finite()])
const shadowPolygon = z.array(z.array(shadowPosition))
const shadowGeometry = z.discriminatedUnion('type', [
  z.object({ type: z.literal('Polygon'), coordinates: shadowPolygon }),
  z.object({ type: z.literal('MultiPolygon'), coordinates: z.array(shadowPolygon) }),
  z.object({ type: z.literal('GeometryCollection'), geometries: z.array(z.never()) }),
])
const analysisSchema = z.object({
  ...artifactBase,
  kind: z.literal('analysis'),
  payload: z.object({
    timestamp: z.string(),
    target_id: z.uuid(),
    solar: z.object({ azimuth_deg: z.number().finite(), elevation_deg: z.number().finite() }),
    status: z.enum(['modeled', 'night', 'low_sun']),
    method: z.string(),
    metric_crs: z.string(),
    limitations: z.array(z.string()),
    scenarios: z.record(
      z.string(),
      z.object({
        name: z.string(),
        area_m2: z.number().finite(),
        target_area_m2: z.number().finite(),
        coverage_percent: z.number().finite(),
        shadow_geometry: shadowGeometry,
        excluded_trees: z.array(z.string()),
      }),
    ),
  }),
})
const estimateSchema = z.object({
  ...artifactBase,
  kind: z.literal('estimate'),
  payload: z.object({
    scenario: z.enum(['baseline', 'option_a', 'option_b']),
    currency: z.string(),
    complete: z.boolean(),
    missing_rates: z.array(z.object({ item_id: z.uuid(), name: z.string(), reason: z.string() })),
    selling_total: money,
    rounding_policy: z.string(),
    label: z.string().optional(),
    charges: z
      .array(
        z.object({
          category: z.enum(['labour', 'transport', 'overhead', 'fixed']),
          amount: money,
          source_note: z.string(),
        }),
      )
      .optional(),
    cost_base: money.optional(),
    profit: z.string().nullable().optional(),
    profit_basis: z.string().optional(),
    method: z.string().optional(),
    percent: money.optional(),
  }),
})
export const artifactSchema = z.discriminatedUnion('kind', [
  analysisSchema,
  estimateSchema,
  z.object({ ...artifactBase, kind: z.literal('developer_brief'), payload: snapshotSchema }),
  z.object({ ...artifactBase, kind: z.literal('proposal'), payload: snapshotSchema }),
])
export const artifactListSchema = z.object({ items: z.array(artifactSchema), limit: z.number() })
export type Artifact = z.infer<typeof artifactSchema>
