import { useEffect, useRef, useState, type FormEvent } from 'react'
import { z } from 'zod'
import type { Project } from '../domain/projects'
import type { Artifact } from '../domain/calculations'
import { request } from '../services/api'
import { Button } from './ui/button'

const reviewSchema = z.object({
  id: z.uuid(),
  created_at: z.string(),
  stale: z.boolean(),
  workspace_revision: z.number(),
  project_revision: z.number(),
  payload: z.object({
    revision: z.number(),
    reviewer_id: z.uuid(),
    preferred_option: z.enum(['option_a', 'option_b']),
    status: z.enum(['draft', 'needs_information', 'reviewed']),
    criteria: z.array(z.string()),
    notes: z.string(),
    analysis_id: z.uuid().nullable(),
    estimate_ids: z.array(z.uuid()),
  }),
})
const listSchema = z.object({ items: z.array(reviewSchema), limit: z.number() })
type Review = z.infer<typeof reviewSchema>
type Props = {
  project: Project
  token?: string
  revision: number
  dirty: boolean
  artifacts: Artifact[]
  onDirty: (dirty: boolean) => void
}

export default function ReviewPanel({
  project,
  token,
  revision,
  dirty,
  artifacts,
  onDirty,
}: Props) {
  const endpoint = `/api/v1/organisations/${project.organisation_id}/projects/${project.id}/reviews`
  const [history, setHistory] = useState<Review[]>([])
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [criteria, setCriteria] = useState('')
  const [notes, setNotes] = useState('')
  const [option, setOption] = useState('option_a')
  const [status, setStatus] = useState('draft')
  const pending = useRef<{ fingerprint: string; key: string } | null>(null)
  useEffect(() => {
    let active = true
    request(endpoint, listSchema, token)
      .then((result) => {
        if (active) {
          setHistory(result.items)
          setLoaded(true)
        }
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : 'History unavailable.')
      })
    return () => {
      active = false
    }
  }, [endpoint, token, revision, project.revision])
  const current = artifacts.filter(
    (item) =>
      !dirty &&
      !item.stale &&
      item.workspace_revision === revision &&
      item.project_revision === project.revision,
  )
  const analysis = current.find((item) => item.kind === 'analysis')
  const estimates = (['option_a', 'option_b'] as const).map((key) =>
    current.find((item) => item.kind === 'estimate' && item.payload.scenario === key),
  )
  async function reload() {
    setBusy(true)
    setError('')
    try {
      const result = await request(endpoint, listSchema, token)
      setHistory(result.items)
      setLoaded(true)
      setNotice('History reloaded; your entered notes are preserved.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'History unavailable.')
    } finally {
      setBusy(false)
    }
  }
  async function save(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    const input = {
      expected_review_revision: Math.max(0, ...history.map((item) => item.payload.revision)),
      expected_workspace_revision: revision,
      expected_project_revision: project.revision,
      preferred_option: option,
      status,
      criteria: criteria
        .split('\n')
        .map((value) => value.trim())
        .filter(Boolean),
      notes: notes.trim(),
      analysis_id: analysis?.id ?? null,
      estimate_ids: estimates.flatMap((item) => (item ? [item.id] : [])),
    }
    const fingerprint = JSON.stringify(input)
    if (pending.current?.fingerprint !== fingerprint)
      pending.current = { fingerprint, key: crypto.randomUUID() }
    try {
      const saved = await request(endpoint, reviewSchema, token, {
        method: 'POST',
        body: JSON.stringify({ ...input, request_key: pending.current.key }),
      })
      setHistory((previous) =>
        [saved, ...previous.filter((item) => item.id !== saved.id)].slice(0, 100),
      )
      pending.current = null
      onDirty(false)
      setNotice(`Review revision ${saved.payload.revision} saved.`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Review could not be saved.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <section
      aria-label="Option comparison and review"
      className="my-6 rounded-lg border border-stone-300 p-4"
    >
      <h3>Compare saved options</h3>
      <p>
        Same saved workspace and analysis time. Missing or stale results are unavailable; modeled
        shade is not field validation.
      </p>
      {analysis?.kind === 'analysis' && (
        <p>
          Analysis time: {analysis.payload.timestamp}. Target: {analysis.payload.target_id}. State:{' '}
          {analysis.payload.status}.
        </p>
      )}
      <div className="grid gap-3 md:grid-cols-3">
        {(['baseline', 'option_a', 'option_b'] as const).map((key) => {
          const shade =
            analysis?.kind === 'analysis' && analysis.payload.status === 'modeled'
              ? analysis.payload.scenarios[key]
              : undefined
          const estimate = estimates.find(
            (item) => item?.kind === 'estimate' && item.payload.scenario === key,
          )
          return (
            <article key={key} className="rounded border border-stone-300 p-3">
              <h4>
                {key === 'baseline' ? 'Baseline' : key === 'option_a' ? 'Option A' : 'Option B'}
              </h4>
              <p>
                {shade
                  ? `${shade.coverage_percent.toFixed(1)}% modeled target coverage`
                  : 'Shade comparison unavailable'}
              </p>
              <p>
                {estimate?.kind === 'estimate'
                  ? `${estimate.payload.complete ? 'Total' : 'Incomplete subtotal'}: MYR ${estimate.payload.selling_total}`
                  : 'Estimate unavailable'}
              </p>
            </article>
          )
        })}
      </div>
      <h3>Save an option review</h3>
      <p>
        Reviews are saved independently of issued documents. Reviewed records are internal notes,
        not external approval.
      </p>
      <form
        onSubmit={save}
        onChange={() => {
          onDirty(true)
          setNotice('')
        }}
      >
        <label>
          Review preferred option
          <select
            value={option}
            onChange={(event) => setOption(event.target.value)}
            disabled={busy}
          >
            <option value="option_a">Option A</option>
            <option value="option_b">Option B</option>
          </select>
        </label>
        <label>
          Review status
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            disabled={busy}
          >
            <option value="draft">Draft</option>
            <option value="needs_information">Needs information</option>
            <option value="reviewed">Reviewed</option>
          </select>
        </label>
        <label>
          Decision criteria (one per line)
          <textarea
            required
            maxLength={10000}
            value={criteria}
            disabled={busy}
            onChange={(event) => setCriteria(event.target.value)}
          />
        </label>
        <label>
          Review notes
          <textarea
            required
            maxLength={8000}
            value={notes}
            disabled={busy}
            onChange={(event) => setNotes(event.target.value)}
          />
        </label>
        <Button type="submit" disabled={busy || dirty || revision < 1 || !loaded}>
          Save review
        </Button>
        {dirty && <p>Save workspace changes before saving a review.</p>}
      </form>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <h3>Saved review history</h3>
      <Button type="button" variant="outline" disabled={busy} onClick={() => void reload()}>
        Reload review history
      </Button>
      <p>Latest 100 records. Earlier revisions remain immutable in storage.</p>
      {history.map((item) => (
        <article key={item.id} className="my-3 rounded border border-stone-300 p-3">
          <strong>
            Review {item.payload.revision}: {item.payload.status.replaceAll('_', ' ')} /{' '}
            {item.payload.preferred_option.replace('_', ' ')}
          </strong>
          <p>
            {item.stale || dirty ? 'Stale inputs' : 'Current saved inputs'}; workspace{' '}
            {item.workspace_revision}; brief {item.project_revision}
          </p>
          <p>
            {item.created_at} / reviewer {item.payload.reviewer_id}
          </p>
          <ul>
            {item.payload.criteria.map((value, index) => (
              <li key={index}>{value}</li>
            ))}
          </ul>
          <p className="whitespace-pre-wrap">{item.payload.notes}</p>
          <p>
            Analysis: {item.payload.analysis_id ?? 'None'}; estimates:{' '}
            {item.payload.estimate_ids.length}
          </p>
        </article>
      ))}
    </section>
  )
}
