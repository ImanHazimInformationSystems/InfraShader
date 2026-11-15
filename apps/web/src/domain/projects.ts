import { z } from 'zod'
import { selectionError } from './site-selection'
import { treeInventorySchema } from './trees'
const siteOutlineSchema = z
  .object({
    type: z.literal('Polygon'),
    coordinates: z
      .array(
        z
          .array(z.tuple([z.number().finite(), z.number().finite()]))
          .min(4)
          .max(65),
      )
      .length(1),
  })
  .refine((p) => {
    const r = p.coordinates[0]
    return (
      r[0][0] === r[r.length - 1][0] &&
      r[0][1] === r[r.length - 1][1] &&
      !selectionError(r.slice(0, -1))
    )
  }, 'Use a closed, non-crossing site outline.')

export const boundsSchema = z
  .tuple([
    z.number().min(-180).max(180),
    z.number().min(-85).max(85),
    z.number().min(-180).max(180),
    z.number().min(-85).max(85),
  ])
  .refine(
    ([w, s, e, n]) => w < e && s < n,
    'West must be less than east, and south less than north. Extents crossing the antimeridian are not supported yet.',
  )
  .refine(
    ([w, s, e, n]) => e - w <= 0.2 && n - s <= 0.2,
    'Choose a small-site extent no more than 0.2 degrees wide or high.',
  )
export type Bounds = z.infer<typeof boundsSchema>
export const purposeSchema = z.enum(['developer_decision', 'contractor_proposal'])
const optionalBriefText = z.string().trim().max(4000)
export const opportunityStages = [
  'enquiry',
  'qualified',
  'design',
  'submitted',
  'won',
  'lost',
  'on_hold',
] as const
export const clientContactSchema = z.object({
  name: z.string().trim().min(1).max(160),
  company: z.string().max(160).default(''),
  email: z.union([z.literal(''), z.email()]).default(''),
  phone: z.string().max(80).default(''),
  source: z.string().max(1000).default(''),
  notes: z.string().max(2000).default(''),
})
export type ClientContact = z.infer<typeof clientContactSchema>
export const briefScopeSchema = z.object({
  deliverables: z.string().max(4000).default(''),
  inclusions: z.string().max(4000).default(''),
  exclusions: z.string().max(4000).default(''),
  intended_use: z.string().max(2000).default(''),
  unresolved_questions: z.string().max(4000).default(''),
  facts: z
    .array(
      z.object({
        text: z.string().trim().min(1).max(2000),
        source: z.string().trim().min(1).max(1000),
        state: z.enum(['known', 'estimated', 'unknown']),
      }),
    )
    .max(30)
    .default([]),
})
export type BriefScope = z.infer<typeof briefScopeSchema>
export const opportunitySchema = z.object({
  owner: z.string().max(160).default(''),
  due_date: z.iso.date().nullable().default(null),
  stage: z.enum(opportunityStages).default('enquiry'),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  source: z.string().max(1000).default(''),
  client: clientContactSchema.nullable().default(null),
})
export const projectInputSchema = z.object({
  details: z
    .object({
      scope: briefScopeSchema.optional(),
      opportunity: opportunitySchema.optional(),
      budget_min: z
        .string()
        .regex(/^\d+(\.\d{1,2})?$/)
        .nullable()
        .optional(),
      site_notes: z.string().max(8000).optional(),
      known_facts: z.string().max(4000).optional(),
      unknown_facts: z.string().max(4000).optional(),
      project_type: z.string().max(160).default(''),
      budget: z
        .string()
        .regex(/^\d+(\.\d{1,2})?$/)
        .nullable()
        .default(null),
      priorities: z.string().max(4000).default(''),
      constraints: z.string().max(4000).default(''),
      stakeholders: z
        .array(
          z.object({
            name: z.string().trim().min(1).max(160),
            role: z.string().max(160),
            needs: z.string().max(2000),
          }),
        )
        .max(30)
        .default([]),
    })
    .optional(),
  name: z.string().trim().min(1, 'Give this project a name.').max(160),
  purpose: purposeSchema,
  stakeholder: z.string().trim().min(1, 'Please fill in this field.').max(160),
  problem: optionalBriefText,
  intended_users: z.string().trim().max(2000),
  desired_outcome: optionalBriefText,
  use_periods: z.string().trim().max(2000),
  site: z.object({
    bounds: boundsSchema,
    crs: z.literal('EPSG:4326'),
    outline: siteOutlineSchema.nullable().optional(),
    trees: treeInventorySchema.optional(),
  }),
  timezone: z
    .string()
    .min(1)
    .refine((value) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: value })
        return true
      } catch {
        return false
      }
    }, 'Use a valid IANA timezone, for example Asia/Kuala_Lumpur.'),
  currency: z.string().regex(/^[A-Z]{3}$/, 'Use a three-letter currency code, for example MYR.'),
})
export type ProjectInput = z.infer<typeof projectInputSchema>
export const projectSchema = projectInputSchema.extend({
  capabilities: z.array(z.string()).optional(),
  organisation_capabilities: z.array(z.string()).optional(),
  stage: z
    .enum(['brief', 'site', 'option', 'estimate', 'developer_brief', 'proposal'])
    .default('brief'),
  id: z.string().uuid(),
  organisation_id: z.string().uuid(),
  created_at: z.iso.datetime({ offset: true }).optional(),
  archived: z.boolean(),
  revision: z.number().int().positive(),
  updated_at: z.iso.datetime({ offset: true }),
  /** Built-in reference project marker, set only by the API's example installer. */
  example: z.enum(['studio', 'studio_a', 'studio_b', 'studio_c', 'review']).nullable().optional(),
})
export type Project = z.infer<typeof projectSchema>
export const projectListSchema = z.object({
  items: z.array(projectSchema),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
})
export const sessionSchema = z.object({
  user_id: z.string().uuid(),
  organisations: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
      role: z.string(),
      capabilities: z.array(z.string()),
      workspaces: z.array(z.enum(['studio', 'review'])).optional(),
      enabled_workspaces: z.array(z.enum(['studio', 'review'])).optional(),
      workspace_setup_required: z.boolean().optional(),
    }),
  ),
})
export type Organisation = z.infer<typeof sessionSchema>['organisations'][number]
export const purposeLabel = (purpose: ProjectInput['purpose']) =>
  purpose === 'developer_decision' ? 'Developer decision' : 'Contractor proposal'
export const initialBounds: Bounds = [101.68, 3.13, 101.7, 3.15]
export function emptyBrief(bounds: Bounds): ProjectInput {
  return {
    name: '',
    purpose: 'developer_decision',
    stakeholder: '',
    problem: '',
    intended_users: '',
    desired_outcome: '',
    use_periods: '',
    site: { bounds, crs: 'EPSG:4326' },
    timezone: 'Asia/Kuala_Lumpur',
    currency: 'MYR',
  }
}
export function boundsPolygon(bounds: Bounds) {
  const [w, s, e, n] = bounds
  return {
    type: 'Feature' as const,
    properties: {},
    geometry: {
      type: 'Polygon' as const,
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
  }
}
