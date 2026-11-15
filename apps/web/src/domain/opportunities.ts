import { z } from 'zod'

/**
 * S03/L25/O05 invited opportunities and contractor submissions. The server decides every state;
 * these labels only describe states the server actually returned.
 */
export const sharedFileSchema = z.object({
  id: z.string(),
  filename: z.string(),
  content_type: z.string(),
  size_bytes: z.number(),
  sha256: z.string(),
  description: z.string(),
})
export type SharedFile = z.infer<typeof sharedFileSchema>

export const packageSummarySchema = z.object({
  id: z.string(),
  version: z.number(),
  kind: z.enum(['submission', 'withdrawal']),
  state: z.string(),
  receipt_id: z.string(),
  received_at: z.string(),
  reason: z.string(),
  supersedes_id: z.string().nullable(),
  issued_version: z.number().nullable().optional(),
  issued_at: z.string().nullable().optional(),
  preferred_option: z.string().nullable().optional(),
  package_sha256: z.string(),
  pdf_file_id: z.string().nullable(),
  package_file_id: z.string().nullable(),
})
export type PackageSummary = z.infer<typeof packageSummarySchema>

export const invitationStateSchema = z.enum(['draft', 'pending', 'accepted', 'revoked', 'expired'])
export type InvitationState = z.infer<typeof invitationStateSchema>

export const ownerInvitationSchema = z.object({
  id: z.string(),
  state: invitationStateSchema,
  revision: z.number(),
  recipient_email: z.string(),
  instructions: z.string(),
  shared_fields: z.array(z.string()),
  closes_at: z.string(),
  closed: z.boolean(),
  expires_at: z.string().nullable(),
  issued_at: z.string().nullable(),
  accepted_at: z.string().nullable(),
  revoked_at: z.string().nullable(),
  contractor_organisation: z.string().nullable(),
  basis_revision: z.number().nullable(),
  current_basis_revision: z.number().nullable(),
  basis_changed: z.boolean(),
  submission_key: z.string().nullable(),
  files: z.array(sharedFileSchema),
  packages: z.array(packageSummarySchema),
  current_package_version: z.number().nullable(),
  token: z.string().optional(),
})
export type OwnerInvitation = z.infer<typeof ownerInvitationSchema>
export const ownerInvitationListSchema = z.object({ items: z.array(ownerInvitationSchema) })

const looseRecord = z.record(z.string(), z.unknown())
export const briefSchema = z
  .object({
    owner_organisation: z.string().nullable().optional(),
    project_name: z.string().optional(),
    basis_revision: z.number().optional(),
    basis: looseRecord.optional(),
    problem: z.string().optional(),
    intended_users: z.string().optional(),
    desired_outcome: z.string().optional(),
    use_periods: z.string().optional(),
    site: looseRecord.optional(),
  })
  .passthrough()
export type SharedBrief = z.infer<typeof briefSchema>
export const briefPreviewSchema = z.object({ frozen: z.boolean(), brief: briefSchema })

export const contractorOpportunitySchema = z.object({
  id: z.string(),
  state: invitationStateSchema,
  revision: z.number(),
  owner_organisation: z.string().nullable(),
  project_name: z.string().nullable(),
  closes_at: z.string(),
  closed: z.boolean(),
  accepted_at: z.string().nullable(),
  linked_project_id: z.string().nullable(),
  basis_updated: z.boolean(),
  submission_count: z.number(),
  packages: z.array(packageSummarySchema),
  instructions: z.string().optional(),
  brief: briefSchema.nullable().optional(),
  files: z.array(sharedFileSchema).optional(),
})
export type ContractorOpportunity = z.infer<typeof contractorOpportunitySchema>
export const contractorOpportunityListSchema = z.object({
  items: z.array(contractorOpportunitySchema),
})

export const recipientPreviewSchema = z.object({
  state: invitationStateSchema,
  owner_organisation: z.string().nullable(),
  project_name: z.string().nullable(),
  closes_at: z.string(),
  expires_at: z.string(),
  instructions: z.string(),
  brief: briefSchema,
  files: z.array(sharedFileSchema),
  accepted_by_you: z.boolean(),
  contractor_organisation_id: z.string().nullable(),
  eligible_organisations: z.array(z.object({ id: z.string(), name: z.string().nullable() })),
})
export type RecipientPreview = z.infer<typeof recipientPreviewSchema>

