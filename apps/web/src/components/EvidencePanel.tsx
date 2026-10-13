import { useEffect, useRef, useState, type FormEvent } from 'react'
import { z } from 'zod'
import type { Project } from '../domain/projects'
import type { WorkspaceData } from '../domain/workspace'
import { request } from '../services/api'
import { Button } from './ui/button'
const evidenceSchema = z.object({
  archived: z.boolean().default(false),
  created_by: z.string().optional(),
  updated_by: z.string().optional(),
  updated_at: z.string().optional(),
  id: z.uuid(),
  description: z.string(),
  source_note: z.string(),
  content_type: z.string(),
  size_bytes: z.number(),
  sha256: z.string(),
  created_at: z.string(),
  revision: z.number(),
  observations: z.string(),
  target_ids: z.array(z.uuid()),
})
const listSchema = z.object({ items: z.array(evidenceSchema), limit: z.number() })
type Evidence = z.infer<typeof evidenceSchema>
export default function EvidencePanel({
  project,
  token,
  targets,
  onDirty,
}: {
  project: Project
  token?: string
  targets: WorkspaceData['targets']
  onDirty: (dirty: boolean) => void
}) {
  const [items, setItems] = useState<Evidence[]>([])
  const [archived, setArchived] = useState(false)
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [refresh, setRefresh] = useState(0)
  const [editing, setEditing] = useState<string | null>(null),
    [changed, setChanged] = useState(false)
  const [photos, setPhotos] = useState<Record<string, string>>({})
  const urls = useRef(new Set<string>()),
    mounted = useRef(true)
  const endpoint = `/api/v1/organisations/${project.organisation_id}/projects/${project.id}/evidence`
  useEffect(() => {
    mounted.current = true
    const owned = urls.current
    return () => {
      mounted.current = false
      owned.forEach((url) => URL.revokeObjectURL(url))
      owned.clear()
    }
  }, [])
  useEffect(() => {
    let active = true
    request(`${endpoint}?archived=${archived}`, listSchema, token)
      .then((result) => {
        if (active) {
          setItems(result.items)
          setError('')
        }
      })
      .catch((reason) => {
        if (active) setError(reason.message)
      })
    return () => {
      active = false
    }
  }, [endpoint, token, refresh, archived])
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    setBusy(true)
    setError('')
    try {
      const saved = await request(endpoint, evidenceSchema, token, {
        method: 'POST',
        body: new FormData(form),
      })
      if (mounted.current) {
        setItems((previous) => [saved, ...previous])
        form.reset()
      }
    } catch (reason) {
      if (mounted.current) setError(reason instanceof Error ? reason.message : 'Upload failed.')
    } finally {
      if (mounted.current) setBusy(false)
    }
  }
  async function content(item: Evidence, preview: boolean) {
    setBusy(true)
    setError('')
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_BASE_URL ?? ''}${endpoint}/${item.id}/content`,
        { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000) },
      )
      if (!response.ok)
        throw new Error('Private photo unavailable or access denied. Check your session and retry.')
      const blob = await response.blob()
      if (!mounted.current) return
      const url = URL.createObjectURL(blob)
      urls.current.add(url)
      if (preview) setPhotos((previous) => ({ ...previous, [item.id]: url }))
      else {
        const link = document.createElement('a')
        link.href = url
        link.download = `evidence-${item.id}.jpg`
        link.click()
      }
    } catch (reason) {
      if (mounted.current) setError(reason instanceof Error ? reason.message : 'Photo unavailable.')
    } finally {
      if (mounted.current) setBusy(false)
    }
  }
  async function save(event: FormEvent<HTMLFormElement>, item: Evidence) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setBusy(true)
    setError('')
    try {
      const saved = await request(`${endpoint}/${item.id}`, evidenceSchema, token, {
        method: 'PATCH',
        body: JSON.stringify({
          expected_revision: item.revision,
          description: form.get('description'),
          source_note: form.get('source_note'),
          observations: form.get('observations'),
          target_ids: form.getAll('target_ids'),
        }),
      })
      setItems((previous) => previous.map((value) => (value.id === saved.id ? saved : value)))
      setEditing(null)
      setChanged(false)
      onDirty(false)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Save failed; your notes are preserved.')
    } finally {
      setBusy(false)
    }
  }
  function discard() {
    if (changed && !window.confirm('Discard unsaved evidence notes?')) return false
    setChanged(false)
    onDirty(false)
    return true
  }
  async function toggleArchive(item: Evidence) {
    if (
      !discard() ||
      !window.confirm(
        item.archived
          ? 'Restore this photograph?'
          : 'Remove this photograph from active evidence? Its private bytes are retained for recovery; this does not erase backups.',
      )
    )
      return
    setBusy(true)
    setError('')
    try {
      await request(`${endpoint}/${item.id}/archive`, evidenceSchema, token, {
        method: 'PATCH',
        body: JSON.stringify({ expected_revision: item.revision, archived: !item.archived }),
      })
      setEditing(null)
      setPhotos((previous) => {
        const next = { ...previous }
        if (next[item.id]) {
          URL.revokeObjectURL(next[item.id])
          urls.current.delete(next[item.id])
          delete next[item.id]
        }
        return next
      })
      setRefresh((value) => value + 1)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Removal failed; reload and retry.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <details className="my-6 rounded-lg border border-stone-300 p-4">
      <summary>Private site evidence</summary>
      <p>
        PNG/JPEG photos up to 10 MiB and 16 million pixels. Photos are re-encoded to remove embedded
        EXIF/GPS metadata. Record date, location and permissions explicitly.
      </p>
      {error && <p role="alert">{error}</p>}
      {busy && <p role="status">Saving or loading private evidence...</p>}
      <label>
        <input
          type="checkbox"
          checked={archived}
          disabled={busy}
          onChange={(event) => {
            if (discard()) {
              setEditing(null)
              setArchived(event.target.checked)
            }
          }}
        />{' '}
        Show removed photographs
      </label>
      <p>
        Removal is reversible. Removed photographs cannot be downloaded or selected for a new
        output. Permanent erasure follows an operator-reviewed retention request.
      </p>
      <Button
        type="button"
        variant="outline"
        disabled={busy}
        onClick={() => {
          if (discard()) {
            setEditing(null)
            setRefresh((value) => value + 1)
          }
        }}
      >
        Reload evidence
      </Button>
      <form onSubmit={(event) => void upload(event)} className="grid gap-3 my-4">
        <fieldset disabled={busy || project.archived || Boolean(editing) || archived}>
          <label>
            Photo
            <input name="photo" type="file" accept="image/png,image/jpeg" required />
          </label>
          <label>
            Photo description
            <input name="description" maxLength={2000} required />
          </label>
          <label>
            Source, date and permission note
            <input name="source_note" maxLength={2000} required />
          </label>
          <label>
            <input name="rights_confirmed" type="checkbox" value="true" required /> I have
            permission to store and use this photo.
          </label>
          <Button>Upload private photo</Button>
        </fieldset>
      </form>
      <div className="grid gap-4 md:grid-cols-2">
        {items.map((item) => (
          <article key={item.id} className="rounded border border-stone-300 p-3">
            <h3>{item.description}</h3>
            <p>{item.source_note}</p>
            <p>
              {item.created_at} / revision {item.revision}
              {item.updated_at && ` / Updated ${item.updated_at} by ${item.updated_by}`}
            </p>
            {!item.archived &&
              (photos[item.id] ? (
                <img
                  src={photos[item.id]}
                  alt={item.description}
                  className="max-h-80 w-full object-contain"
                />
              ) : (
                <Button variant="outline" disabled={busy} onClick={() => void content(item, true)}>
                  Preview photo {item.description}
                </Button>
              ))}
            <p className="whitespace-pre-wrap">{item.observations}</p>
            <p>
              Linked targets:{' '}
              {item.target_ids
                .map(
                  (id) => targets.find((target) => target.id === id)?.name ?? 'Unavailable target',
                )
                .join(', ') || 'None'}
            </p>
            <Button
              variant="outline"
              disabled={busy || item.archived}
              onClick={() => void content(item, false)}
            >
              Download photo {item.description}
            </Button>
            <Button
              variant="outline"
              disabled={busy || project.archived || item.archived}
              onClick={() => {
                if (discard()) setEditing(item.id)
              }}
            >
              Edit evidence {item.description}
            </Button>
            <Button
              variant="outline"
              disabled={busy || project.archived}
              onClick={() => void toggleArchive(item)}
            >
              {item.archived ? 'Restore photo' : 'Remove photo'} {item.description}
            </Button>
            {editing === item.id && (
              <form
                onSubmit={(event) => void save(event, item)}
                onChange={() => {
                  setChanged(true)
                  onDirty(true)
                }}
              >
                <fieldset disabled={busy}>
                  <label>
                    Edit photo description
                    <input
                      name="description"
                      defaultValue={item.description}
                      required
                      maxLength={2000}
                    />
                  </label>
                  <label>
                    Edit photo source
                    <input
                      name="source_note"
                      defaultValue={item.source_note}
                      required
                      maxLength={2000}
                    />
                  </label>
                  <label>
                    Site observations
                    <textarea
                      name="observations"
                      defaultValue={item.observations}
                      maxLength={8000}
                    />
                  </label>
                  <fieldset>
                    <legend>Link saved target zones</legend>
                    {targets.map((target) => (
                      <label key={target.id}>
                        <input
                          type="checkbox"
                          name="target_ids"
                          value={target.id}
                          defaultChecked={item.target_ids.includes(target.id)}
                        />
                        {target.name}
                      </label>
                    ))}
                  </fieldset>
                  <Button>Save evidence notes</Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      if (discard()) setEditing(null)
                    }}
                  >
                    Cancel evidence edit
                  </Button>
                </fieldset>
              </form>
            )}
          </article>
        ))}
      </div>
    </details>
  )
}
