import { useCallback, useEffect, useRef, useState } from 'react'
import type { Map } from 'mapbox-gl'
import {
  MousePointer2,
  Route,
  Trees,
  Flower2,
  Sprout,
  Trash2,
  LocateFixed,
  Undo2,
  Redo2,
  Paintbrush,
} from 'lucide-react'
import RoadEditor from './RoadEditor'
import GroundPaint from './GroundPaint'
import { useStudioToolActive } from './studio-context'
import { openPricing } from '../domain/pricing'
import { request } from '../services/api'
import {
  workspaceDataSchema,
  workspaceInput,
  type WorkspaceData,
  type ScenarioKey,
  type WorkItem,
} from '../domain/workspace'
import './town-layout.css'
import { plantChoices, type PlantVariant } from '../services/plant-models'

function PlantArt({ variant }: { variant: PlantVariant }) {
  const look = plantChoices.find((choice) => choice.id === variant)!
  return <svg viewBox="0 0 100 90" aria-hidden="true" className="plant-model-art">
    <ellipse cx="50" cy="81" rx="35" ry="5" fill="#476a3820" />
    {look.kind === 'shrub' ? variant === 'grass' ? Array.from({ length: 13 }, (_, i) =>
      <path key={i} d={`M50 80Q${25 + i * 4} 45 ${9 + i * 7} ${30 + Math.abs(6 - i) * 3}`} stroke={i % 2 ? '#8d9f50' : '#527b43'} strokeWidth="4" fill="none" />
    ) : <>
      <path d="M50 80V38M50 65L25 41M50 61L76 35" stroke="#806448" strokeWidth="4" fill="none" />
      {Array.from({ length: 22 }, (_, i) => {
        const x = 18 + (i * 19 % 65), y = variant === 'hedge' ? 32 + i * 13 % 38 : 25 + i * 17 % 46
        return <ellipse key={i} cx={x} cy={y} rx="10" ry="6" transform={`rotate(${i * 39} ${x} ${y})`} fill={i % 3 ? look.color : '#85a45e'} />
      })}
    </> : [22, 39, 56, 73].map((x, i) => <g key={x}>
      <path d={`M${x} 79V${29 + i % 2 * 9}M${x} 65l-9 -12M${x} 57l9 -9`} stroke="#5b8452" strokeWidth="3" fill="none" />
      {variant === 'tulip' ? <path d={`M${x - 10} ${24 + i % 2 * 9}q10 9 20 0q0 23 -10 23q-10 0 -10 -23Z`} fill={look.color} /> : variant === 'lavender' ?
        Array.from({ length: 6 }, (_, j) => <ellipse key={j} cx={x + j % 2 * 5 - 2} cy={20 + j * 4} rx="5" ry="4" fill={j % 2 ? '#a593c8' : look.color} />) : <>
          {Array.from({ length: 8 }, (_, k) => <ellipse key={k} cx={x} cy={25 + i % 2 * 9} rx="4" ry="11" transform={`rotate(${k * 45} ${x} ${34 + i % 2 * 9})`} fill="#fff6df" stroke="#d9ceac" strokeWidth="0.6" />)}
          <circle cx={x} cy={34 + i % 2 * 9} r="5" fill="#e9b331" />
        </>}
    </g>)}
  </svg>
}

type Props = {
  map: Map | null
  data: WorkspaceData
  scenario: ScenarioKey
  revision: number
  siteArea?: number | null
  endpoint: string
  token?: string
  disabled: boolean
  selectedIds: string[]
  onSelect: (ids: string[]) => void
  onChange: (data: WorkspaceData) => void
  onRoadDirty: (dirty: boolean) => void
  onRoadActive: (active: boolean) => void
  onPlantActive: (active: boolean) => void
  onPaintActive: (active: boolean) => void
  onPaintDirty: (dirty: boolean) => void
  onWorking: (busy: boolean) => void
  onMaterials: (id: string) => void
  onEstimate: () => void
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
}
const plantTools = [
  { id: 'shrub', name: 'Shrub', Icon: Sprout, detail: 'Small green cluster' },
  { id: 'flowers', name: 'Flowers', Icon: Flower2, detail: 'Flower cluster marker' },
] as const

