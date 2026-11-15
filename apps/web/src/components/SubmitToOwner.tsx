import { useCallback, useEffect, useRef, useState } from 'react'
import { Send } from 'lucide-react'
import { z } from 'zod'
import type { Project } from '../domain/projects'
import { ApiError, request } from '../services/api'
import { downloadAuthorised } from '../services/download'
import {
  attachmentListSchema,
  attachmentSchema,
  contractorOpportunityListSchema,
  currentSubmissionId,
  eligibleProposalListSchema,
  formatWhen,
  packagePreviewSchema,
  receiptSchema,
  submissionLabel,
  type Attachment,
  type ContractorOpportunity,
  type PackagePreview,
  type Receipt,
} from '../domain/opportunities'
import { PackageView } from './OpportunityInvitations'
import './opportunities.css'

type Eligible = {
  artifact_id: string
  version: number | null
  issued_at: string | null
  preferred_option: string | null
  valid_until: string | null
  pdf_retained: boolean
  previously_submitted: boolean
}

/**
 * Proposal step, contractor side: deliberately submit an issued proposal to the owner who
 * invited this project. Separate from Issue: issuing locks a version; submitting sends one.
 */
export default function SubmitToOwner({
  project,
  token,
  refresh,
}: {
  project: Project
  token: string | undefined
  refresh: number
}) {
  const base = `/api/v1/organisations/${project.organisation_id}/opportunities`
  const [items, setItems] = useState<ContractorOpportunity[]>([])
  const load = useCallback(async () => {
    if (!token || !project.organisation_capabilities?.includes('studio')) return
    try {
      const result = await request(
        `${base}?project_id=${project.id}`,
        contractorOpportunityListSchema,
        token,
      )
      setItems(result.items)
    } catch {
      setItems([])
    }
  }, [base, project.id, project.organisation_capabilities, token])
  const allowed = Boolean(token && project.organisation_capabilities?.includes('studio'))
  useEffect(() => {
    if (!allowed) return
    let alive = true
    request(`${base}?project_id=${project.id}`, contractorOpportunityListSchema, token).then(
      (result) => alive && setItems(result.items),
      () => alive && setItems([]),
    )
    return () => {
      alive = false
    }
  }, [allowed, base, project.id, token, refresh])
  if (!token || items.length === 0) return null
  return (
    <>
      {items.map((item) => (
        <SubmitPanel
          key={item.id}
          item={item}
          path={`${base}/${item.id}`}
          token={token}
          canSubmit={Boolean(project.capabilities?.includes('issue_proposal'))}
          onChanged={load}
        />
      ))}
    </>
  )
}

