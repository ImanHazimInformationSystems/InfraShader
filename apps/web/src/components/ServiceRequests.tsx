import { useEffect, useState, type FormEvent } from 'react'
import { z } from 'zod'
import { request } from '../services/api'
import { Button } from './ui/button'

const update = z.object({
  id: z.uuid(),
  actor_id: z.uuid(),
  created_at: z.string(),
  message: z.string(),
  status: z.string(),
})
const record = z.object({
  id: z.uuid(),
  actor_id: z.uuid(),
  created_at: z.string(),
  message: z.string(),
  kind: z.string(),
  updates: z.array(update),
})
const list = z.object({ items: z.array(record) })
export default function ServiceRequests({
  org,
  token,
  admin,
  disabled,
  onDirty,
}: {
  org: string
  token?: string
  admin: boolean
  disabled: boolean
  onDirty: (dirty: boolean) => void
}) {
  const [items, setItems] = useState<z.infer<typeof record>[]>([]),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false),
    [refresh, setRefresh] = useState(0)
  const [editing, setEditing] = useState('')
  function changed(id: string) {
    setEditing(id)
    onDirty(true)
  }
  const endpoint = `/api/v1/organisations/${org}/service-requests`
  useEffect(() => {
    let active = true
    request(endpoint, list, token)
      .then((result) => {
        if (active) setItems(result.items)
      })
      .catch((reason) => {
        if (active) setError(reason.message)
      })
    return () => {
      active = false
    }
  }, [endpoint, token, refresh])
  async function submit(event: FormEvent<HTMLFormElement>, id?: string) {
    event.preventDefault()
    const form = event.currentTarget
    const values = new FormData(form)
    setBusy(true)
    setError('')
    setNotice('')
    // Keep a retry key on this form until a successful save, including network failures.
    const fingerprint = JSON.stringify(Object.fromEntries(values))
    const requestKey =
      form.dataset.fingerprint === fingerprint && form.dataset.requestKey
        ? form.dataset.requestKey
        : crypto.randomUUID()
    form.dataset.requestKey = requestKey
    form.dataset.fingerprint = fingerprint
    try {
      const result = await request(
        id ? `${endpoint}/${id}/responses` : endpoint,
        z.object({ id: z.uuid() }),
        token,
        {
          method: 'POST',
          body: JSON.stringify({
            request_key: requestKey,
            message: values.get('message'),
            ...(id ? { status: values.get('status') } : { kind: values.get('kind') }),
          }),
        },
      )
      form.reset()
      delete form.dataset.requestKey
      setEditing('')
      onDirty(false)
      setRefresh((value) => value + 1)
      setNotice(`Saved locally: ${result.id}. An organisation administrator must review it.`)
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Request failed. Keep your text and retry.',
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <details className="my-5 rounded border border-stone-300 p-4">
      <summary>Support and data requests</summary>
      <p>
        Requests are stored in this organisation for its administrators. No email is sent. For
        urgent access or a service outage, contact the person operating this local installation and
        provide the displayed request ID. Never include passwords or keys.
      </p>
      <p>
        Projects are retained until an administrator reviews a deletion request. Archiving does not
        delete data. Deletion and account closure need an operator review of shared records and
        backups; submitting a request does not erase anything.
      </p>
      <form onSubmit={(event) => void submit(event)} onChange={() => changed('new')}>
        <fieldset disabled={busy || disabled || Boolean(editing && editing !== 'new')}>
          <label>
            Request type
            <select name="kind">
              <option value="support">Support</option>
              <option value="data_export">Data export</option>
              <option value="data_correction">Data correction</option>
              <option value="data_deletion">Data deletion</option>
              <option value="account_closure">Account closure</option>
            </select>
          </label>
          <label>
            Request details
            <textarea name="message" required maxLength={4000} />
          </label>
          <Button>Save request</Button>
        </fieldset>
      </form>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <h3>{admin ? 'Organisation request queue' : 'Your requests'}</h3>
      <p>Latest 100 requests. Responses form an immutable history.</p>
      {items.map((item) => (
        <article key={item.id} className="my-3 rounded border border-stone-300 p-3">
          <h4>
            {item.kind.replaceAll('_', ' ')} - {item.updates.at(-1)?.status ?? 'open'}
          </h4>
          <p>
            {item.id} / {item.created_at}
          </p>
          <p className="whitespace-pre-wrap">{item.message}</p>
          {item.updates.map((entry) => (
            <p key={entry.id}>
              {entry.created_at}: {entry.status} - {entry.message}
            </p>
          ))}
          {admin && (
            <form
              onSubmit={(event) => void submit(event, item.id)}
              onChange={() => changed(item.id)}
            >
              <fieldset disabled={busy || disabled || Boolean(editing && editing !== item.id)}>
                <label>
                  Response for {item.id}
                  <textarea name="message" required maxLength={4000} />
                </label>
                <label htmlFor={`request-status-${item.id}`}>Request status</label>
                <select id={`request-status-${item.id}`} name="status">
                  <option value="in_progress">In progress</option>
                  <option value="resolved">Resolved</option>
                </select>
                <Button>Save response</Button>
              </fieldset>
            </form>
          )}
        </article>
      ))}
    </details>
  )
}
