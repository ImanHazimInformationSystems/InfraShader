import { useCallback, useEffect, useState } from 'react'
import { ArrowRight, Download, Inbox } from 'lucide-react'
import { z } from 'zod'
import type { Project } from '../domain/projects'
import { request } from '../services/api'
import { downloadAuthorised } from '../services/download'
import {
  contractorOpportunityListSchema,
  contractorOpportunitySchema,
  currentSubmissionId,
  linkableListSchema,
  pendingInvitationListSchema,
  formatWhen,
  submissionLabel,
  type ContractorOpportunity,
} from '../domain/opportunities'
import { BriefView } from './OpportunityInvitations'
import './opportunities.css'

const message = (reason: unknown) =>
  reason instanceof Error ? reason.message : 'Something went wrong. Reload and retry.'

/** Design Studio list of accepted invitations from owner organisations (L25). */
export default function StudioOpportunities({
  organisationId,
  token,
  projects,
  onOpenProject,
  onReview,
  refresh = 0,
}: {
  organisationId: string
  token: string
  projects: Project[]
  onOpenProject: (projectId: string, submit?: boolean) => void
  onReview?: (invitationId: string) => void
  refresh?: number
}) {
  const base = `/api/v1/organisations/${organisationId}/opportunities`
  const [items, setItems] = useState<ContractorOpportunity[] | null>(null)
  const [pending, setPending] = useState<
    {
      id: string
      owner_organisation: string | null
      project_name: string | null
      closes_at: string
    }[]
  >([])
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    try {
      setItems((await request(base, contractorOpportunityListSchema, token)).items)
      setError('')
    } catch (reason) {
      setError(message(reason))
    }
  }, [base, token])
  useEffect(() => {
    let alive = true
    request(base, contractorOpportunityListSchema, token).then(
      (result) => alive && setItems(result.items),
      (reason) => alive && setError(message(reason)),
    )
    // Invitations addressed to this verified account; no link is needed to see or open them.
    request('/api/v1/opportunities/pending', pendingInvitationListSchema, token).then(
      (result) => alive && setPending(result.items),
      () => alive && setPending([]),
    )
    return () => {
      alive = false
    }
  }, [base, token, refresh])
  if (items !== null && items.length === 0 && pending.length === 0 && !error) return null
  return (
    <section className="opp" aria-labelledby="opp-studio-heading">
      <header className="opp-head">
        <Inbox size={20} aria-hidden="true" />
        <div>
          <h2 id="opp-studio-heading">Invited opportunities</h2>
          <p>
            Owners who invited you to submit a proposal. Prepare it privately in a linked project,
            issue it, then submit it from the project's Proposal step.
          </p>
        </div>
      </header>
      {error && (
        <p className="opp-alert" role="alert">
          {error}
        </p>
      )}
      {pending.length > 0 && (
        <div className="opp-pending" role="status" aria-label="Invitations waiting for you">
          <strong>
            {pending.length === 1
              ? 'You have 1 invitation waiting'
              : `You have ${pending.length} invitations waiting`}
          </strong>
          <ul>
            {pending.map((entry) => (
              <li key={entry.id}>
                {entry.owner_organisation} · {entry.project_name} · closes{' '}
                {formatWhen(entry.closes_at)}{' '}
                <button
                  type="button"
                  className="button primary"
                  onClick={() => onReview?.(entry.id)}
                >
                  Review invitation
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {items === null ? (
        <p role="status">Loading opportunities…</p>
      ) : (
        <ul className="opp-list">
          {items.map((item) => (
            <OpportunityCard
              key={item.id}
              item={item}
              base={base}
              token={token}
              projects={projects}
              onOpenProject={onOpenProject}
              onChanged={load}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

function OpportunityCard({
  item,
  base,
  token,
  projects,
  onOpenProject,
  onChanged,
}: {
  item: ContractorOpportunity
  base: string
  token: string
  projects: Project[]
  onOpenProject: (projectId: string, submit?: boolean) => void
  onChanged: () => Promise<void>
}) {
  const [detail, setDetail] = useState<ContractorOpportunity | null>(null)
  const [choice, setChoice] = useState('')
  const [name, setName] = useState(`${item.project_name ?? 'Invited project'} proposal`)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const path = `${base}/${item.id}`
  const linked = projects.find((project) => project.id === item.linked_project_id)
  // The full list of projects this user may link comes from the server, not one loaded page.
  const [linkable, setLinkable] = useState<{ id: string; name: string }[] | null>(null)
  const eligible =
    linkable ??
    projects
      .filter((project) => project.purpose === 'contractor_proposal' && !project.archived)
      .map((project) => ({ id: project.id, name: project.name }))
  useEffect(() => {
    if (item.state !== 'accepted' || item.submission_count > 0) return
    let alive = true
    request(`${path}/linkable-projects`, linkableListSchema, token).then(
      (result) => alive && setLinkable(result.items),
      () => alive && setLinkable(null),
    )
    return () => {
      alive = false
    }
  }, [path, token, item.state, item.submission_count])
  const latest = currentSubmissionId(item.packages)
  async function act(action: () => Promise<unknown>) {
    setBusy(true)
    setError('')
    try {
      await action()
      await onChanged()
    } catch (reason) {
      setError(message(reason))
    } finally {
      setBusy(false)
    }
  }
  return (
    <li className="opp-card" aria-label={`Opportunity from ${item.owner_organisation ?? 'owner'}`}>
      <div className="opp-card-top">
        <strong>
          {item.owner_organisation} · {item.project_name}
        </strong>
        <span className={`opp-badge is-${item.closed ? 'expired' : item.state}`}>
          {item.state === 'revoked'
            ? 'Withdrawn by the owner'
            : item.closed
              ? 'Closed'
              : latest
                ? 'Submitted'
                : 'Open'}
        </span>
      </div>
      <p className="opp-meta">
        Closes {formatWhen(item.closes_at)} · {item.submission_count} submission
        {item.submission_count === 1 ? '' : 's'}
      </p>
      {item.basis_updated && (
        <p className="opp-warn">
          The owner has changed its comparison basis since inviting you. Ask the owner whether to
          resubmit against the current brief.
        </p>
      )}
      {error && (
        <p className="opp-alert" role="alert">
          {error}
        </p>
      )}
      <div className="opp-actions">
        <button
          type="button"
          onClick={() =>
            void request(path, contractorOpportunitySchema, token).then(setDetail, (reason) =>
              setError(message(reason)),
            )
          }
        >
          Open shared brief
        </button>
        {item.linked_project_id && (
          <button
            type="button"
            className={linked ? 'button primary' : undefined}
            onClick={() => onOpenProject(item.linked_project_id!)}
          >
            Open linked project <ArrowRight size={15} aria-hidden="true" />
          </button>
        )}
        {item.linked_project_id && item.state === 'accepted' && !item.closed && (
          <button type="button" onClick={() => onOpenProject(item.linked_project_id!, true)}>
            Go to Submit
          </button>
        )}
      </div>
      {item.state === 'accepted' && !item.closed && (
        <ol className="opp-next">
          <li data-done={Boolean(item.linked_project_id)}>Link or create your project</li>
          <li data-done={item.submission_count > 0}>
            Issue the proposal in its Proposal step (it stays private)
          </li>
          <li data-done={item.submission_count > 0}>
            Go to Submit, preview what the owner receives, then submit
          </li>
        </ol>
      )}
      {detail && (
        <div className="opp-detail">
          {detail.instructions && (
            <p>
              <strong>Owner's instructions:</strong> {detail.instructions}
            </p>
          )}
          {detail.brief && <BriefView brief={detail.brief} frozen />}
          {(detail.files ?? []).length > 0 && (
            <ul>
              {(detail.files ?? []).map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    className="price-link"
                    onClick={() =>
                      void downloadAuthorised(`${path}/files/${f.id}/content`, token, f.filename)
                    }
                  >
                    <Download size={14} aria-hidden="true" /> {f.filename}
                  </button>{' '}
                  · {f.description}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {item.state === 'accepted' && (
        <div className="opp-link-project">
          <strong>
            {item.linked_project_id ? 'Change linked project' : 'Prepare your proposal'}
          </strong>
          {item.submission_count > 0 ? (
            <p className="opp-hint">
              Revisions must come from the project you first submitted from.
            </p>
          ) : (
            <>
              <label>
                Link an existing Design Studio project
                <select value={choice} onChange={(event) => setChoice(event.target.value)}>
                  <option value="">Choose a project…</option>
                  {eligible.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={busy || !choice}
                onClick={() =>
                  void act(() =>
                    request(`${path}/link`, contractorOpportunitySchema, token, {
                      method: 'POST',
                      body: JSON.stringify({
                        expected_revision: item.revision,
                        project_id: choice,
                      }),
                    }),
                  )
                }
              >
                Link project
              </button>
              {!item.linked_project_id && (
                <>
                  <p className="opp-hint">
                    Or start a new project from the shared brief. Your existing projects are never
                    changed.
                  </p>
                  <label>
                    New project name
                    <input
                      value={name}
                      maxLength={160}
                      onChange={(event) => setName(event.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    className="button primary"
                    disabled={busy || !name.trim()}
                    onClick={() =>
                      void act(async () => {
                        const created = await request(
                          `${path}/project`,
                          z.object({ project: z.object({ id: z.string() }) }).passthrough(),
                          token,
                          {
                            method: 'POST',
                            body: JSON.stringify({ expected_revision: item.revision, name }),
                          },
                        )
                        onOpenProject(created.project.id)
                      })
                    }
                  >
                    Create project from brief
                  </button>
                </>
              )}
            </>
          )}
        </div>
      )}
      {item.packages.length > 0 && (
        <div className="opp-packages">
          <strong>Your receipts</strong>
          <ul>
            {item.packages.map((p) => (
              <li key={p.id}>
                <span className={`opp-badge ${p.id === latest ? 'is-accepted' : 'is-muted'}`}>
                  {submissionLabel(p, latest)}
                </span>{' '}
                {p.receipt_id} · {formatWhen(p.received_at)}
                {p.issued_version != null && ` · issued v${p.issued_version}`}
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
                    Submitted PDF
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  )
}
