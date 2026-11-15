import { useEffect, useRef, useState } from 'react'
import mapboxgl, { type Map } from 'mapbox-gl'
import { RotateCw, Move, MousePointer2, Check, Trash2, Undo2, Redo2, Trees } from 'lucide-react'
import { useStudioToolActive } from './studio-context'
import PlantedTreeLayer, { type TreeGhost } from './PlantedTreeLayer'
import {
  treeChoices,
  defaultTreeDesign,
  designForTree,
  type TreeVariant,
} from '../services/tree-models'
import {
  workspaceDataSchema,
  workspaceInput,
  type WorkspaceData,
  type WorkItem,
  type ScenarioKey,
} from '../domain/workspace'
import { rateListSchema, type Rate } from '../domain/calculations'
import { openPricing } from '../domain/pricing'
import { request } from '../services/api'
import { z } from 'zod'
import './proposed-trees.css'
import type { Solar } from '../services/environment'

type Props = {
  solar: Solar | null
  map: Map | null
  data: WorkspaceData
  scenario: ScenarioKey
  revision: number
  endpoint: string
  token?: string
  active: boolean
  disabled: boolean
  dirty: boolean
  canPrice: boolean
  rateBasis: 'cost' | 'indicative_budget'
  focusId?: string
  showModels: boolean
  categoryLayers: Record<string, boolean>
  onChange: (data: WorkspaceData) => void
  onDirty: (dirty: boolean) => void
  onWorking: (busy: boolean) => void
  onActive: (active: boolean) => void
  onScenario: (scenario: ScenarioKey) => void
  onEstimate: () => void
  onSpecifications: (id: string) => void
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
}
const costsSchema = z.object({
  rows: z.array(
    z.object({
      parent_id: z.string(),
      name: z.string(),
      quantity: z.string(),
      total: z.string().nullable(),
      status: z.string(),
      rate: z.string(),
    }),
  ),
})

function TreeArt({ variant }: { variant: TreeVariant }) {
  return (
    <svg
      viewBox="0 0 100 108"
      aria-hidden="true"
      className={`tree-card-art tree-card-art-${variant}`}
    >
      <ellipse cx="50" cy="98" rx="32" ry="6" fill="#365b3520" />
      {variant === 'palm' ? (
        <>
          <path d="M43 98Q60 59 52 29" stroke="#8b7355" strokeWidth="9" fill="none" />
          <path
            d="M52 30Q10 12 8 52Q29 31 52 30M52 30Q78 0 96 38Q72 27 52 30M52 30Q81 32 92 69Q63 44 52 30M52 30Q34 3 25 12Q34 24 52 30M52 30Q26 36 20 74Q37 46 52 30"
            fill="#71964a"
            stroke="#3d7443"
            strokeWidth="2"
          />
        </>
      ) : (
        <>
          <path
            d="M49 99L51 40M50 69L29 47M50 57L69 32M51 78L75 58"
            stroke="#806146"
            strokeWidth="7"
            strokeLinecap="round"
          />
          {variant === 'evergreen' ? (
            <>
              <path d="M50 7L69 39H61L82 63H70L92 87H9L30 62H20L40 37H31Z" fill="#3c7858" />
              <path d="M50 7L50 87H92L70 63H82L61 39H69Z" fill="#2d5c46" />
            </>
          ) : variant === 'columnar' ? (
            <>
              <path
                d="M50 6Q24 19 29 40Q12 60 30 80Q50 92 68 76Q84 58 69 41Q77 19 50 6Z"
                fill="#829a48"
              />
              <path d="M50 12Q72 28 61 46Q77 65 53 80" fill="#638337" />
            </>
          ) : (
            <>
              <path
                d="M49 14Q23 7 20 34Q1 34 9 57Q2 78 30 78Q39 95 60 79Q89 88 91 66Q104 46 80 38Q77 9 49 14Z"
                fill="#72964d"
              />
              <path d="M51 20Q83 19 75 46Q98 51 78 68Q71 83 55 74Q71 56 51 20" fill="#4e7e42" />
              <path
                d="M24 35L37 48M19 58L31 62M49 27L55 40M60 67L65 55"
                stroke="#a0b56a"
                strokeWidth="5"
                strokeLinecap="round"
              />
            </>
          )}
        </>
      )}
    </svg>
  )
}

