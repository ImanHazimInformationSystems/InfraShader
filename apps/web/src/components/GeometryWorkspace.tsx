import { useEffect, useMemo, useRef, useState } from 'react'
import type { Feature } from 'geojson'
import type { Project } from '../domain/projects'
import {
  coordinateText,
  draftWorkspace,
  parseCoordinates,
  workspaceInput,
  workspaceSchema,
  type Geometry,
  type SavedWorkspace,
  type ScenarioKey,
  type WorkItem,
  type WorkspaceData,
} from '../domain/workspace'
import { request } from '../services/api'
import DrawingMap from './DrawingMap'
import { Button } from './ui/button'
import CalculationsPanel from './CalculationsPanel'
import EvidencePanel from './EvidencePanel'

type Props = {
  project: Project
  token: string | undefined
  demo: boolean
  onDirty: (dirty: boolean) => void
}
type Kind = 'boundary' | 'target' | WorkItem['kind']
export default function GeometryWorkspace({ project, token, demo, onDirty }: Props) {
  const [saved, setSaved] = useState<SavedWorkspace>({ revision: 0, data: null })
  const [data, setData] = useState<WorkspaceData | null>(null)
  const [scenario, setScenario] = useState<ScenarioKey>('baseline')
  const [kind, setKind] = useState<Kind>('boundary')
  const [name, setName] = useState('Site boundary')
  const [source, setSource] = useState('')
  const [provenance, setProvenance] = useState<WorkItem['provenance']>('estimated')
  const [coordinates, setCoordinates] = useState('')
  const [height, setHeight] = useState('')
  const [heightSource, setHeightSource] = useState('')
  const [count, setCount] = useState('1')
  const [override, setOverride] = useState('')
  const [shadow, setShadow] = useState<{ revision: number; features: Feature[] } | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [reviewDirty, setReviewDirty] = useState(false)
  useEffect(() => {
    onDirty(dirty || reviewDirty)
  }, [dirty, reviewDirty, onDirty])
  const [pendingForm, setPendingForm] = useState(false)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const identity = `${demo ? 'demo' : project.organisation_id}/${project.id}`
  const current = useRef({ token, identity })
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  useEffect(() => {
    current.current = { token, identity }
  }, [token, identity])
  const endpoint = `/api/v1/organisations/${project.organisation_id}/projects/${project.id}/workspace`
  const storageKey = `infrashader.demo.workspace.v1.${project.id}`
  const geometryType: Geometry['type'] =
    kind === 'path' ? 'LineString' : kind === 'tree' || kind === 'bench' ? 'Point' : 'Polygon'

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const result = demo
          ? workspaceSchema.parse(
              JSON.parse(localStorage.getItem(storageKey) ?? '{"revision":0,"data":null}'),
            )
          : await request(endpoint, workspaceSchema, current.current.token)
        if (active) {
          setSaved(result)
          setData(result.data)
          setDirty(false)
        }
      } catch (reason) {
        if (active)
          setError(reason instanceof Error ? reason.message : 'Workspace could not be loaded.')
      } finally {
        if (active) setBusy(false)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [demo, endpoint, storageKey, onDirty])

  function markFormChanged() {
    setPendingForm(true)
    markChanged()
  }
  function markChanged() {
    setDirty(true)
    setNotice('')
  }
  function change(next: WorkspaceData) {
    setData(next)
    markChanged()
  }
  function start() {
    const next = draftWorkspace(project.site.bounds)
    change(next)
    setCoordinates(coordinateText(next.boundary))
    setSource(next.boundary_source)
  }
  function selectKind(next: Kind) {
    if (pendingForm && !window.confirm('Discard unapplied form changes?')) return
    setPendingForm(false)
    setHeight(next === 'canopy' ? '3' : '')
    setHeightSource('')
    setKind(next)
    setName(next === 'boundary' ? 'Site boundary' : '')
    setCoordinates(next === 'boundary' && data ? coordinateText(data.boundary) : '')
    setSource(next === 'boundary' && data ? data.boundary_source : '')
    setEditingId(null)
    setOverride('')
    setError('')
  }
  function apply() {
    if (!data) return
    try {
      if (!source.trim() || !name.trim())
        throw new Error('Enter a name and source note before applying this geometry.')
      const geometry = kind === 'manual' ? null : parseCoordinates(coordinates, geometryType)
      const next = structuredClone(data)
      if (kind === 'boundary') {
        next.boundary = geometry!
        next.boundary_source = source
        next.boundary_provenance = provenance
      } else if (kind === 'target') {
        const target = {
          id: editingId ?? crypto.randomUUID(),
          name,
          geometry: geometry!,
          source_note: source,
          provenance,
        }
        next.targets = [...next.targets.filter((item) => item.id !== target.id), target]
      } else {
        if (
          (kind === 'canopy' || (kind === 'building' && height !== '')) &&
          (!(Number(height) > 0) || Number(height) > 100 || !heightSource.trim())
        )
          throw new Error('Enter a height greater than 0 and no more than 100 m, with its source.')
        if (!Number.isInteger(Number(count)) || Number(count) < 1)
          throw new Error('Count must be a positive whole number.')
        if (
          override &&
          (!Number.isFinite(Number(override)) ||
            Number(override) <= 0 ||
            provenance === 'calculated')
        )
          throw new Error('An override needs a positive value and its own non-calculated source.')
        const previous = next.scenarios[scenario].items.find((item) => item.id === editingId)
        const item: WorkItem = {
          id: editingId ?? crypto.randomUUID(),
          name,
          kind,
          status: previous?.status ?? (scenario === 'baseline' ? 'existing' : 'proposed'),
          geometry,
          count: Number(count),
          height_m:
            (kind === 'building' || kind === 'canopy') && height !== '' ? Number(height) : null,
          height_source: heightSource,
          quantity_override: override || null,
          provenance,
          source_note: source,
          rate_id: previous?.rate_id ?? null,
        }
        next.scenarios[scenario].items = [
          ...next.scenarios[scenario].items.filter((entry) => entry.id !== item.id),
          item,
        ]
      }
      change(next)
      setPendingForm(false)
      setError('')
      setEditingId(null)
      setNotice('Applied to your draft. Save to validate and persist the workspace.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Check the coordinates.')
    }
  }
  function edit(item: WorkItem) {
    if (pendingForm && !window.confirm('Discard unapplied form changes?')) return
    setPendingForm(false)
    setKind(item.kind)
    setName(item.name)
    setSource(item.source_note)
    setProvenance(item.provenance)
    setCoordinates(item.geometry ? coordinateText(item.geometry) : '')
    setHeight(String(item.height_m ?? ''))
    setHeightSource(item.height_source)
    setCount(String(item.count))
    setOverride(item.quantity_override ?? '')
    setEditingId(item.id)
  }
  async function save() {
    if (!data || pendingForm) return
    setBusy(true)
    setError('')
    try {
      let result: SavedWorkspace
      if (demo) {
        const before = workspaceSchema.parse(
          JSON.parse(localStorage.getItem(storageKey) ?? '{"revision":0,"data":null}'),
        )
        if (before.revision !== saved.revision)
          throw new Error('Demo workspace changed in another tab. Reload before saving.')
        result = workspaceSchema.parse({
          revision: saved.revision + 1,
          data: workspaceInput(data, saved.revision),
        })
        localStorage.setItem(storageKey, JSON.stringify(result))
      } else
        result = await request(endpoint, workspaceSchema, current.current.token, {
          method: 'POST',
          body: JSON.stringify(workspaceInput(data, saved.revision)),
        })
      if (!mounted.current || current.current.identity !== identity) return
      setSaved(result)
      setData(result.data)
      setDirty(false)
      setNotice(
        demo
          ? 'Draft saved only in Browser Demo. Metric validation and calculations require the real API.'
          : `Workspace revision ${result.revision} saved. Quantities were calculated by the API.`,
      )
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Save failed. Your draft is retained.')
    } finally {
      setBusy(false)
    }
  }
  const features = useMemo<Feature[]>(
    () =>
      !data
        ? []
        : [
            { type: 'Feature', geometry: data.boundary, properties: { color: '#b4c5ae' } },
            ...data.targets.map((target) => ({
              type: 'Feature' as const,
              geometry: target.geometry,
              properties: { color: '#d8a638' },
            })),
            ...data.scenarios[scenario].items
              .filter((item) => item.geometry)
              .map((item) => ({
                type: 'Feature' as const,
                geometry: item.geometry!,
                id: item.id,
                properties: {
                  item_id: item.id,
                  name: item.name,
                  kind: item.kind,
                  height: item.height_m ?? 0,
                  height_source: item.height_source,
                  provenance: item.provenance,
                  color: item.kind === 'building' && item.height_m === null ? '#ba6236' : '#2d7258',
                },
              })),
            ...(!dirty && shadow?.revision === saved.revision ? shadow.features : []),
          ],
    [data, scenario, dirty, shadow, saved.revision],
  )
  const selectedFeature = useMemo<Feature | undefined>(() => {
    const item = data?.scenarios[scenario].items.find((item) => item.id === editingId)
    return item?.geometry
      ? {
          type: 'Feature',
          id: item.id,
          geometry: item.geometry,
          properties: {
            name: item.name,
            provenance: item.provenance,
            height: item.height_m,
            height_source: item.height_source,
          },
        }
      : undefined
  }, [data, scenario, editingId])
  return (
    <section className="paper mt-6 p-5" aria-label="Ground geometry workspace">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="eyebrow">Ground geometry & options</span>
          <h2>Define the work on your site</h2>
          <p>
            {demo
              ? 'Browser Demo drafts do not calculate or certify quantities.'
              : 'The API validates geometry and calculates quantities in a local projected CRS.'}
          </p>
        </div>
        <span role="status">
          {dirty ? 'Unsaved workspace' : `Workspace revision ${saved.revision}`}
        </span>
      </div>
      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="notice" role="status">
          {notice}
        </div>
      )}
      {busy && !data ? (
        <p role="status">Loading workspace…</p>
      ) : !data ? (
        <Button disabled={!!error || project.archived} onClick={start}>
          Start from selected locator
        </Button>
      ) : (
        <>
          <p className="text-sm">
            Draft boundary: {data.boundary_source} ·{' '}
            {data.metric_crs ?? 'Metric validation pending'} · {data.source_crs} transfer
          </p>
          <div className="flex flex-wrap gap-2 py-3" aria-label="Scenario selection">
            {(['baseline', 'option_a', 'option_b'] as const).map((key) => (
              <Button
                key={key}
                variant={scenario === key ? 'default' : 'outline'}
                onClick={() => {
                  if (pendingForm && !window.confirm('Discard unapplied form changes?')) return
                  setPendingForm(false)
                  setScenario(key)
                  setShadow(null)
                  setEditingId(null)
                }}
              >
                {data.scenarios[key].name}
              </Button>
            ))}
            {scenario !== 'baseline' && (
              <Button
                variant="outline"
                disabled={busy || project.archived}
                onClick={() => {
                  if (window.confirm('Replace this option with an independent copy of Baseline?')) {
                    const next = structuredClone(data)
                    next.scenarios[scenario].items = structuredClone(next.scenarios.baseline.items)
                    change(next)
                  }
                }}
              >
                Copy Baseline into this option
              </Button>
            )}
          </div>
          <fieldset disabled={busy || project.archived} className="border-0 p-0 min-w-0">
            <div className="field">
              <label htmlFor="geometry-kind">Geometry to add or replace</label>
              <select
                id="geometry-kind"
                value={kind}
                onChange={(event) => selectKind(event.target.value as Kind)}
              >
                {(
                  [
                    'boundary',
                    'target',
                    'area',
                    'path',
                    'building',
                    'canopy',
                    'tree',
                    'bench',
                    'manual',
                  ] as const
                ).map((entry) => (
                  <option key={entry} value={entry}>
                    {entry === 'canopy'
                      ? 'Elevated canopy roof'
                      : entry === 'manual'
                        ? 'Manual count item'
                        : entry}
                  </option>
                ))}
              </select>
            </div>
            <DrawingMap
              bounds={project.site.bounds}
              features={features}
              type={geometryType}
              selected={selectedFeature}
              disabled={busy || project.archived}
              onSelect={(id) => {
                const item = data.scenarios[scenario].items.find((item) => item.id === id)
                if (item) edit(item)
              }}
              onGeometry={(geometry) => {
                setCoordinates(coordinateText(geometry))
                markFormChanged()
              }}
            />
            <div className="grid gap-5 py-4 lg:grid-cols-2">
              <div>
                <div className="field">
                  <label htmlFor="geometry-name">Geometry name</label>
                  <input
                    id="geometry-name"
                    maxLength={160}
                    value={name}
                    onChange={(event) => {
                      setName(event.target.value)
                      markFormChanged()
                    }}
                  />
                </div>
                {kind !== 'manual' && (
                  <div className="field">
                    <label htmlFor="geometry-coordinates">
                      Longitude, latitude coordinates — one pair per line
                    </label>
                    <textarea
                      id="geometry-coordinates"
                      rows={7}
                      value={coordinates}
                      onChange={(event) => {
                        setCoordinates(event.target.value)
                        markFormChanged()
                      }}
                    />
                    <small>
                      {geometryType === 'Polygon'
                        ? 'Repeat the first pair at the end to close the polygon. No holes; up to 128 vertices.'
                        : geometryType === 'Point'
                          ? 'Enter one pair only.'
                          : 'Enter at least two pairs.'}{' '}
                      Saving verifies the 5 km site limit and boundary containment.
                    </small>
                  </div>
                )}
                {(kind === 'building' || kind === 'canopy') && (
                  <>
                    <div className="field">
                      <label htmlFor="geometry-height">Height above ground (m)</label>
                      {kind === 'building' && (
                        <small>
                          Leave blank if unknown. Unknown buildings remain 2D and block shade
                          comparison.
                        </small>
                      )}
                      <input
                        id="geometry-height"
                        type="number"
                        min="0.01"
                        max="100"
                        step="0.01"
                        value={height}
                        onChange={(event) => {
                          setHeight(event.target.value)
                          markFormChanged()
                        }}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="height-source">Height source and uncertainty</label>
                      <input
                        id="height-source"
                        maxLength={2000}
                        value={heightSource}
                        onChange={(event) => {
                          setHeightSource(event.target.value)
                          markFormChanged()
                        }}
                      />
                    </div>
                  </>
                )}
                {['tree', 'bench', 'manual'].includes(kind) && (
                  <div className="field">
                    <label htmlFor="geometry-count">Count (items)</label>
                    <input
                      id="geometry-count"
                      type="number"
                      min="1"
                      step="1"
                      value={count}
                      onChange={(event) => {
                        setCount(event.target.value)
                        markFormChanged()
                      }}
                    />
                  </div>
                )}
              </div>
              <div>
                <div className="field">
                  <label htmlFor="geometry-provenance">Provenance</label>
                  <select
                    id="geometry-provenance"
                    value={provenance}
                    onChange={(event) => {
                      setProvenance(event.target.value as WorkItem['provenance'])
                      markFormChanged()
                    }}
                  >
                    {[
                      'measured',
                      'sourced',
                      'estimated',
                      'manually_entered',
                      'imported',
                      'calculated',
                    ].map((entry) => (
                      <option key={entry}>{entry}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="geometry-source">Source note and uncertainty</label>
                  <textarea
                    id="geometry-source"
                    maxLength={2000}
                    rows={4}
                    value={source}
                    onChange={(event) => {
                      setSource(event.target.value)
                      markFormChanged()
                    }}
                  />
                </div>
                {!['boundary', 'target'].includes(kind) && (
                  <div className="field">
                    <label htmlFor="quantity-override">Verified quantity override (optional)</label>
                    <input
                      id="quantity-override"
                      type="number"
                      min="0.0001"
                      step="0.0001"
                      value={override}
                      onChange={(event) => {
                        setOverride(event.target.value)
                        markFormChanged()
                      }}
                    />
                    <small>
                      m² for areas/roofs/buildings; m for paths; items for counts. The calculated
                      quantity is retained.
                    </small>
                  </div>
                )}
                <Button type="button" onClick={apply}>
                  {editingId
                    ? 'Apply item changes'
                    : kind === 'boundary'
                      ? 'Apply boundary'
                      : 'Add to draft'}
                </Button>
              </div>
            </div>
          </fieldset>
          <h3>Shared target zones</h3>
          <ul>
            {data.targets.map((target) => (
              <li key={target.id} className="flex flex-wrap items-center gap-3 py-2">
                <span>
                  {target.name} ·{' '}
                  {dirty
                    ? 'Recalculation pending'
                    : target.area_m2
                      ? `${target.area_m2.toFixed(2)} m²`
                      : 'Quantity unavailable in Demo'}
                </span>
                <Button
                  variant="outline"
                  disabled={busy || project.archived}
                  onClick={() => {
                    setKind('target')
                    setName(target.name)
                    setSource(target.source_note)
                    setProvenance(target.provenance)
                    setCoordinates(coordinateText(target.geometry))
                    setEditingId(target.id)
                  }}
                >
                  Edit target
                </Button>
                <Button
                  variant="outline"
                  disabled={busy || project.archived}
                  onClick={() =>
                    change({
                      ...data,
                      targets: data.targets.filter((entry) => entry.id !== target.id),
                    })
                  }
                >
                  Remove target
                </Button>
              </li>
            ))}
          </ul>
          <h3>{data.scenarios[scenario].name} work items</h3>
          {data.scenarios[scenario].items.length === 0 ? (
            <p>No work items in this scenario yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Active quantity</th>
                    <th>Source</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.scenarios[scenario].items.map((item) => (
                    <tr key={item.id}>
                      <td className="p-2">
                        {item.name}
                        <br />
                        {item.kind} · {item.status}
                      </td>
                      <td className="p-2">
                        {dirty
                          ? 'Stale / draft'
                          : item.quantity
                            ? `${item.quantity.value.toFixed(2)} ${item.quantity.calculated.unit}${item.quantity.is_override ? ' (override)' : ''}`
                            : 'Unavailable in Demo'}
                      </td>
                      <td className="p-2">
                        {item.provenance}: {item.source_note}
                      </td>
                      <td className="flex flex-wrap gap-2 p-2">
                        <Button
                          variant="outline"
                          disabled={busy || project.archived}
                          onClick={() => edit(item)}
                        >
                          Edit {item.name}
                        </Button>
                        <Button
                          variant="outline"
                          disabled={busy || project.archived}
                          onClick={() => {
                            const next = structuredClone(data)
                            next.scenarios[scenario].items = next.scenarios[scenario].items.filter(
                              (entry) => entry.id !== item.id,
                            )
                            change(next)
                          }}
                        >
                          Remove {item.name}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex flex-wrap gap-3 border-t border-stone-200 pt-4">
            <Button
              disabled={busy || !dirty || pendingForm || project.archived}
              onClick={() => void save()}
            >
              {busy
                ? 'Saving workspace…'
                : demo
                  ? 'Save Demo geometry draft'
                  : 'Validate & save workspace'}
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                if (!dirty || window.confirm('Discard unsaved workspace changes and reload?'))
                  window.location.reload()
              }}
            >
              Reload saved workspace
            </Button>
          </div>
          <p className="text-sm">
            {pendingForm && <strong>Apply the current form to the draft before saving. </strong>}
            Trees are count items; tree shade is excluded. Building and roof heights require a
            source. Geometry edits make dependent analyses and estimates stale.
          </p>
          {!demo && (
            <CalculationsPanel
              project={project}
              token={token}
              data={data}
              revision={saved.revision}
              dirty={dirty}
              scenario={scenario}
              onReviewDirty={setReviewDirty}
              onData={change}
              onShowShadows={(features, revision) => setShadow({ features, revision })}
            />
          )}
          {!demo && <EvidencePanel project={project} token={token} />}
        </>
      )}
    </section>
  )
}
