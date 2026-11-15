import { checkpointSchema } from './brief-checkpoint'
import { z } from 'zod'
import { geometrySchema } from './workspace'
import { projectInputSchema } from './projects'

const money = z.string().regex(/^\d+(\.\d+)?$/)
// Output template v3 (L23): API-projected local metres (east, north) from the site's SW corner.
const metre = z.number().finite()
const localPosition = z.tuple([metre, metre])
const localGeometry = z.discriminatedUnion('type', [
  z.object({ type: z.literal('Polygon'), coordinates: z.array(z.array(localPosition)) }),
  z.object({ type: z.literal('MultiPolygon'), coordinates: z.array(z.array(z.array(localPosition))) }),
  z.object({ type: z.literal('LineString'), coordinates: z.array(localPosition) }),
  z.object({ type: z.literal('Point'), coordinates: localPosition }),
])
export type LocalGeometry = z.infer<typeof localGeometry>
export const planSheetSchema = z.object({
  status: z.enum(['scaled', 'not_to_scale']),
  date: z.string(),
  timezone: z.string(),
  north: z.string(),
  sources: z.array(z.string()),
  reason: z.string().optional(),
  crs: z.string().optional(),
  method: z.string().optional(),
  extent_m: z.object({ width: metre, height: metre }).optional(),
  site: z
    .object({
      geometry: localGeometry,
      area_m2: metre,
      perimeter_m: metre,
      edges: z.array(
        z.object({ index: z.number(), from: localPosition, to: localPosition, length_m: metre }),
      ),
      edges_omitted: z.boolean(),
    })
    .optional(),
  targets: z.array(z.object({ name: z.string(), geometry: localGeometry })).default([]),
  layers: z
    .record(
      z.string(),
      z.array(
        z.object({
          id: z.string(),
          number: z.number().int(),
          name: z.string(),
          geometry: localGeometry,
          quantity: money,
          unit: z.string(),
          provenance: z.string(),
        }),
      ),
    )
    .default({}),
  uncertainty: z.array(z.string()).default([]),
})
export type PlanSheet = z.infer<typeof planSheetSchema>
export const maintenanceTaskSchema = z.object({
  task: z.string().min(1).max(300),
  responsibility: z.enum(['contractor', 'client', 'third_party', 'to_be_agreed']),
  frequency: z.string().min(1).max(120),
  included_in_price: z.boolean(),
  assumptions: z.string().max(1000).default(''),
})
export type MaintenanceTask = z.infer<typeof maintenanceTaskSchema>
export const RESPONSIBILITY_LABEL: Record<MaintenanceTask['responsibility'], string> = {
  contractor: 'Contractor',
  client: 'Client',
  third_party: 'Third party',
  to_be_agreed: 'To be agreed',
}
export const rateSchema = z.object({
  category: z.string().default('General'),
  archived: z.boolean().default(false),
  metadata_revision: z.number().default(1),
  id: z.uuid(),
  code: z.string(),
  version: z.number().int(),
  description: z.string(),
  unit: z.enum(['m2', 'm', 'item', 'm3', 'h']),
  currency: z.literal('MYR'),
  basis: z.enum(['cost', 'indicative_budget']),
  amount: money.optional(),
  effective_date: z.string(),
  valid_until: z.string().nullable().optional(),
  source_note: z.string(),
  includes: z.array(z.string()),
  // L14 source record. Every type is entered by the organisation; none is supplier-verified.
  source_type: z
    .enum(['user_entered', 'supplier_quote', 'price_list', 'past_project'])
    .default('user_entered'),
  supplier_name: z.string().default(''),
  quote_reference: z.string().default(''),
  exclusions: z.string().default(''),
})
export const SOURCE_TYPE_LABEL: Record<Rate['source_type'], string> = {
  user_entered: 'Entered by your team',
  supplier_quote: 'From a supplier quotation',
  price_list: 'From a supplier price list',
  past_project: 'From a past project',
}
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
// Fixed-price and count-only lines (clearance, preliminaries) have no map geometry; the API sends
// null for them, and an issued snapshot with such a line must still load.
export const scopeItem = z.object({
  manual_basis: z.enum(['count', 'fixed']).default('count'),
  geometry: geometrySchema.nullish(),
  id: z.uuid(),
  name: z.string(),
  kind: z.string(),
  status: z.string(),
  pricing_status: z.string().optional(),
  quantity: money,
  unit: z.enum(['m2', 'm', 'item', 'm3', 'h']),
  source_note: z.string(),
  provenance: z.string(),
})
export const snapshotSchema = z.object({
  previous_issue: z
    .object({ id: z.string(), version: z.number(), selling_total: money })
    .optional(),
  scope_changes: z
    .array(z.object({ id: z.string(), name: z.string(), change: z.string() }))
    .default([]),
  valid_until: z.string().optional(),
  programme: z.string().optional(),
  maintenance: z.string().optional(),
  template: z.number().int().optional(),
  plan_sheet: planSheetSchema.optional(),
  maintenance_plan: z
    .object({ basis: z.string(), tasks: z.array(maintenanceTaskSchema) })
    .optional(),
  change_summary: z.string().optional(),
  pricing_warnings: z.array(z.string()).default([]),
  pricing_review: z
    .object({ reviewer_id: z.string(), reviewed_at: z.string(), exception_reviewed: z.boolean() })
    .optional(),
  quantity_schedule: z
    .array(
      z.object({ item_id: z.string(), description: z.string(), quantity: money, unit: z.string() }),
    )
    .default([]),
  manifest: z
    .object({
      schema: z.string(),
      renderer: z.string().optional(),
      font_sha256: z.string().optional(),
      estimate_id: z.string(),
      workspace_revision: z.number(),
      project_revision: z.number(),
      evidence: z.array(z.object({ id: z.string(), revision: z.number(), sha256: z.string() })),
    })
    .optional(),

  customer_narrative: z.string().default(''),
  site_constraints: z
    .object({
      total: z.number(),
      unverified: z.number(),
      critical_unverified: z.number(),
      notice: z.string(),
    })
    .optional(),
  site_evidence: z
    .array(
      z.object({
        id: z.uuid(),
        revision: z.number(),
        description: z.string(),
        source_note: z.string(),
        observations: z.string(),
        target_ids: z.array(z.uuid()),
        sha256: z.string(),
        image_data: z
          .string()
          .regex(/^data:image\/jpeg;base64,/)
          .optional(),
        image_sha256: z.string().optional(),
      }),
    )
    .default([]),
  draft: z.boolean().optional(),
  // Draft previews only: what still blocks issue. Never present on an issued snapshot.
  draft_issues: z.array(z.string()).optional(),
  display_units: z.enum(['metric', 'imperial']).default('metric'),
  brief_details: projectInputSchema.shape.details,
  brief_checkpoint: checkpointSchema.optional(),
  option_budgets: z
    .record(
      z.string(),
      z.object({
        status: z.enum(['complete', 'partial', 'unavailable']),
        total: money.optional(),
        estimate_id: z.uuid().optional(),
      }),
    )
    .optional(),
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
    reason: z.string().default(''),
    engine_versions: z.record(z.string(), z.string()).optional(),
    inputs: z
      .array(
        z.object({
          scenario: z.string(),
          id: z.string(),
          name: z.string(),
          height_m: z.number().nullable(),
          height_source: z.string(),
          provenance: z.string(),
          source_note: z.string(),
        }),
      )
      .default([]),
    metric_crs: z.string(),
    limitations: z.array(z.string()),
    scenarios: z.record(
      z.string(),
      z.object({
        name: z.string(),
        area_m2: z.number().finite(),
        target_area_m2: z.number().finite(),
        coverage_percent: z.number().finite(),
        delta_area_m2: z.number().finite().optional(),
        delta_percentage_points: z.number().finite().optional(),
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
    readiness: z
      .object({
        checked_on: z.string(),
        priced_count: z.number(),
        scope_count: z.number(),
        unpriced_count: z.number(),
        ready: z.boolean(),
        coverage_note: z.string(),
        warnings: z.array(
          z.object({ code: z.string(), message: z.string(), item_id: z.string().nullable() }),
        ),
      })
      .nullish(),
    explanation: z
      .object({ formula: z.string(), rounding: z.string(), charges: z.string() })
      .optional(),
    takeoff: z
      .array(
        z.object({
          item_id: z.string().regex(/^[0-9a-f-]{36}(?::.+)?$/i),
          description: z.string(),
          quantity: money,
          unit: z.string(),
          quantity_source: z.string(),
          wastage_percent: money,
          rate_code: z.string(),
          rate_version: z.number(),
          effective_date: z.string(),
          unit_price: money.optional(),
          line_total: money.optional(),
          price_basis: z.string().optional(),
        }),
      )
      .default([]),
    currency: z.string(),
    complete: z.boolean(),
    missing_rates: z.array(
      z.object({
        item_id: z.string().regex(/^[0-9a-f-]{36}(?::.+)?$/i),
        name: z.string(),
        reason: z.string(),
      }),
    ),
    selling_total: money,
    rounding_policy: z.string(),
    label: z.string().optional(),
    charges: z
      .array(
        z.object({
          category: z.enum([
            'labour',
            'equipment',
            'transport',
            'overhead',
            'contingency',
            'fixed',
          ]),
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
