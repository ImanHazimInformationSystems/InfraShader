import { z } from 'zod'
import { constraintFields } from './site-constraints'
import { objectInstanceSchema, objectPoseSchema } from './objects'
import { terrainSchema } from './terrain'
import { planReferenceSchema, planInput } from './plan-reference'
import type { Bounds } from './projects'

const position = z.tuple([z.number().finite(), z.number().finite()])
export const geometrySchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('Polygon'),
    coordinates: z.array(z.array(position).min(4).max(129)).min(1).max(9),
  }),
  z.object({ type: z.literal('LineString'), coordinates: z.array(position).min(2).max(128) }),
  z.object({ type: z.literal('Point'), coordinates: position }),
])
export type Geometry = z.infer<typeof geometrySchema>
export const provenanceSchema = z.enum([
  'measured',
  'sourced',
  'estimated',
  'manually_entered',
  'imported',
  'calculated',
])
const quantitySchema = z.object({
  value: z.number().finite(),
  is_override: z.boolean(),
  calculated: z.object({
    value: z.number().finite(),
    unit: z.enum(['m2', 'm', 'item', 'm3', 'h']),
    metric_crs: z.string().nullable(),
    method: z.string(),
  }),
})
export const plantSchema = z.object({
  code: z.string(),
  version: z.number().default(1),
  scientific_name: z.string(),
  common_name: z.string(),
  source: z.string(),
  nursery_size: z.string(),
  current_crown_m: z.number(),
  mature_crown_m: z.number(),
  spacing_m: z.number(),
  method: z.enum(['explicit_count', 'square_spacing', 'line_spacing']),
  sun_water: z.string(),
  suitability: z.string(),
  maintenance: z.string(),
  availability_date: z.string().nullable(),
  substitution: z.string(),
})
export const componentSchema = z.object({
  code: z.string(),
  name: z.string(),
  category: z.enum(['material', 'labour', 'equipment', 'transport', 'overhead']),
  basis: z.enum(['surface', 'volume', 'length', 'per_surface', 'fixed']),
  unit: z.enum(['m2', 'm3', 'm', 'item', 'h']),
  factor: z.number(),
  thickness_mm: z.number(),
  wastage_percent: z.number(),
  rate_id: z.uuid().nullable(),
})
export const assemblySchema = z.object({
  code: z.string(),
  version: z.number().default(1),
  use: z.enum(['paving', 'edging', 'deck', 'fence', 'road']),
  material: z.string(),
  finish: z.string(),
  source: z.string(),
  width_m: z.number(),
  height_m: z.number(),
  approved: z.boolean(),
  pricing: z.enum(['inclusive', 'components']),
  components: z.array(componentSchema),
})
export const itemSchema = z.object({
  terrain_work: z.object({
    activity: z.string(), resource: z.enum(['labour', 'equipment', 'material', 'transport']),
    tools: z.string(), assumptions: z.string(), quantity: z.string(),
    quantity_basis: z.enum(['manual', 'cut', 'fill']).optional(),
    unit: z.enum(['h', 'm3', 'item']), terrain_signature: z.string().nullable(),
  }).nullable().optional(),
  terrain_work_stale: z.boolean().optional(),
  tree_design: z.object({
    variant: z.enum(['canopy', 'columnar', 'evergreen', 'palm']),
    scale: z.number().min(0.25).max(3), rotation_deg: z.number().min(0).max(360),
    stock_spec: z.string().max(500), rate_reviewed: z.boolean(),
  }).nullable().optional(),
  layout_plant: z.enum(['tree', 'shrub', 'flowers']).nullable().optional(),
  plant_variant: z.enum(['leafy', 'hedge', 'grass', 'daisy', 'tulip', 'lavender']).nullable().optional(),
  road: z.object({
    mode: z.enum(['line', 'curve', 'area']),
    surface: z.enum(['dirt', 'pavement', 'stone', 'gravel']).default('pavement'),
    points: z.array(position).min(2).max(12),
    width_m: z.number().positive().max(100),
  }).nullable().optional(),
  editor_dimensions: z.object({ width_m: z.number(), depth_m: z.number() }).nullable().optional(),
  editor_locked: z.boolean().optional(),
  editor_group: z.string().max(80).optional(),
  plant: plantSchema.nullable().optional(),
  assembly: assemblySchema.nullable().optional(),
  schedule: z
    .array(
      z.object({
        code: z.string(),
        description: z.string(),
        value: z.string(),
        unit: z.string(),
        method: z.string(),
        source_quantity: z.string(),
        source_unit: z.string(),
        surface_m2: z.string().optional(),
        rate_id: z.string().nullable(),
        priced: z.boolean(),
      }),
    )
    .optional(),
  object_instance: objectInstanceSchema.nullable().optional(),
  object_pose: objectPoseSchema.optional(),
  reference_calibration: z.string().nullable().optional(),
  reference_review_required: z.boolean().optional(),
  manual_basis: z.enum(['count', 'fixed']).default('count'),
  category: z.string().min(1).max(80).default('General'),
  visible: z.boolean().default(true),
  crown_diameter_m: z.number().positive().max(100).nullable().default(null),
  id: z.uuid(),
  name: z.string().min(1).max(160),
  kind: z.enum(['area', 'path', 'building', 'canopy', 'tree', 'bench', 'manual', 'object']),
  status: z.enum(['existing', 'proposed']),
  pricing_status: z.enum(['firm', 'optional', 'provisional']).optional(),
  geometry: geometrySchema.nullable(),
  count: z.number().int().min(0).max(1000000),
  height_m: z.number().positive().max(100).nullable(),
  height_source: z.string().max(2000),
  quantity_override: z.string().nullable(),
  provenance: provenanceSchema,
  source_note: z.string().min(1).max(2000),
  rate_id: z.uuid().nullable(),
  quantity: quantitySchema.optional(),
})
export type WorkItem = z.infer<typeof itemSchema>
export const targetSchema = z.object({
  reference_calibration: z.string().nullable().optional(),
  reference_review_required: z.boolean().optional(),
  id: z.uuid(),
  name: z.string().min(1).max(160),
  geometry: geometrySchema,
  source_note: z.string().min(1).max(2000),
  provenance: provenanceSchema,
  area_m2: z.number().finite().optional(),
})
export const groundStrokeSchema = z.object({
  texture: z.enum(['lawn', 'meadow', 'fine', 'dry', 'deep', 'wild', 'erase']),
  radius_m: z.number().min(1).max(100),
  points: z.array(position).min(1).max(64),
})
export type GroundStroke = z.infer<typeof groundStrokeSchema>
const scenarioSchema = z.object({
  terrain_signature: z.string().nullable().optional(),
  ground_paint: z.array(groundStrokeSchema).max(128).optional(),
  name: z.string(),
  items: z.array(itemSchema).max(150),
  terrain: terrainSchema.nullable().optional(),
  terrain_anchors: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        x: z.number(),
        y: z.number(),
        ground_elevation_m: z.number(),
      }),
    )
    .optional(),
})
export const siteConstraintSchema = z.object({
  ...constraintFields,
  geometry: geometrySchema.nullable(),
})
export type SiteConstraint = z.infer<typeof siteConstraintSchema>
export const workspaceDataSchema = z.object({
  boundary_area_m2: z.number().nonnegative().optional(),
  constraints: z.array(siteConstraintSchema).max(100).default([]),
  plan_reference: planReferenceSchema.nullable().optional(),
  source_crs: z.literal('EPSG:4326'),
  boundary: geometrySchema,
  boundary_provenance: provenanceSchema,
  boundary_source: z.string().min(1).max(2000),
  targets: z.array(targetSchema).max(20),
  scenarios: z.object({
    baseline: scenarioSchema,
    option_a: scenarioSchema,
    option_b: scenarioSchema,
  }),
  metric_crs: z.string().optional(),
})
export const workspaceSchema = z.object({
  site_area_m2: z.number().nullable().optional(),
  revision: z.number().int().nonnegative(),
  data: workspaceDataSchema.nullable(),
})
export type WorkspaceData = z.infer<typeof workspaceDataSchema>
export type SavedWorkspace = z.infer<typeof workspaceSchema>
export type ScenarioKey = keyof WorkspaceData['scenarios']
export function draftWorkspace(bounds: Bounds): WorkspaceData {
  const [w, s, e, n] = bounds
  return {
    constraints: [],
    source_crs: 'EPSG:4326',
    boundary: {
      type: 'Polygon',
      coordinates: [
        [
          [w, s],
          [e, s],
          [e, n],
          [w, n],
          [w, s],
        ],
      ],
    },
    boundary_provenance: 'estimated',
    boundary_source: 'Unverified locator extent; replace or verify before use.',
    targets: [],
    scenarios: {
      baseline: { name: 'Baseline', items: [] },
      option_a: { name: 'Option A', items: [] },
      option_b: { name: 'Option B', items: [] },
    },
  }
}
export function workspaceInput(data: WorkspaceData, revision: number) {
  const clean = structuredClone(data)
  delete clean.metric_crs
  delete clean.boundary_area_m2
  if (clean.plan_reference) clean.plan_reference = planInput(clean.plan_reference)
  clean.targets.forEach((target) => {
    delete target.area_m2
    delete target.reference_review_required
  })
  Object.values(clean.scenarios).forEach((scenario) => {
    delete scenario.terrain_signature
    delete scenario.terrain_anchors
    scenario.items.forEach((item) => {
      delete item.schedule
      delete item.object_pose
      delete item.quantity
      delete item.terrain_work_stale
      delete item.reference_review_required
    })
  })
  return { ...clean, expected_revision: revision }
}
export function coordinateText(geometry: Geometry): string {
  const rings =
    geometry.type === 'Polygon'
      ? geometry.coordinates
      : [geometry.type === 'Point' ? [geometry.coordinates] : geometry.coordinates]
  return rings.map((ring) => ring.map((point) => point.join(', ')).join('\n')).join('\n\n')
}
export function parseCoordinates(value: string, type: Geometry['type']): Geometry {
  const rings = value
    .trim()
    .split(/\n\s*\n/)
    .map((ring) =>
      ring.split('\n').map((line) =>
        line
          .trim()
          .split(/[\s,]+/)
          .map(Number),
      ),
    )
  if (type !== 'Polygon' && rings.length !== 1)
    throw new Error('Only polygons support separate rings.')
  if (type === 'Point' && rings[0].length !== 1)
    throw new Error('A point requires exactly one longitude/latitude pair.')
  return geometrySchema.parse({
    type,
    coordinates: type === 'Polygon' ? rings : type === 'Point' ? rings[0][0] : rings[0],
  })
}
