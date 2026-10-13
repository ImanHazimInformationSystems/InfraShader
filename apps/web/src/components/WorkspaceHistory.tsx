import { useEffect, useState } from 'react'
import { z } from 'zod'
import { workspaceSchema, workspaceDataSchema, type SavedWorkspace } from '../domain/workspace'
import { request } from '../services/api'
import { Button } from './ui/button'

const schema = z.object({
  items: z.array(
    z.object({
      revision: z.number(),
      created_at: z.string(),
      changed_by: z.string(),
      data: workspaceDataSchema,
    }),
  ),
  offset: z.number(),
  limit: z.number(),
})
export default function WorkspaceHistory({
  endpoint,
  token,
  revision,
  blocked,
  onRestore,
}: {
  endpoint: string
  token?: string
  revision: number
  blocked: boolean
  onRestore: (saved: SavedWorkspace) => void
}) {
  const [history, setHistory] = useState<z.infer<typeof schema> | null>(null)
  const [offset, setOffset] = useState(0)
  const [retry, setRetry] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    request(`${endpoint}/history?offset=${offset}`, schema, token)
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
  }, [endpoint, token, revision, offset, retry])
  async function restore(value: number) {
    if (
      !window.confirm(
        `Restore workspace revision ${value} as a new revision? Existing calculations and reviews will become stale.`,
      )
    )
      return
    setBusy(true)
    setError('')
    try {
      onRestore(
        await request(
          `${endpoint}/history/${value}/restore?expected_revision=${revision}`,
          workspaceSchema,
          token,
          { method: 'POST' },
        ),
      )
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Restoration failed.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <details className="my-4 rounded border border-stone-300 p-4">
      <summary>Workspace history and restore</summary>
      <p>
        Restoration revalidates geometry and recalculates quantities against the current project.
        History starts with the saved revision present when history support was installed.
      </p>
      {error && <p role="alert">{error}</p>}
      <Button variant="outline" onClick={() => setRetry((value) => value + 1)}>
        Reload workspace history
      </Button>
      {history?.items.map((item) => (
        <article className="my-3 border-t border-stone-300 p-3" key={item.revision}>
          <h3>Saved workspace revision {item.revision}</h3>
          <p>
            {item.created_at} / {item.changed_by}
          </p>
          <p>
            {item.data.targets.length} targets.{' '}
            {Object.values(item.data.scenarios)
              .map((option) => `${option.name}: ${option.items.length} items`)
              .join('; ')}
            .
          </p>
          <Button
            variant="outline"
            disabled={blocked || busy || item.revision === revision}
            onClick={() => void restore(item.revision)}
          >
            Restore workspace revision {item.revision}
          </Button>
        </article>
      ))}
      <Button
        variant="outline"
        disabled={!offset || busy}
        onClick={() => setOffset((value) => Math.max(0, value - 20))}
      >
        Newer workspace revisions
      </Button>
      <Button
        variant="outline"
        disabled={history?.items.length !== 20 || busy}
        onClick={() => setOffset((value) => value + 20)}
      >
        Older workspace revisions
      </Button>
    </details>
  )
}