export const pendingInvitationListSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      owner_organisation: z.string().nullable(),
      project_name: z.string().nullable(),
      closes_at: z.string(),
      issued_at: z.string().nullable(),
    }),
  ),
})

export const eligibleProposalSchema = z.object({
  artifact_id: z.string(),
  version: z.number().nullable(),
  issued_at: z.string().nullable(),
  preferred_option: z.string().nullable(),
  valid_until: z.string().nullable(),
  pdf_retained: z.boolean(),
  previously_submitted: z.boolean(),
})
export const eligibleProposalListSchema = z.object({ items: z.array(eligibleProposalSchema) })

export const packagePreviewSchema = z.object({
  recipient: z.object({
    owner_organisation: z.string().nullable(),
    project_name: z.string().nullable(),
  }),
  contractor_organisation: z.string().nullable(),
  closes_at: z.string(),
  is_revision: z.boolean(),
  blockers: z.array(z.string()),
  warnings: z.array(z.string()),
  package: looseRecord.nullable(),
})
export type PackagePreview = z.infer<typeof packagePreviewSchema>

export const receiptSchema = packageSummarySchema.extend({
  owner_organisation: z.string().nullable(),
  project_name: z.string().nullable(),
  contractor_organisation: z.string().nullable(),
  statement: z.string(),
  package: looseRecord.optional(),
})
export type Receipt = z.infer<typeof receiptSchema>

export const ownerPackageSchema = packageSummarySchema.extend({ package: looseRecord })

export const STATE_LABEL: Record<InvitationState, string> = {
  draft: 'Draft (not shared yet)',
  pending: 'Link issued, not accepted yet',
  accepted: 'Accepted by the contractor',
  revoked: 'Revoked',
  expired: 'Link expired',
}

export const FIELD_LABEL: Record<string, string> = {
  problem: 'Problem to solve',
  intended_users: 'Intended users',
  desired_outcome: 'Desired outcome',
  use_periods: 'Use times',
  site: 'Site location and outline',
  criteria: 'Evaluation criteria (names and weights only)',
}

export const attachmentSchema = z.object({
  id: z.string(),
  filename: z.string(),
  content_type: z.string(),
  size_bytes: z.number(),
  sha256: z.string(),
  description: z.string(),
  submitted: z.boolean(),
})
export type Attachment = z.infer<typeof attachmentSchema>
export const attachmentListSchema = z.object({ items: z.array(attachmentSchema) })
export const linkableListSchema = z.object({
  items: z.array(z.object({ id: z.string(), name: z.string() })),
})

/** Opens the owner's own email app with the link; InfraShader itself sends nothing. */
export const invitationMailto = (email: string, project: string, link: string) =>
  `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(
    `Invitation to submit a proposal: ${project}`,
  )}&body=${encodeURIComponent(
    `You are invited to submit a proposal through InfraShader.\n\nOpen this link and sign in with this email address:\n${link}\n\nThe link works once and expires at the closing time.`,
  )}`

/** Link the owner copies and shares; the token only ever lives in the URL fragment. */
export const invitationLink = (token: string, origin = window.location.origin) =>
  `${origin}/#opportunity=${encodeURIComponent(token)}`

/** Reads and removes an opportunity token from the URL fragment (never sent to the server). */
export function captureOpportunityToken(): string {
  const value = new URLSearchParams(window.location.hash.slice(1)).get('opportunity') ?? ''
  if (value) {
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
    try {
      sessionStorage.setItem('infrashader.opportunity-token', value)
    } catch {
      // Storage unavailable: the token stays in memory for this page only.
    }
    return value
  }
  try {
    return sessionStorage.getItem('infrashader.opportunity-token') ?? ''
  } catch {
    return ''
  }
}
export function forgetOpportunityToken() {
  try {
    sessionStorage.removeItem('infrashader.opportunity-token')
  } catch {
    // Nothing stored.
  }
}

export function submissionLabel(item: PackageSummary, latestSubmissionId: string | null) {
  if (item.kind === 'withdrawal') return 'Withdrawal recorded'
  return item.id === latestSubmissionId ? 'Received · current' : 'Received · superseded'
}

/** The id of the newest submission that has not since been withdrawn. */
export function currentSubmissionId(packages: PackageSummary[]) {
  let current: string | null = null
  for (const item of [...packages].sort((a, b) => a.version - b.version))
    current = item.kind === 'submission' ? item.id : null
  return current
}

export const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString('en-MY', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  })
