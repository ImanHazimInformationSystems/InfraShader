import { displayQuantity, useDisplayUnits } from '../services/display-units'
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
import RectangleBuilder from './RectangleBuilder'
import EvidencePanel from './EvidencePanel'
import WorkspaceHistory from './WorkspaceHistory'
import {
  readWorkspaceDraft,
  workspaceDraftKey,
  type WorkspaceDraft,
} from '../services/workspace-draft'

type Props = {
  project: Project
  token: string | undefined
  demo: boolean
  onDirty: (dirty: boolean) => void
  userId?: string
}
type Kind = 'boundary' | 'target' | WorkItem['kind']
export default function GeometryWorkspace({ project, token, demo, onDirty, userId }: Props) {
  const displayUnits = useDisplayUnits()
  const [saved, setSaved] = useState<SavedWorkspace>({ revision: 0, data: null })
  const [data, setData] = useState<WorkspaceData | null>(null)
  const [scenario, setScenario] = useState<ScenarioKey>('baseline')
  const [layers, setLayers] = useState({
    boundary: true,
    target: true,
    building: true,
    canopy: true,
    work: true,
    shadow: true,
  })
  const [kind, setKind] = useState<Kind>('boundary')
  const [name, setName] = useState('Site boundary')
  const [source, setSource] = useState('')
  const [provenance, setProvenance] = useState<WorkItem['provenance']>('estimated')
  const [coordinates, setCoordinates] = useState('')
  const [height, setHeight] = useState('')
  const [heightSource, setHeightSource] = useState('')
  const [count, setCount] = useState('1')
  const [manualBasis, setManualBasis] = useState<'count' | 'fixed'>('count')
  const [category, setCategory] = useState('General')
  const [crown, setCrown] = useState('')
  const [undo, setUndo] = useState<WorkspaceData[]>([])
  const [redo, setRedo] = useState<WorkspaceData[]>([])
  const [override, setOverride] = useState('')
  const [shadow, setShadow] = useState<{ revision: number; features: Feature[] } | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [evidenceDirty, setEvidenceDirty] = useState(false)
  const [reviewDirty, setReviewDirty] = useState(false)
  useEffect(() => {
    onDirty(dirty || reviewDirty || evidenceDirty)
  }, [dirty, reviewDirty, evidenceDirty, onDirty])
  const [pendingForm, setPendingForm] = useState(false)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [recoverable, setRecoverable] = useState<WorkspaceDraft | null>(null)
  const recoveryKey =
    !demo && userId ? workspaceDraftKey(userId, project.organisation_id, project.id) : null
  useEffect(() => {
    if (!recoveryKey || !dirty || !data || busy) return
    try {
      sessionStorage.setItem(
        recoveryKey,
        JSON.stringify({
          savedAt: Date.now(),
          revision: saved.revision,
          data,
          form: {
            manualBasis,
            scenario,
            category,
            crown,
            kind,
            name,
            source,
            coordinates,
            height,
            heightSource,
            count,
            override,
            provenance,
            editingId,
            pendingForm,
          },
        }),
      )
    } catch {
      // Surface failure of an external storage write; editing and API save remain available.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError(
        'Tab recovery storage is unavailable. Keep this tab open and save your workspace to the API.',
      )
    }
  }, [
    recoveryKey,
    dirty,
    data,
    busy,
    saved.revision,
    scenario,
    kind,
    name,
    source,
    coordinates,
    height,
    heightSource,
    count,
    manualBasis,
    override,
    provenance,
    editingId,
    pendingForm,
    category,
    crown,
  ])
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
          if (recoveryKey) setRecoverable(readWorkspaceDraft(recoveryKey))
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
  }, [demo, endpoint, storageKey, onDirty, recoveryKey])

  function recoverDraft() {
    if (!recoverable || recoverable.revision !== saved.revision) return
    const form = recoverable.form
    setData(recoverable.data)
    setScenario(form.scenario)
    setKind(form.kind)
    setName(form.name)
    setSource(form.source)
    setCoordinates(form.coordinates)
    setHeight(form.height)
    setHeightSource(form.heightSource)
    setCount(form.count)
    setManualBasis(form.manualBasis)
    setCategory(form.category)
    setCrown(form.crown)
    setOverride(form.override)
    setProvenance(form.provenance)
    setEditingId(form.editingId)
    setPendingForm(form.pendingForm)
    setDirty(true)
    setRecoverable(null)
    setNotice('Recovered this tab draft. Apply pending form edits, then validate and save.')
  }

  function markFormChanged() {
    setPendingForm(true)
    markChanged()
  }
  function markChanged() {
    setDirty(true)
    setNotice('')
  }
  function change(next: WorkspaceData) {
    const sharedIds = new Set(next.scenarios.baseline.items.map((item) => item.id))
    const previousIds = new Set(data?.scenarios.baseline.items.map((item) => item.id) ?? [])
    for (const key of ['option_a', 'option_b'] as const) {
      next.scenarios[key].items = [
        ...structuredClone(next.scenarios.baseline.items),
        ...next.scenarios[key].items.filter(
          (item) => !sharedIds.has(item.id) && !previousIds.has(item.id),
        ),
      ]
    }
    if (data) setUndo((previous) => [...previous.slice(-49), structuredClone(data)])
    setRedo([])
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
    setManualBasis('count')
    setCategory(
      next === 'tree'
        ? 'Vegetation'
        : next === 'bench'
          ? 'Furniture'
          : ['building', 'canopy'].includes(next)
            ? 'Structures'
            : next === 'path'
              ? 'Circulation'
              : 'General',
    )
    setCrown('')
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
        if (!Number.isInteger(Number(count)) || Number(count) < 0)
          throw new Error('Count must be a nonnegative whole number.')
        if (
          override &&
          (!Number.isFinite(Number(override)) ||
            Number(override) < 0 ||
            (Number(override) === 0 && !['tree', 'bench', 'manual'].includes(kind)) ||
            provenance === 'calculated')
        )
          throw new Error('An override needs a positive value and its own non-calculated source.')
        const previous = next.scenarios[scenario].items.find((item) => item.id === editingId)
        const item: WorkItem = {
          manual_basis: kind === 'manual' ? manualBasis : 'count',
          category: category.trim() || 'General',
          visible: previous?.visible ?? true,
          crown_diameter_m: kind === 'tree' && crown ? Number(crown) : null,
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
    if (pendingForm && !window.confirm('Discard unapplied form changes?')) return false
    setPendingForm(false)
    if (data?.scenarios.baseline.items.some((value) => value.id === item.id))
      setScenario('baseline')
    setKind(item.kind)
    setName(item.name)
    setSource(item.source_note)
    setProvenance(item.provenance)
    setCoordinates(item.geometry ? coordinateText(item.geometry) : '')
    setHeight(String(item.height_m ?? ''))
    setHeightSource(item.height_source)
    setCount(String(item.count))
    setManualBasis(item.manual_basis)
    setCategory(item.category)
    setCrown(item.crown_diameter_m === null ? '' : String(item.crown_diameter_m))
    setOverride(item.quantity_override ?? '')
    setEditingId(item.id)
  }
  function editTarget(target: WorkspaceData['targets'][number]) {
    if (pendingForm && !window.confirm('Discard unapplied form changes?')) return
    setPendingForm(false)
    setKind('target')
    setName(target.name)
    setSource(target.source_note)
    setProvenance(target.provenance)
    setCoordinates(coordinateText(target.geometry))
    setEditingId(target.id)
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
      setUndo([])
      setRedo([])
      if (recoveryKey) sessionStorage.removeItem(recoveryKey)
      setRecoverable(null)
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
            {
              type: 'Feature' as const,
              geometry: data.boundary,
              properties: { color: '#b4c5ae', kind: 'boundary' },
            },
            ...data.targets.map((target) => ({
              type: 'Feature' as const,
              geometry: target.geometry,
              id: target.id,
              properties: {
                color: '#d8a638',
                item_id: target.id,
                kind: 'target',
                name: target.name,
              },
            })),
            ...data.scenarios[scenario].items
              .filter((item) => item.geometry && item.visible)
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
          ].filter((feature) => {
            const kind = feature.properties?.kind
            return layers[kind && kind in layers ? (kind as keyof typeof layers) : 'work']
          }),
    [data, scenario, dirty, shadow, saved.revision, layers],
  )
  const selectedFeature = useMemo<Feature | undefined>(() => {
    const target =
      kind === 'target' ? data?.targets.find((target) => target.id === editingId) : undefined
    if (target)
      return {
        type: 'Feature',
        id: target.id,
        geometry: target.geometry,
        properties: { name: target.name, provenance: target.provenance },
      }
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
  }, [data, scenario, editingId, kind])
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
      {recoverable && (
        <div className="notice" role="status">
          <div>
            <strong>An unsaved workspace draft is available in this tab.</strong>
            <p>
              {recoverable.revision === saved.revision
                ? 'Recover the geometry and pending item form, or discard the local draft.'
                : 'The server revision changed. Automatic recovery is blocked to prevent overwriting newer work. Download the draft for manual reconciliation.'}
            </p>
            <Button
              disabled={busy || recoverable.revision !== saved.revision}
              onClick={recoverDraft}
            >
              Recover workspace draft
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                const url = URL.createObjectURL(
                  new Blob([JSON.stringify(recoverable, null, 2)], { type: 'application/json' }),
                )
                const link = document.createElement('a')
                link.href = url
                link.download = 'infrashader-unsaved-workspace.json'
                link.click()
                setTimeout(() => URL.revokeObjectURL(url), 1000)
              }}
            >
              Download unsaved draft
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                if (recoveryKey) sessionStorage.removeItem(recoveryKey)
                setRecoverable(null)
              }}
            >
              Discard recovered draft
            </Button>
          </div>
        </div>
      )}
      {!demo && (
        <p className="text-sm">
          Unsaved geometry and item forms are kept in this tab for up to eight hours, scoped to your
          account. Explicit sign-out or discarding changes clears them. Review, pricing and evidence
          forms require separate saves.
        </p>
      )}
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
                  if (
                    window.confirm('Remove this option own items and keep the shared Baseline?')
                  ) {
                    const next = structuredClone(data)
                    next.scenarios[scenario].items = structuredClone(next.scenarios.baseline.items)
                    change(next)
                  }
                }}
              >
                Reset option to Baseline
              </Button>
            )}
          </div>
          <p>
            Baseline objects are shared by both options. Edit or remove them in Baseline; saving
            updates both options and makes earlier calculations stale. Proposed items stay
            independent.
          </p>
          <fieldset disabled={busy || project.archived} className="border-0 p-0 min-w-0">
            <div className="field">
              <label htmlFor="geometry-kind">Geometry to add or replace</label>
              <select
                id="geometry-kind"
                value={kind}
                onChange={(event) => selectKind(event.target.value as Kind)}
              >
                {Object.entries({
                  'Site definition': ['boundary', 'target'],
                  Structures: ['building', 'canopy'],
                  'Surfaces and circulation': ['area', 'path'],
                  'Vegetation and furniture': ['tree', 'bench'],
                  'Other quantities': ['manual'],
                }).map(([group, kinds]) => (
                  <optgroup key={group} label={group}>
                    {kinds.map((entry) => (
                      <option key={entry} value={entry}>
                        {entry === 'canopy'
                          ? 'Elevated canopy roof'
                          : entry === 'manual'
                            ? 'Manual count item'
                            : entry}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            {kind === 'canopy' && !demo && (
              <RectangleBuilder
                project={project}
                token={token}
                onGeometry={(geometry) => {
                  setCoordinates(coordinateText(geometry))
                  markFormChanged()
                }}
              />
            )}
            <fieldset className="my-3">
              <legend>Map layers</legend>
              {Object.entries(layers).map(([key, visible]) => (
                <label key={key} className="inline-flex flex-row items-center gap-2 mr-4">
                  <input
                    type="checkbox"
                    checked={visible}
                    onChange={(event) =>
                      setLayers((current) => ({ ...current, [key]: event.target.checked }))
                    }
                  />{' '}
                  Show {key} layer
                </label>
              ))}
              <p>
                Layer visibility changes this view only. Quantities, analysis and saved scope
                include hidden objects.
              </p>
            </fieldset>
            <DrawingMap
              bounds={project.site.bounds}
              features={features}
              type={geometryType}
              selected={selectedFeature}
              disabled={busy || project.archived}
              onSelect={(id) => {
                const target = data.targets.find((target) => target.id === id)
                if (target) {
                  editTarget(target)
                  return
                }
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
                {!['boundary', 'target'].includes(kind) && (
                  <div className="field">
                    <label htmlFor="object-category">Object category</label>
                    <input
                      id="object-category"
                      maxLength={80}
                      value={category}
                      onChange={(event) => {
                        setCategory(event.target.value)
                        markFormChanged()
                      }}
                    />
                  </div>
                )}
                {kind === 'tree' && (
                  <div className="field">
                    <label htmlFor="tree-crown">Tree crown diameter (m, optional)</label>
                    <input
                      id="tree-crown"
                      type="number"
                      min="0.01"
                      max="100"
                      step="0.01"
                      value={crown}
                      onChange={(event) => {
                        setCrown(event.target.value)
                        markFormChanged()
                      }}
                    />
                    <p>Record the source and uncertainty below. This does not enable tree shade.</p>
                  </div>
                )}
                {kind === 'manual' && (
                  <label>
                    Manual quantity basis
                    <select
                      value={manualBasis}
                      onChange={(event) => {
                        const basis = event.target.value as 'count' | 'fixed'
                        setManualBasis(basis)
                        if (basis === 'fixed') {
                          setCount('1')
                          setOverride('')
                        }
                        markFormChanged()
                      }}
                    >
                      <option value="count">Count</option>
                      <option value="fixed">Fixed-price scope (one item)</option>
                    </select>
                  </label>
                )}
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
                      disabled={kind === 'manual' && manualBasis === 'fixed'}
                      type="number"
                      min="0"
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
                      disabled={kind === 'manual' && manualBasis === 'fixed'}
                      type="number"
                      min={['tree', 'bench', 'manual'].includes(kind) ? '0' : '0.0001'}
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
                      ? displayQuantity(target.area_m2, 'm2', displayUnits)
                      : 'Quantity unavailable in Demo'}
                </span>
                <Button
                  variant="outline"
                  disabled={busy || project.archived}
                  onClick={() => editTarget(target)}
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
          <p className="text-sm">
            Visibility affects the editor map only. Hidden items remain in quantities, pricing,
            comparisons and shade calculations. Tree crowns are descriptive metadata; tree shade is
            excluded.
          </p>
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
                        {item.manual_basis === 'fixed' && ' / Fixed-price scope (one item)'}
                        <br />
                        {item.category}
                        {item.crown_diameter_m
                          ? ` / Crown diameter ${item.crown_diameter_m} m`
                          : ''}
                      </td>
                      <td className="p-2">
                        {dirty
                          ? 'Stale / draft'
                          : item.quantity
                            ? `${displayQuantity(item.quantity.value, item.quantity.calculated.unit, displayUnits)}${item.quantity.is_override ? ' (override)' : ''}`
                            : 'Unavailable in Demo'}
                      </td>
                      <td className="p-2">
                        {item.provenance}: {item.source_note}
                      </td>
                      <td className="flex flex-wrap gap-2 p-2">
                        <Button
                          variant="outline"
                          disabled={busy || project.archived}
                          onClick={() => {
                            const next = structuredClone(data)
                            const owner = data.scenarios.baseline.items.some(
                              (value) => value.id === item.id,
                            )
                              ? 'baseline'
                              : scenario
                            next.scenarios[owner].items = next.scenarios[owner].items.map(
                              (value) =>
                                value.id === item.id
                                  ? { ...value, visible: !value.visible }
                                  : value,
                            )
                            change(next)
                          }}
                        >
                          {item.visible ? 'Hide' : 'Show'} {item.name}
                        </Button>
                        <Button
                          variant="outline"
                          disabled={busy || project.archived}
                          onClick={() => edit(item)}
                        >
                          Edit {item.name}
                        </Button>
                        <Button
                          variant="outline"
                          disabled={
                            busy ||
                            project.archived ||
                            (scenario !== 'baseline' &&
                              data.scenarios.baseline.items.some((value) => value.id === item.id))
                          }
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
              variant="outline"
              disabled={busy || project.archived || !undo.length}
              onClick={() => {
                if (
                  pendingForm &&
                  !window.confirm(
                    'Discard unapplied form changes and undo the last workspace edit?',
                  )
                )
                  return
                if (data) setRedo((previous) => [...previous, structuredClone(data)])
                setData(undo[undo.length - 1])
                setUndo((previous) => previous.slice(0, -1))
                setPendingForm(false)
                setEditingId(null)
                setShadow(null)
                markChanged()
              }}
            >
              Undo workspace edit
            </Button>
            <Button
              variant="outline"
              disabled={busy || project.archived || !redo.length}
              onClick={() => {
                if (
                  pendingForm &&
                  !window.confirm('Discard unapplied form changes and redo the workspace edit?')
                )
                  return
                if (data) setUndo((previous) => [...previous, structuredClone(data)])
                setData(redo[redo.length - 1])
                setRedo((previous) => previous.slice(0, -1))
                setPendingForm(false)
                setEditingId(null)
                setShadow(null)
                markChanged()
              }}
            >
              Redo workspace edit
            </Button>
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
                if (!dirty || window.confirm('Discard unsaved workspace changes and reload?')) {
                  if (recoveryKey) sessionStorage.removeItem(recoveryKey)
                  window.location.reload()
                }
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
            <WorkspaceHistory
              endpoint={endpoint}
              token={token}
              revision={saved.revision}
              blocked={busy || dirty || reviewDirty || evidenceDirty || project.archived}
              onRestore={(result) => {
                setSaved(result)
                setData(result.data)
                setUndo([])
                setRedo([])
                setDirty(false)
                setPendingForm(false)
                setEditingId(null)
                setShadow(null)
                setNotice(
                  `Workspace revision ${result.revision} restored. Recalculate and review before issuing.`,
                )
              }}
            />
          )}
          {!demo && (
            <CalculationsPanel
              project={project}
              token={token}
              data={data}
              revision={saved.revision}
              dirty={dirty}
              scenario={scenario}
              onScenarioChange={(option) => {
                setScenario(option)
                setShadow(null)
              }}
              onInspect={(option, itemId) => {
                const item = data.scenarios[option].items.find((value) => value.id === itemId)
                if (item && edit(item) !== false) {
                  setScenario(
                    data.scenarios.baseline.items.some((value) => value.id === item.id)
                      ? 'baseline'
                      : option,
                  )
                  setShadow(null)
                  document
                    .querySelector('[aria-label="Geometry drawing canvas"]')
                    ?.scrollIntoView({ block: 'center' })
                }
              }}
              onReviewDirty={setReviewDirty}
              recoveryKey={recoveryKey ?? undefined}
              onData={change}
              onShowShadows={(features, revision) => setShadow({ features, revision })}
            />
          )}
          {!demo && (
            <EvidencePanel
              project={project}
              token={token}
              targets={data.targets}
              onDirty={setEvidenceDirty}
            />
          )}
        </>
      )}
    </section>
  )
}
