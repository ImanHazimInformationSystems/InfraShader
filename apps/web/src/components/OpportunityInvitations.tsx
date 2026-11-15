import { useCallback, useEffect, useRef, useState } from 'react'
import { Copy, FileText, Inbox, Link2, Trash2 } from 'lucide-react'
import type { Project } from '../domain/projects'
import { request } from '../services/api'
import { downloadAuthorised } from '../services/download'
import {
  briefPreviewSchema,
  currentSubmissionId,
  FIELD_LABEL,
  formatWhen,
  invitationLink,
  invitationMailto,
  ownerInvitationListSchema,
  ownerInvitationSchema,
  ownerPackageSchema,
  sharedFileSchema,
  STATE_LABEL,
  submissionLabel,
  type OwnerInvitation,
  type SharedBrief,
} from '../domain/opportunities'
import { z } from 'zod'
import './opportunities.css'

const FIELDS = [
  'problem',
  'intended_users',
  'desired_outcome',
  'use_periods',
  'site',
  'criteria',
] as const
const optionName = (value: string) => (value === 'option_b' ? 'Option B' : 'Option A')
const message = (reason: unknown) =>
  reason instanceof Error ? reason.message : 'Something went wrong. Reload and retry.'

/** Owner side of S03/L25/O05: invite contractors to submit to this review project. */
export default function OpportunityInvitations({
  project,
  token,
}: {
  project: Project
  token: string
}) {
  const base = `/api/v1/organisations/${project.organisation_id}/projects/${project.id}`
  const [items, setItems] = useState<OwnerInvitation[] | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [issuedLink, setIssuedLink] = useState<{
    id: string
    link: string
    email: string
  } | null>(null)
  const [closesFuture, setClosesFuture] = useState(false)
  const linkRef = useRef<HTMLDivElement>(null)
  // The new link appears above the card that issued it: bring it into view so it is not missed.
  useEffect(() => {
    if (issuedLink) {
      linkRef.current?.scrollIntoView({ block: 'center' })
      linkRef.current?.focus()
    }
  }, [issuedLink])
  const [form, setForm] = useState({
    email: '',
    closes: '',
    instructions: '',
    fields: ['problem', 'site'] as string[],
  })

  const load = useCallback(async () => {
    try {
      const result = await request(`${base}/opportunities`, ownerInvitationListSchema, token)
      setItems(result.items)
      setError('')
    } catch (reason) {
      setError(message(reason))
    }
  }, [base, token])
  useEffect(() => {
    let alive = true
    request(`${base}/opportunities`, ownerInvitationListSchema, token).then(
      (result) => alive && setItems(result.items),
      (reason) => alive && setError(message(reason)),
    )
    return () => {
      alive = false
    }
  }, [base, token])

  async function act(action: () => Promise<unknown>, done?: string) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await action()
      await load()
      if (done) setNotice(done)
    } catch (reason) {
      setError(message(reason))
    } finally {
      setBusy(false)
    }
  }

  const closesValid = form.closes !== '' && closesFuture

  return (
    <section className="opp" aria-labelledby="opp-owner-heading">
      <header className="opp-head">
        <Inbox size={20} aria-hidden="true" />
        <div>
          <h2 id="opp-owner-heading">Invite contractors to submit</h2>
          <p>
            Each invited contractor organisation submits its own issued proposal to this review
            project. Their offers appear in the received offers list below. Inviting never gives
            them access to this project, other offers or your evaluation.
          </p>
        </div>
      </header>
      {error && (
        <p className="opp-alert" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="opp-ok" role="status">
          {notice}
        </p>
      )}
      {issuedLink && (
        <div className="opp-link" role="status" ref={linkRef} tabIndex={-1}>
          <strong>Invitation link (shown once)</strong>
          <p>
            Copy it and send it to the contractor yourself. InfraShader does not email it. Anyone
            using it must sign in with the invited email address. The contractor will also see this
            invitation under Invited opportunities when signed in, even without the link. If you
            lose the link, use "Issue a new link".
          </p>
          <code>{issuedLink.link}</code>
          <div className="opp-actions">
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(issuedLink.link)
                setNotice('Invitation link copied.')
              }}
            >
              <Copy size={15} aria-hidden="true" /> Copy link
            </button>
            <a
              className="opp-mail"
              href={invitationMailto(issuedLink.email, project.name, issuedLink.link)}
            >
              Open in my email app
            </a>
            <button type="button" onClick={() => setIssuedLink(null)}>
              Done
            </button>
          </div>
        </div>
      )}

      <details className="opp-new">
        <summary>New invitation</summary>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void act(
              () =>
                request(`${base}/opportunities`, ownerInvitationSchema, token, {
                  method: 'POST',
                  body: JSON.stringify({
                    recipient_email: form.email,
                    closes_at: new Date(form.closes).toISOString(),
                    instructions: form.instructions,
                    shared_fields: form.fields,
                  }),
                }),
              'Draft saved. Review what will be shared, add files, then issue the link.',
            )
          }}
        >
          <label>
            Contractor's account email
            <input
              type="email"
              required
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
            />
          </label>
          <label>
            Closing date and time (your local time)
            <input
              type="datetime-local"
              required
              value={form.closes}
              onChange={(event) => {
                setForm({ ...form, closes: event.target.value })
                setClosesFuture(new Date(event.target.value).getTime() > Date.now())
              }}
            />
          </label>
          {form.closes && !closesValid && (
            <small className="opp-warn">Choose a closing time in the future.</small>
          )}
          <label>
            Submission instructions
            <textarea
              maxLength={4000}
              value={form.instructions}
              onChange={(event) => setForm({ ...form, instructions: event.target.value })}
            />
          </label>
          <fieldset>
            <legend>Also share from this project</legend>
            <p className="opp-hint">
              The comparison basis title, scope items, requirements, tax basis and deadline are
              always shared. Budget, reviewers, approval policy and scores are never shared.
              Evaluation criteria are shared only if you tick them (names and weights, no scores).
            </p>
            {FIELDS.map((field) => (
              <label key={field} className="opp-check">
                <input
                  type="checkbox"
                  checked={form.fields.includes(field)}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      fields: event.target.checked
                        ? [...form.fields, field]
                        : form.fields.filter((value) => value !== field),
                    })
                  }
                />
                {FIELD_LABEL[field]}
              </label>
            ))}
          </fieldset>
          <button type="submit" className="button primary" disabled={busy || !closesValid}>
            Save draft invitation
          </button>
        </form>
      </details>

      {items === null ? (
        <p role="status">Loading invitations…</p>
      ) : items.length === 0 ? (
        <p className="opp-empty">No invitations yet.</p>
      ) : (
        <ul className="opp-list">
          {items.map((item) => (
            <InvitationCard
              key={item.id}
              item={item}
              base={base}
              token={token}
              busy={busy}
              act={act}
              onIssued={(link) => setIssuedLink({ id: item.id, link, email: item.recipient_email })}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

function InvitationCard({
  item,
  base,
  token,
  busy,
  act,
  onIssued,
}: {
  item: OwnerInvitation
  base: string
  token: string
  busy: boolean
  act: (action: () => Promise<unknown>, done?: string) => Promise<void>
  onIssued: (link: string) => void
}) {
  const [brief, setBrief] = useState<{ frozen: boolean; brief: SharedBrief } | null>(null)
  const [description, setDescription] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [viewing, setViewing] = useState<Record<string, unknown> | null>(null)
  const latest = currentSubmissionId(item.packages)
  const path = `${base}/opportunities/${item.id}`
  return (
    <li className="opp-card" aria-label={`Invitation to ${item.recipient_email}`}>
      <div className="opp-card-top">
        <strong>{item.contractor_organisation ?? item.recipient_email}</strong>
        <span className={`opp-badge is-${item.state}`}>{STATE_LABEL[item.state]}</span>
      </div>
      <p className="opp-meta">
        {item.recipient_email} · closes {formatWhen(item.closes_at)}
        {item.closed && ' (closed)'}
      </p>
      {item.basis_changed && (
        <p className="opp-warn">
          Your comparison basis changed after this invitation (shared revision {item.basis_revision}
          , now {item.current_basis_revision}). The contractor still has the brief it originally
          received.
        </p>
      )}
      <div className="opp-actions">
        <button
          type="button"
          onClick={() =>
            void request(`${path}/brief`, briefPreviewSchema, token).then(setBrief, () =>
              setBrief(null),
            )
          }
        >
          <FileText size={15} aria-hidden="true" />{' '}
          {item.state === 'draft' ? 'Preview what will be shared' : 'Shared brief'}
        </button>
        {item.state === 'draft' && (
          <button
            type="button"
            className="button primary"
            disabled={busy || item.closed}
            onClick={() => {
              if (
                !window.confirm(
                  `Issue a single-use invitation link for ${item.recipient_email}? The brief and files are frozen when issued.`,
                )
              )
                return
              void act(async () => {
                const issued = await request(`${path}/issue`, ownerInvitationSchema, token, {
                  method: 'POST',
                  body: JSON.stringify({ expected_revision: item.revision }),
                })
                if (issued.token) onIssued(invitationLink(issued.token))
              }, 'Invitation issued.')
            }}
          >
            <Link2 size={15} aria-hidden="true" /> Issue invitation link
          </button>
        )}
        {(item.state === 'pending' || item.state === 'expired') && !item.closed && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (
                !window.confirm(
                  'Issue a new link? The previous link stops working. The brief the contractor sees does not change.',
                )
              )
                return
              void act(async () => {
                const issued = await request(`${path}/reissue`, ownerInvitationSchema, token, {
                  method: 'POST',
                  body: JSON.stringify({ expected_revision: item.revision }),
                })
                if (issued.token) onIssued(invitationLink(issued.token))
              }, 'New invitation link issued.')
            }}
          >
            <Link2 size={15} aria-hidden="true" /> Issue a new link
          </button>
        )}
        {(item.state === 'draft' ||
          item.state === 'pending' ||
          item.state === 'accepted' ||
          item.state === 'expired') && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              const text =
                item.state === 'draft'
                  ? 'Discard this draft invitation?'
                  : 'Revoke this invitation? The contractor can no longer submit. Anything already received is kept.'
              if (!window.confirm(text)) return
              void act(
                () =>
                  request(`${path}/revoke`, z.unknown(), token, {
                    method: 'POST',
                    body: JSON.stringify({ expected_revision: item.revision }),
                  }),
                item.state === 'draft' ? 'Draft discarded.' : 'Invitation revoked.',
              )
            }}
          >
            <Trash2 size={15} aria-hidden="true" />{' '}
            {item.state === 'draft' ? 'Discard draft' : 'Revoke'}
          </button>
        )}
      </div>

      {brief && <BriefView brief={brief.brief} frozen={brief.frozen} />}

      <div className="opp-files">
        <strong>Shared files</strong>
        {item.files.length === 0 ? (
          <p className="opp-hint">No files shared.</p>
        ) : (
          <ul>
            {item.files.map((f) => (
              <li key={f.id}>
                {f.filename} · {f.description} · {(f.size_bytes / 1024).toFixed(0)} KB
                {item.state === 'draft' && (
                  <button
                    type="button"
                    className="price-link"
                    onClick={() =>
                      void act(
                        () =>
                          request(`${path}/files/${f.id}`, z.unknown(), token, {
                            method: 'DELETE',
                          }),
                        'File removed.',
                      )
                    }
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {item.state === 'draft' && (
          <div className="opp-upload">
            <label>
              File to share (PDF, XLSX or JSON, up to 10 MiB)
              <input type="file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
            </label>
            <label>
              What it is
              <input value={description} onChange={(event) => setDescription(event.target.value)} />
            </label>
            <button
              type="button"
              disabled={busy || !file || !description.trim()}
              onClick={() => {
                if (!file) return
                const body = new FormData()
                body.append('file', file)
                body.append('description', description)
                void act(
                  () => request(`${path}/files`, sharedFileSchema, token, { method: 'POST', body }),
                  'File added to the draft.',
                )
              }}
            >
              Add file
            </button>
          </div>
        )}
      </div>

      {item.packages.length > 0 && (
        <div className="opp-packages">
          <strong>Received from this contractor</strong>
          <ul>
            {item.packages.map((p) => (
              <li key={p.id}>
                <span className={`opp-badge ${p.id === latest ? 'is-accepted' : 'is-muted'}`}>
                  {submissionLabel(p, latest)}
                </span>{' '}
                Receipt {p.receipt_id} · {formatWhen(p.received_at)}
                {p.issued_version != null && ` · issued proposal v${p.issued_version}`}
                {p.preferred_option && ` · ${optionName(p.preferred_option)}`}
                {p.reason && ` · ${p.reason}`}
                {p.kind === 'submission' && (
                  <span className="opp-actions">
                    <button
                      type="button"
                      onClick={() =>
                        void request(
                          `${path}/packages/${p.version}`,
                          ownerPackageSchema,
                          token,
                        ).then((result) => setViewing(result.package))
                      }
                    >
                      View package
                    </button>
                    {p.pdf_file_id && (
                      <button
                        type="button"
                        onClick={() =>
                          void downloadAuthorised(
                            `${base}/owner-review/files/${p.pdf_file_id}`,
                            token,
                            `proposal-${p.receipt_id}.pdf`,
                          )
                        }
                      >
                        Download PDF
                      </button>
                    )}
                  </span>
                )}
              </li>
            ))}
          </ul>
          <p className="opp-hint">
            Received is not accepted. Confirm the values and map the scope in the offer below before
            scoring; contractor figures are their own declarations.
          </p>
        </div>
      )}
      {viewing && <PackageView pkg={viewing} onClose={() => setViewing(null)} />}
    </li>
  )
}

export function BriefView({ brief, frozen }: { brief: SharedBrief; frozen: boolean }) {
  const basis = (brief.basis ?? {}) as Record<string, unknown>
  const scope =
    (basis.scope_items as {
      code: string
      description: string
      unit: string
      quantity?: string | null
    }[]) ?? []
  const requirements =
    (basis.requirements as { code: string; text: string; mandatory: boolean }[]) ?? []
  const criteria = brief.criteria as
    | { status: string; items: { code: string; name: string; weight: string; direction: string }[] }
    | undefined
  return (
    <div className="opp-brief" aria-label="Shared brief">
      <p className="opp-hint">
        {frozen
          ? `Frozen at basis revision ${brief.basis_revision}. This is exactly what the contractor received.`
          : 'Draft preview: this is exactly what will be shared when you issue the link.'}
      </p>
      <dl>
        <dt>Owner</dt>
        <dd>{brief.owner_organisation ?? '—'}</dd>
        <dt>Project</dt>
        <dd>{brief.project_name}</dd>
        <dt>Title</dt>
        <dd>{String(basis.title ?? '—')}</dd>
        <dt>Tax basis</dt>
        <dd>{String(basis.tax_basis ?? '—')}</dd>
        {(['problem', 'intended_users', 'desired_outcome', 'use_periods'] as const).map((key) =>
          brief[key] !== undefined ? (
            <div key={key}>
              <dt>{FIELD_LABEL[key]}</dt>
              <dd>{brief[key] || 'Not recorded'}</dd>
            </div>
          ) : null,
        )}
        <dt>Site location</dt>
        <dd>{brief.site ? 'Shared (map outline)' : 'Not shared'}</dd>
      </dl>
      {criteria && (
        <>
          <strong>
            Evaluation criteria{' '}
            {criteria.status === 'locked' ? '(locked)' : '(draft, may still change)'}
          </strong>
          {criteria.items.length ? (
            <ul>
              {criteria.items.map((item) => (
                <li key={item.code}>
                  {item.name} · weight {item.weight}% ·{' '}
                  {item.direction === 'lower_better' ? 'lower is better' : 'higher is better'}
                </li>
              ))}
            </ul>
          ) : (
            <p className="opp-hint">No criteria set yet.</p>
          )}
        </>
      )}
      <strong>Scope items</strong>
      <ul>
        {scope.map((item) => (
          <li key={item.code}>
            {item.code} · {item.description} · {item.quantity ?? '—'} {item.unit}
          </li>
        ))}
      </ul>
      {requirements.length > 0 && (
        <>
          <strong>Requirements</strong>
          <ul>
            {requirements.map((item) => (
              <li key={item.code}>
                {item.code} · {item.text} {item.mandatory ? '(mandatory)' : '(optional)'}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

export function PackageView({
  pkg,
  onClose,
}: {
  pkg: Record<string, unknown>
  onClose: () => void
}) {
  const proposal = (pkg.proposal ?? {}) as Record<string, unknown>
  const scope = (pkg.scope as { id: string; name: string; quantity: string; unit: string }[]) ?? []
  return (
    <div className="opp-package" role="region" aria-label="Submitted package">
      <div className="opp-card-top">
        <strong>
          {String(proposal.title ?? 'Proposal')} · issued v{String(proposal.issued_version ?? '?')}
        </strong>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
      <p className="opp-hint">{String(pkg.statement ?? '')}</p>
      <dl>
        <dt>Contractor</dt>
        <dd>{String(pkg.contractor_organisation ?? '—')}</dd>
        <dt>Option</dt>
        <dd>{String(proposal.preferred_option ?? '—')}</dd>
        <dt>Quoted total</dt>
        <dd>
          {String(proposal.currency ?? '')} {String(proposal.selling_total ?? '—')}
        </dd>
        <dt>Valid until</dt>
        <dd>{String(proposal.valid_until ?? '—')}</dd>
        <dt>Assumptions</dt>
        <dd>{String(proposal.assumptions ?? '—')}</dd>
        <dt>Exclusions</dt>
        <dd>{String(proposal.exclusions ?? '—')}</dd>
        <dt>Programme</dt>
        <dd>{String(proposal.programme ?? '—')}</dd>
      </dl>
      <strong>Scope ({scope.length} items)</strong>
      <ul>
        {scope.slice(0, 30).map((item) => (
          <li key={item.id}>
            {item.name} · {item.quantity} {item.unit}
          </li>
        ))}
      </ul>
    </div>
  )
}
