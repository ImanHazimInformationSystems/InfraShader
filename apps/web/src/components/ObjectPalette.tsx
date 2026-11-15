import type { Map as GeographicMap } from 'mapbox-gl'
import type { Solar } from '../services/environment'
import { mapFrameSchema, type MapFrame } from '../services/map-frame'
import type { SceneOutline, SceneView } from './ObjectScene'
import { createPortal } from 'react-dom'
import { z } from 'zod'
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { catalogueSchema, type ObjectPreset, type ObjectInstance } from '../domain/objects'
import {
  geometrySchema,
  type Geometry,
  itemSchema,
  workspaceDataSchema,
  workspaceInput,
  type WorkspaceData,
  type ScenarioKey,
  type WorkItem,
} from '../domain/workspace'
import { request } from '../services/api'
const ObjectScene = lazy(() => import('./ObjectScene'))
import ObjectBuilder from './ObjectBuilder'
import { useStudioToolActive } from './studio-context'
import { previewObject } from '../services/object-effects'
import type { TerrainBrush } from '../domain/terrain'
import type { TerrainWaterPreview } from '../domain/terrain-study'
type Props = {
  terrainWater?: TerrainWaterPreview | null
  terrainBrush?: TerrainBrush
  onTerrainMessage?: (message: string) => void
  placementMap?: GeographicMap | null
  revision?: number
  solar?: Solar | null
  geographicMap?: GeographicMap | null
  sceneHost?: HTMLDivElement | null
  sceneMode?: boolean
  onSceneMode?: (value: boolean) => void
  data: WorkspaceData
  scenario: ScenarioKey
  endpoint: string
  token?: string
  disabled: boolean
  onChange: (data: WorkspaceData) => void
  onDirty: (dirty: boolean) => void
  onWorking: (busy: boolean) => void
  categoryLayers: Record<string, boolean>
  onCategoryLayers: (layers: Record<string, boolean>) => void
  selection?: string | null
  onSelection?: (id: string) => void
  siteLayers?: {
    boundary: boolean
    target: boolean
    building: boolean
    canopy: boolean
    work: boolean
  }
}
export default function ObjectPalette({
  terrainWater,
  terrainBrush,
  onTerrainMessage,
  placementMap,
  revision = 0,
  solar,
  geographicMap,
  sceneHost,
  sceneMode,
  onSceneMode,
  data,
  scenario,
  endpoint,
  token,
  disabled,
  onChange,
  onDirty,
  onWorking,
  categoryLayers,
  onCategoryLayers,
  selection,
  onSelection,
  siteLayers,
}: Props) {
  const terrainActive = useStudioToolActive('terrain')
  const objectsActive = useStudioToolActive('objects')
  const [precision, setPrecision] = useState(false)
  const [objectPlacing, setObjectPlacing] = useState(false)
  const [gestureDirty, setGestureDirty] = useState(false)
  const sceneView = useRef<SceneView | null>(null)
  const [presets, setPresets] = useState<ObjectPreset[]>([]),
    [query, setQuery] = useState(''),
    [category, setCategory] = useState('All'),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [retry, setRetry] = useState(0)
  const [assetId, setAssetId] = useState('bench'),
    [selectedId, setSelectedId] = useState(''),
    [name, setName] = useState('Park bench'),
    [pending, setPending] = useState(false),
    [localShow3D, setLocalShow3D] = useState(false)
  const show3D = sceneMode ?? localShow3D
  const setShow3D = onSceneMode ?? setLocalShow3D
  const [sceneGeometry, setSceneGeometry] = useState<{
    data: WorkspaceData
    shapes: Record<string, Geometry>
    frame: MapFrame
    context: { boundary: Geometry; targets: Record<string, Geometry> }
  } | null>(null)
  const [sceneError, setSceneError] = useState('')
  useEffect(() => {
    if (!show3D && !data.scenarios[scenario].items.some((item) => item.object_instance)) return
    const controller = new AbortController()
    void request(
      `${endpoint.replace(/\/workspace$/, '')}/spatial-scene?georeferenced=true`,
      z.object({
        shapes: z.record(z.string(), z.record(z.string(), geometrySchema)),
        frame: mapFrameSchema,
        context: z.object({
          boundary: geometrySchema,
          targets: z.record(z.string(), geometrySchema),
        }),
      }),
      token,
      { method: 'POST', signal: controller.signal, body: JSON.stringify(workspaceInput(data, 0)) },
    )
      .then((result) => {
        if (!controller.signal.aborted) {
          setSceneGeometry({
            data,
            shapes: result.shapes[scenario],
            frame: result.frame,
            context: result.context,
          })
          setSceneError('')
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) setSceneError(error.message)
      })
    return () => controller.abort()
  }, [data, scenario, show3D, endpoint, token])
  const bounds = data.boundary.type === 'Polygon' ? data.boundary.coordinates[0] : [[0, 0]]
  const [form, setForm] = useState<ObjectInstance>({
    asset_id: 'bench',
    version: 1,
    longitude: bounds.reduce((s, p) => s + p[0], 0) / bounds.length,
    latitude: bounds.reduce((s, p) => s + p[1], 0) / bounds.length,
    rotation_deg: 0,
    scale: 1,
    stretch_x: 1, stretch_y: 1, stretch_z: 1, tilt_deg: 0, lean_deg: 0, light_on: true, light_intensity: 1,
    elevation_offset_m: 0,
    snap_m: 0,
    group: '',
    locked: false,
  })
  const [east, setEast] = useState(1),
    [north, setNorth] = useState(0),
    [turn, setTurn] = useState(15)
  const items = data.scenarios[scenario].items,
    selected = items.find((i) => i.id === selectedId),
    preset = presets.find((p) => p.id === assetId)
  const inherited = Boolean(
    selected &&
    scenario !== 'baseline' &&
    data.scenarios.baseline.items.some((i) => i.id === selected.id),
  )
  const current = items.filter((i) => i.object_instance)
  useEffect(() => {
    const controller = new AbortController()
    fetch('/objects/catalogue.json', { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error('Object catalogue unavailable. Retry loading.')
        return r.json()
      })
      .then((j) => setPresets(catalogueSchema.parse(j)))
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message)
      })
    return () => controller.abort()
  }, [retry])
  useEffect(() => {
    onDirty(pending || busy || gestureDirty)
    return () => onDirty(false)
  }, [pending, busy, gestureDirty, onDirty])
  const select = useCallback(
    (id: string) => {
      if (pending && !window.confirm('Discard unapplied object changes?')) return
      const item = items.find((i) => i.id === id)
      if (!item?.object_instance) {
        onSelection?.(id)
        setSelectedId('')
        return
      }
      setSelectedId(id)
      onSelection?.(id)
      setAssetId(item.object_instance.asset_id)
      setName(item.name)
      setForm(item.object_instance)
      setPending(false)
    },
    [items, pending, onSelection],
  )
  const [previousItems, setPreviousItems] = useState(items)
  if (previousItems !== items) {
    setPreviousItems(items)
    if (!pending && selected?.object_instance) {
      setForm(selected.object_instance)
      setName(selected.name)
    }
    if (selectedId && !selected) setSelectedId('')
  }
  const incoming = items.find((i) => i.id === selection)
  if (selection && selection !== selectedId && incoming?.object_instance && !pending) {
    setSelectedId(incoming.id)
    setAssetId(incoming.object_instance.asset_id)
    setName(incoming.name)
    setForm(incoming.object_instance)
  }
  function changeForm(patch: Partial<ObjectInstance>) {
    setForm((f) => ({ ...f, ...patch }))
    setPending(true)
  }
  async function preview(next: WorkspaceData) {
    setBusy(true)
    onWorking(true)
    setError('')
    try {
      const checked = await request(
        `${endpoint.replace(/\/workspace$/, '')}/object-preview`,
        workspaceDataSchema,
        token,
        { method: 'POST', body: JSON.stringify(workspaceInput(next, 0)) },
      )
      onChange(checked)
      setPending(false)
      return checked
    } catch (e) {
      setError((e as Error).message)
      onTerrainMessage?.((e as Error).message)
    } finally {
      setBusy(false)
      onWorking(false)
    }
  }
  async function apply(position?: [number, number], create = false) {
    if (!preset || (!create && (inherited || selected?.object_instance?.locked))) return
    const previous = create ? undefined : selected
    const item = itemSchema.parse({
      ...previous,
      id: previous?.id ?? crypto.randomUUID(),
      name,
      kind: 'object',
      status: scenario === 'baseline' ? 'existing' : 'proposed',
      geometry: null,
      count: 1,
      height_m: null,
      height_source: '',
      quantity_override: null,
      provenance: 'estimated',
      source_note: `${preset.name} v${preset.version}; project-authored MIT concept geometry; not surveyed`,
      rate_id: previous?.rate_id ?? null,
      object_instance: { ...form, ...(position ? { longitude: position[0], latitude: position[1] } : {}), asset_id: preset.id, version: preset.version },
    })
    const next = structuredClone(data)
    next.scenarios[scenario].items = items.filter((i) => i.id !== item.id).concat(item)
    const checked = await preview(next)
    if (checked) {
      setSelectedId(item.id)
      onSelection?.(item.id)
      setForm(checked.scenarios[scenario].items.find((i) => i.id === item.id)!.object_instance!)
    }
  }
  async function modify(action: 'duplicate' | 'delete' | 'visibility' | 'lock') {
    if (!selected || inherited) return
    if (pending && !window.confirm('Discard unapplied object changes?')) return
    const next = structuredClone(data),
      list = next.scenarios[scenario].items,
      index = list.findIndex((i) => i.id === selected.id)
    if (action === 'duplicate') {
      const copy = structuredClone(selected)
      copy.id = crypto.randomUUID()
      copy.name += ' copy'
      copy.object_instance = { ...copy.object_instance!, locked: false }
      list.push(copy)
    }
    if (action === 'delete') list.splice(index, 1)
    if (action === 'visibility') list[index].visible = !list[index].visible
    if (action === 'lock')
      list[index].object_instance!.locked = !list[index].object_instance!.locked
    const checked = await preview(next)
    if (checked) {
      if (action === 'delete') {
        setSelectedId('')
        onSelection?.('')
      } else if (action === 'lock')
        setForm(
          checked.scenarios[scenario].items.find((i) => i.id === selected.id)!.object_instance!,
        )
    }
  }
  async function transform(operation: string, movement?: [number, number]) {
    if (!selected?.object_instance || disabled || inherited || selected.object_instance.locked)
      return
    if (pending) {
      setError('Apply or discard object fields before transforming the group.')
      return
    }
    const ids = current
      .filter((i) =>
        selected.object_instance!.group
          ? i.object_instance!.group === selected.object_instance!.group
          : i.id === selected.id,
      )
      .map((i) => i.id)
    setBusy(true)
    onWorking(true)
    setError('')
    try {
      const checked = await request(
        `${endpoint.replace(/\/workspace$/, '')}/object-transform`,
        workspaceDataSchema,
        token,
        {
          method: 'POST',
          body: JSON.stringify({
            workspace: workspaceInput(data, 0),
            scenario,
            ids,
            operation,
            east_m: movement?.[0] ?? east,
            north_m: movement?.[1] ?? north,
            rotation_deg: turn,
          }),
        },
      )
      onChange(checked)
      setForm(checked.scenarios[scenario].items.find((i) => i.id === selected.id)!.object_instance!)
      setPending(false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
      onWorking(false)
    }
  }
  const numeric = (
    label: string,
    key: 'longitude' | 'latitude' | 'rotation_deg' | 'scale' | 'elevation_offset_m' | 'snap_m',
  ) => (
    <label key={key}>
      {label}
      <input
        type="number"
        step="any"
        value={form[key]}
        onChange={(e) => changeForm({ [key]: Number(e.target.value) })}
      />
    </label>
  )
  const sceneItems = useMemo(
    () =>
      items.filter(
        (i) =>
          categoryLayers[i.category] !== false &&
          siteLayers?.[
            i.kind === 'building' ? 'building' : i.kind === 'canopy' ? 'canopy' : 'work'
          ] !== false,
      ).map((item) => pending && item.id === selectedId && item.object_pose && preset
        ? previewObject(item, form, preset) : item),
    [items, categoryLayers, siteLayers, pending, selectedId, preset, form],
  )
  const sceneOutlines = useMemo<SceneOutline[]>(() => {
    if (sceneGeometry?.data !== data) return []
    return [
      ...(siteLayers?.boundary === false
        ? []
        : [{ geometry: sceneGeometry.context.boundary, color: '#72233d' }]),
      ...(siteLayers?.target === false
        ? []
        : Object.entries(sceneGeometry.context.targets).map(([id, geometry]) => ({
            id,
            geometry,
            color: '#416b91',
          }))),
    ]
  }, [sceneGeometry, data, siteLayers?.boundary, siteLayers?.target])
  const sceneGroundPaint = useMemo(() => ({ boundary: data.boundary, strokes: data.scenarios[scenario].ground_paint ?? [] }), [data, scenario])
  const previewItems = useMemo<WorkItem[]>(
    () =>
      preset
        ? [
            itemSchema.parse({
              id: '00000000-0000-4000-8000-000000000001',
              name: preset.name,
              kind: 'object',
              status: 'proposed',
              geometry: null,
              count: 1,
              height_m: null,
              height_source: '',
              quantity_override: null,
              provenance: 'estimated',
              source_note: 'Preset preview',
              rate_id: null,
              object_instance: {
                asset_id: preset.id,
                version: 1,
                longitude: 0,
                latitude: 0,
                rotation_deg: 0,
                scale: 1,
                elevation_offset_m: 0,
                snap_m: 0,
                group: '',
                locked: false,
              },
              object_pose: {
                x: 0,
                y: 0,
                elevation_m: 0,
                ground_elevation_m: 0,
                dimensions: preset.dimensions,
                footprint: { type: 'Polygon', coordinates: [] },
                license: preset.license,
                asset_sha256: preset.sha256,
                metric_crs: 'Preview local metres',
              },
            }),
          ]
        : [],
    [preset],
  )
  return (
    <details open className="rounded border p-4" aria-label="Licensed object palette">
      <summary>Landscape objects</summary>
      {!precision && <ObjectBuilder map={placementMap ?? geographicMap ?? null} presets={presets} form={form} selected={selected} items={current}
        disabled={disabled || busy} readOnlySelection={inherited} pending={pending} busy={busy} onActive={setObjectPlacing} onDraft={setGestureDirty}
        onForm={changeForm} onPlace={apply} onApply={() => void apply()} onSelect={select} onAction={(action) => void modify(action)}
        onPreset={(asset) => { setSelectedId(''); onSelection?.(''); setAssetId(asset.id); setName(asset.name); setForm((f) => ({ ...f, asset_id: asset.id, version: asset.version, locked: false, scale: 1, stretch_x: 1, stretch_y: 1, stretch_z: 1, tilt_deg: 0, lean_deg: 0, rotation_deg: 0, elevation_offset_m: 0, snap_m: 0, group: '', light_on: true, light_intensity: 1 })); setPending(false) }}
        onFence={async (points) => {
          setBusy(true); onWorking(true); setError('')
          try { const checked = await request(`${endpoint.replace(/\/workspace$/, '')}/spatial-edit`, workspaceDataSchema, token,
            { method: 'POST', body: JSON.stringify({ workspace: workspaceInput(data, revision), scenario, operation: 'fence', fence_points: points }) })
            onChange(checked); setPending(false)
          } catch (e) { setError((e as Error).message) } finally { setBusy(false); onWorking(false) }
        }} />}
      <button type="button" disabled={gestureDirty || pending} onClick={() => setPrecision(!precision)}>{precision ? 'Simple object controls' : 'Precision object controls'}</button>
      {error && <p role="alert">{error}</p>}
      <div hidden={!precision}>
      <p>
        Project-authored MIT concept presets. Dimensions are nominal; no engineering, safety, shade
        or solar energy-output claim.{' '}
        <a href="/objects/LICENSE.txt" target="_blank" rel="noreferrer">
          Read asset licence
        </a>
        .
      </p>
      {error && <p role="alert">{error}</p>}
      {!presets.length && (
        <button type="button" onClick={() => setRetry((v) => v + 1)}>
          Retry object catalogue
        </button>
      )}
      <label>
        Search object presets
        <input value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      <label>
        Object category
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {['All', ...new Set(presets.map((p) => p.category))].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {presets
          .filter(
            (p) =>
              (category === 'All' || p.category === category) &&
              `${p.name} ${p.category}`.toLowerCase().includes(query.toLowerCase()),
          )
          .map((p) => (
            <button
              type="button"
              key={p.id}
              aria-pressed={assetId === p.id && !selectedId}
              onClick={() => {
                if (pending && !window.confirm('Discard unapplied object changes?')) return
                setSelectedId('')
                onSelection?.('')
                setAssetId(p.id)
                setName(p.name)
                setForm((f) => ({
                  ...f,
                  asset_id: p.id,
                  version: p.version,
                  locked: false,
                  scale: 1,
                }))
                setPending(false)
              }}
            >
              <img
                src={`/objects/${p.id}.svg`}
                alt={`${p.name} thumbnail`}
                width="120"
                height="100"
                loading="lazy"
              />
              {p.name}
            </button>
          ))}
      </div>
      {preset && (
        <p>
          {preset.name}: {preset.dimensions.join(' × ')} m (width × height × depth); {preset.unit};
          scale {preset.scale_min}–{preset.scale_max}; {preset.license}; ground-centre pivot;{' '}
          {preset.triangles} triangles. Source: {preset.source}. Thumbnail uses part bounds.
        </p>
      )}
      <label>
        <input type="checkbox" checked={show3D} onChange={(e) => setShow3D(e.target.checked)} />
        Show 3D object preview and layout
      </label>
      </div>
      {!show3D && placementMap && sceneHost && sceneGeometry?.data === data && current.length > 0 && createPortal(
        <Suspense fallback={null}><ObjectScene solar={solar} geographicMap={placementMap} mapFrame={sceneGeometry.frame} presets={presets}
          items={sceneItems.filter((item) => item.object_instance)} terrain={data.scenarios[scenario].terrain} disabled onSelect={objectPlacing ? undefined : select} selectedId={selectedId} /></Suspense>, sceneHost)}
      {show3D && (
        <Suspense fallback={<p>Loading object renderer…</p>}>
          {precision && <><h4>Selected preset at nominal size</h4>
          {previewItems.length > 0 && <ObjectScene presets={presets} items={previewItems} />}</>}
          {sceneHost
            ? createPortal(
                <>
                  <h4>Scenario design layout</h4>
                  {sceneError && (
                    <p role="alert">
                      Scene context unavailable: {sceneError}. Use the 2D plan or numeric controls;
                      your draft is kept.
                    </p>
                  )}
                  {sceneGeometry?.data !== data && (
                    <p role="status">
                      Updating projected geometry; ordinary geometry is hidden until validated.
                    </p>
                  )}
                  <ObjectScene
                    solar={solar}
                    geographicMap={geographicMap}
                    mapFrame={sceneGeometry?.data === data ? sceneGeometry.frame : undefined}
                    viewState={sceneView}
                    geometry={sceneGeometry?.data === data ? sceneGeometry.shapes : undefined}
                    outlines={sceneOutlines}
                    presets={presets}
                    items={sceneItems}
                    terrain={data.scenarios[scenario].terrain}
                    groundPaint={sceneGroundPaint}
                    terrainWater={(!terrainActive || terrainBrush?.mode === 'navigate') && data.scenarios[scenario].terrain_signature === terrainWater?.signature ? terrainWater : undefined}
                    terrainBoundary={sceneGeometry?.data === data ? sceneGeometry.context.boundary : undefined}
                    terrainBrush={terrainActive ? terrainBrush : undefined}
                    onTerrainGesture={setGestureDirty}
                    onTerrainMessage={onTerrainMessage}
                    onSelect={objectPlacing ? undefined : select}
                    selectedId={selection ?? selectedId}
                    disabled={disabled || pending}
                    onTerrain={terrainActive || (precision && objectsActive) ? (terrain) => {
                      const next = structuredClone(data)
                      next.scenarios[scenario].terrain = terrain
                      void preview(next)
                    } : undefined}
                    onMove={
                      !inherited && !selected?.object_instance?.locked && selected
                        ? (east, north) => {
                            void transform('translate', [east, north])
                          }
                        : undefined
                    }
                  />
                </>,
                sceneHost,
              )
            : null}
        </Suspense>
      )}
      <div hidden={!precision}>
      <fieldset>
        <legend>Object category layers (view only)</legend>
        {[...new Set(current.map((i) => i.category))].map((c) => (
          <label key={c}>
            <input
              type="checkbox"
              checked={categoryLayers[c] !== false}
              onChange={(e) => onCategoryLayers({ ...categoryLayers, [c]: e.target.checked })}
            />
            Show object category {c}
          </label>
        ))}
      </fieldset>
      <p>
        2D footprints remain on the site map. Use the object list and numeric transforms if WebGL is
        unavailable. Terrain contacts use the scenario grid; elevation offsets are conceptual and
        may intersect terrain. Assign rates in the existing pricing controls after saving.
      </p>
      <fieldset
        disabled={disabled || busy || inherited || Boolean(selected?.object_instance?.locked)}
      >
        <legend>{selected ? 'Edit selected object' : 'Place preset'}</legend>
        <label>
          Object name
          <input
            value={name}
            maxLength={160}
            onChange={(e) => {
              setName(e.target.value)
              setPending(true)
            }}
          />
        </label>
        {numeric('Object longitude', 'longitude')}
        {numeric('Object latitude', 'latitude')}
        {numeric('Object rotation (clockwise grid degrees)', 'rotation_deg')}
        {numeric('Object uniform scale', 'scale')}
        {numeric('Object elevation offset (m)', 'elevation_offset_m')}
        {numeric('Object snap grid (m; 0 disables)', 'snap_m')}
        <label>
          Object group
          <input
            maxLength={80}
            value={form.group}
            onChange={(e) => changeForm({ group: e.target.value })}
          />
        </label>
        <button
          type="button"
          disabled={!preset || !name.trim()}
          onClick={() => void apply().catch((e) => setError((e as Error).message))}
        >
          {selected ? 'Apply object changes' : 'Place object'}
        </button>
      </fieldset>
      {selected && (
        <fieldset disabled={disabled || busy || inherited}>
          <legend>Selected instance actions</legend>
          <button type="button" onClick={() => modify('lock')}>
            {selected.object_instance?.locked ? 'Unlock object' : 'Lock object'}
          </button>
          <button type="button" onClick={() => modify('visibility')}>
            {selected.visible ? 'Hide object' : 'Show object'}
          </button>
          <button type="button" onClick={() => modify('duplicate')}>
            Duplicate object
          </button>
          <button
            type="button"
            disabled={selected.object_instance?.locked}
            onClick={() => modify('delete')}
          >
            Delete object
          </button>
          <label>
            Group east movement (m)
            <input type="number" value={east} onChange={(e) => setEast(Number(e.target.value))} />
          </label>
          <label>
            Group north movement (m)
            <input type="number" value={north} onChange={(e) => setNorth(Number(e.target.value))} />
          </label>
          <label>
            Group rotation (degrees)
            <input type="number" value={turn} onChange={(e) => setTurn(Number(e.target.value))} />
          </label>
          {['translate', 'rotate', 'align_x', 'align_y'].map((op) => (
            <button
              key={op}
              type="button"
              disabled={selected.object_instance?.locked}
              onClick={() => transform(op)}
            >
              {
                {
                  translate: 'Move group',
                  rotate: 'Rotate group',
                  align_x: 'Align group easting',
                  align_y: 'Align group northing',
                }[op]
              }
            </button>
          ))}
        </fieldset>
      )}
      {inherited && <p>Shared Baseline object: switch to Baseline to edit it.</p>}
      <ul>
        {current.map((item) => (
          <li key={item.id}>
            <button type="button" onClick={() => select(item.id)}>
              {item.name} · {item.visible ? 'visible' : 'hidden'}
              {item.object_instance!.locked ? ' · locked' : ''}
            </button>{' '}
            · {item.quantity?.value ?? 'pending'} {item.quantity?.calculated.unit ?? ''} ·{' '}
            {item.object_instance!.group || 'ungrouped'}
          </li>
        ))}
      </ul>
      <p>
        Apply operations to the draft, then Validate &amp; save workspace. Undo/redo and saved
        history retain instance metadata and rate links. Hidden objects remain in quantities.
      </p>
      </div>
    </details>
  )
}
