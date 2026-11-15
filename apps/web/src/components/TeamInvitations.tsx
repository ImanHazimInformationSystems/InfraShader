import { useEffect, useState, type FormEvent } from 'react'
import { z } from 'zod'
import { request } from '../services/api'

const policySchema = z.object({
  roles: z.record(z.string(), z.array(z.string())),
  capabilities: z.array(z.string()),
})
const inviteSchema = z.object({
  id: z.string(),
  email: z.string(),
  role: z.string(),
  state: z.string(),
  expires_at: z.string(),
  token: z.string().optional(),
})
export default function TeamInvitations({ org, token }: { org: string; token?: string }) {
  const [policy, setPolicy] = useState<z.infer<typeof policySchema>>(),
    [items, setItems] = useState<z.infer<typeof inviteSchema>[]>([]),
    [caps, setCaps] = useState<string[]>([]),
    [roles, setRoles] = useState<string[]>([]),
    [link, setLink] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [refresh, setRefresh] = useState(0)
  const endpoint = `/api/v1/organisations/${org}/invitations`
  useEffect(() => {
    let active = true
    Promise.all([
      request('/api/v1/access-policy', policySchema, token),
      request(endpoint, z.object({ items: z.array(inviteSchema) }), token),
    ])
      .then(([p, r]) => {
        if (active) {
          setPolicy(p)
          setItems(r.items)
        }
      })
      .catch((e) => {
        if (active) setError(e.message)
      })
    return () => {
      active = false
    }
  }, [endpoint, token, refresh])
  async function invite(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setBusy(true)
    setError('')
    setLink('')
    try {
      const r = await request(endpoint, inviteSchema, token, {
        method: 'POST',
        body: JSON.stringify({
          email: form.get('email'),
          expires_days: Number(form.get('days')),
          role: caps.includes('manage_members') ? 'administrator' : 'member',
          capabilities: caps,
        }),
      })
      setLink(`${location.origin}/#invite=${r.token}`)
      setRefresh((x) => x + 1)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invitation failed')
    } finally {
      setBusy(false)
    }
  }
  async function revoke(id: string) {
    setBusy(true)
    setError('')
    try {
      await request(`${endpoint}/${id}/revoke`, inviteSchema, token, { method: 'POST' })
      setRefresh((x) => x + 1)
      setLink('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Revocation failed')
    } finally {
      setBusy(false)
    }
  }
  return (
    <section aria-label="Team invitations">
      <h2>Invite a team member</h2>
      <p>
        No email is sent. Copy the one-time link and give it privately to the intended recipient.
        Project access is assigned separately.
      </p>
      {error && <p role="alert">{error}</p>}
      <form onSubmit={(e) => void invite(e)}>
        <fieldset disabled={busy}>
          <label>
            Recipient account email
            <input name="email" type="email" required maxLength={320} />
          </label>
          <label>
            Expires after days
            <input name="days" type="number" min={1} max={14} defaultValue={7} />
          </label>
          <fieldset>
            <legend>Role templates (combine as needed)</legend>
            {Object.entries(policy?.roles ?? {}).map(([role, grants]) => (
              <label key={role}>
                <input
                  type="checkbox"
                  checked={roles.includes(role)}
                  onChange={(e) => {
                    const selected = e.target.checked
                      ? [...roles, role]
                      : roles.filter((r) => r !== role)
                    setRoles(selected)
                    setCaps([...new Set(selected.flatMap((r) => policy!.roles[r]))])
                  }}
                />
                {role} <small>{grants.join(', ')}</small>
              </label>
            ))}
          </fieldset>
          <details>
            <summary>Explicit capabilities</summary>
            {policy?.capabilities.map((cap) => (
              <label key={cap}>
                <input
                  type="checkbox"
                  checked={caps.includes(cap)}
                  onChange={(e) =>
                    setCaps(e.target.checked ? [...caps, cap] : caps.filter((c) => c !== cap))
                  }
                />
                {cap.replaceAll('_', ' ')}
              </label>
            ))}
          </details>
          <button className="button primary">Create invitation link</button>
        </fieldset>
      </form>
      {link && (
        <div className="notice">
          <label>
            Copy invitation link
            <input readOnly value={link} onFocus={(e) => e.target.select()} />
          </label>
          <button
            className="button secondary"
            onClick={() =>
              void navigator.clipboard
                .writeText(link)
                .catch(() => setError('Select and copy the link manually.'))
            }
          >
            Copy link
          </button>
          <p>The secret is shown only now. It cannot be retrieved later.</p>
        </div>
      )}
      <h3>Invitation history</h3>
      {items.map((i) => (
        <div className="invitation-row" key={i.id}>
          <span>
            {i.email} · {i.state} · expires {new Date(i.expires_at).toLocaleString()}
          </span>
          {i.state === 'pending' && (
            <button className="button secondary" disabled={busy} onClick={() => void revoke(i.id)}>
              Revoke invitation
            </button>
          )}
        </div>
      ))}
    </section>
  )
}
