import { z } from 'zod'

/** Response contracts for the D1B owner review API. The backend owns every rule and number. */
const entry = <T extends z.ZodTypeAny>(payload: T) =>
  z.object({
    key: z.string(),
    revision: z.number(),
    payload,
    updated_by: z.string(),
    updated_at: z.string(),
  })

const source = z.object({ document_id: z.string(), location: z.string() }).nullable().optional()
export type SourceRef = { document_id: string; location: string }

export const scopeItem = z.object({
  code: z.string(),
  description: z.string(),
  unit: z.string(),
  quantity: z.string().nullable().optional(),
})
export const requirement = z.object({
  code: z.string(),
  text: z.string(),
  kind: z.enum(['eligibility', 'technical']),
  mandatory: z.boolean(),
  expiry_required: z.boolean(),
})
export const basisPayload = z.object({
  title: z.string(),
  deliverables: z.string(),
  submission_requirements: z.string(),
  currency: z.literal('MYR'),
  tax_basis: z.enum(['exclusive', 'inclusive']),
  budget: z.string().nullable(),
  deadline: z.string().nullable(),
  deadline_timezone: z.string(),
  evaluation_horizon_years: z.number().nullable(),
  scope_items: z.array(scopeItem),
  requirements: z.array(requirement),
  reviewers: z.array(z.string()),
  self_approval: z.enum(['prohibited', 'permitted']),
  addendum_note: z.string(),
})
export const criterion = z.object({
  code: z.string(),
  name: z.string(),
  weight: z.string(),
  direction: z.enum(['higher_better', 'lower_better']),
  scale_min: z.number(),
  scale_max: z.number(),
  mandatory_gate: z.boolean(),
  pass_mark: z.number().nullable(),
  evidence_requirement: z.string(),
  guidance: z.string(),
})
export const rubricPayload = z.object({
  criteria: z.array(criterion),
  missing_score_rule: z.enum(['not_ranked', 'scale_minimum']),
  reviewer_aggregation: z.enum(['mean', 'median']),
  tie_policy: z.literal('report_only'),
  change_reason: z.string(),
  status: z.enum(['draft', 'locked']),
  locked_by: z.string().nullable(),
  locked_at: z.string().nullable(),
})
const field = z.object({
  state: z.enum(['unconfirmed', 'confirmed', 'not_provided']),
  source,
  value: z.union([z.string(), z.number(), z.null()]).optional(),
})
export const FIELD_NAMES = [
  'quoted_total',
  'tax_basis',
  'validity_until',
  'duration_days',
  'warranty',
  'exclusions',
  'annual_maintenance',
] as const
export type FieldName = (typeof FIELD_NAMES)[number]
export const line = z.object({
  line_id: z.string(),
  original_text: z.string(),
  original_unit: z.string(),
  original_quantity: z.string().nullable().optional(),
  original_rate: z.string().nullable().optional(),
  original_amount: z.string().nullable().optional(),
  source: z.object({ document_id: z.string(), location: z.string() }),
  scope_code: z.string().nullable().optional(),
  state: z.enum(['included', 'excluded', 'optional', 'missing', 'provisional', 'unpriced']),
  mapping_confirmed: z.boolean(),
  mapping_note: z.string(),
  adjustment: z
    .object({ amount: z.string(), reason: z.string(), source: z.string() })
    .nullable()
    .optional(),
})
export const response = z.object({
  code: z.string(),
  state: z.enum(['answered', 'absent', 'unclear', 'not_applicable', 'accepted', 'rejected']),
  source,
  expiry: z.string().nullable().optional(),
  note: z.string(),
})
export const submissionPayload = z.object({
  bidder_name: z.string(),
  // native_infrashader: submitted by a contractor through an InfraShader invitation (S03/L25).
  channel: z.enum(['external_document', 'native_upload', 'native_infrashader']),
  supplier_registered: z.boolean(),
  sender: z.string(),
  received_at: z.string(),
  receipt_evidence: z.string(),
  package_version: z.number(),
  received_by: z.string(),
  fields: z.record(z.string(), field),
  lines: z.array(line),
  responses: z.array(response),
  withdrawn: z.boolean(),
  confirmed_package_version: z.number().nullable(),
  confirmed_basis_revision: z.number().nullable(),
  revisions: z.array(z.object({ package_version: z.number(), reason: z.string() })),
  native: z
    .object({
      invitation_id: z.string(),
      receipt_id: z.string(),
      package_record_version: z.number(),
      opportunity_basis_revision: z.number().nullable(),
    })
    .optional(),
  contractor_withdrawal: z
    .object({ receipt_id: z.string(), at: z.string(), reason: z.string() })
    .optional(),
})
export const scorePayload = z.object({
  submission_key: z.string(),
  reviewer_id: z.string(),
  rubric_revision: z.number(),
  package_version: z.number(),
  conflict: z.enum(['none', 'declared']),
  conflict_note: z.string(),
  state: z.enum(['draft', 'submitted']),
  scores: z.array(
    z.object({
      criterion: z.string(),
      score: z.number().nullable(),
      rationale: z.string(),
      source,
    }),
  ),
})
export const clarificationPayload = z.object({
  submission_key: z.string().nullable(),
  question: z.string(),
  due_date: z.string().nullable(),
  state: z.enum(['open', 'answered', 'closed']),
  response: z.string(),
  response_received_at: z.string().nullable(),
  response_source: z.string(),
  raised_by: z.string(),
})
export const fileMeta = z.object({
  id: z.string(),
  submission_key: z.string().nullable(),
  purpose: z.enum(['received', 'decision_pack', 'decision_memo']),
  package_version: z.number(),
  filename: z.string(),
  content_type: z.string(),
  size_bytes: z.number(),
  sha256: z.string(),
  description: z.string(),
  uploaded_by: z.string(),
  created_at: z.string(),
})
export const decisionPayload = z.object({
  state: z.enum(['submitted', 'returned', 'approved', 'rejected']),
  recommended_submission: z.string(),
  rationale: z.string(),
  exception_reason: z.string(),
  evaluation_hash: z.string(),
  submitted_by: z.string(),
  decided_by: z.string().optional(),
  decision_reason: z.string().optional(),
  history: z.array(
    z.object({ action: z.string(), by: z.string(), at: z.string(), reason: z.string().optional() }),
  ),
  pack: z.array(fileMeta).nullable(),
})
export const stateSchema = z.object({
  project_id: z.string(),
  capabilities: z.array(z.string()),
  user_id: z.string(),
  eligible_reviewers: z.array(z.string()),
  basis: entry(basisPayload).nullable(),
  rubric: entry(rubricPayload).nullable(),
  submissions: z.array(entry(submissionPayload)),
  scores: z.array(entry(scorePayload)),
  clarifications: z.array(entry(clarificationPayload)),
  decision: entry(decisionPayload).nullable(),
  files: z.array(fileMeta),
})
export const evaluationSchema = z.object({
  official: z.boolean(),
  what_if: z.boolean(),
  hash: z.string(),
  rule: z.string(),
  label: z.string().optional(),
  results: z.array(
    z.object({
      submission_key: z.string(),
      bidder_name: z.string(),
      readiness: z.enum([
        'comparable',
        'needs_clarification',
        'unpriced',
        'ineligible',
        'withdrawn',
      ]),
      reasons: z.array(z.string()),
      document_only: z.boolean().optional(),
      quoted_total: z.string().nullable().optional(),
      adjustments_total: z.string().optional(),
      comparison_total: z.string().nullable().optional(),
      budget_gap: z.string().nullable().optional(),
      lifecycle_undiscounted: z.string().nullable().optional(),
      missing_scope: z.array(z.string()).optional(),
      missing_scores: z.array(z.string()).optional(),
      weighted_score: z.string().nullable().optional(),
      reviewer_sheets: z.number().optional(),
      rank: z.number().nullable().optional(),
      tie: z.boolean().optional(),
      criteria: z
        .array(
          z.object({
            criterion: z.string(),
            weight: z.string(),
            aggregate: z.string().nullable(),
            contribution: z.string().nullable(),
            substituted_minimum: z.boolean(),
            reviewer_scores: z.array(z.number()),
          }),
        )
        .optional(),
    }),
  ),
})
export const dashboardSchema = z.object({
  computed_at: z.string(),
  withheld_projects: z.number(),
  definitions: z.record(z.string(), z.string()),
  projects: z.array(
    z.object({
      project_id: z.string(),
      name: z.string(),
      submissions: z.number(),
      document_only: z.number(),
      comparable: z.number(),
      needs_clarification: z.number(),
      unpriced: z.number(),
      ineligible: z.number(),
      budget: z.string().nullable(),
      lowest_comparison_total: z.string().nullable(),
      highest_comparison_total: z.string().nullable(),
      priced_offers: z.number(),
      reviewer_sheets_submitted: z.number(),
      reviewer_sheets_expected: z.number(),
      rubric_locked: z.boolean(),
      decision_state: z.string(),
      approval_waiting_days: z.number().nullable(),
    }),
  ),
})
export type OwnerState = z.infer<typeof stateSchema>
export type Evaluation = z.infer<typeof evaluationSchema>
export type Submission = OwnerState['submissions'][number]
export type Line = z.infer<typeof line>
export type Criterion = z.infer<typeof criterion>

