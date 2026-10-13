import { useEffect, useState } from 'react'
import { z } from 'zod'
import { projectSchema, type Project } from '../domain/projects'
import { request } from '../services/api'
import { Button } from './ui/button'
const historySchema = z.object({
  items: z.array(
    z.object({
      revision: z.number(),
      changed_by: z.string(),
      created_at: z.string(),
      project: projectSchema,
    }),
  ),
  offset: z.number(),
  limit: z.number(),
})
export default function ProjectHistory({
  project,
  token,
  dirty,
  onRestore,
}: {
  project: Project
  token?: string
  dirty: boolean
  onRestore: (project: Project) => void
}) {
  const [history, setHistory] = useState<z.infer<typeof historySchema> | null>(null)
  const [offset, setOffset] = useState(0)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [retry, setRetry] = useState(0)
  const endpoint = `/api/v1/organisations/${project.organisation_id}/projects/${project.id}/history`
  useEffect(() => {
    let active = true
    request(`${endpoint}?offset=${offset}`, historySchema, token)
      .then((value) => {
        if (active) {
          setHistory(value)
          setError('')
        }
      })
      .catch((reason) => {
        if (active) setError(reason.message)
      })
    return () => {
      active = false
    }
  }, [endpoint, token, project.revision, offset, retry])
  async function restore(revision: number) {
    if (
      !window.confirm(
        `Restore brief revision ${revision} as a new revision? Current calculations and reviews will become stale.`,
      )
    )
      return
    setBusy(true)
    setError('')
    try {
      onRestore(
        await request(
          `${endpoint}/${revision}/restore?expected_revision=${project.revision}`,
          projectSchema,
          token,
          { method: 'POST' },
        ),
      )
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Restore failed.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <details className="my-5 rounded border border-stone-300 p-4">
      <summary>Project brief history</summary>
      <p>
        Restoration creates a new revision. Saved geometry and issued documents remain unchanged.
        History begins with the revision present when history support was installed.
      </p>
      {error && <p role="alert">{error}</p>}
      <Button variant="outline" onClick={() => setRetry((value) => value + 1)}>
        Reload brief history
      </Button>
      {history?.items.map((item) => (
        <article key={item.revision} className="my-3 border-t border-stone-300 p-3">
          <h3>
            Brief revision {item.revision}: {item.project.name}
          </h3>
          <p>
            {item.created_at} / {item.changed_by}
          </p>
          <p>{item.project.problem}</p>
          <p>
            {item.project.details?.project_type} / Budget:{' '}
            {item.project.details?.budget ?? 'Not specified'} {item.project.currency}
          </p>
          <p>Priorities: {item.project.details?.priorities}</p>
          <p>Constraints: {item.project.details?.constraints}</p>
          {item.project.details?.stakeholders.map((person, index) => (
            <p key={index}>
              {person.name} / {person.role}: {person.needs}
            </p>
          ))}
          <Button
            disabled={busy || dirty || item.revision === project.revision}
            onClick={() => void restore(item.revision)}
          >
            Restore brief revision {item.revision}
          </Button>
        </article>
      ))}
      <Button
        variant="outline"
        disabled={!offset || busy}
        onClick={() => setOffset((value) => Math.max(0, value - 50))}
      >
        Newer brief revisions
      </Button>
      <Button
        variant="outline"
        disabled={history?.items.length !== 50 || busy}
        onClick={() => setOffset((value) => value + 50)}
      >
        Older brief revisions
      </Button>
    </details>
  )
}