function SubmitPanel({
  item,
  path,
  token,
  canSubmit,
  onChanged,
}: {
  item: ContractorOpportunity
  path: string
  token: string
  canSubmit: boolean
  onChanged: () => Promise<void>
}) {
  const [eligible, setEligible] = useState<Eligible[]>([])
  const [artifact, setArtifact] = useState('')
  const [preview, setPreview] = useState<PackagePreview | null>(null)
  const [reason, setReason] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [status, setStatus] = useState<
    { tone: 'working' | 'error' | 'info'; text: string } | { tone: 'done'; receipt: Receipt } | null
  >(null)
  const [withdrawReason, setWithdrawReason] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [chosen, setChosen] = useState<string[]>([])
  const [file, setFile] = useState<File | null>(null)
  const [fileNote, setFileNote] = useState('')
  const [attachVersion, setAttachVersion] = useState(0)
  useEffect(() => {
    let alive = true
    request(`${path}/attachments`, attachmentListSchema, token).then(
      (result) => {
        if (!alive) return
        setAttachments(result.items)
        // New, unsubmitted documents are included by default; the sender can untick them.
        setChosen(result.items.filter((entry) => !entry.submitted).map((entry) => entry.id))
      },
      () => alive && setAttachments([]),
    )
    return () => {
      alive = false
    }
  }, [path, token, attachVersion, item.packages.length])
  const staged = attachments.filter((entry) => !entry.submitted)
  const key = useRef<{ artifact: string; key: string } | null>(null)
  const statusRef = useRef<HTMLDivElement>(null)
  const latest = currentSubmissionId(item.packages)

  useEffect(() => {
    void request(`${path}/eligible-proposals`, eligibleProposalListSchema, token).then(
      (result) => {
        setEligible(result.items)
        setArtifact(
          (current) =>
            current ||
            result.items.find((entry) => entry.pdf_retained && !entry.previously_submitted)
              ?.artifact_id ||
            '',
        )
      },
      () => setEligible([]),
    )
  }, [path, token, item.packages.length])
  useEffect(() => {
    if (status && status.tone !== 'working') statusRef.current?.focus()
  }, [status])

  const closed = item.closed || item.state !== 'accepted'
  const blocked = !preview || preview.blockers.length > 0
  const needsReason = Boolean(preview?.is_revision) && !reason.trim()

  async function loadPreview(id: string) {
    setPreview(null)
    setConfirmed(false)
    if (!id) return
    try {
      setPreview(
        await request(`${path}/package-preview`, packagePreviewSchema, token, {
          method: 'POST',
          body: JSON.stringify({ artifact_id: id, attachment_ids: chosen }),
        }),
      )
    } catch (reason) {
      setStatus({ tone: 'error', text: reason instanceof Error ? reason.message : String(reason) })
    }
  }

  async function submit() {
    if (!key.current || key.current.artifact !== artifact)
      key.current = { artifact, key: crypto.randomUUID() }
    setStatus({
      tone: 'working',
      text: 'Submitting… the package is not received until the server confirms it.',
    })
    try {
      const receipt = await request(`${path}/submit`, receiptSchema, token, {
        method: 'POST',
        body: JSON.stringify({
          artifact_id: artifact,
          idempotency_key: key.current.key,
          confirmed: true,
          reason,
          attachment_ids: chosen,
        }),
      })
      key.current = null
      setStatus({ tone: 'done', receipt })
      setPreview(null)
      setReason('')
      setConfirmed(false)
      await onChanged()
    } catch (reason) {
      const retryable = !(reason instanceof ApiError) || reason.status === 0 || reason.status >= 500
      setStatus({
        tone: 'error',
        text: `Not submitted. ${reason instanceof Error ? reason.message : String(reason)}${
          retryable ? ' You can retry safely: a repeat request never creates a second offer.' : ''
        }`,
      })
    }
  }

  return (
    <section className="opp opp-submit" aria-labelledby={`opp-submit-${item.id}`}>
      <header className="opp-head">
        <Send size={20} aria-hidden="true" />
        <div>
          <h3 id={`opp-submit-${item.id}`}>
            Submit to {item.owner_organisation ?? 'the owner'} · {item.project_name}
          </h3>
          <p>
            Closes {formatWhen(item.closes_at)}. Issuing locks a version; submitting sends one to
            the owner. Only the issued, client-facing proposal is sent, never your costs, rates or
            drafts.
          </p>
        </div>
      </header>
      {closed ? (
        <p className="opp-warn">
          {item.state === 'revoked'
            ? 'The owner withdrew this invitation. Nothing more can be submitted.'
            : 'The closing time has passed. Nothing more can be submitted.'}
        </p>
      ) : !canSubmit ? (
        <p className="opp-warn">
          Submitting needs the "issue proposal" permission on this project. Ask a project manager.
        </p>
      ) : eligible.length === 0 ? (
        <p className="opp-hint">
          Issue a proposal in the Proposal tab first. Draft previews cannot be submitted.
        </p>
      ) : (
        <div className="opp-form">
          <fieldset>
            <legend>Issued proposal to send</legend>
            {eligible.map((entry) => (
              <label key={entry.artifact_id} className="opp-check">
                <input
                  type="radio"
                  name={`artifact-${item.id}`}
                  checked={artifact === entry.artifact_id}
                  disabled={!entry.pdf_retained}
                  onChange={() => {
                    setArtifact(entry.artifact_id)
                    setPreview(null)
                  }}
                />
                Version {entry.version} · issued{' '}
                {entry.issued_at ? formatWhen(entry.issued_at) : '—'} ·{' '}
                {entry.preferred_option === 'option_b' ? 'Option B' : 'Option A'}
                {!entry.pdf_retained && ' · PDF not stored yet'}
                {entry.previously_submitted && ' · already submitted'}
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend>Supporting documents (optional)</legend>
            <p className="opp-hint">
              For example insurance certificates or a method statement. PDF, XLSX or JSON, up to 10
              MiB each, at most 5. They are shared only when you submit.
            </p>
            {staged.map((entry) => (
              <label key={entry.id} className="opp-check">
                <input
                  type="checkbox"
                  checked={chosen.includes(entry.id)}
                  onChange={(event) => {
                    setPreview(null)
                    setChosen((current) =>
                      event.target.checked
                        ? [...current, entry.id]
                        : current.filter((value) => value !== entry.id),
                    )
                  }}
                />
                {entry.filename} · {entry.description}
                <button
                  type="button"
                  className="price-link"
                  onClick={() =>
                    void request(`${path}/attachments/${entry.id}`, z.unknown(), token, {
                      method: 'DELETE',
                    }).then(() => {
                      setPreview(null)
                      setAttachVersion((value) => value + 1)
                    })
                  }
                >
                  Remove
                </button>
              </label>
            ))}
            <div className="opp-upload">
              <label>
                Document
                <input type="file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
              </label>
              <label>
                What it is
                <input
                  value={fileNote}
                  maxLength={500}
                  onChange={(event) => setFileNote(event.target.value)}
                />
              </label>
              <button
                type="button"
                disabled={!file || !fileNote.trim() || staged.length >= 5}
                onClick={() => {
                  if (!file) return
                  const body = new FormData()
                  body.append('file', file)
                  body.append('description', fileNote)
                  void request(`${path}/attachments`, attachmentSchema, token, {
                    method: 'POST',
                    body,
                  }).then(
                    () => {
                      setFile(null)
                      setFileNote('')
                      setPreview(null)
                      setAttachVersion((value) => value + 1)
                    },
                    (reason) =>
                      setStatus({
                        tone: 'error',
                        text: reason instanceof Error ? reason.message : String(reason),
                      }),
                  )
                }}
              >
                Add document
              </button>
            </div>
          </fieldset>
          <button type="button" disabled={!artifact} onClick={() => void loadPreview(artifact)}>
            Preview what the owner will receive
          </button>
          {preview && (
            <div className="opp-preview" role="region" aria-label="Outgoing package preview">
              <dl className="opp-facts">
                <div>
                  <dt>To</dt>
                  <dd>
                    {preview.recipient.owner_organisation} · {preview.recipient.project_name}
                  </dd>
                </div>
                <div>
                  <dt>From</dt>
                  <dd>{preview.contractor_organisation}</dd>
                </div>
                <div>
                  <dt>Type</dt>
                  <dd>{preview.is_revision ? 'Revised submission' : 'First submission'}</dd>
                </div>
              </dl>
              {preview.blockers.length > 0 && (
                <div className="opp-alert" role="alert">
                  <strong>You cannot submit yet:</strong>
                  <ul>
                    {preview.blockers.map((text) => (
                      <li key={text}>{text}</li>
                    ))}
                  </ul>
                </div>
              )}
              {preview.warnings.length > 0 && (
                <ul className="opp-warn">
                  {preview.warnings.map((text) => (
                    <li key={text}>{text}</li>
                  ))}
                </ul>
              )}
              {preview.package && (
                <PackageView pkg={preview.package} onClose={() => setPreview(null)} />
              )}
              {preview.package && (
                <p className="opp-hint">
                  Included documents: the issued proposal PDF (exact stored copy), this package
                  summary
                  {chosen.length > 0 &&
                    ` and ${chosen.length} supporting document${chosen.length === 1 ? '' : 's'}`}
                  . Brief received at basis revision{' '}
                  {String(
                    (preview.package.opportunity as { basis_revision?: number } | undefined)
                      ?.basis_revision ?? '—',
                  )}
                  .
                </p>
              )}
              {preview.is_revision && (
                <label>
                  What changed in this revision? (shown to the owner)
                  <textarea
                    maxLength={2000}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                  />
                </label>
              )}
              <label className="opp-check">
                <input
                  type="checkbox"
                  checked={confirmed}
                  disabled={blocked}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />
                I am authorised to submit this offer on behalf of {preview.contractor_organisation}.
              </label>
              <button
                type="button"
                className="button primary"
                disabled={blocked || !confirmed || needsReason || status?.tone === 'working'}
                onClick={() => void submit()}
              >
                {status?.tone === 'working' ? 'Submitting…' : 'Submit to organisation'}
              </button>
              {needsReason && (
                <small className="opp-hint">Describe the change to submit a revision.</small>
              )}
            </div>
          )}
        </div>
      )}
      {status && (
        <div
          ref={statusRef}
          tabIndex={-1}
          role={status.tone === 'error' ? 'alert' : 'status'}
          className={`issue-status is-${status.tone}`}
        >
          {status.tone === 'done' ? (
            <>
              <p>
                <strong>Received.</strong> Receipt {status.receipt.receipt_id} · recorded{' '}
                {formatWhen(status.receipt.received_at)} for {status.receipt.owner_organisation} ·
                submission version {status.receipt.version}.
              </p>
              <p>{status.receipt.statement}</p>
            </>
          ) : (
            <p>{status.text}</p>
          )}
        </div>
      )}
      {item.packages.length > 0 && (
        <div className="opp-packages">
          <strong>Submission history</strong>
          <ul>
            {item.packages.map((p) => (
              <li key={p.id}>
                <span className={`opp-badge ${p.id === latest ? 'is-accepted' : 'is-muted'}`}>
                  {submissionLabel(p, latest)}
                </span>{' '}
                {p.receipt_id} · {formatWhen(p.received_at)}
                {p.issued_version != null && ` · issued v${p.issued_version}`}
                {p.reason && ` · ${p.reason}`}
                {p.kind === 'submission' && (
                  <button
                    type="button"
                    className="price-link"
                    onClick={() =>
                      void downloadAuthorised(
                        `${path}/packages/${p.version}/files/pdf`,
                        token,
                        `${p.receipt_id}.pdf`,
                      )
                    }
                  >
                    Download submitted PDF
                  </button>
                )}
              </li>
            ))}
          </ul>
          {latest && !closed && canSubmit && (
            <details>
              <summary>Withdraw the current submission</summary>
              <label>
                Reason (shown to the owner)
                <textarea
                  maxLength={2000}
                  value={withdrawReason}
                  onChange={(event) => setWithdrawReason(event.target.value)}
                />
              </label>
              <button
                type="button"
                disabled={!withdrawReason.trim()}
                onClick={() => {
                  if (
                    !window.confirm('Withdraw your current submission? The owner keeps the record.')
                  )
                    return
                  void request(`${path}/withdraw`, receiptSchema, token, {
                    method: 'POST',
                    body: JSON.stringify({
                      idempotency_key: crypto.randomUUID(),
                      confirmed: true,
                      reason: withdrawReason,
                    }),
                  }).then(
                    async () => {
                      setWithdrawReason('')
                      setStatus({
                        tone: 'info',
                        text: 'Withdrawal recorded. The owner keeps your earlier receipts and sees the withdrawal.',
                      })
                      await onChanged()
                    },
                    (reason) =>
                      setStatus({
                        tone: 'error',
                        text: reason instanceof Error ? reason.message : String(reason),
                      }),
                  )
                }}
              >
                Withdraw submission
              </button>
            </details>
          )}
        </div>
      )}
    </section>
  )
}
