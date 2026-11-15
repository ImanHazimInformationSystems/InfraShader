import { useEffect, useState, type FormEvent } from 'react'
import { z } from 'zod'
import { request } from '../services/api'
import { sessionSchema } from '../domain/projects'

const pendingSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      organisation_name: z.string(),
      email: z.string(),
      state: z.string(),
    }),
  ),
})
export default function OrganisationOnboarding({
  token,
  onChanged,
  invitation = '',
}: {
  token: string
  onChanged: () => void
  invitation?: string
}) {
  const [pending, setPending] = useState<z.infer<typeof pendingSchema>['items']>([])
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  useEffect(() => {
    let active = true
    request('/api/v1/invitations', pendingSchema, token)
      .then((r) => {
        if (active) setPending(r.items)
      })
      .catch((e) => {
        if (active) setError(e.message)
      })
    return () => {
      active = false
    }
  }, [token])
  async function submit(event: FormEvent<HTMLFormElement>, create: boolean) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setBusy(true)
    setError('')
    try {
      const raw = String(data.get('invitation') ?? '').trim()
      const secret = raw.includes('#invite=') ? raw.split('#invite=')[1] : raw
      await request(
        create ? '/api/v1/organisations' : '/api/v1/invitations/accept',
        sessionSchema,
        token,
        {
          method: 'POST',
          body: JSON.stringify(
            create
              ? {
                  name: data.get('name'),
                  workspaces:
                    data.get('workspace') === 'both'
                      ? ['studio', 'review']
                      : [data.get('workspace')],
                }
              : { token: secret },
          ),
        },
      )
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Please retry.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="paper access-onboarding" aria-label="Organisation onboarding">
      <span className="eyebrow">Your team, your workspace</span>
      <h2>Create or join an organisation</h2>
      <p>
        Use a verified account email. A new organisation is a separate private space; its name does
        not verify affiliation with an existing company.
      </p>
      {error && <p role="alert">{error}</p>}
      <div className="access-columns">
        <form onSubmit={(e) => void submit(e, true)}>
          <h3>Create an organisation</h3>
          <label>
            Organisation display name
            <input name="name" required maxLength={160} />
          </label>
          <label>
            Intended workspace
            <select name="workspace">
              <option value="studio">Design Studio</option>
              <option value="review">Organisation Review</option>
              <option value="both">Both workspaces</option>
            </select>
          </label>
          <p>
            You receive explicit administration and working capabilities for the selected
            workspaces. Team members need their own grants.
          </p>
          <button className="button primary" disabled={busy}>
            Create organisation
          </button>
        </form>
        <form onSubmit={(e) => void submit(e, false)}>
          <h3>Join by invitation</h3>
          <label>
            Invitation link or token
            <input
              name="invitation"
              type="password"
              autoComplete="off"
              defaultValue={invitation}
              required
            />
          </label>
          <p>
            Sign in with the verified email specified by the inviter. Links are single-use and
            expire.
          </p>
          <button className="button secondary" disabled={busy}>
            Accept invitation
          </button>
          <h4>Pending invitations for your account</h4>
          {pending.length ? (
            pending.map((i) => (
              <p key={i.id}>
                {i.organisation_name} · {i.email} — use the administrator’s invitation link.
              </p>
            ))
          ) : (
            <p>No pending invitation found.</p>
          )}
        </form>
      </div>
    </section>
  )
}