export const READINESS_LABEL: Record<Evaluation['results'][number]['readiness'], string> = {
  comparable: 'Comparable',
  needs_clarification: 'Needs clarification',
  unpriced: 'Unpriced or incomplete',
  ineligible: 'Ineligible',
  withdrawn: 'Withdrawn',
}

/** Weight total for display only; the server validates the exact Decimal sum. */
export function weightTotal(weights: string[]): string {
  const cents = weights.reduce((sum, value) => {
    const match = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(value.trim())
    return match ? sum + Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0')) : NaN
  }, 0)
  return Number.isNaN(cents)
    ? 'invalid'
    : `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`
}

// O17: the retained decision pack (decision-pack.json) the memorandum is rendered from.
export const decisionPackSchema = z.object({
  pack_format: z.literal('infrashader-owner-decision-pack-v1'),
  project: z.object({ id: z.string(), name: z.string(), currency: z.string() }),
  approved_at: z.string(),
  approved_by: z.string(),
  decision: decisionPayload.partial({ pack: true }),
  basis: entry(basisPayload),
  rubric: entry(rubricPayload),
  submissions: z.array(entry(submissionPayload)),
  score_sheets: z.array(entry(scorePayload)),
  clarifications: z.array(entry(clarificationPayload)),
  evaluation: evaluationSchema,
  source_manifest: z.array(fileMeta),
  disclosures: z.array(z.string()),
})
export type DecisionPack = z.infer<typeof decisionPackSchema>

// O06: unverified text-layer suggestions (never official until mapped and confirmed).
export const suggestionsSchema = z.object({
  document_id: z.string(),
  filename: z.string(),
  status: z.enum(['ok', 'no_text_layer', 'unsupported', 'unreadable', 'timeout']),
  message: z.string().optional(),
  notice: z.string().optional(),
  truncated: z.boolean().optional(),
  suggestions: z.array(z.object({ location: z.string(), text: z.string(), amount: z.string() })),
})
export type Suggestions = z.infer<typeof suggestionsSchema>