export default function TownLayout(props: Props) {
  const {
    map,
    data,
    scenario,
    revision,
    endpoint,
    token,
    disabled,
    onChange,
    onPlantActive,
    onWorking,
    onRoadDirty,
    onSelect,
    onPaintDirty,
  } = props
  const [tool, setTool] = useState<'select' | 'roads' | 'plants' | 'ground'>('roads')
  const layoutActive = useStudioToolActive('layout')
  const [plant, setPlant] = useState<NonNullable<WorkItem['layout_plant']> | null>(null)
  const [variant, setVariant] = useState<PlantVariant>('leafy')
  const [roadDraft, setRoadDraft] = useState(false)
  const [paintDraft, setPaintDraft] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const placing = useRef(false)
  const editable = !disabled && layoutActive && scenario !== 'baseline'
  const items = data.scenarios[scenario].items
  const area = data.boundary_area_m2 ?? props.siteArea
  const roadDirty = useCallback(
    (value: boolean) => {
      setRoadDraft(value)
      onRoadDirty(value)
    },
    [onRoadDirty],
  )
  const paintDirty = useCallback(
    (value: boolean) => {
      setPaintDraft(value)
      onPaintDirty(value)
    },
    [onPaintDirty],
  )
  useEffect(() => {
    onPlantActive(tool === 'plants' && Boolean(plant) && editable)
    return () => onPlantActive(false)
  }, [tool, plant, editable, onPlantActive])

  useEffect(() => {
    if (!map || tool !== 'plants' || !plant || !editable) return
    const canvas = map.getCanvas()
    const previous = canvas.style.cursor
    canvas.style.cursor = 'crosshair'
    const place = async (event: { lngLat: { lng: number; lat: number } }) => {
      if (placing.current) return
      placing.current = true
      onWorking(true)
      setError('')
      try {
        const selected = plantTools.find((entry) => entry.id === plant)!
        const look = plantChoices.find((choice) => choice.id === variant)!
        const item: WorkItem = {
          id: crypto.randomUUID(),
          name: `${selected.name} ${items.filter((item) => item.layout_plant === plant).length + 1}`,
          kind: 'tree',
          layout_plant: plant,
          plant_variant: look.id,
          status: 'proposed',
          geometry: { type: 'Point', coordinates: [event.lngLat.lng, event.lngLat.lat] },
          count: 1,
          manual_basis: 'count',
          category: 'Concept planting',
          visible: true,
          provenance: 'estimated',
          source_note:
            'Concept planting location on site map; species, nursery size and installation scope not specified.',
          height_m: null,
          height_source: '',
          quantity_override: null,
          rate_id: null,
          crown_diameter_m: null,
        }
        const result = await request(
          endpoint.replace(/\/workspace$/, '/spatial-edit'),
          workspaceDataSchema,
          token,
          {
            method: 'POST',
            body: JSON.stringify({
              workspace: workspaceInput(data, revision),
              scenario,
              operation: 'plant',
              plant_item: item,
            }),
          },
        )
        onChange(result)
        onSelect([item.id])
        setMessage(`${selected.name} placed. Click to place another, or choose Select.`)
      } catch (reason) {
        setError(
          reason instanceof Error
            ? reason.message
            : 'Plant could not be placed. Your layout is retained.',
        )
      } finally {
        placing.current = false
        onWorking(false)
      }
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPlant(null)
    }
    map.on('click', place)
    window.addEventListener('keydown', escape)
    return () => {
      map.off('click', place)
      window.removeEventListener('keydown', escape)
      canvas.style.cursor = previous
    }
  }, [
    map,
    tool,
    plant,
    variant,
    editable,
    data,
    items,
    scenario,
    revision,
    endpoint,
    token,
    onChange,
    onSelect,
    onWorking,
  ])

  async function remove(item: WorkItem) {
    onWorking(true)
    setError('')
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
            ids: [item.id],
          }),
        },
      )
      onChange(next)
      props.onSelect([])
      setMessage('Removed from your draft. Undo is available before saving.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not remove item.')
    } finally {
      onWorking(false)
    }
  }

  return (
    <section className="town-layout" aria-label="Town builder layout">
      <div className="town-site-card">
        <span className="town-site-icon">▧</span>
        <div>
          <span className="town-eyebrow">YOUR SITE · ESTIMATED</span>
          <strong>
            {area == null
              ? 'Area unavailable'
              : `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(area)} m²`}
          </strong>
          <small>
            {area == null
              ? 'Verify a suitable site boundary to calculate area.'
              : `${(area / 10000).toFixed(3)} ha · map boundary, not a survey`}
          </small>
        </div>
      </div>
      <div className="town-tool-tray" role="group" aria-label="Layout building tools">
        {(
          [
            { id: 'select', label: 'Select', Icon: MousePointer2 },
            { id: 'roads', label: 'Roads', Icon: Route },
            { id: 'plants', label: 'Planting', Icon: Trees },
            { id: 'ground', label: 'Ground', Icon: Paintbrush },
          ] as const
        ).map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            aria-pressed={tool === id}
            disabled={(roadDraft || paintDraft) && tool !== id}
            onClick={() => {
              setTool(id)
              setPlant(null)
              setError('')
            }}
          >
            <Icon size={23} aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </div>
      <div className="town-history">
        <span>{items.filter((item) => item.status === 'proposed').length} proposed items</span>
        <button
          type="button"
          aria-label="Undo layout change"
          disabled={!props.canUndo || disabled || roadDraft || paintDraft}
          onClick={props.onUndo}
        >
          <Undo2 size={17} /> Undo
        </button>
        <button
          type="button"
          aria-label="Redo layout change"
          disabled={!props.canRedo || disabled || roadDraft || paintDraft}
          onClick={props.onRedo}
        >
          <Redo2 size={17} /> Redo
        </button>
      </div>
      <div hidden={tool !== 'roads'}>
        <RoadEditor
          map={map}
          data={data}
          scenario={scenario}
          revision={revision}
          endpoint={endpoint}
          token={token}
          disabled={disabled || !layoutActive}
          onChange={onChange}
          onDirty={roadDirty}
          onActive={props.onRoadActive}
          onMaterials={props.onMaterials}
          onEstimate={props.onEstimate}
        />
      </div>
      <GroundPaint
        map={map}
        data={data}
        scenario={scenario}
        revision={revision}
        endpoint={endpoint}
        token={token}
        active={tool === 'ground' && layoutActive}
        disabled={disabled}
        onChange={onChange}
        onActive={props.onPaintActive}
        onDirty={paintDirty}
        onWorking={onWorking}
      />
      {tool === 'plants' && (
        <div className="town-planting">
          <h3>Bring the site to life</h3>
          <p>Choose a plant, then click on your site. Escape stops planting.</p>
          <p className="town-note">Trees live in the Trees section. Choose one of three shrub or flower looks below.</p>
          <div className="town-plant-tray">
            {plantTools.map(({ id, name, Icon, detail }) => (
              <button
                type="button"
                key={id}
                disabled={!editable}
                aria-pressed={plant === id}
                onClick={() => { setPlant(plant === id ? null : id); setVariant(id === 'shrub' ? 'leafy' : 'daisy') }}
              >
                <span className={`town-plant-art town-plant-${id}`}>
                  <Icon size={33} aria-hidden="true" />
                </span>
                <strong>{name}</strong>
                <small>{detail}</small>
              </button>
            ))}
          </div>
          {plant && <div className="town-plant-models" aria-label="Plant model choices">
            {plantChoices.filter((choice) => choice.kind === plant).map((choice) => <button
              key={choice.id} type="button" disabled={!editable} aria-pressed={variant === choice.id}
              onClick={() => setVariant(choice.id)}>
              <PlantArt variant={choice.id} /><strong>{choice.name}</strong><small>{choice.detail}</small>
            </button>)}
          </div>}
          {scenario === 'baseline' && <p>Choose Option A or B for proposed planting.</p>}
          <p className="town-note">
            Models are illustrative looks, not specified species, nursery sizes or prices. Each placement is one planting item. Add plant
            specifications and rates in Materials when ready.
          </p>
        </div>
      )}
      {tool === 'select' && (
        <div className="town-selection">
          <h3>Your layout</h3>
          <p>Click an item on the map or pick one below.</p>
          {items.length === 0 && (
            <div className="town-empty">
              Your site is ready.
              <br />
              Choose Roads or Planting to begin.
            </div>
          )}
          {items.map((item) => (
            <article key={item.id} data-selected={props.selectedIds.includes(item.id)}>
              <button
                type="button"
                className="town-item-name"
                onClick={() => {
                  props.onSelect([item.id])
                  if (map && item.geometry?.type === 'Point')
                    map.easeTo({ center: item.geometry.coordinates, duration: 250 })
                }}
              >
                <LocateFixed size={17} />
                <span>
                  <strong>{item.name}</strong>
                  <small>
                    {item.road
                      ? `${item.road.surface} · ${item.quantity?.value.toFixed(1) ?? '…'} m²`
                      : (item.layout_plant ?? item.kind)}{' '}
                    · {item.status}
                    {item.layout_plant && !item.rate_id ? ' · unpriced' : ''}
                  </small>
                </span>
              </button>
              {item.layout_plant && (
                <button
                  type="button"
                  aria-label={`Specifications and cost for ${item.name}`}
                  onClick={() => props.onMaterials(item.id)}
                >
                  Details
                </button>
              )}
              {item.status === 'proposed' && (
                <button
                  type="button"
                  aria-label={`Price ${item.name}`}
                  onClick={() => openPricing(item.id)}
                >
                  Price
                </button>
              )}
              <button
                type="button"
                disabled={!editable || item.status !== 'proposed' || item.editor_locked}
                aria-label={`Remove ${item.name}`}
                onClick={() => void remove(item)}
              >
                <Trash2 size={17} />
              </button>
            </article>
          ))}
        </div>
      )}
      {error && (
        <p role="alert" className="town-error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="town-note">
          {message}
        </p>
      )}
    </section>
  )
}
