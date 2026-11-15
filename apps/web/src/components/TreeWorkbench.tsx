import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import type { Map, MapMouseEvent } from 'mapbox-gl'
import { Trees, Plus, Undo2, Redo2 } from 'lucide-react'
import {
  adoptTrees,
  setTreeStatus,
  treeInside,
  treeSchema,
  type SiteTree,
  type TreeSite,
} from '../domain/trees'
import { loadMappedTrees, readTreeGeoJSON } from '../services/tree-context'
import type { Solar } from '../services/environment'
import { hasTreeDimensions } from '../services/tree-scene'
import TreeMapLayer from './TreeMapLayer'
import './trees.css'

const noTrees: SiteTree[] = []
export default function TreeWorkbench({
  site,
  map,
  solar = null,
  onApply,
  onReload,
  onDirty,
  saveLabel = 'Apply tree decisions',
  disabled = false,
  active = true,
}: {
  site: TreeSite
  map: Map | null
  solar?: Solar | null
  disabled?: boolean
  active?: boolean
  onApply: (trees: SiteTree[]) => Promise<void> | void
  onReload?: () => Promise<SiteTree[]>
  onDirty?: (dirty: boolean) => void
  saveLabel?: string
}) {
  const [baseline, setBaseline] = useState(site.trees ?? noTrees)
  const [history, setHistory] = useState({
    past: [] as SiteTree[][],
    present: site.trees ?? noTrees,
    future: [] as SiteTree[][],
  })
  const trees = history.present
  const [context, setContext] = useState<SiteTree[]>([])
  const [contextMessage, setContextMessage] = useState(
    'No tree inventory loaded. Map coverage is unknown. Load mapped trees, import a source, or add records.',
  )
  const [source, setSource] = useState(''),
    [attribution, setAttribution] = useState('')
  const [showContext, setShowContext] = useState(true),
    [showProject, setShowProject] = useState(true)
  const [showRemoved, setShowRemoved] = useState(true),
    [shadows, setShadows] = useState(false)
  const [selected, setSelected] = useState(''),
    [editing, setEditing] = useState<SiteTree | null>(null)
  const [placing, setPlacing] = useState(false),
    [busy, setBusy] = useState(false),
    [fetching, setFetching] = useState(false)
  const [message, setMessage] = useState(''),
    [error, setError] = useState(''),
    [renderError, setRenderError] = useState('')
  const [filter, setFilter] = useState('')
  const pending = !!editing || placing || JSON.stringify(trees) !== JSON.stringify(baseline)
  const request = useRef<AbortController | null>(null),
    generation = useRef(0),
    alive = useRef(true)
  const boundsKey = JSON.stringify([site.bounds, site.outline])
  useEffect(() => {
    onDirty?.(pending)
  }, [pending, onDirty])
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      request.current?.abort()
    }
  }, [])
  useEffect(() => {
    generation.current++
    request.current?.abort()
    queueMicrotask(() => {
      setFetching(false)
      setPlacing(false)
    })
  }, [boundsKey])
  useEffect(() => {
    if (!active) queueMicrotask(() => setPlacing(false))
  }, [active])
  const commit = (next: SiteTree[]) => {
    setHistory((h) => ({ past: [...h.past.slice(-49), h.present], present: next, future: [] }))
    setMessage('Tree decisions have not been saved.')
    setError('')
  }
  const inside = useMemo(() => trees.filter((t) => treeInside(t, site)), [trees, site])
  const candidates = useMemo(() => context.filter((t) => treeInside(t, site)), [context, site])
  const additions = candidates.filter((t) => !trees.some((saved) => saved.id === t.id))
  const displayed = useMemo(() => {
    const ids = new Set(inside.map((t) => t.id))
    return [
      ...(showContext
        ? candidates.filter((t) => !ids.has(t.id)).map((t) => ({ ...t, context: true }))
        : []),
      ...(showProject
        ? inside
            .filter((t) => showRemoved || t.status !== 'remove')
            .map((t) => ({ ...t, context: false }))
        : []),
    ]
  }, [inside, candidates, showContext, showProject, showRemoved])
  function newTree(longitude: number, latitude: number): SiteTree {
    return treeSchema.parse({
      id: crypto.randomUUID(),
      name: `Tree ${trees.length + 1}`,
      longitude,
      latitude,
      source: 'User-entered site observation',
      attribution: 'User-supplied project data',
      uncertainty: 'Position and dimensions require verification.',
    })
  }
  useEffect(() => {
    if (!map || !placing || disabled || !active) return
    const click = (e: MapMouseEvent) => {
      if (!treeInside({ longitude: e.lngLat.lng, latitude: e.lngLat.lat }, site)) {
        setError('Choose a point inside the selected site.')
        return
      }
      setEditing(
        treeSchema.parse({
          id: crypto.randomUUID(),
          name: 'New tree',
          longitude: e.lngLat.lng,
          latitude: e.lngLat.lat,
          source: 'User-selected map position',
          attribution: 'User-supplied project data',
          uncertainty: 'Position selected on map; verify on site.',
        }),
      )
      setPlacing(false)
      setError('')
    }
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPlacing(false)
    }
    const canvas = map.getCanvas()
    const oldCursor = canvas.style.cursor
    canvas.style.cursor = 'crosshair'
    map.on('click', click)
    window.addEventListener('keydown', escape)
    return () => {
      map.off('click', click)
      window.removeEventListener('keydown', escape)
      canvas.style.cursor = oldCursor
    }
  }, [map, placing, disabled, active, site])
  async function lookup() {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    const ticket = ++generation.current
    setFetching(true)
    setError('')
    try {
      const result = await loadMappedTrees(site.bounds, controller.signal)
      if (!alive.current || ticket !== generation.current) return
      setContext(result.trees)
      setContextMessage(
        `${result.trees.length} mapped trees returned${result.limited ? ' — partial: first 500 only' : ''}. OpenStreetMap coverage is incomplete; zero results does not mean no trees exist. Context is not saved until included and applied.`,
      )
    } catch (reason) {
      if (alive.current && ticket === generation.current && !controller.signal.aborted)
        setError(
          reason instanceof Error
            ? reason.message
            : 'Tree lookup unavailable. Previous context is retained.',
        )
    } finally {
      if (alive.current && ticket === generation.current) setFetching(false)
    }
  }
  async function apply() {
    setBusy(true)
    setError('')
    const next = structuredClone(trees)
    try {
      await onApply(next)
      if (!alive.current) return
      setBaseline(next)
      setHistory({ past: [], present: next, future: [] })
      setMessage(
        `${saveLabel === 'Apply tree decisions' ? 'Applied to the new-project draft' : 'Tree decisions saved'}. ${next.length} records retained with their sources.`,
      )
    } catch (reason) {
      if (alive.current)
        setError(
          reason instanceof Error ? reason.message : 'Save failed. Your tree draft is retained.',
        )
    } finally {
      if (alive.current) setBusy(false)
    }
  }
  const chosen = inside.find((t) => t.id === selected)
  const rows = inside.filter((t) =>
    `${t.name} ${t.species} ${t.status}`.toLowerCase().includes(filter.toLowerCase()),
  )
  return (
    <section className="tree-workbench" aria-label="Site tree inventory">
      <TreeMapLayer
        map={map}
        trees={displayed}
        solar={solar}
        shadows={shadows}
        selected={selected}
        onSelect={(id) => {
          if (!placing && active) setSelected(id)
        }}
        onError={setRenderError}
      />
      <header className="tree-heading">
        <Trees size={24} aria-hidden="true" />
        <div>
          <span className="eyebrow">SITE TREES</span>
          <h3>Review what stays</h3>
        </div>
      </header>
      <p className="fine-print">
        Control Mapbox trees, satellite imagery and elevation in Map layers. This inventory is
        separate from basemap scenery.
      </p>
      <p className="fine-print">
        Review existing trees in the selected site. Removal is a proposal decision; the source
        record stays in the inventory. Trees outside a changed site are preserved.
      </p>
      <div className="tree-totals" aria-label="Tree decision totals">
        <span>
          <strong>{inside.filter((t) => t.status === 'retain').length}</strong> Retain
        </span>
        <span>
          <strong>{inside.filter((t) => t.status === 'remove').length}</strong> Remove
        </span>
        <span>
          <strong>{trees.length - inside.length}</strong> Outside site
        </span>
      </div>
      <details className="tree-sources" open={!trees.length}>
        <summary>Find or import existing trees</summary>
        <p className="fine-print">
          Mapped-tree lookup sends this site's bounds to the configured Overpass service. It is a
          manual, bounded read with no account or project text sent.
        </p>
        <button type="button" disabled={fetching} onClick={() => void lookup()}>
          Load mapped trees in this site
        </button>
        {fetching && (
          <button
            type="button"
            onClick={() => {
              generation.current++
              request.current?.abort()
              setFetching(false)
            }}
          >
            Cancel lookup
          </button>
        )}
        <p role="status">{fetching ? 'Looking up community-mapped trees…' : contextMessage}</p>
        <label>
          Tree dataset source
          <input
            maxLength={500}
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="Inventory name, organisation and date"
          />
        </label>
        <label>
          Tree dataset licence / permission
          <input
            maxLength={500}
            value={attribution}
            onChange={(e) => setAttribution(e.target.value)}
            placeholder="Attribution or permission to use this data"
          />
        </label>
        <label>
          Tree inventory GeoJSON
          <input
            type="file"
            accept=".geojson,.json,application/geo+json"
            onChange={async (e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (!file) return
              request.current?.abort()
              const ticket = ++generation.current
              setFetching(false)
              try {
                if (file.size > 2_000_000) throw new Error('Use a tree GeoJSON file under 2 MB.')
                const records = await readTreeGeoJSON(await file.text(), source, attribution)
                if (!alive.current || ticket !== generation.current) return
                setContext(records)
                setError('')
                setContextMessage(
                  `${records.length} tree records loaded from ${source}. Context only; review and include trees before applying.`,
                )
              } catch (reason) {
                if (alive.current && ticket === generation.current)
                  setError(
                    reason instanceof Error
                      ? reason.message
                      : 'Import failed. Previous context is retained.',
                  )
              }
            }}
          />
        </label>
        <p className="fine-print">
          WGS84 Point FeatureCollection, up to 500 trees / 2 MB. Optional properties: name, species,
          height_m, crown_diameter_m, form, dimensions_source, uncertainty. Unknown dimensions stay
          as markers.
        </p>
        {!!context.length && (
          <>
            <p>
              {candidates.length} context trees inside this site;{' '}
              {context.length - candidates.length} outside. {additions.length} new records can be
              included.
            </p>
            <button
              type="button"
              disabled={disabled || busy || !!editing || !additions.length}
              onClick={() => {
                try {
                  commit(adoptTrees(trees, context, site))
                } catch {
                  setError('The project is limited to 500 trees. Use a smaller inventory.')
                }
              }}
            >
              Include trees inside site in draft
            </button>
            <button
              type="button"
              onClick={() => {
                setContext([])
                setContextMessage('Context cleared. Project tree decisions are retained.')
              }}
            >
              Clear context overlay
            </button>
          </>
        )}
      </details>
      <details>
        <summary>Tree display & preview limits</summary>
        <label>
          <input
            type="checkbox"
            checked={showContext}
            onChange={(e) => setShowContext(e.target.checked)}
          />{' '}
          Show source context trees
        </label>
        <label>
          <input
            type="checkbox"
            checked={showProject}
            onChange={(e) => setShowProject(e.target.checked)}
          />{' '}
          Show project trees
        </label>
        <label>
          <input
            type="checkbox"
            checked={showRemoved}
            onChange={(e) => setShowRemoved(e.target.checked)}
          />{' '}
          Show removal markers
        </label>
        <label>
          <input type="checkbox" checked={shadows} onChange={(e) => setShadows(e.target.checked)} />{' '}
          Illustrative tree shadow preview
        </label>
        <p className="fine-print">
          Green: retained. Red marker: proposed removal. Grey-green: context only.{' '}
          {inside.filter(hasTreeDimensions).length} project trees have both dimensions for 3D.
          Models use simplified crown shapes, not species-accurate scans.
        </p>
        <p className="fine-print">
          Tree shadows use a solid ellipsoid on flat ground and the displayed solar position. They
          stop below 5° sun elevation, while solar data is unavailable, or when elevation terrain is
          enabled. Tree and terrain effects are excluded from analytical shade studies and issued
          quantities.
        </p>
        {!map && (
          <p role="status">Map unavailable. Numeric tree review and saving remain available.</p>
        )}
        {renderError && <p role="status">{renderError}</p>}
      </details>
      <div className="tree-actions">
        <button
          type="button"
          disabled={disabled || busy || !!editing || trees.length >= 500}
          onClick={() => {
            const c = map?.getCenter()
            setEditing(
              newTree(
                c?.lng ?? (site.bounds[0] + site.bounds[2]) / 2,
                c?.lat ?? (site.bounds[1] + site.bounds[3]) / 2,
              ),
            )
          }}
        >
          <Plus size={15} aria-hidden="true" /> Add tree record
        </button>
        <button
          type="button"
          disabled={disabled || busy || !map || !!editing || trees.length >= 500}
          aria-pressed={placing}
          onClick={() => setPlacing(!placing)}
        >
          {placing ? 'Cancel tree placement' : 'Place tree on map'}
        </button>
        <button
          type="button"
          disabled={disabled || busy || !!editing || !inside.length}
          onClick={() => commit(setTreeStatus(trees, site, 'retain'))}
        >
          Keep all site trees
        </button>
        <button
          type="button"
          disabled={disabled || busy || !!editing || !inside.length}
          onClick={() => commit(setTreeStatus(trees, site, 'remove'))}
        >
          Mark all site trees for removal
        </button>
      </div>
      {placing && (
        <p role="status">
          Click inside the site to add a tree. Press Escape to cancel. You can still pan and zoom.
        </p>
      )}
      {editing && (
        <TreeForm
          key={editing.id}
          tree={editing}
          map={map}
          disabled={disabled || busy}
          onCancel={() => setEditing(null)}
          onApply={(next) => {
            if (!treeInside(next, site)) {
              setError('Tree location must be inside the selected site.')
              return
            }
            commit(
              trees.some((t) => t.id === next.id)
                ? trees.map((t) => (t.id === next.id ? next : t))
                : [...trees, next],
            )
            setSelected(next.id)
            setEditing(null)
          }}
        />
      )}
      <label>
        Find a site tree
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Name, species or decision"
        />
      </label>
      <div className="tree-list" role="list" aria-label="Trees inside selected site">
        {rows.map((t) => (
          <div
            role="listitem"
            key={t.id}
            className={`tree-list-item ${selected === t.id ? 'is-selected' : ''}`}
          >
            <button
              type="button"
              aria-pressed={selected === t.id}
              onClick={() => setSelected(t.id)}
            >
              <strong>{t.name}</strong>
              <small>
                {t.species || 'Species unknown'} ·{' '}
                {t.height_m === null ? 'Height unknown' : `${t.height_m} m tall`}
              </small>
            </button>
            <label>
              Decision for {t.name}
              <select
                aria-label={`Decision for ${t.name}`}
                value={t.status}
                disabled={disabled || busy || !!editing}
                onChange={(e) =>
                  commit(setTreeStatus(trees, site, e.target.value as SiteTree['status'], t.id))
                }
              >
                <option value="retain">Retain</option>
                <option value="remove">Remove</option>
              </select>
            </label>
          </div>
        ))}
        {!rows.length && (
          <p>
            No matching project tree records inside this site. This is not evidence that the site
            has no trees.
          </p>
        )}
      </div>
      {!!(trees.length - inside.length) && (
        <details>
          <summary>{trees.length - inside.length} preserved records outside this site</summary>
          <ul>
            {trees
              .filter((t) => !treeInside(t, site))
              .map((t) => (
                <li key={t.id}>
                  {t.name} — {t.status}; {t.longitude}, {t.latitude}
                </li>
              ))}
          </ul>
        </details>
      )}
      {chosen && (
        <section className="tree-detail" aria-label="Selected tree details">
          <h4>{chosen.name}</h4>
          <dl>
            <dt>Source</dt>
            <dd>
              {chosen.source} {chosen.source_id && `(${chosen.source_id})`}
            </dd>
            <dt>Attribution</dt>
            <dd>{chosen.attribution}</dd>
            <dt>Coordinates</dt>
            <dd>
              {chosen.longitude.toFixed(6)}, {chosen.latitude.toFixed(6)}
            </dd>
            <dt>Height / crown diameter</dt>
            <dd>
              {chosen.height_m ?? 'Unknown'} / {chosen.crown_diameter_m ?? 'Unknown'} m
            </dd>
            <dt>Dimension basis</dt>
            <dd>{chosen.dimensions_source || 'Unknown'}</dd>
            <dt>Uncertainty</dt>
            <dd>{chosen.uncertainty || 'Not recorded'}</dd>
            <dt>Removal reason</dt>
            <dd>{chosen.removal_reason || 'Not recorded'}</dd>
          </dl>
          <button
            type="button"
            disabled={disabled || busy || !!editing}
            onClick={() => setEditing(chosen)}
          >
            Edit selected tree record
          </button>
          <button
            type="button"
            disabled={!map}
            onClick={() =>
              map?.easeTo({
                center: [chosen.longitude, chosen.latitude],
                duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 300,
              })
            }
          >
            Locate selected tree
          </button>
        </section>
      )}
      <div className="tree-actions">
        <button
          type="button"
          disabled={disabled || busy || !!editing || !history.past.length}
          onClick={() =>
            setHistory((h) => ({
              past: h.past.slice(0, -1),
              present: h.past[h.past.length - 1],
              future: [h.present, ...h.future],
            }))
          }
        >
          <Undo2 size={14} aria-hidden="true" /> Undo tree change
        </button>
        <button
          type="button"
          disabled={disabled || busy || !!editing || !history.future.length}
          onClick={() =>
            setHistory((h) => ({
              past: [...h.past, h.present],
              present: h.future[0],
              future: h.future.slice(1),
            }))
          }
        >
          <Redo2 size={14} aria-hidden="true" /> Redo tree change
        </button>
        <button
          type="button"
          disabled={busy || !pending}
          onClick={() => {
            setHistory({ past: [], present: baseline, future: [] })
            setEditing(null)
            setPlacing(false)
            setError('')
          }}
        >
          Discard tree draft
        </button>
      </div>
      {onReload && (
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            if (
              pending &&
              !window.confirm('Discard the unsaved tree draft and load the saved tree records?')
            )
              return
            setBusy(true)
            try {
              const value = await onReload()
              if (alive.current) {
                setBaseline(value)
                setHistory({ past: [], present: value, future: [] })
                setEditing(null)
                setError('')
              }
            } catch (reason) {
              if (alive.current)
                setError(
                  reason instanceof Error ? reason.message : 'Reload failed. Draft retained.',
                )
            } finally {
              if (alive.current) setBusy(false)
            }
          }}
        >
          Reload saved trees
        </button>
      )}
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
      <p role="status">
        {message ||
          (pending ? 'Unsaved tree decisions' : 'Tree decisions match the applied site records.')}
      </p>
      <button
        type="button"
        className="button primary full"
        disabled={disabled || busy || !!editing || placing || !pending}
        onClick={() => void apply()}
      >
        {busy ? 'Saving tree decisions…' : saveLabel}
      </button>
      {disabled && (
        <p className="fine-print">
          Tree decisions are read-only. Editing requires permission to edit this active project.
        </p>
      )}
    </section>
  )
}