export default function ProposedTrees(props: Props) {
  const {
    map,
    data,
    scenario,
    revision,
    endpoint,
    token,
    disabled,
    active,
    onChange,
    onDirty,
    onWorking,
    onActive,
  } = props
  const panelActive = useStudioToolActive('trees') && active
  const [elevatedMap, setElevatedMap] = useState(Boolean(map?.getTerrain()))
  useEffect(() => {
    if (!map) return
    const update = () => setElevatedMap(Boolean(map.getTerrain()))
    map.on('terrain', update)
    return () => { map.off('terrain', update) }
  }, [map])
  const trees = data.scenarios[scenario].items.filter(
    (item) =>
      item.kind === 'tree' &&
      item.status === 'proposed' &&
      item.layout_plant !== 'shrub' &&
      item.layout_plant !== 'flowers',
  )
  const initial = trees.find((item) => item.id === props.focusId)
  const [selectedId, setSelectedId] = useState(initial?.id ?? '')
  const selected = trees.find((item) => item.id === selectedId)
  const [design, setDesign] = useState(initial ? designForTree(initial) : { ...defaultTreeDesign })
  const [name, setName] = useState(initial?.name ?? '')
  const [point, setPoint] = useState<[number, number]>(
    initial?.geometry?.type === 'Point' ? initial.geometry.coordinates : [0, 0],
  )
  const [rateId, setRateId] = useState(initial?.rate_id ?? '')
  const [placing, setPlacing] = useState(false)
  const [ghost, setGhost] = useState<TreeGhost | null>(null)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [rates, setRates] = useState<Rate[]>([])
  const [rateSearch, setRateSearch] = useState('')
  const [query, setQuery] = useState('')
  const [costs, setCosts] = useState<z.infer<typeof costsSchema> | null>(null)
  const alive = useRef(true),
    actionBusy = useRef(false)
  const editable = !disabled && scenario !== 'baseline' && !selected?.editor_locked
  const pending = Boolean(
    selected &&
    JSON.stringify([design, name, rateId, point]) !==
      JSON.stringify([
        designForTree(selected),
        selected.name,
        selected.rate_id ?? '',
        selected.geometry?.type === 'Point' ? selected.geometry.coordinates : [0, 0],
      ]),
  )
  const choice = treeChoices.find((entry) => entry.id === design.variant)!
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  useEffect(() => {
    onDirty(pending || working)
    return () => onDirty(false)
  }, [pending, working, onDirty])
  useEffect(() => {
    onActive(panelActive && placing && editable)
    return () => onActive(false)
  }, [panelActive, placing, editable, onActive])
  useEffect(() => {
    let current = true
    request(
      `${endpoint.replace(/\/projects\/.*$/, '')}/rates?limit=100&query=${encodeURIComponent(query)}`,
      rateListSchema,
      token,
    )
      .then((result) => {
        if (current)
          setRates(
            result.items.filter(
              (rate) => rate.unit === 'item' && rate.basis === props.rateBasis && !rate.archived,
            ),
          )
      })
      .catch((reason) => {
        if (current) setError(reason.message)
      })
    return () => {
      current = false
    }
  }, [endpoint, token, query, props.rateBasis])
  useEffect(() => {
    let current = true
    request(
      `${endpoint.replace(/\/workspace$/, '')}/schedule?scenario=${scenario}`,
      costsSchema,
      token,
    )
      .then((result) => {
        if (current) setCosts(result)
      })
      .catch(() => {
        if (current) setCosts(null)
      })
    return () => {
      current = false
    }
  }, [endpoint, scenario, token, revision])

  const choose = (item: WorkItem) => {
    if (pending && !window.confirm('Discard unapplied tree changes?')) return
    setSelectedId(item.id)
    setDesign(designForTree(item))
    setName(item.name)
    setRateId(item.rate_id ?? '')
    if (item.geometry?.type === 'Point') setPoint(item.geometry.coordinates)
    setPlacing(false)
    setGhost(null)
    setError('')
    if (map && item.geometry?.type === 'Point')
      map.easeTo({
        center: item.geometry.coordinates,
        pitch: 55,
        zoom: Math.max(map.getZoom(), 20),
        duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 350,
      })
  }
  const latest = useRef({ design, rateId, selected, pending, editable, choose })
  useEffect(() => {
    latest.current = { design, rateId, selected, pending, editable, choose }
  })

  async function save(position: [number, number], create = false) {
    if (!editable || actionBusy.current) return
    if (rateId && (!design.stock_spec.trim() || !design.rate_reviewed)) {
      setError('Add the purchased stock specification and confirm that the rate matches it.')
      return
    }
    actionBusy.current = true
    setWorking(true)
    onWorking(true)
    setError('')
    const item: WorkItem =
      selected && !create
        ? {
            ...structuredClone(selected),
            tree_design: design,
            name: name.trim() || selected.name,
            geometry: { type: 'Point', coordinates: position },
            rate_id: rateId || null,
            layout_plant: 'tree',
          }
        : {
            id: crypto.randomUUID(),
            name: `${choice.name} ${trees.length + 1}`,
            kind: 'tree',
            status: 'proposed',
            layout_plant: 'tree',
            tree_design: design,
            geometry: { type: 'Point', coordinates: position },
            count: 1,
            manual_basis: 'count',
            category: 'Proposed trees',
            visible: true,
            provenance: 'estimated',
            source_note:
              'Concept planted-tree location and visual size; purchased stock and installation specified separately.',
            height_m: null,
            height_source: '',
            quantity_override: null,
            crown_diameter_m: null,
            rate_id: rateId || null,
          }
    const input = workspaceInput(data, revision)
    const clean = structuredClone(item)
    delete clean.quantity
    delete clean.schedule
    delete clean.reference_review_required
    delete clean.object_pose
    try {
      const next = await request(
        endpoint.replace(/\/workspace$/, '/spatial-edit'),
        workspaceDataSchema,
        token,
        {
          method: 'POST',
          body: JSON.stringify({ workspace: input, scenario, operation: 'tree', tree_item: clean }),
        },
      )
      if (!alive.current) return
      onChange(next)
      setPoint(position)
      if (!create) {
        setNotice('Tree updated in your draft. Save the workspace to retain it.')
        setGhost(null)
      } else {
        setNotice('Tree planted in your draft. Click to plant another, or choose Select.')
        setSelectedId('')
      }
    } catch (reason) {
      if (alive.current)
        setError(
          reason instanceof Error ? reason.message : 'Tree edit failed. Your draft is retained.',
        )
    } finally {
      actionBusy.current = false
      if (alive.current) {
        setWorking(false)
        onWorking(false)
      }
    }
  }
  const saveRef = useRef(save)
  useEffect(() => {
    saveRef.current = save
  })

  useEffect(() => {
    if (!map || !panelActive || !placing || !editable) return
    const canvas = map.getCanvas(),
      previous = canvas.style.cursor
    canvas.style.cursor = 'crosshair'
    const hover = (event: { lngLat: { lng: number; lat: number } }) =>
      setGhost({
        longitude: event.lngLat.lng,
        latitude: event.lngLat.lat,
        ...latest.current.design,
      })
    const click = (event: { lngLat: { lng: number; lat: number } }) =>
      void saveRef.current([event.lngLat.lng, event.lngLat.lat], true)
    const leave = () => setGhost(null)
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPlacing(false)
        setGhost(null)
      }
    }
    map.on('mousemove', hover)
    map.on('click', click)
    canvas.addEventListener('pointerleave', leave)
    window.addEventListener('keydown', escape)
    return () => {
      map.off('mousemove', hover)
      map.off('click', click)
      canvas.removeEventListener('pointerleave', leave)
      window.removeEventListener('keydown', escape)
      canvas.style.cursor = previous
    }
  }, [map, panelActive, placing, editable])
  useEffect(() => {
    if (
      !map ||
      !selected ||
      !panelActive ||
      !editable ||
      placing ||
      selected.geometry?.type !== 'Point'
    )
      return
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'planted-tree-move'
    button.textContent = '↔'
    button.setAttribute('aria-label', 'Drag selected tree to move it')
    const marker = new mapboxgl.Marker({ element: button, draggable: true })
      .setLngLat(selected.geometry.coordinates)
      .addTo(map)
    marker.on('drag', () => {
      const p = marker.getLngLat()
      setPoint([p.lng, p.lat])
    })
    marker.on('dragend', () => {
      const p = marker.getLngLat()
      void saveRef.current([p.lng, p.lat])
    })
    return () => {
      marker.remove()
    }
  }, [map, selected, panelActive, editable, placing])
  const visibleTrees = trees.filter((item) => props.categoryLayers[item.category] !== false)
  const renderedTrees = visibleTrees.map((item) =>
    item.id === selectedId && pending
      ? { ...item, tree_design: design, geometry: { type: 'Point' as const, coordinates: point } }
      : item,
  )
  const matchedRate = rates.find((rate) => rate.id === rateId)

  async function remove() {
    if (!selected || !editable) return
    setWorking(true)
    onWorking(true)
    try {
      const next = await request(
        endpoint.replace(/\/workspace$/, '/spatial-edit'),
        workspaceDataSchema,
        token,
        {
          method: 'POST',
          body: JSON.stringify({
            workspace: workspaceInput(data, revision),
            scenario,
            operation: 'delete',
            ids: [selected.id],
          }),
        },
      )
      onChange(next)
      setSelectedId('')
      setNotice('Tree removed. Undo is available before saving.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not remove tree.')
    } finally {
      setWorking(false)
      onWorking(false)
    }
  }
  return (
    <section className="proposed-trees" aria-label="Plant trees">
      <PlantedTreeLayer
        solar={props.solar}
        flatGround={!data.scenarios[scenario].terrain}
        map={map}
        items={[...renderedTrees, ...data.scenarios[scenario].items.filter((item) =>
          (item.layout_plant === 'shrub' || item.layout_plant === 'flowers') && props.categoryLayers[item.category] !== false)]}
        ghost={panelActive && placing ? ghost : null}
        visible={props.showModels}
        picking={panelActive && !placing && !working}
        onSelect={(id) => {
          const item = trees.find((item) => item.id === id)
          if (item) choose(item)
        }}
      />
      <div className="tree-garden-heading">
        <span className="town-eyebrow">PLANT YOUR DESIGN</span>
        <h3>A tree for every corner</h3>
        <p>Pick a tree look, then click your site. Hover to preview; Escape stops planting.</p>
        <p className="tree-shadow-note" role="status">
          {elevatedMap || data.scenarios[scenario].terrain
            ? 'Tree shadows paused: flat ground only.'
            : !props.solar
              ? 'Tree shadows unavailable: waiting for sun context.'
              : props.solar.elevation_deg < 5
                ? 'Tree shadows hidden: night or very low sun.'
                : 'Tree shadows follow Sun context. Visual preview from model size; not a calculated shade study.'}
        </p>
      </div>
      <div className="tree-option-tabs" aria-label="Tree design option">
        {(['option_a', 'option_b'] as const).map((key) => (
          <button
            key={key}
            type="button"
            disabled={working || pending}
            aria-pressed={scenario === key}
            onClick={() => props.onScenario(key)}
          >
            {data.scenarios[key].name}
          </button>
        ))}
        <button
          type="button"
          disabled={!map}
          onClick={() =>
            map?.easeTo({
              pitch: 60,
              bearing: -20,
              zoom: Math.max(map.getZoom(), 19),
              duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 450,
            })
          }
        >
          View in 3D
        </button>
      </div>
      {scenario === 'baseline' && (
        <p className="town-note">
          Choose a proposed option to plant trees. Existing-site records stay in Existing site.
        </p>
      )}
      <div className="tree-model-tray">
        {treeChoices.map((entry) => (
          <button
            type="button"
            key={entry.id}
            disabled={!editable || working || pending}
            aria-pressed={design.variant === entry.id && placing}
            onClick={() => {
              setSelectedId('')
              if (entry.id !== design.variant) {
                setRateId('')
                setDesign({ ...design, variant: entry.id, stock_spec: '', rate_reviewed: false })
              }
              setName('')
              setPlacing(true)
              setError('')
            }}
          >
            <TreeArt variant={entry.id} />
            <strong>{entry.name}</strong>
            <small>{entry.detail}</small>
          </button>
        ))}
      </div>
      <div className="tree-garden-actions">
        <button
          type="button"
          aria-pressed={!placing}
          onClick={() => {
            setPlacing(false)
            setGhost(null)
          }}
        >
          <MousePointer2 size={17} /> Select trees
        </button>
        <button
          type="button"
          disabled={!props.canUndo || disabled || pending || working}
          onClick={props.onUndo}
        >
          <Undo2 size={17} /> Undo
        </button>
        <button
          type="button"
          disabled={!props.canRedo || disabled || pending || working}
          onClick={props.onRedo}
        >
          <Redo2 size={17} /> Redo
        </button>
      </div>
      <div className="tree-pose-panel">
        <h4>
          {selected
            ? selected.name
            : placing
              ? `Placing ${choice.name.toLowerCase()}`
              : 'Tree settings'}
        </h4>
        <div className="tree-garden-actions">
          {[
            { name: 'Small', value: 0.6 },
            { name: 'Medium', value: 1 },
            { name: 'Large', value: 1.5 },
          ].map((size) => (
            <button
              type="button"
              key={size.name}
              disabled={!editable}
              onClick={() => setDesign({ ...design, scale: size.value })}
            >
              {size.name}
            </button>
          ))}
        </div>
        <label>
          Size · {design.scale.toFixed(2)}×
          <input
            aria-label="Tree display size"
            type="range"
            min="0.25"
            max="3"
            step="0.05"
            value={design.scale}
            disabled={!editable}
            onChange={(event) => setDesign({ ...design, scale: Number(event.target.value) })}
          />
        </label>
        <span className="tree-size-note">
          Model ≈ {(choice.height * design.scale).toFixed(1)} m tall ×{' '}
          {(choice.width * design.scale).toFixed(1)} m wide
        </span>
        <label>
          Rotation · {design.rotation_deg}°
          <input
            aria-label="Tree rotation"
            type="range"
            min="0"
            max="359"
            step="1"
            value={design.rotation_deg}
            disabled={!editable}
            onChange={(event) => setDesign({ ...design, rotation_deg: Number(event.target.value) })}
          />
        </label>
        <button
          type="button"
          disabled={!editable}
          onClick={() => setDesign({ ...design, rotation_deg: (design.rotation_deg + 45) % 360 })}
        >
          <RotateCw size={16} /> Turn 45°
        </button>
        {selected && (
          <>
            <label>
              Tree name
              <input
                value={name}
                maxLength={160}
                disabled={!editable}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <div className="tree-garden-actions">
              <button
                type="button"
                disabled={
                  !editable ||
                  !pending ||
                  working ||
                  Boolean(rateId && (!design.stock_spec || !design.rate_reviewed))
                }
                onClick={() => void save(point)}
              >
                <Check size={16} /> Apply tree changes
              </button>
              <button
                type="button"
                disabled={!editable || working}
                onClick={() => {
                  if (map) {
                    const p = map.getCenter()
                    void save([p.lng, p.lat])
                  }
                }}
              >
                <Move size={16} /> Move to map centre
              </button>
              <button type="button" disabled={!editable || working} onClick={() => void remove()}>
                <Trash2 size={16} /> Remove
              </button>
            </div>
            {pending && (
              <button type="button" onClick={() => choose(selected)}>
                Discard tree changes
              </button>
            )}
          </>
        )}
        <small>
          Visual size is a design assumption, not surveyed height or nursery stock. Size/rotation
          changes do not multiply tree counts or prices.
        </small>
      </div>
      <details className="tree-cost-panel" open>
        <summary>Tree specification &amp; cost</summary>
        <label>
          Purchased stock specification
          <input
            maxLength={500}
            value={design.stock_spec}
            disabled={!editable || !props.canPrice}
            placeholder="Species/size, stock size and installation inclusions"
            onChange={(event) =>
              setDesign({ ...design, stock_spec: event.target.value, rate_reviewed: false })
            }
          />
        </label>
        <div className="tree-rate-search">
          <input
            aria-label="Find tree rates"
            value={rateSearch}
            onChange={(event) => setRateSearch(event.target.value)}
            placeholder="Search your sourced rates"
          />
          <button type="button" onClick={() => setQuery(rateSearch)}>
            Search
          </button>
        </div>
        <label>
          Per-tree rate
          <select
            aria-label="Per-tree rate"
            value={rateId}
            disabled={!editable || !props.canPrice}
            onChange={(event) => {
              setRateId(event.target.value)
              setDesign({ ...design, rate_reviewed: false })
            }}
          >
            <option value="">Unpriced — choose a sourced rate</option>
            {rateId && !matchedRate && (
              <option value={rateId}>Saved rate version — review source/validity</option>
            )}
            {rates.map((rate) => (
              <option key={rate.id} value={rate.id}>
                {rate.description} ·{' '}
                {rate.amount == null ? 'Restricted' : `MYR ${rate.amount}/tree`} · {rate.code} v
                {rate.version}
              </option>
            ))}
          </select>
        </label>
        {matchedRate && (
          <p>
            {matchedRate.source_note} · effective {matchedRate.effective_date} · valid until{' '}
            {matchedRate.valid_until ?? 'not recorded'}
          </p>
        )}
        {rateId && (
          <label className="tree-rate-confirm">
            <input
              type="checkbox"
              checked={design.rate_reviewed}
              disabled={!editable || !props.canPrice}
              onChange={(event) => setDesign({ ...design, rate_reviewed: event.target.checked })}
            />{' '}
            I checked that this rate matches the purchased stock and inclusions.
          </label>
        )}
        {!rateId && (
          <p className="tree-unpriced">Unpriced. A model does not provide a supplier price.</p>
        )}
        <button type="button" disabled={pending || working} onClick={props.onEstimate}>
          Review option estimate / manage rates
        </button>
        {selected && (
          <button
            type="button"
            disabled={pending || working}
            onClick={() => props.onSpecifications(selected.id)}
          >
            Full plant specification
          </button>
        )}
        {selected && (
          <button type="button" disabled={pending || working} onClick={() => openPricing(selected.id)}>
            Open in Pricing
          </button>
        )}
        <small>
          Pricing lists every tree, object, path and road with its price status, and can apply one
          reviewed rate to matching trees with the same stock.
        </small>
      </details>
      <div className="tree-planted-list">
        <h4>
          <Trees size={17} /> Planted in this option · {trees.length}
        </h4>
        {!trees.length && <p>Choose a tree above to start planting.</p>}
        {trees.map((item) => {
          const cost = costs?.rows.find((row) => row.parent_id === item.id)
          return (
            <button
              type="button"
              key={item.id}
              className={item.id === selectedId ? 'selected' : ''}
              onClick={() => choose(item)}
            >
              <TreeArt variant={designForTree(item).variant} />
              <span>
                <strong>{item.name}</strong>
                <small>
                  {props.dirty
                    ? 'Save to update costs'
                    : cost?.total
                      ? `MYR ${cost.total} · ${cost.quantity} tree`
                      : cost?.status?.includes('restricted')
                        ? 'Cost restricted'
                        : 'Unpriced'}
                  {item.editor_locked ? ' · locked' : ''}
                </small>
              </span>
            </button>
          )
        })}
      </div>
      {error && (
        <p role="alert" className="tree-error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="town-note">
          {notice}
        </p>
      )}
      <p className="tree-footer">
        Four illustrative tree forms, not an automatic species recommendation or growth simulation.
        Models do not enter analytical tree shade. Pricing uses explicit counts, specified stock and
        selected source rates; estimates remain preliminary.
      </p>
    </section>
  )
}
