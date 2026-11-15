import { useEffect, useState } from 'react'
import { Mail } from 'lucide-react'
import { request, ApiError } from '../services/api'
import {
  contractorOpportunitySchema,
  forgetOpportunityToken,
  formatWhen,
  recipientPreviewSchema,
  type ContractorOpportunity,
  type RecipientPreview,
} from '../domain/opportunities'
import { BriefView } from './OpportunityInvitations'
import './opportunities.css'

const EXPLAIN: Record<string, string> = {
  wrong_recipient:
    'This invitation was sent to a different email address. Sign out and sign in with the invited account.',
  invitation_unavailable: 'This invitation link is not valid. Ask the owner for a new link.',
  invitation_expired: 'This invitation has expired. Ask the owner for a new link.',
  invitation_revoked: 'The owner withdrew this invitation.',
  already_accepted: 'This invitation was already accepted.',
  verified_email_required: 'Confirm your account email first, then open the link again.',
}

/**
 * Recipient view of an invitation link: what the owner shares, the deadline, and acceptance for
 * one of the recipient's own organisations. Accepting never joins the owner's organisation.
 */
export default function OpportunityAccept({
  token: invitation,
  invitationId,
  sessionToken,
  onAccepted,
  onDismiss,
}: {
  token?: string
  invitationId?: string
  sessionToken: string
  onAccepted: (opportunity: ContractorOpportunity, organisationId: string) => void
  onDismiss: () => void
}) {
  const [preview, setPreview] = useState<RecipientPreview | null>(null)
  const [error, setError] = useState('')
  const [organisation, setOrganisation] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let current = true
    request('/api/v1/opportunities/preview', recipientPreviewSchema, sessionToken, {
      method: 'POST',
      body: JSON.stringify(invitationId ? { invitation_id: invitationId } : { token: invitation }),
    })
      .then((result) => {
        if (!current) return
        setPreview(result)
        setOrganisation(
          result.contractor_organisation_id ?? result.eligible_organisations[0]?.id ?? '',
        )
      })
      .catch((reason) => {
        if (!current) return
        setError(
          reason instanceof ApiError ? (EXPLAIN[reason.code] ?? reason.message) : String(reason),
        )
      })
    return () => {
      current = false
    }
  }, [invitation, invitationId, sessionToken])

  const dismiss = () => {
    forgetOpportunityToken()
    onDismiss()
  }
  const usable = preview && (preview.state === 'pending' || preview.accepted_by_you)

  return (
    <section className="opp opp-accept" aria-labelledby="opp-accept-heading">
      <header className="opp-head">
        <Mail size={20} aria-hidden="true" />
        <div>
          <span className="eyebrow">Invitation to submit a proposal</span>
          <h2 id="opp-accept-heading">
            {preview
              ? `${preview.owner_organisation ?? 'An owner'} · ${preview.project_name ?? 'Project'}`
              : 'Opening invitation…'}
          </h2>
        </div>
      </header>
      {error && (
        <div className="opp-alert" role="alert">
          <p>{error}</p>
          <button type="button" onClick={dismiss}>
            Close
          </button>
        </div>
      )}
      {preview && (
        <>
          <dl className="opp-facts">
            <div>
              <dt>Closes</dt>
              <dd>{formatWhen(preview.closes_at)}</dd>
            </div>
            <div>
              <dt>Link valid until</dt>
              <dd>{formatWhen(preview.expires_at)}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>
                {preview.accepted_by_you
                  ? 'Already accepted by you'
                  : preview.state === 'pending'
                    ? 'Waiting for your answer'
                    : preview.state === 'expired'
                      ? 'Expired'
                      : preview.state === 'revoked'
                        ? 'Withdrawn by the owner'
                        : 'Already accepted'}
              </dd>
            </div>
          </dl>
          {preview.instructions && (
            <p>
              <strong>Owner's instructions:</strong> {preview.instructions}
            </p>
          )}
          <BriefView brief={preview.brief} frozen />
          {preview.files.length > 0 && (
            <p className="opp-hint">
              Shared files ({preview.files.map((f) => f.filename).join(', ')}) can be downloaded
              after you accept.
            </p>
          )}
          <div className="opp-privacy">
            <strong>What accepting means</strong>
            <ul>
              <li>You work on your proposal privately in your own Design Studio.</li>
              <li>
                The owner sees only what you deliberately submit later, never your costs, rates or
                drafts.
              </li>
              <li>You do not join the owner's organisation and cannot see other contractors.</li>
            </ul>
          </div>
          {usable &&
            (preview.eligible_organisations.length ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  setBusy(true)
                  setError('')
                  request(
                    '/api/v1/opportunities/accept',
                    contractorOpportunitySchema,
                    sessionToken,
                    {
                      method: 'POST',
                      body: JSON.stringify({
                        ...(invitationId ? { invitation_id: invitationId } : { token: invitation }),
                        contractor_organisation_id: organisation,
                      }),
                    },
                  )
                    .then((result) => {
                      forgetOpportunityToken()
                      onAccepted(result, organisation)
                    })
                    .catch((reason) =>
                      setError(
                        reason instanceof ApiError
                          ? (EXPLAIN[reason.code] ?? reason.message)
                          : String(reason),
                      ),
                    )
                    .finally(() => setBusy(false))
                }}
              >
                <label>
                  Submit as (your organisation)
                  <select
                    value={organisation}
                    onChange={(event) => setOrganisation(event.target.value)}
                  >
                    {preview.eligible_organisations.map((org) => (
                      <option key={org.id} value={org.id}>
                        {org.name ?? org.id}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="opp-actions">
                  <button type="submit" className="button primary" disabled={busy || !organisation}>
                    {preview.accepted_by_you ? 'Open opportunity' : 'Accept invitation'}
                  </button>
                  <button type="button" onClick={dismiss}>
                    Not now
                  </button>
                </div>
              </form>
            ) : (
              <p className="opp-warn">
                You need an organisation with Design Studio access to accept. Create or join one
                first, then open the link again.
              </p>
            ))}
        </>
      )}
    </section>
  )
}
