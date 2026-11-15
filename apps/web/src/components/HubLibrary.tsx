import { templateSchema, type BriefTemplate } from '../domain/hub'
import { useEffect, useState } from 'react'
import { z } from 'zod'
import { request } from '../services/api'
import { clientContactSchema, type ClientContact } from '../domain/projects'

const recordSchema = z.object({
  id: z.uuid(),
  kind: z.enum(['contact', 'template']),
  data: z.record(z.string(), z.string()),
  revision: z.number(),
  archived: z.boolean(),
})
type HubRecord = z.infer<typeof recordSchema>
const listSchema = z.object({ items: z.array(recordSchema), total: z.number() })
type Props = {
  org: string
  token: string
  kind: 'contact' | 'template'
  initial?: BriefTemplate
  onContact?: (contact: ClientContact) => void
  onTemplate?: (template: BriefTemplate) => void
}
export default function HubLibrary({ org, token, kind, initial, onContact, onTemplate }: Props) {
  const empty: Record<string, string> =
    kind === 'contact'
      ? { name: '', company: '', email: '', phone: '', source: '', notes: '' }
      : {
          name: '',
          purpose: 'contractor_proposal',
          problem: '',
          intended_users: '',
          desired_outcome: '',
          use_periods: '',
          project_type: '',
          priorities: '',
          constraints: '',
        }
  const [draft, setDraft] = useState<Record<string, string>>(initial ?? empty)
  const [editing, setEditing] = useState<HubRecord | null>(null)
  const [rows, setRows] = useState<HubRecord[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [archived, setArchived] = useState(false)
  const [version, setVersion] = useState(0)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [history, setHistory] = useState<{
    name: string
    rows: HubRecord[]
    offset: number
    id: string
  } | null>(null)
  const path = `/api/v1/organisations/${org}/hub`
  useEffect(() => {
    let cancelled = false
    request(`${path}?kind=${kind}&archived=${archived}&offset=${offset}`, listSchema, token)
      .then((result) => {
        if (!cancelled) {
          setRows(result.items)
          setTotal(result.total)
          setLoading(false)
        }
      })
      .catch((reason) => {
        if (!cancelled) {
          setError(String(reason))
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [path, token, kind, archived, offset, version])
  function reload() {
    setLoading(true)
    setError('')
    setVersion((value) => value + 1)
  }
  async function readHistory(row: { id: string; name: string }, pageOffset = 0) {
    setBusy(true)
    setError('')
    try {
      const result = await request(
        `${path}/${row.id}/history?offset=${pageOffset}`,
        z.object({ items: z.array(z.object({ data: recordSchema })) }),
        token,
      )
      setHistory({ ...row, rows: result.items.map((item) => item.data), offset: pageOffset })
    } catch (reason) {
      setError(String(reason))
    } finally {
      setBusy(false)
    }
  }
  async function save(row?: HubRecord) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const target = row ?? editing
      const data = (kind === 'contact' ? clientContactSchema : templateSchema).parse(
        row?.data ?? draft,
      )
      await request(`${path}${target ? `/${target.id}` : ''}`, recordSchema, token, {
        method: target ? 'PATCH' : 'POST',
        body: JSON.stringify({
          kind,
          data,
          ...(target
            ? {
                expected_revision: target.revision,
                archived: row ? !row.archived : target.archived,
              }
            : {}),
        }),
      })
      setEditing(null)
      setDraft(empty)
      setNotice(
        row
          ? row.archived
            ? 'Record restored.'
            : 'Record archived.'
          : 'Record saved. Existing project snapshots are unchanged.',
      )
      reload()
    } catch (reason) {
      setError(
        reason instanceof z.ZodError
          ? reason.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
          : String(reason),
      )
    } finally {
      setBusy(false)
    }
  }
  const label = kind === 'contact' ? 'Contact' : 'Template'
  return (
    <section className="paper p-4" aria-label={`Personal ${kind} library`}>
      <h3>My {kind === 'contact' ? 'client contacts' : 'brief templates'}</h3>
      <p className="fine-print">
        Private to your account in this organisation.{' '}
        {kind === 'contact'
          ? 'Using a contact copies its details into the project, visible to permitted project readers.'
          : 'Templates reuse brief text only. Review client-specific text before saving. Select a new site and client when using one.'}
      </p>
      <div className="flex flex-wrap gap-2 my-3">
        <button
          type="button"
          className="button secondary"
          disabled={busy}
          onClick={() => {
            setArchived(!archived)
            setOffset(0)
            setRows([])
            setLoading(true)
          }}
        >
          {archived ? 'Show active records' : 'Show archived records'}
        </button>
        <button type="button" className="button secondary" disabled={busy} onClick={reload}>
          Reload {kind}s
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {loading ? (
        <p role="status">Loading records…</p>
      ) : rows.length === 0 ? (
        <p>
          No {archived ? 'archived' : 'saved'} {kind}s.
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.id} className="border-b py-2">
              <strong>{row.data.name}</strong>
              <button
                type="button"
                className="button text"
                disabled={busy}
                onClick={() => void readHistory({ id: row.id, name: row.data.name })}
              >
                History of {row.data.name}
              </button>
              {kind === 'contact' && (
                <p>
                  {[row.data.company, row.data.email, row.data.phone].filter(Boolean).join(' · ')}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {!archived && (onContact || onTemplate) && (
                  <button
                    type="button"
                    className="button secondary"
                    disabled={busy}
                    onClick={() => {
                      try {
                        if (kind === 'contact') onContact?.(clientContactSchema.parse(row.data))
                        else onTemplate?.(templateSchema.parse(row.data))
                      } catch (reason) {
                        setError(String(reason))
                      }
                    }}
                  >
                    Use {row.data.name}
                  </button>
                )}
                {!archived && (
                  <button
                    type="button"
                    className="button secondary"
                    disabled={busy}
                    onClick={() => {
                      setEditing(row)
                      setDraft(row.data)
                      setNotice('')
                    }}
                  >
                    Edit {row.data.name}
                  </button>
                )}
                <button
                  type="button"
                  className="button secondary"
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        `${archived ? 'Restore' : 'Archive'} ${row.data.name}? Existing projects remain unchanged.`,
                      )
                    )
                      void save(row)
                  }}
                >
                  {archived ? 'Restore' : 'Archive'} {row.data.name}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {total > 100 && (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={offset === 0 || loading}
            onClick={() => {
              setOffset(offset - 100)
              setLoading(true)
            }}
          >
            Previous records
          </button>
          <span>
            {offset + 1}–{Math.min(offset + 100, total)} of {total}
          </span>
          <button
            type="button"
            disabled={offset + 100 >= total || loading}
            onClick={() => {
              setOffset(offset + 100)
              setLoading(true)
            }}
          >
            Next records
          </button>
        </div>
      )}
      {history && (
        <section aria-label="Record history" className="my-4">
          <h4>History: {history.name}</h4>
          {history.rows.map((row) => (
            <details key={row.revision}>
              <summary>
                Revision {row.revision}
                {row.archived ? ' — archived' : ''}
              </summary>
              <dl>
                {Object.entries(row.data).map(([key, value]) => (
                  <div key={key}>
                    <dt>{key.replaceAll('_', ' ')}</dt>
                    <dd className="whitespace-pre-wrap">{value || 'Not recorded'}</dd>
                  </div>
                ))}
              </dl>
            </details>
          ))}
          <button
            type="button"
            disabled={busy || history.offset === 0}
            onClick={() => void readHistory(history, Math.max(0, history.offset - 50))}
          >
            Newer revisions
          </button>
          <button
            type="button"
            disabled={busy || history.rows.length < 50}
            onClick={() => void readHistory(history, history.offset + 50)}
          >
            Older revisions
          </button>
          <button type="button" onClick={() => setHistory(null)}>
            Close record history
          </button>
        </section>
      )}
      <fieldset disabled={busy} className="my-4">
        <legend>
          {editing ? 'Edit' : 'New'} {kind}
        </legend>
        <div className="form-grid">
          {Object.keys(empty).map((key) => (
            <label key={key}>
              {label} {key.replaceAll('_', ' ')}
              {key === 'purpose' ? (
                <select
                  value={draft[key]}
                  onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                >
                  <option value="contractor_proposal">Contractor proposal</option>
                  <option value="developer_decision">Developer decision</option>
                </select>
              ) : (
                <input
                  value={draft[key] ?? ''}
                  maxLength={
                    key === 'email'
                      ? 320
                      : key === 'phone'
                        ? 80
                        : ['name', 'company', 'project_type'].includes(key)
                          ? 160
                          : ['notes', 'intended_users', 'use_periods'].includes(key)
                            ? 2000
                            : key === 'source'
                              ? 1000
                              : 4000
                  }
                  onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                />
              )}
            </label>
          ))}
        </div>
        <div className="flex gap-2 my-3">
          <button type="button" className="button primary" onClick={() => void save()}>
            {busy ? 'Saving…' : `Save ${kind}`}
          </button>
          {editing && (
            <button
              type="button"
              className="button secondary"
              onClick={() => {
                setEditing(null)
                setDraft(empty)
              }}
            >
              Cancel record edit
            </button>
          )}
        </div>
      </fieldset>
    </section>
  )
}
