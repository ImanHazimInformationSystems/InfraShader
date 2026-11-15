import { z } from 'zod'
import { briefScopeSchema } from './projects'

export const acknowledgementSchema = z.object({
  status: z.enum(['not_confirmed', 'acknowledged']),
  issue_policy: z.enum(['draft_only', 'qualified_issue']),
  person: z.string(),
  confirmation_date: z.string().nullable(),
  method: z.string(),
  note: z.string(),
  evidence: z.array(
    z.object({
      id: z.string(),
      revision: z.number(),
      sha256: z.string(),
      description: z.string(),
      source_note: z.string(),
    }),
  ),
  scope: briefScopeSchema,
})
export const checkpointSchema = z.object({
  status: z.enum(['not_confirmed', 'acknowledged']),
  issue_policy: z.enum(['draft_only', 'qualified_issue']),
  checkpoint_id: z.string().nullable(),
  checkpoint_version: z.number(),
  brief_revision: z.number(),
  reason: z.string(),
  scope: briefScopeSchema,
  budget_min: z.string().nullable(),
  budget_max: z.string().nullable(),
  currency: z.string(),
  acknowledgement: acknowledgementSchema.nullable(),
})
export const checkpointHistorySchema = z.object({
  current: checkpointSchema,
  items: z.array(
    z.object({
      id: z.string(),
      version: z.number(),
      brief_revision: z.number(),
      created_at: z.string(),
      created_by: z.string(),
      data: acknowledgementSchema,
    }),
  ),
})
