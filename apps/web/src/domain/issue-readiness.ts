import { z } from 'zod'

export const issueReadinessSchema = z.object({
  ready: z.boolean(),
  project_revision: z.number(),
  issues: z.array(
    z.object({
      code: z.string(),
      message: z.string(),
      why: z.string(),
      severity: z.enum(['blocks_issue', 'warning']),
      group: z.enum(['Site', 'Brief', 'Prices', 'Proposal wording', 'Approvals']),
      fix: z.string(),
      field: z.string().nullable(),
      item_id: z.string().nullable(),
    }),
  ),
})
export type IssueBlocker = z.infer<typeof issueReadinessSchema>['issues'][number]
export const issueGroups = ['Site', 'Brief', 'Prices', 'Proposal wording', 'Approvals'] as const
export const blocksIssue = (issues: IssueBlocker[]) =>
  issues.some((i) => i.severity === 'blocks_issue')

// Used only for a race/error response. The normal checklist is entirely server-owned.
export const issueButtonDisabled = (issues: IssueBlocker[], pending: boolean, blocked: boolean) =>
  pending || blocked || blocksIssue(issues)
export const issueErrors: Record<string, [string, string]> = {
  output_images: ['Photo storage is unavailable. Retry or deselect photo copies.', 'proposal'],
  output_image_integrity: [
    'A selected photo failed its integrity check. Review or deselect that photo.',
    'proposal',
  ],
  output_image: ['A selected photo cannot be rendered. Review or deselect that photo.', 'proposal'],
  output_purpose: ['Choose the document type for this project’s purpose.', 'brief'],
  project_archived: ['Restore this archived project before issuing.', 'project'],
  reference_review: ['Check traced shapes against the replacement plan.', 'reference'],
  stale_brief: ['Reload and review the updated project brief.', 'reload'],
  brief_not_confirmed: ['Review the brief agreement before issuing.', 'checkpoint'],
  brief_incomplete: ['Complete the missing fields in the project brief.', 'brief'],
  issue_not_ready: [
    'Review the site area and recalculate a complete total for this option.',
    'estimate',
  ],
  proposal_validity: ['Enter a proposal validity date today or later.', 'proposal'],
  proposal_fields: ['Complete the client scope, programme and maintenance wording.', 'proposal'],
  price_review: [
    'Ask an authorised pricing reviewer to resolve the pricing warnings.',
    'pricing_review',
  ],
  change_summary: ['Describe what changed since the last issued proposal.', 'proposal'],
  maintenance_checklist: ['Complete each added maintenance task and frequency.', 'proposal'],
  required_text: ['Complete the review criteria, notes, assumptions and exclusions.', 'proposal'],
  pricing_permission: ['Ask an authorised pricing reviewer to record the exception.', 'access'],
  issue_permission: ['Ask a project issuer to issue this document.', 'access'],
  project_capability_required: ['Ask a project issuer to review your permissions.', 'access'],
  capability_required: ['Ask a project issuer to review your permissions.', 'access'],
  evidence_unavailable: ['Choose available evidence for this project.', 'proposal'],
  issue_confirmation: ['Review the proposal before confirming issue.', 'proposal'],
  validation_error: ['Check the highlighted proposal fields and maintenance rows.', 'proposal'],
  not_found: ['Reload the project and review the selected total and evidence.', 'reload'],
}
export function issueError(code: string): IssueBlocker {
  const [message, fix] = issueErrors[code] ?? [
    'Readiness could not be confirmed. Refresh the checklist and try again.',
    'refresh',
  ]
  return {
    code,
    message,
    fix,
    why: 'The document has not been issued. Review the latest saved information.',
    severity: 'blocks_issue',
    group: 'Approvals',
    field: ({ proposal_validity: 'valid_until', proposal_fields: 'customer_narrative',
      price_review: 'pricing_override_reason', change_summary: 'change_summary',
      maintenance_checklist: 'maintenance_plan.0.task', evidence_unavailable: 'evidence_ids',
      output_images: 'evidence_ids', output_image: 'evidence_ids', output_image_integrity: 'evidence_ids',
    } as Record<string, string>)[code] ?? null,
    item_id: null,
  }
}
