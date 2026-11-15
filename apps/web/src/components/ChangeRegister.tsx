import { useEffect, useState } from 'react'
import { z } from 'zod'
import type { Project } from '../domain/projects'
import { request } from '../services/api'

const baseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')
const impactItem = z.object({
  item_id: z.string(),
  name: z.string(),
  change: z.enum(['added', 'removed', 'changed']),
  unit_before: z.string().nullable(),
  unit_after: z.string().nullable(),
  quantity_before: z.string().nullable(),
  quantity_after: z.string().nullable(),
  quantity_delta: z.string().nullable(),
  unit_changed: z.boolean(),
})
const impactSchema = z.object({
  status: z.enum(['no_issue', 'unchanged', 'changed']),
  message: z.string().optional(),
  issue: z
    .object({ version: z.number(), issued_at: z.string(), preferred_option: z.string() })
    .optional(),
  items: z.array(impactItem).optional(),
  price: z
    .object({
      status: z.enum(['current', 'estimate_needed', 'estimate_partial']),
      issued_total: z.string().nullable(),
      current_total: z.string().nullable(),
      delta: z.string().nullable(),
      currency: z.string().nullable(),
    })
    .optional(),
  review_needed: z.array(z.string()).optional(),
})
const changeSchema = z.object({
  key: z.string(),
  revision: z.number(),
  payload: z.object({
    requester: z.string(),
    requester_role: z.string(),
    requested_on: z.string(),
    reason: z.string(),
    original_scope: z.string(),
    proposed_additions: z.string(),
    proposed_removals: z.string(),
    time_effect: z.string(),
    state: z.enum(['prepared', 'reviewed', 'sent', 'acknowledged', 'rejected', 'withdrawn']),
    base_issue: z.object({ version: z.number() }).nullable(),
    revised_issue: z.object({ version: z.number() }).nullable(),
    impact_snapshot: impactSchema.extend({ frozen_at: z.string() }).nullable(),
    outcome: z
      .object({ external_person: z.string(), date: z.string(), note: z.string() })
      .optional(),
    history: z.array(z.object({ state: z.string(), at: z.string(), note: z.string() })),
  }),
})
const listSchema = z.object({
  items: z.array(changeSchema),
  impact: impactSchema,
  proposals: z.array(z.object({ id: z.string(), version: z.number(), issued_at: z.string() })),
})
type Change = z.infer<typeof changeSchema>
type Impact = z.infer<typeof impactSchema>
const NEXT: Record<Change['payload']['state'], Change['payload']['state'][]> = {
  prepared: ['reviewed', 'withdrawn'],
  reviewed: ['sent', 'prepared', 'withdrawn'],
  sent: ['acknowledged', 'rejected', 'withdrawn'],
  acknowledged: [],
  rejected: [],
  withdrawn: [],
}
const LABEL: Record<string, string> = {
  prepared: 'Prepared (internal)',
  reviewed: 'Reviewed internally — impact frozen',
  sent: 'Sent to client',
  acknowledged: 'Client acknowledged (with evidence)',
  rejected: 'Client rejected (with evidence)',
  withdrawn: 'Withdrawn',
}
const qty = (value: string | null, unit?: string | null) =>
  value == null
    ? '—'
    : `${Number(value).toLocaleString('en-MY', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}${unit ? ` ${unit}` : ''}`
const money = (v?: string | null, c?: string | null) =>
  v == null
    ? '—'
    : `${c ?? 'MYR'} ${Number(v).toLocaleString('en-MY', { minimumFractionDigits: 2 })}`

