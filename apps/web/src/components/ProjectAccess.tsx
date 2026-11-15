import { useEffect, useState } from 'react'
import { z } from 'zod'
import type { Project } from '../domain/projects'
import { request } from '../services/api'
const schema = z.object({
  items: z.array(z.object({ user_id: z.string(), capabilities: z.array(z.string()) })),
  members: z.array(
    z.object({ user_id: z.string(), role: z.string(), capabilities: z.array(z.string()) }),
  ),
})
export default function ProjectAccess({
  project,
  token,
  onChanged,
}: {
  project: Project
  token?: string
  onChanged: () => void
}) {
  const [data, setData] = useState<z.infer<typeof schema>>(),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState('')
  const endpoint = `/api/v1/organisations/${project.organisation_id}/projects/${project.id}/access`
  useEffect(() => {
    let active = true
    request(endpoint, schema, token)
      .then((r) => {
        if (active) setData(r)
      })
      .catch((e) => {
        if (active) setError(e.message)
      })
    return () => {
      active = false
    }
  }, [endpoint, token])
  return (
    <details className="paper p-5 project-access">
      <summary>Project access</summary>
      <p>
        Only explicitly assigned team members can open this project. Effective actions require both
        membership and project capabilities.
      </p>
      {error && <p role="alert">{error}</p>}
      {saved && <p role="status">{saved}</p>}
      {data?.members.map((member) => (
        <form
          key={member.user_id}
          onSubmit={async (e) => {
            e.preventDefault()
            const form = new FormData(e.currentTarget)
            setBusy(true)
            setError('')
            setSaved('')
            try {
              await request(endpoint, z.object({ saved: z.boolean() }), token, {
                method: 'PUT',
                body: JSON.stringify({
                  user_id: member.user_id,
                  capabilities: form.getAll('capability'),
                }),
              })
              setSaved(`Project access saved for ${member.user_id}.`)
              onChanged()
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Save failed')
            } finally {
              setBusy(false)
            }
          }}
        >
          <fieldset disabled={busy}>
            <legend>
              {member.user_id} · {member.role}
            </legend>
            {project.capabilities?.map((cap) => (
              <label key={cap}>
                <input
                  name="capability"
                  type="checkbox"
                  value={cap}
                  defaultChecked={data.items
                    .find((i) => i.user_id === member.user_id)
                    ?.capabilities.includes(cap)}
                />
                {cap.replaceAll('_', ' ')}
                {!member.capabilities.includes(cap) ? ' (membership capability also required)' : ''}
              </label>
            ))}
            <button className="button secondary">Save project access</button>
          </fieldset>
        </form>
      ))}
    </details>
  )
}
