import { z } from 'zod'

// Geometry is parsed by the workspace schema, avoiding a circular module dependency.
export const constraintFields = {
  id: z.uuid(),
  title: z.string().min(1).max(160),
  category: z.enum(['observation', 'access', 'utility', 'setback', 'existing_tree', 'no_work']),
  description: z.string().min(1).max(4000),
  source_type: z.enum(['measured', 'supplied', 'map_derived', 'traced', 'estimated']),
  source_note: z.string().min(1).max(2000),
  uncertainty: z.string().min(1).max(2000),
  location_consent: z.boolean(),
  consent_note: z.string(),
  inspection_date: z.string().nullable(),
  evidence_ids: z.array(z.uuid()),
  related_ids: z.array(z.uuid()),
  status: z.enum(['unverified', 'site_check', 'verified', 'resolved']),
  critical: z.boolean(),
  responsible: z.string(),
  due_date: z.string().nullable(),
  response: z.string(),
  resolution: z.string(),
  verified_by: z.string(),
  verification_reference: z.string(),
  verification_date: z.string().nullable(),
}