function TreeForm({
  tree,
  map,
  onApply,
  onCancel,
  disabled,
}: {
  tree: SiteTree
  map: Map | null
  onApply: (tree: SiteTree) => void
  onCancel: () => void
  disabled: boolean
}) {
  const [draft, setDraft] = useState({
    ...tree,
    longitude: String(tree.longitude),
    latitude: String(tree.latitude),
    height_m: tree.height_m === null ? '' : String(tree.height_m),
    crown_diameter_m: tree.crown_diameter_m === null ? '' : String(tree.crown_diameter_m),
  })
  const [error, setError] = useState('')
  const field = (key: keyof typeof draft, label: string, type = 'text') => (
    <label>
      {label}
      <input
        type={type}
        step={type === 'number' ? 'any' : undefined}
        value={draft[key]}
        onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
      />
    </label>
  )
  function submit(event: FormEvent) {
    event.preventDefault()
    const parsed = treeSchema.safeParse({
      ...draft,
      longitude: draft.longitude.trim() ? Number(draft.longitude) : NaN,
      latitude: draft.latitude.trim() ? Number(draft.latitude) : NaN,
      height_m: draft.height_m.trim() ? Number(draft.height_m) : null,
      crown_diameter_m: draft.crown_diameter_m.trim() ? Number(draft.crown_diameter_m) : null,
    })
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '))
      return
    }
    onApply(parsed.data)
  }
  return (
    <form className="tree-record-form" onSubmit={submit} aria-label="Tree record editor">
      <fieldset disabled={disabled}>
        <legend>Tree record</legend>
        <div className="tree-form-grid">
          {field('name', 'Tree name')}
          {field('species', 'Tree species (optional)')}
          {field('longitude', 'Tree longitude', 'number')}
          {field('latitude', 'Tree latitude', 'number')}
          {field('height_m', 'Tree height in metres (optional)', 'number')}
          {field('crown_diameter_m', 'Crown diameter in metres (optional)', 'number')}
        </div>
        <button
          type="button"
          disabled={!map}
          onClick={() => {
            const c = map!.getCenter()
            setDraft({ ...draft, longitude: String(c.lng), latitude: String(c.lat) })
          }}
        >
          Use map centre for tree
        </button>
        <label>
          Tree form
          <select
            value={draft.form}
            onChange={(e) => setDraft({ ...draft, form: e.target.value as SiteTree['form'] })}
          >
            <option value="unknown">Unknown (generic crown)</option>
            <option value="broadleaf">Broadleaf</option>
            <option value="conifer">Conifer</option>
            <option value="palm">Palm</option>
          </select>
        </label>
        {field('source', 'Tree record source')}
        {field('attribution', 'Tree record attribution / permission')}
        {field('dimensions_source', 'Tree dimensions source or explicit assumption')}
        {field('uncertainty', 'Tree uncertainty / verification notes')}
        {field('removal_reason', 'Tree removal reason (optional)')}
        <p className="fine-print">
          Leave unmeasured dimensions blank. Both height and crown diameter are needed for an
          illustrative 3D model; unknown trees remain map markers.
        </p>
        {error && <p role="alert">{error}</p>}
        <div className="tree-actions">
          <button type="submit">Apply tree record to draft</button>
          <button type="button" onClick={onCancel}>
            Cancel tree record
          </button>
        </div>
      </fieldset>
    </form>
  )
}
