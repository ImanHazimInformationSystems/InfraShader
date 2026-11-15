import { useEffect, useState } from 'react'
import { z } from 'zod'
import type { Project } from '../domain/projects'
import {
  coordinateText,
  parseCoordinates,
  workspaceDataSchema,
  workspaceInput,
  type Geometry,
  type SiteConstraint,
  type WorkspaceData,
} from '../domain/workspace'
import { request } from '../services/api'
import DrawingMap from './DrawingMap'
import { Button } from './ui/button'

type Props = {
  data: WorkspaceData
  project: Project
  token?: string
  revision: number
  disabled: boolean
  onChange: (data: WorkspaceData) => void
  onDirty: (dirty: boolean) => void
  onWorking: (busy: boolean) => void
}
const categories = {
  observation: 'Observation',
  access: 'Access point',
  utility: 'Utility',
  setback: 'Setback',
  existing_tree: 'Existing tree',
  no_work: 'No-work zone',
} as const
const statuses = {
  unverified: 'Unverified',
  site_check: 'Verify on site',
  verified: 'Verification recorded',
  resolved: 'Resolved',
} as const
const fresh = (): SiteConstraint => ({
  id: crypto.randomUUID(),
  title: '',
  category: 'observation',
  description: '',
  source_type: 'estimated',
  source_note: '',
  uncertainty: '',
  geometry: null,
  location_consent: false,
  consent_note: '',
  inspection_date: null,
  evidence_ids: [],
  related_ids: [],
  status: 'unverified',
  critical: false,
  responsible: '',
  due_date: null,
  response: '',
  resolution: '',
  verified_by: '',
  verification_reference: '',
  verification_date: null,
})
const evidenceSchema = z.object({
  items: z.array(z.object({ id: z.uuid(), description: z.string() })),
  limit: z.number(),
})
export default function SiteConstraints({
  data,
  project,
  token,
  revision,
  disabled,
  onChange,
  onDirty,
  onWorking,
}: Props) {
  const [form, setForm] = useState<SiteConstraint>(fresh),
    [dirty, setDirty] = useState(false)
  const [coordinates, setCoordinates] = useState(''),
    [shape, setShape] = useState<Geometry['type'] | 'None'>('None')
  const [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false)
  const [search, setSearch] = useState(''),
    [queue, setQueue] = useState(false)
  const [photos, setPhotos] = useState<{ id: string; description: string }[]>([]),
    [reload, setReload] = useState(0)
  const [photoError, setPhotoError] = useState('')
  const endpoint = `/api/v1/organisations/${project.organisation_id}/projects/${project.id}`
  useEffect(() => onDirty(dirty), [dirty, onDirty])
  useEffect(() => {
    let alive = true
    request(`${endpoint}/evidence`, evidenceSchema, token)
      .then((result) => {
        if (alive) {
          setPhotos(result.items)
          setPhotoError('')
        }
      })
      .catch((e) => {
        if (alive) setPhotoError(e.message)
      })
    return () => {
      alive = false
    }
  }, [endpoint, token, reload])
  function patch<K extends keyof SiteConstraint>(key: K, value: SiteConstraint[K]) {
    setForm((previous) => ({ ...previous, [key]: value }))
    setDirty(true)
    setNotice('')
  }
  function choose(record?: SiteConstraint) {
    if (dirty && !window.confirm('Discard unapplied constraint changes?')) return
    const next = record ? structuredClone(record) : fresh()
    setForm(next)
    setCoordinates(next.geometry ? coordinateText(next.geometry) : '')
    setShape(next.geometry?.type ?? 'None')
    setDirty(false)
    setError('')
  }
  async function apply(remove = false) {
    if (disabled || busy) return
    if (
      remove &&
      !window.confirm(
        'Remove this constraint from the draft? Saved workspace history retains earlier versions.',
      )
    )
      return
    setBusy(true)
    onWorking(true)
    setError('')
    setNotice('')
    try {
      const record = {
        ...form,
        geometry: remove || shape === 'None' ? null : parseCoordinates(coordinates, shape),
      }
      const next = structuredClone(data)
      next.constraints = remove
        ? data.constraints.filter((r) => r.id !== form.id)
        : [...data.constraints.filter((r) => r.id !== form.id), record]
      const checked = await request(`${endpoint}/object-preview`, workspaceDataSchema, token, {
        method: 'POST',
        body: JSON.stringify(workspaceInput(next, revision)),
      })
      onChange(checked)
      setDirty(false)
      setNotice('Constraint applied to the draft. Validate & save workspace to retain a revision.')
      if (remove) {
        setForm(fresh())
        setCoordinates('')
        setShape('None')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Validation failed; your form is retained.')
    } finally {
      setBusy(false)
      onWorking(false)
    }
  }
  const links = [
    ...new Map(
      [
        ...data.targets.map((t) => ({ id: t.id, name: `Target: ${t.name}` })),
        ...Object.values(data.scenarios).flatMap((s) =>
          s.items.map((i) => ({ id: i.id, name: `${s.name}: ${i.name}` })),
        ),
      ].map((i) => [i.id, i]),
    ).values(),
  ]
  const unresolved = data.constraints.filter((r) => !['verified', 'resolved'].includes(r.status))
  const checkboxStyle = {
    display: 'flex',
    flexDirection: 'row' as const,
    alignItems: 'center',
    gap: 8,
  }
  const text = (
    label: string,
    key:
      | 'title'
      | 'description'
      | 'source_note'
      | 'uncertainty'
      | 'responsible'
      | 'response'
      | 'resolution'
      | 'consent_note'
      | 'verified_by'
      | 'verification_reference',
    multiline = false,
  ) => (
    <label>
      {label}
      {multiline ? (
        <textarea value={form[key]} maxLength={4000} onChange={(e) => patch(key, e.target.value)} />
      ) : (
        <input
          value={form[key]}
          maxLength={key === 'title' || key === 'responsible' || key === 'verified_by' ? 160 : 2000}
          onChange={(e) => patch(key, e.target.value)}
        />
      )}
    </label>
  )
  return (
    <section
      aria-label="Survey evidence and constraints"
      className="rounded-xl border border-stone-300 p-4 my-4"
    >
      <h3>Survey evidence & constraints · L03</h3>
      <p>
        Private site observations, source records and verification tasks. Map labels do not verify
        buried services or statutory setbacks. A recorded verification is a user declaration, not a
        survey certificate.
      </p>
      <p role="status">
        {data.constraints.length} records · {unresolved.length} unverified ·{' '}
        {unresolved.filter((r) => r.critical).length} critical facts awaiting verification.
      </p>
      <div className="flex flex-wrap gap-3">
        <label>
          Find constraints
          <input value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <label style={checkboxStyle}>
          <input
            type="checkbox"
            style={{ width: 'auto' }}
            checked={queue}
            onChange={(e) => setQueue(e.target.checked)}
          />
          Show verification queue only
        </label>
        <Button variant="outline" disabled={disabled || busy} onClick={() => choose()}>
          New constraint
        </Button>
      </div>
      <div className="grid gap-3 pt-3 md:grid-cols-2">
        {data.constraints
          .filter(
            (r) =>
              (!queue || !['verified', 'resolved'].includes(r.status)) &&
              `${r.title} ${r.category} ${r.responsible} ${r.source_note}`
                .toLowerCase()
                .includes(search.toLowerCase()),
          )
          .sort(
            (a, b) =>
              Number(b.critical) - Number(a.critical) ||
              (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') ||
              a.title.localeCompare(b.title),
          )
          .map((r) => (
            <article key={r.id} className="rounded-lg border border-stone-200 p-3">
              <h4 className="font-semibold">{r.title}</h4>
              <p>
                {categories[r.category]} / {r.source_type}
                <br />
                {r.uncertainty}
              </p>
              <p>
                <strong>
                  {statuses[r.status]}
                  {r.critical ? ' / Critical' : ''}
                </strong>
                <br />
                {r.responsible || 'Unassigned'}
                {r.due_date ? ` / Due ${r.due_date}` : ''}
              </p>
              <p>{r.response || 'No design response recorded'}</p>
              <Button variant="outline" disabled={busy} onClick={() => choose(r)}>
                Review {r.title}
              </Button>
            </article>
          ))}
      </div>
      <details open className="mt-4">
        <summary>Constraint inspector</summary>
        <fieldset disabled={disabled || busy} className="grid gap-4 md:grid-cols-2">
          <div>
            {text('Constraint title', 'title')}
            <label>
              Constraint category
              <select
                aria-label="Constraint category"
                value={form.category}
                onChange={(e) => patch('category', e.target.value as SiteConstraint['category'])}
              >
                {Object.entries(categories).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            {text('Observation or constraint details', 'description', true)}
            <label>
              Constraint source type
              <select
                aria-label="Constraint source type"
                value={form.source_type}
                onChange={(e) =>
                  patch('source_type', e.target.value as SiteConstraint['source_type'])
                }
              >
                {['estimated', 'map_derived', 'traced', 'measured', 'supplied'].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            {text('Source document, person or measurement reference', 'source_note', true)}
            {text('Uncertainty and limits', 'uncertainty', true)}
            <label>
              Inspection date
              <input
                type="date"
                value={form.inspection_date ?? ''}
                onChange={(e) => patch('inspection_date', e.target.value || null)}
              />
            </label>
            <label>
              Location geometry
              <select
                aria-label="Location geometry"
                value={shape}
                onChange={(e) => {
                  setShape(e.target.value as typeof shape)
                  setDirty(true)
                }}
              >
                {['None', 'Point', 'LineString', 'Polygon'].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            {shape !== 'None' && (
              <>
                <label>
                  Constraint longitude, latitude coordinates
                  <textarea
                    value={coordinates}
                    onChange={(e) => {
                      setCoordinates(e.target.value)
                      setDirty(true)
                    }}
                  />
                </label>
                <label style={checkboxStyle}>
                  <input
                    type="checkbox"
                    style={{ width: 'auto' }}
                    checked={form.location_consent}
                    onChange={(e) => patch('location_consent', e.target.checked)}
                  />
                  Permission to record this location is confirmed
                </label>
                {text('Location permission basis', 'consent_note')}
                <details>
                  <summary>Draw constraint location</summary>
                  <DrawingMap
                    bounds={project.site.bounds}
                    type={shape}
                    features={data.constraints
                      .filter((r) => r.geometry)
                      .map((r) => ({
                        type: 'Feature' as const,
                        id: r.id,
                        geometry: r.geometry!,
                        properties: { kind: 'constraint', name: r.title, color: '#b75e30' },
                      }))}
                    disabled={disabled || busy}
                    onGeometry={(g) => {
                      setCoordinates(coordinateText(g))
                      setDirty(true)
                    }}
                  />
                </details>
              </>
            )}
          </div>
          <div>
            <label>
              Verification status
              <select
                aria-label="Verification status"
                value={form.status}
                onChange={(e) => patch('status', e.target.value as SiteConstraint['status'])}
              >
                {Object.entries(statuses).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label style={checkboxStyle}>
              <input
                type="checkbox"
                style={{ width: 'auto' }}
                checked={form.critical}
                onChange={(e) => patch('critical', e.target.checked)}
              />
              Critical fact requiring review
            </label>
            {text('Responsible person', 'responsible')}
            <label>
              Site check due date
              <input
                type="date"
                value={form.due_date ?? ''}
                onChange={(e) => patch('due_date', e.target.value || null)}
              />
            </label>
            {text('Design response or proposed action', 'response', true)}
            {text('Resolution and result', 'resolution', true)}
            {['verified', 'resolved'].includes(form.status) && (
              <>
                {text('Verified by', 'verified_by')}
                <label>
                  Verification date
                  <input
                    type="date"
                    value={form.verification_date ?? ''}
                    onChange={(e) => patch('verification_date', e.target.value || null)}
                  />
                </label>
                {text('Supplied verification reference', 'verification_reference', true)}
                <p>
                  Supply the actual inspection or authoritative document reference. Changing a
                  status does not locate a utility or establish compliance.
                </p>
              </>
            )}
            <fieldset>
              <legend>Linked private photographs</legend>
              {photos.map((photo) => (
                <label key={photo.id} style={checkboxStyle}>
                  <input
                    type="checkbox"
                    style={{ width: 'auto' }}
                    checked={form.evidence_ids.includes(photo.id)}
                    onChange={(e) =>
                      patch(
                        'evidence_ids',
                        e.target.checked
                          ? [...form.evidence_ids, photo.id]
                          : form.evidence_ids.filter((id) => id !== photo.id),
                      )
                    }
                  />
                  {photo.description}
                </label>
              ))}
              <Button variant="outline" onClick={() => setReload((v) => v + 1)}>
                Refresh evidence list
              </Button>
              <p>
                Upload and inspect photos in Private site evidence below. Images remain private and
                are not automatically published with this register.
              </p>
              {photoError && <p role="alert">{photoError}</p>}
            </fieldset>
            <label>
              Linked design geometry
              <select
                aria-label="Linked design geometry"
                multiple
                value={form.related_ids}
                onChange={(e) =>
                  patch(
                    'related_ids',
                    Array.from(e.target.selectedOptions, (o) => o.value),
                  )
                }
              >
                {links.map((link) => (
                  <option key={link.id} value={link.id}>
                    {link.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void apply()}>Apply constraint to draft</Button>
            <Button variant="outline" onClick={() => choose()}>
              Discard constraint form
            </Button>
            <Button
              variant="outline"
              disabled={!data.constraints.some((r) => r.id === form.id)}
              onClick={() => void apply(true)}
            >
              Remove constraint
            </Button>
          </div>
        </fieldset>
      </details>
      {dirty && <p>Unapplied constraint changes: apply or discard before saving the workspace.</p>}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
    </section>
  )
}
