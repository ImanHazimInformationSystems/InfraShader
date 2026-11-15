import { useEffect, useState } from 'react'
import { z } from 'zod'
import type { Project } from '../domain/projects'
import { checkpointHistorySchema, checkpointSchema } from '../domain/brief-checkpoint'
import { request } from '../services/api'

export default function BriefCheckpointPanel({
  project,
  token,
}: {
  project: Project
  token: string
}) {
  const [history, setHistory] = useState<z.infer<typeof checkpointHistorySchema> | null>(null)
  const [evidence, setEvidence] = useState<{ id: string; description: string }[]>([])
  const [status, setStatus] = useState<'not_confirmed' | 'acknowledged'>('not_confirmed')
  const [policy, setPolicy] = useState('draft_only')
  const [person, setPerson] = useState('')
  const [date, setDate] = useState('')
  const [method, setMethod] = useState('')
  const [note, setNote] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [offset, setOffset] = useState(0)
  const [retry, setRetry] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const base = `/api/v1/organisations/${project.organisation_id}/projects/${project.id}`
  const canEdit = project.capabilities?.includes('edit_project') && !project.archived
  useEffect(() => {
    let active = true
    Promise.all([
      request(`${base}/brief-checkpoints?offset=${offset}`, checkpointHistorySchema, token),
      request(
        `${base}/evidence`,
        z.object({ items: z.array(z.object({ id: z.string(), description: z.string() })) }),
        token,
      ),
    ])
      .then(([records, files]) => {
        if (active) {
          setHistory(records)
          setEvidence(files.items)
          setError('')
        }
      })
      .catch((reason) => {
        if (active) setError(String(reason))
      })
    return () => {
      active = false
    }
  }, [base, token, offset, retry, project.revision])
  async function record() {
    if (!history) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await request(`${base}/brief-checkpoints`, checkpointSchema, token, {
        method: 'POST',
        body: JSON.stringify({
          expected_project_revision: project.revision,
          expected_checkpoint_version: history.current.checkpoint_version,
          status,
          issue_policy: policy,
          note,
          person: status === 'acknowledged' ? person : '',
          confirmation_date: status === 'acknowledged' ? date || null : null,
          method: status === 'acknowledged' ? method : '',
          evidence_ids: status === 'acknowledged' ? selected : [],
        }),
      })
      setNotice('Checkpoint recorded as a new immutable entry. This is not a digital signature.')
      setRetry((value) => value + 1)
    } catch (reason) {
      setError(String(reason))
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="paper p-4 my-4" aria-label="Agreed brief checkpoint">
      <h2>Agreed brief checkpoint</h2>
      <p>
        Brief revision {project.revision}. Record what the client acknowledged, with their evidence.
        An internal opportunity stage or review checkbox does not establish client acceptance.
      </p>
      {history && (
        <div className="notice small">
          <strong>
            {history.current.status === 'acknowledged'
              ? 'Acknowledgement recorded'
              : 'Not confirmed'}
          </strong>
          <p>{history.current.reason}</p>
          <p>
            Unconfirmed output policy:{' '}
            {history.current.issue_policy === 'draft_only'
              ? 'Draft previews only; issuing is blocked.'
              : 'Qualified issue allowed; the output explicitly states that the brief is not confirmed.'}
          </p>
        </div>
      )}
      <p className="fine-print">
        Before a checkpoint is recorded, outputs retain the existing qualified-issue workflow and
        are labelled not confirmed. Select Draft only below to block issuing. Editing the brief
        invalidates current acknowledgement; history and earlier issued files stay unchanged.
      </p>
      <details className="my-3">
        <summary>Current scope and unresolved questions</summary>
        {history && (
          <>
            <dl>
              {(
                [
                  'deliverables',
                  'inclusions',
                  'exclusions',
                  'intended_use',
                  'unresolved_questions',
                ] as const
              ).map((key) => (
                <div key={key}>
                  <dt>{key.replaceAll('_', ' ')}</dt>
                  <dd className="whitespace-pre-wrap">
                    {history.current.scope[key] || 'Not recorded'}
                  </dd>
                </div>
              ))}
            </dl>
            <ul>
              {history.current.scope.facts.map((fact, index) => (
                <li key={index}>
                  {fact.state}: {fact.text} — {fact.source}
                </li>
              ))}
            </ul>
          </>
        )}
      </details>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <button
        type="button"
        className="button secondary"
        disabled={busy}
        onClick={() => setRetry((value) => value + 1)}
      >
        Reload brief checkpoint and evidence
      </button>
      {canEdit && (
        <details className="my-3">
          <summary>Record a brief checkpoint</summary>
          <fieldset disabled={busy || !history}>
            <label>
              Brief acknowledgement status
              <select
                aria-label="Brief acknowledgement status"
                value={status}
                onChange={(e) => setStatus(e.target.value as typeof status)}
              >
                <option value="not_confirmed">Not confirmed</option>
                <option value="acknowledged">Acknowledgement supported by evidence</option>
              </select>
            </label>
            <label>
              Unconfirmed issue policy
              <select
                aria-label="Unconfirmed issue policy"
                value={policy}
                onChange={(e) => setPolicy(e.target.value)}
              >
                <option value="draft_only">
                  Draft only — block issuing without current acknowledgement
                </option>
                <option value="qualified_issue" disabled={!project.capabilities?.includes(project.purpose === 'contractor_proposal' ? 'issue_proposal' : 'issue_developer_brief')}>
                  Allow issue with an explicit not-confirmed label
                </option>
              </select>
            </label>
            {status === 'acknowledged' && (
              <>
                <p>
                  Complete deliverables, inclusions, exclusions and intended use in Edit brief
                  first. Upload acknowledgement evidence through the project evidence panel, then
                  reload this list.
                </p>
                <label>
                  External confirming person
                  <input
                    maxLength={160}
                    value={person}
                    onChange={(e) => setPerson(e.target.value)}
                  />
                </label>
                <label>
                  Confirmation date
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </label>
                <label>
                  Confirmation method
                  <input
                    maxLength={1000}
                    value={method}
                    onChange={(e) => setMethod(e.target.value)}
                    placeholder="e.g. Client email referencing this brief"
                  />
                </label>
                <fieldset>
                  <legend>Attached acknowledgement evidence</legend>
                  {evidence.length ? (
                    evidence.map((file) => (
                      <label key={file.id}>
                        <input
                          type="checkbox"
                          checked={selected.includes(file.id)}
                          onChange={(e) =>
                            setSelected(
                              e.target.checked
                                ? [...selected, file.id]
                                : selected.filter((id) => id !== file.id),
                            )
                          }
                        />
                        {file.description}
                      </label>
                    ))
                  ) : (
                    <p>
                      No available project evidence. Upload evidence before recording
                      acknowledgement.
                    </p>
                  )}
                </fieldset>
              </>
            )}
            <label>
              Checkpoint note / outstanding work
              <textarea maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
            <button
              type="button"
              className="button primary"
              disabled={!note.trim()}
              onClick={() => void record()}
            >
              {busy ? 'Recording…' : 'Record checkpoint'}
            </button>
          </fieldset>
        </details>
      )}
      <details className="my-3">
        <summary>Brief checkpoint history</summary>
        {history?.items.map((row) => (
          <details key={row.id}>
            <summary>
              Checkpoint {row.version} · brief revision {row.brief_revision} ·{' '}
              {row.data.status.replaceAll('_', ' ')}
            </summary>
            <p>
              {row.created_at}; recorded by {row.created_by}
            </p>
            <p>
              {row.data.person} {row.data.confirmation_date} {row.data.method}
            </p>
            <p>{row.data.note}</p>
            <p>Policy: {row.data.issue_policy}</p>
            <ul>
              {row.data.evidence.map((file) => (
                <li key={file.id}>
                  {file.description} · revision {file.revision} · SHA-256 {file.sha256}
                </li>
              ))}
            </ul>
            <dl>
              {(
                [
                  'deliverables',
                  'inclusions',
                  'exclusions',
                  'intended_use',
                  'unresolved_questions',
                ] as const
              ).map((key) => (
                <div key={key}>
                  <dt>{key.replaceAll('_', ' ')}</dt>
                  <dd>{row.data.scope[key] || 'Not recorded'}</dd>
                </div>
              ))}
            </dl>
          </details>
        ))}
        <button
          type="button"
          disabled={busy || offset === 0}
          onClick={() => setOffset(Math.max(0, offset - 50))}
        >
          Newer checkpoints
        </button>
        <button
          type="button"
          disabled={busy || history?.items.length !== 50}
          onClick={() => setOffset(offset + 50)}
        >
          Older checkpoints
        </button>
      </details>
    </section>
  )
}
