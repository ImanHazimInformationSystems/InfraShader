import { z } from 'zod'

export const boundsSchema = z.tuple([
  z.number().min(-180).max(180), z.number().min(-85).max(85),
  z.number().min(-180).max(180), z.number().min(-85).max(85),
]).refine(([w, s, e, n]) => w < e && s < n, 'West must be less than east, and south less than north. Extents crossing the antimeridian are not supported yet.')
  .refine(([w, s, e, n]) => e - w <= 0.2 && n - s <= 0.2, 'Choose a small-site extent no more than 0.2 degrees wide or high.')
export type Bounds = z.infer<typeof boundsSchema>
export const purposeSchema = z.enum(['developer_decision', 'contractor_proposal'])
const optionalBriefText = z.string().trim().max(4000)
export const projectInputSchema = z.object({
  details: z.object({
    project_type: z.string().max(160).default(''),
    budget: z.string().regex(/^\d+(\.\d{1,2})?$/).nullable().default(null),
    priorities: z.string().max(4000).default(''), constraints: z.string().max(4000).default(''),
    stakeholders: z.array(z.object({name:z.string().trim().min(1).max(160), role:z.string().max(160), needs:z.string().max(2000)})).max(30).default([]),
  }).optional(),
  name: z.string().trim().min(1, 'Give this project a name.').max(160),
  purpose: purposeSchema,
  stakeholder: z.string().trim().min(1, 'Please fill in this field.').max(160),
  problem: optionalBriefText,
  intended_users: z.string().trim().max(2000),
  desired_outcome: optionalBriefText,
  use_periods: z.string().trim().max(2000),
  site: z.object({ bounds: boundsSchema, crs: z.literal('EPSG:4326') }),
  timezone: z.string().min(1).refine((value) => {
    try { new Intl.DateTimeFormat('en', { timeZone: value }); return true } catch { return false }
  }, 'Use a valid IANA timezone, for example Asia/Kuala_Lumpur.'),
  currency: z.string().regex(/^[A-Z]{3}$/, 'Use a three-letter currency code, for example MYR.'),
})
export type ProjectInput = z.infer<typeof projectInputSchema>
export const projectSchema = projectInputSchema.extend({
  id: z.string().uuid(), organisation_id: z.string().uuid(),
  created_at: z.iso.datetime({ offset: true }).optional(), archived: z.boolean(), revision: z.number().int().positive(), updated_at: z.iso.datetime({ offset: true }),
})
export type Project = z.infer<typeof projectSchema>
export const projectListSchema = z.object({ items: z.array(projectSchema), total: z.number().int(), limit: z.number().int(), offset: z.number().int() })
export const sessionSchema = z.object({
  user_id: z.string().uuid(),
  organisations: z.array(z.object({ id: z.string().uuid(), name: z.string(), role: z.string(), capabilities: z.array(z.string()) })),
})
export type Organisation = z.infer<typeof sessionSchema>['organisations'][number]
export const purposeLabel = (purpose: ProjectInput['purpose']) => purpose === 'developer_decision' ? 'Developer decision' : 'Contractor proposal'
export const initialBounds: Bounds = [101.68, 3.13, 101.70, 3.15]
export function emptyBrief(bounds: Bounds): ProjectInput {
  return { name: '', purpose: 'developer_decision', stakeholder: '', problem: '', intended_users: '', desired_outcome: '', use_periods: '', site: { bounds, crs: 'EPSG:4326' }, timezone: 'Asia/Kuala_Lumpur', currency: 'MYR' }
}
export function boundsPolygon(bounds: Bounds) {
  const [w, s, e, n] = bounds
  return { type: 'Feature' as const, properties: {}, geometry: { type: 'Polygon' as const, coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] } }
}