function ImpactView({ impact }: { impact: Impact }) {
  if (impact.status === 'no_issue') return <p>{impact.message}</p>
  return (
    <>
      <p>
        Compared with issued proposal v{impact.issue?.version} (
        {impact.issue?.preferred_option.replace('_', ' ')}):{' '}
        <strong>
          {impact.status === 'unchanged'
            ? 'no scope changes'
            : `${impact.items?.length ?? 0} item change(s)`}
        </strong>
        .
      </p>
      {(impact.items?.length ?? 0) > 0 && (
        <div className="table-scroll" tabIndex={0} role="group" aria-label="Scrollable table">
          <table className="owner-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Change</th>
                <th>Issued quantity</th>
                <th>Current quantity</th>
                <th>Difference</th>
              </tr>
            </thead>
            <tbody>
              {impact.items?.map((i) => (
                <tr key={i.item_id}>
                  <th scope="row">{i.name}</th>
                  <td>
                    {i.change}
                    {i.unit_changed ? ' (unit changed)' : ''}
                  </td>
                  <td>{qty(i.quantity_before, i.unit_before)}</td>
                  <td>{qty(i.quantity_after, i.unit_after)}</td>
                  <td>{qty(i.quantity_delta)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {impact.price && (
        <p>
          Issued selling total {money(impact.price.issued_total, impact.price.currency)};{' '}
          {impact.price.status === 'current'
            ? `current ${money(impact.price.current_total, impact.price.currency)} (difference ${money(impact.price.delta, impact.price.currency)}).`
            : impact.price.status === 'estimate_partial'
              ? 'current estimate is partial — no price difference is shown.'
              : 'no current estimate for the issued option — recalculate before reviewing price impact.'}
        </p>
      )}
      {(impact.review_needed?.length ?? 0) > 0 && (
        <ul>
          {impact.review_needed?.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
    </>
  )
}

export default function ChangeRegister({ project, token }: { project: Project; token: string }) {
  const base = `/api/v1/organisations/${project.organisation_id}/projects/${project.id}`
  const caps = project.capabilities ?? []
  const canEdit = caps.includes('edit_project') && !project.archived
  const canReview = caps.includes('issue_proposal')
  const [data, setData] = useState<z.infer<typeof listSchema> | null>(null)
  const [evidence, setEvidence] = useState<{ id: string; description: string }[]>([])
  const [reload, setReload] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const blank = {
    requester: '',
    requester_role: 'client',
    requested_on: '',
    reason: '',
    original_scope: '',
    proposed_additions: '',
    proposed_removals: '',
    time_effect: '',
  }
  const [form, setForm] = useState(blank)
  useEffect(() => {
    let active = true
    Promise.all([
      request(`${base}/change-requests`, listSchema, token),
      request(
        `${base}/evidence`,
        z.object({ items: z.array(z.object({ id: z.string(), description: z.string() })) }),
        token,
      ).catch(() => ({ items: [] })),
    ])
      .then(([list, files]) => {
        if (!active) return
        setData(list)
        setEvidence(files.items)
        setError('')
      })
      .catch(
        (reason: unknown) =>
          active && setError(reason instanceof Error ? reason.message : String(reason)),
      )
    return () => {
      active = false
    }
  }, [base, token, reload, project.revision])
  async function send(path: string, body: unknown, done: string) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await request(`${base}${path}`, z.unknown(), token, {
        method: 'POST',
        body: JSON.stringify(body),
      })
      setNotice(done)
      setReload((v) => v + 1)
      return true
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
      return false
    } finally {
      setBusy(false)
    }
  }
  async function exportCsv() {
    const response = await fetch(`${baseUrl}${base}/change-requests/export.csv`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!response.ok) return setError('Change register export is unavailable.')
    const url = URL.createObjectURL(await response.blob())
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'change-register.csv'
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return (
    <section className="paper owner-review" aria-label="Change register">
      <h2>Changed since last issue and change register</h2>
      <p className="fine-print">
        Issued proposals never change. A change request records who asked, why and the quantity and
        selling-price effect against the last issue. Client acknowledgement needs the external
        person, date and attached evidence; it is not a contract variation or payment approval.
        Issue a revised proposal deliberately, then link it here.
      </p>
      <div aria-live="polite">
        {error && (
          <p role="alert" className="notice error">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="notice">
            {notice}
          </p>
        )}
      </div>
      {!data ? (
        !error && <p role="status">Loading change register…</p>
      ) : (
        <>
          <h3>Changed since last issue</h3>
          <ImpactView impact={data.impact} />
          <h3>Change requests</h3>
          {data.items.length === 0 && <p>No change requests recorded.</p>}
          {data.items.map((c) => (
            <ChangeRow
              key={c.key}
              change={c}
              busy={busy}
              canEdit={canEdit}
              canReview={canReview}
              evidence={evidence}
              proposals={data.proposals}
              send={send}
            />
          ))}
          <div className="owner-actions">
            <button type="button" className="button secondary" onClick={() => void exportCsv()}>
              Download change register (CSV)
            </button>
            <button type="button" className="button text" onClick={() => setReload((v) => v + 1)}>
              Reload
            </button>
          </div>
          {canEdit && (
            <details>
              <summary>Record a change request</summary>
              <fieldset disabled={busy} className="owner-grid">
                <label>
                  Requested by
                  <input
                    value={form.requester}
                    onChange={(e) => {
                      const value = e.target.value
                      setForm((current) => ({ ...current, requester: value }))
                    }}
                  />
                </label>
                <label>
                  Requester role
                  <select
                    value={form.requester_role}
                    onChange={(e) => {
                      const value = e.target.value
                      setForm((current) => ({ ...current, requester_role: value }))
                    }}
                  >
                    <option value="client">Client</option>
                    <option value="contractor">Contractor</option>
                    <option value="site_condition">Site condition</option>
                    <option value="other">Other</option>
                  </select>
                </label>
                <label>
                  Requested on
                  <input
                    type="date"
                    value={form.requested_on}
                    onChange={(e) => {
                      const value = e.target.value
                      setForm((current) => ({ ...current, requested_on: value }))
                    }}
                  />
                </label>
                <label className="wide">
                  Reason
                  <textarea
                    value={form.reason}
                    onChange={(e) => {
                      const value = e.target.value
                      setForm((current) => ({ ...current, reason: value }))
                    }}
                  />
                </label>
                <label className="wide">
                  Original scope (as issued)
                  <textarea
                    value={form.original_scope}
                    onChange={(e) => {
                      const value = e.target.value
                      setForm((current) => ({ ...current, original_scope: value }))
                    }}
                  />
                </label>
                <label>
                  Proposed additions
                  <textarea
                    value={form.proposed_additions}
                    onChange={(e) => {
                      const value = e.target.value
                      setForm((current) => ({ ...current, proposed_additions: value }))
                    }}
                  />
                </label>
                <label>
                  Proposed removals
                  <textarea
                    value={form.proposed_removals}
                    onChange={(e) => {
                      const value = e.target.value
                      setForm((current) => ({ ...current, proposed_removals: value }))
                    }}
                  />
                </label>
                <label className="wide">
                  Time effect (stated assumption)
                  <input
                    value={form.time_effect}
                    onChange={(e) => {
                      const value = e.target.value
                      setForm((current) => ({ ...current, time_effect: value }))
                    }}
                  />
                </label>
                <button
                  type="button"
                  className="button primary"
                  onClick={() =>
                    void send(
                      '/change-requests',
                      form,
                      'Change request recorded as prepared (internal).',
                    ).then((ok) => ok && setForm(blank))
                  }
                >
                  Record change request
                </button>
              </fieldset>
            </details>
          )}
        </>
      )}
    </section>
  )
}

function ChangeRow({
  change,
  busy,
  canEdit,
  canReview,
  evidence,
  proposals,
  send,
}: {
  change: Change
  busy: boolean
  canEdit: boolean
  canReview: boolean
  evidence: { id: string; description: string }[]
  proposals: { id: string; version: number }[]
  send: (path: string, body: unknown, done: string) => Promise<boolean>
}) {
  const p = change.payload
  const [next, setNext] = useState('')
  const [note, setNote] = useState('')
  const [method, setMethod] = useState('')
  const [person, setPerson] = useState('')
  const [outcomeDate, setOutcomeDate] = useState('')
  const [files, setFiles] = useState<string[]>([])
  const [link, setLink] = useState('')
  const [open, setOpen] = useState(false)
  const options = NEXT[p.state].filter((s) => (s === 'reviewed' ? canReview : canEdit))
  const later = proposals.filter((x) => !p.base_issue || x.version > p.base_issue.version)
  return (
    <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        [{LABEL[p.state]}] {p.requested_on} — {p.requester}: {p.reason.slice(0, 80)}
        {p.revised_issue ? ` · revised issue v${p.revised_issue.version}` : ''}
      </summary>
      <dl className="owner-grid">
        <div>
          <dt>Base issue</dt>
          <dd>{p.base_issue ? `v${p.base_issue.version}` : 'None issued'}</dd>
        </div>
        <div>
          <dt>Additions</dt>
          <dd>{p.proposed_additions || '—'}</dd>
        </div>
        <div>
          <dt>Removals</dt>
          <dd>{p.proposed_removals || '—'}</dd>
        </div>
        <div>
          <dt>Time effect</dt>
          <dd>{p.time_effect || '—'}</dd>
        </div>
        {p.outcome && (
          <div className="wide">
            <dt>Client outcome</dt>
            <dd>
              {p.outcome.external_person}, {p.outcome.date}. {p.outcome.note}
            </dd>
          </div>
        )}
      </dl>
      {p.impact_snapshot && (
        <div className="notice">
          <strong>
            Impact frozen at internal review (
            {p.impact_snapshot.frozen_at.slice(0, 16).replace('T', ' ')} UTC)
          </strong>
          <ImpactView impact={p.impact_snapshot} />
        </div>
      )}
      <ol className="fine-print">
        {p.history.map((h, i) => (
          <li key={i}>
            {h.at.slice(0, 16).replace('T', ' ')} UTC — {h.state}: {h.note}
          </li>
        ))}
      </ol>
      {options.length > 0 && (
        <fieldset disabled={busy} className="owner-grid">
          <legend>Move this change request</legend>
          <label>
            New state
            <select value={next} onChange={(e) => setNext(e.target.value)}>
              <option value="">Choose…</option>
              {options.map((s) => (
                <option key={s} value={s}>
                  {LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="wide">
            Note (required)
            <input value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          {next === 'sent' && (
            <label>
              Sent by (method)
              <input value={method} onChange={(e) => setMethod(e.target.value)} />
            </label>
          )}
          {(next === 'acknowledged' || next === 'rejected') && (
            <>
              <label>
                External person
                <input value={person} onChange={(e) => setPerson(e.target.value)} />
              </label>
              <label>
                Outcome date
                <input
                  type="date"
                  value={outcomeDate}
                  onChange={(e) => setOutcomeDate(e.target.value)}
                />
              </label>
              <fieldset className="wide">
                <legend>Attached evidence (upload in project evidence first)</legend>
                {evidence.length === 0 && <p>No project evidence available.</p>}
                {evidence.map((f) => (
                  <label key={f.id} className="inline">
                    <input
                      type="checkbox"
                      checked={files.includes(f.id)}
                      onChange={(e) =>
                        setFiles(
                          e.target.checked ? [...files, f.id] : files.filter((x) => x !== f.id),
                        )
                      }
                    />
                    {f.description}
                  </label>
                ))}
              </fieldset>
            </>
          )}
          <button
            type="button"
            className="button primary"
            disabled={!next}
            onClick={() =>
              void send(
                `/change-requests/${change.key}/transition`,
                {
                  expected_revision: change.revision,
                  state: next,
                  note,
                  sent_method: method,
                  external_person: person,
                  outcome_date: outcomeDate || null,
                  evidence_ids: files,
                },
                `Change request moved to ${LABEL[next] ?? next}.`,
              ).then((ok) => {
                if (ok) {
                  setNext('')
                  setNote('')
                  setMethod('')
                  setPerson('')
                  setOutcomeDate('')
                  setFiles([])
                }
              })
            }
          >
            Record state change
          </button>
        </fieldset>
      )}
      {canReview && !p.revised_issue && ['reviewed', 'sent', 'acknowledged'].includes(p.state) && (
        <fieldset disabled={busy} className="owner-grid">
          <legend>Link the revised proposal issue</legend>
          <label>
            Revised proposal
            <select value={link} onChange={(e) => setLink(e.target.value)}>
              <option value="">Choose…</option>
              {later.map((x) => (
                <option key={x.id} value={x.id}>
                  Proposal v{x.version}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="button secondary"
            disabled={!link}
            onClick={() =>
              void send(
                `/change-requests/${change.key}/revised-issue`,
                { expected_revision: change.revision, proposal_id: link },
                'Revised issue linked.',
              )
            }
          >
            Link revised issue
          </button>
          {later.length === 0 && (
            <p className="fine-print wide">Issue a revised proposal from the output panel first.</p>
          )}
        </fieldset>
      )}
    </details>
  )
}
