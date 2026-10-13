import { useEffect, useState, type FormEvent } from 'react'
import { z } from 'zod'
import type { Organisation } from '../domain/projects'
import { request } from '../services/api'
import { Button } from './ui/button'
import { settingsSchema } from '../domain/settings'
import AccountSecurity from './AccountSecurity'
import ServiceRequests from './ServiceRequests'
const profileSchema = z.object({ display_name: z.string(), revision: z.number() })
const memberSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  role: z.enum(['administrator', 'member']),
  active: z.boolean(),
  capabilities: z.array(z.string()),
  revision: z.number(),
})
const membersSchema = z.object({ items: z.array(memberSchema) })
const eventsSchema = z.object({
  items: z.array(
    z.object({
      id: z.uuid(),
      actor_id: z.string(),
      created_at: z.string(),
      payload: z.object({ action: z.string() }),
    }),
  ),
})
const capabilities = [
  'manage_members',
  'change_catalogue',
  'internal_pricing',
  'issue_developer_brief',
  'issue_proposal',
]

export default function SettingsPage({
  organisation,
  token,
  onDirty,
  onChanged,
  email,
}: {
  organisation: Organisation
  token?: string
  onDirty: (value: boolean) => void
  onChanged: () => void
  email: string
}) {
  const [record, setRecord] = useState<z.infer<typeof settingsSchema> | null>(null)
  const [profile, setProfile] = useState<z.infer<typeof profileSchema> | null>(null)
  const [members, setMembers] = useState<z.infer<typeof memberSchema>[]>([])
  const [history, setHistory] = useState<z.infer<typeof eventsSchema>['items']>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [editingKey, setEditingKey] = useState('')
  const [dirty, setDirty] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const endpoint = `/api/v1/organisations/${organisation.id}`
  const admin = organisation.role === 'administrator'
  useEffect(() => {
    let active = true
    Promise.all([
      request(`${endpoint}/settings`, settingsSchema, token),
      request('/api/v1/profile', profileSchema, token),
      admin ? request(`${endpoint}/members`, membersSchema, token) : Promise.resolve({ items: [] }),
      admin
        ? request(`${endpoint}/administration-history`, eventsSchema, token)
        : Promise.resolve({ items: [] }),
    ])
      .then(([org, person, team, events]) => {
        if (active) {
          setRecord(org)
          setProfile(person)
          setMembers(team.items)
          setHistory(events.items)
          setError('')
        }
      })
      .catch((reason) => {
        if (active) setError(reason.message)
      })
    return () => {
      active = false
    }
  }, [endpoint, token, admin, refresh])
  function changed(event: FormEvent<HTMLFormElement>) {
    setEditingKey(event.currentTarget.dataset.editKey ?? '')
    setDirty(true)
    onDirty(true)
    setNotice('')
  }
  async function save(
    event: FormEvent<HTMLFormElement>,
    kind: 'profile' | 'settings' | 'member',
    member?: z.infer<typeof memberSchema>,
  ) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setBusy(true)
    setError('')
    try {
      if (kind === 'profile' && profile)
        setProfile(
          await request('/api/v1/profile', profileSchema, token, {
            method: 'PUT',
            body: JSON.stringify({
              expected_revision: profile.revision,
              display_name: form.get('display_name'),
            }),
          }),
        )
      if (kind === 'settings' && record)
        setRecord(
          await request(`${endpoint}/settings`, settingsSchema, token, {
            method: 'PUT',
            body: JSON.stringify({
              expected_revision: record.revision,
              name: form.get('name'),
              settings: {
                timezone: form.get('timezone'),
                currency: 'MYR',
                units: form.get('units'),
                default_markup: form.get('default_markup'),
              },
            }),
          }),
        )
      if (kind === 'member' && member)
        await request(`${endpoint}/members/${member.id}`, memberSchema, token, {
          method: 'PATCH',
          body: JSON.stringify({
            expected_revision: member.revision,
            role: form.get('role'),
            active: form.get('active') === 'on',
            capabilities: form.getAll('capabilities'),
          }),
        })
      setEditingKey('')
      setDirty(false)
      onDirty(false)
      setNotice('Changes saved.')
      setRefresh((value) => value + 1)
      onChanged()
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Save failed. Your entered values remain available.',
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <section aria-label="Account and organisation settings" className="paper settings-page p-5">
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <Button
        variant="outline"
        disabled={busy}
        onClick={() => {
          if (!dirty || window.confirm('Discard unsaved settings and reload?')) {
            setRefresh((value) => value + 1)
            setEditingKey('')
            setDirty(false)
            onDirty(false)
          }
        }}
      >
        Reload settings
      </Button>
      <AccountSecurity
        key={`account-${refresh}`}
        email={email}
        disabled={busy || Boolean(editingKey && editingKey !== 'account')}
        onDirty={(value) => {
          setDirty(value)
          onDirty(value)
          setEditingKey(value ? 'account' : '')
        }}
      />
      {profile && (
        <form
          data-edit-key="profile"
          key={`profile-${profile.revision}-${refresh}`}
          onSubmit={(event) => void save(event, 'profile')}
          onChange={changed}
        >
          <h2>Your profile</h2>
          <label>
            Display name
            <input
              name="display_name"
              defaultValue={profile.display_name}
              maxLength={160}
              disabled={busy || Boolean(editingKey && editingKey !== 'profile')}
            />
          </label>
          <Button disabled={busy || Boolean(editingKey && editingKey !== 'profile')}>
            Save profile
          </Button>
        </form>
      )}
      {record && (
        <form
          data-edit-key="settings"
          key={`org-${record.revision}-${refresh}`}
          onSubmit={(event) => void save(event, 'settings')}
          onChange={changed}
        >
          <h2>Organisation defaults</h2>
          <fieldset disabled={!admin || busy || Boolean(editingKey && editingKey !== 'settings')}>
            <label>
              Organisation name
              <input name="name" required maxLength={160} defaultValue={record.name} />
            </label>
            <label>
              Default project timezone
              <input name="timezone" required defaultValue={record.settings.timezone} />
            </label>
            <label>
              Default contractor markup (%)
              <input
                name="default_markup"
                type="number"
                min="0"
                max="1000"
                step="0.0001"
                required
                defaultValue={record.settings.default_markup}
              />
            </label>
            <label htmlFor="display-units">Display units</label>
            <select id="display-units" name="units" defaultValue={record.settings.units}>
              <option value="metric">Metric</option>
              <option value="imperial">Imperial with canonical metric values</option>
            </select>
            <p>
              Currency: MYR. Geometry inputs, stored quantities and rate units remain metric.
              Display conversion never changes saved quantities, prices or issued documents. Default
              timezone/markup apply to new inputs.
            </p>
            <Button disabled={!admin || busy}>Save organisation settings</Button>
          </fieldset>
          {!admin && <p>An administrator can change organisation defaults.</p>}
        </form>
      )}
      <ServiceRequests
        key={`requests-${refresh}`}
        org={organisation.id}
        token={token}
        admin={admin}
        disabled={Boolean(editingKey && editingKey !== 'requests')}
        onDirty={(value) => {
          setEditingKey(value ? 'requests' : '')
          setDirty(value)
          onDirty(value)
        }}
      />
      {admin && (
        <>
          <h2>Organisation members</h2>
          <p>
            Existing memberships only. New accounts are provisioned through local Supabase and the
            operator bootstrap command; invitations are not sent here.
          </p>
          {members.map((member) => (
            <form
              data-edit-key={member.id}
              key={`${member.id}-${member.revision}-${refresh}`}
              onSubmit={(event) => void save(event, 'member', member)}
              onChange={changed}
              className="my-4 rounded border border-stone-300 p-3"
            >
              <h3>Member {member.user_id}</h3>
              <fieldset disabled={busy || Boolean(editingKey && editingKey !== member.id)}>
                <label>
                  Member role
                  <select name="role" defaultValue={member.role}>
                    <option value="member">Member</option>
                    <option value="administrator">Administrator</option>
                  </select>
                </label>
                <label>
                  <input type="checkbox" name="active" defaultChecked={member.active} /> Active
                  membership
                </label>
                <fieldset>
                  <legend>Member capabilities</legend>
                  {capabilities.map((value) => (
                    <label key={value}>
                      <input
                        type="checkbox"
                        name="capabilities"
                        value={value}
                        defaultChecked={member.capabilities.includes(value)}
                      />{' '}
                      {value.replaceAll('_', ' ')}
                    </label>
                  ))}
                </fieldset>
                <p>
                  Administrators have all capabilities. Only administrators can change roles and
                  access.
                </p>
                <Button>Save membership</Button>
              </fieldset>
            </form>
          ))}
          <h2>Administration history</h2>
          <p>Latest 100 changes.</p>
          {history.map((item) => (
            <p key={item.id}>
              {item.created_at} / {item.payload.action} / {item.actor_id}
            </p>
          ))}
        </>
      )}
    </section>
  )
}
