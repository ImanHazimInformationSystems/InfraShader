import { z } from 'zod'
import type { Bounds } from './projects'

const position = z.tuple([z.number().finite(), z.number().finite()])
export const geometrySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('Polygon'), coordinates: z.array(z.array(position).min(4).max(129)).length(1) }),
  z.object({ type: z.literal('LineString'), coordinates: z.array(position).min(2).max(128) }),
  z.object({ type: z.literal('Point'), coordinates: position }),
])
export type Geometry = z.infer<typeof geometrySchema>
export const provenanceSchema = z.enum(['measured', 'sourced', 'estimated', 'manually_entered', 'imported', 'calculated'])
const quantitySchema = z.object({ value: z.number().finite(), is_override: z.boolean(), calculated: z.object({ value: z.number().finite(), unit: z.enum(['m2', 'm', 'item']), metric_crs: z.string().nullable(), method: z.string() }) })
export const itemSchema = z.object({ category: z.string().min(1).max(80).default('General'), visible: z.boolean().default(true), crown_diameter_m: z.number().positive().max(100).nullable().default(null), id: z.uuid(), name: z.string().min(1).max(160), kind: z.enum(['area', 'path', 'building', 'canopy', 'tree', 'bench', 'manual']), status: z.enum(['existing', 'proposed']), geometry: geometrySchema.nullable(), count: z.number().int().min(1).max(1000000), height_m: z.number().positive().max(100).nullable(), height_source: z.string().max(2000), quantity_override: z.string().nullable(), provenance: provenanceSchema, source_note: z.string().min(1).max(2000), rate_id: z.uuid().nullable(), quantity: quantitySchema.optional() })
export type WorkItem = z.infer<typeof itemSchema>
export const targetSchema = z.object({ id: z.uuid(), name: z.string().min(1).max(160), geometry: geometrySchema, source_note: z.string().min(1).max(2000), provenance: provenanceSchema, area_m2: z.number().finite().optional() })
const scenarioSchema = z.object({ name: z.string(), items: z.array(itemSchema).max(150) })
export const workspaceDataSchema = z.object({ source_crs: z.literal('EPSG:4326'), boundary: geometrySchema, boundary_provenance: provenanceSchema, boundary_source: z.string().min(1).max(2000), targets: z.array(targetSchema).max(20), scenarios: z.object({ baseline: scenarioSchema, option_a: scenarioSchema, option_b: scenarioSchema }), metric_crs: z.string().optional() })
export const workspaceSchema = z.object({ revision: z.number().int().nonnegative(), data: workspaceDataSchema.nullable() })
export type WorkspaceData = z.infer<typeof workspaceDataSchema>
export type SavedWorkspace = z.infer<typeof workspaceSchema>
export type ScenarioKey = keyof WorkspaceData['scenarios']
export function draftWorkspace(bounds: Bounds): WorkspaceData {
  const [w, s, e, n] = bounds
  return { source_crs: 'EPSG:4326', boundary: { type: 'Polygon', coordinates: [[[w,s],[e,s],[e,n],[w,n],[w,s]]] }, boundary_provenance: 'estimated', boundary_source: 'Unverified locator extent; replace or verify before use.', targets: [], scenarios: { baseline: { name: 'Baseline', items: [] }, option_a: { name: 'Option A', items: [] }, option_b: { name: 'Option B', items: [] } } }
}
export function workspaceInput(data: WorkspaceData, revision: number) {
  const clean = structuredClone(data)
  delete clean.metric_crs
  clean.targets.forEach(target => delete target.area_m2)
  Object.values(clean.scenarios).forEach(scenario => scenario.items.forEach(item => delete item.quantity))
  return { ...clean, expected_revision: revision }
}
export function coordinateText(geometry: Geometry): string {
  const points = geometry.type === 'Polygon' ? geometry.coordinates[0] : geometry.type === 'Point' ? [geometry.coordinates] : geometry.coordinates
  return points.map(point => point.join(', ')).join('\n')
}
export function parseCoordinates(value: string, type: Geometry['type']): Geometry {
  const points = value.trim().split('\n').map(line => line.trim().split(/[\s,]+/).map(Number))
  if (type === 'Point' && points.length !== 1) throw new Error('A point requires exactly one longitude/latitude pair.')
  return geometrySchema.parse({ type, coordinates: type === 'Polygon' ? [points] : type === 'Point' ? points[0] : points })
}
