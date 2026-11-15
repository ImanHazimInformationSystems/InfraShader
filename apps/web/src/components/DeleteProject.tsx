import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import type { Project } from '../domain/projects'
import { request } from '../services/api'
import { DemoStore } from '../services/demo'
import './delete-project.css'

const eligibilitySchema = z.object({
  allowed: z.boolean(),
  reason: z.string().nullable(),
  revision: z.number(),
})
const deletionSchema = z.object({ deleted: z.literal(true), pending_files: z.number() })

export default function DeleteProject({
  project,
  token,
  demo,
  onDeleted,
}: {
  project: Project
  token?: string
  demo: boolean
  onDeleted: (pending: number) => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [opened, setOpened] = useState(false)
  const [eligibility, setEligibility] = useState<z.infer<typeof eligibilitySchema> | null>(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const endpoint = `/api/v1/organisations/${project.organisation_id}/projects/${project.id}`
  useEffect(() => {
    if (!opened) return
    let active = true
    dialog.current?.showModal()
    if (!demo)
      request(`${endpoint}/deletion`, eligibilitySchema, token)
        .then((value) => {
          if (active) setEligibility(value)
        })
        .catch((reason) => {
          if (active) setError(reason.message)
        })
    return () => {
      active = false
    }
  }, [opened, demo, endpoint, token])
  const close = () => {
    if (!busy) {
      dialog.current?.close()
      setOpened(false)
    }
  }
  async function remove() {
    if (name !== project.name || (!demo && !eligibility?.allowed)) return
    setBusy(true)
    setError('')
    try {
      let pending = 0
      if (demo) {
        new DemoStore().delete(project.id, project.revision, name)
        localStorage.removeItem(`infrashader.demo.workspace.v1.${project.id}`)
      } else {
        const result = await request(endpoint, deletionSchema, token, {
          method: 'DELETE',
          signal: AbortSignal.timeout(90000),
          body: JSON.stringify({
            expected_revision: eligibility!.revision,
            confirmation_name: name,
          }),
        })
        pending = result.pending_files
      }
      dialog.current?.close()
      onDeleted(pending)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Deletion failed. Reload and try again.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <button
        type="button"
        className="button text full"
        style={{ color: '#a22236' }}
        onClick={() => {
          setName('')
          setError('')
          setEligibility(null)
          setOpened(true)
        }}
      >
        Delete project
      </button>
      <dialog
        ref={dialog}
        className="delete-project-dialog"
        aria-labelledby="delete-project-title"
        onCancel={(event) => {
          if (busy) event.preventDefault()
          else setOpened(false)
        }}
      >
        <h2 id="delete-project-title">Delete this project permanently?</h2>
        <p>
          <strong>{project.name}</strong>
        </p>
        <p>
          This removes this project and its saved design, estimates, evidence and draft history for
          everyone with access. It cannot be undone. Shared saved rates and other projects are kept.
        </p>
        <p>
          Projects with issued documents or formal review records must be archived to retain their
          history.
        </p>
        {error && <p role="alert">{error}</p>}
        {!demo && !eligibility && !error && (
          <p role="status">Checking whether this project can be deleted…</p>
        )}
        {eligibility?.reason && <p role="status">{eligibility.reason}</p>}
        {(demo || eligibility?.allowed) && (
          <label className="field">
            Type the project name to confirm
            <input
              autoComplete="off"
              value={name}
              disabled={busy}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
        )}
        <button type="button" className="button secondary" disabled={busy} onClick={close}>
          Cancel
        </button>
        <button
          type="button"
          className="button primary"
          disabled={busy || name !== project.name || (!demo && !eligibility?.allowed)}
          onClick={() => void remove()}
        >
          {busy ? 'Deleting…' : 'Delete permanently'}
        </button>
      </dialog>
    </>
  )
}

const pendingSchema = z.object({
  items: z.array(z.object({ id: z.string(), pending_files: z.number() })),
})
export function DeletedProjectFiles({ org, token }: { org: string; token: string }) {
  const [items, setItems] = useState<z.infer<typeof pendingSchema>['items']>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const endpoint = `/api/v1/organisations/${org}/project-deletions`
  useEffect(() => {
    let active = true
    request(endpoint, pendingSchema, token)
      .then((result) => {
        if (active) setItems(result.items)
      })
      .catch(() => {
        /* The project list stays usable if cleanup status is temporarily offline. */
      })
    return () => {
      active = false
    }
  }, [endpoint, token])
  if (!items.length) return null
  return (
    <section className="notice" aria-label="Deleted project file cleanup">
      <strong>Deleted projects: uploaded-file cleanup pending</strong>
      <p>
        The projects are deleted. {items.reduce((sum, item) => sum + item.pending_files, 0)} private
        uploaded file(s) still need removal from storage.
      </p>
      {error && <p role="alert">{error}</p>}
      <button
        type="button"
        className="button secondary"
        disabled={busy}
        onClick={() => {
          setBusy(true)
          setError('')
          void (async () => {
            try {
              for (const item of items)
                await request(
                  `${endpoint}/${item.id}/retry`,
                  z.object({ pending_files: z.number() }),
                  token,
                  { method: 'POST', signal: AbortSignal.timeout(90000) },
                )
              const result = await request(endpoint, pendingSchema, token)
              setItems(result.items)
              if (result.items.length)
                setError(
                  'Storage cleanup is still unavailable. Retry when local Storage is running.',
                )
            } catch {
              setError('Could not retry file cleanup. Check the connection and try again.')
            } finally {
              setBusy(false)
            }
          })()
        }}
      >
        {busy ? 'Removing files…' : 'Retry file cleanup'}
      </button>
    </section>
  )
}
