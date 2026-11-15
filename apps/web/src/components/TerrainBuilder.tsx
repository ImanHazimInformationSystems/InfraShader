import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { Mountain, Shovel, Waves, Eraser, MousePointer2, Undo2, Redo2, RotateCcw, SlidersHorizontal, Droplets } from 'lucide-react'
import { terrainDab, pondAt, terrainChanged, parseGroundGrid, type TerrainBrush } from '../domain/terrain'
import { itemSchema, workspaceInput, workspaceDataSchema, type WorkspaceData, type WorkItem, type ScenarioKey } from '../domain/workspace'
import { rateListSchema, type Rate } from '../domain/calculations'
import { request } from '../services/api'
import './terrain-builder.css'
import TerrainStudy from './TerrainStudy'
import type { TerrainWaterPreview } from '../domain/terrain-study'

type Props = {
  revision: number; canAnalyse: boolean; onWater: (preview: TerrainWaterPreview | null) => void
  sceneMode: boolean; disabledReason?: string
  data: WorkspaceData; scenario: ScenarioKey; endpoint: string; token?: string
  disabled: boolean; dirty: boolean; canPrice: boolean; rateBasis: 'cost' | 'indicative_budget'
  brush: TerrainBrush; onBrush: (brush: TerrainBrush) => void
  onChange: (data: WorkspaceData) => void; onDirty: (dirty: boolean) => void; onWorking: (busy: boolean) => void
  onUndo: () => void; onRedo: () => void; canUndo: boolean; canRedo: boolean
  onScene: () => void; onEstimate: () => void; message: string
}
const modes = [
  ['navigate', 'Explore', MousePointer2], ['raise', 'Raise hills', Mountain], ['lower', 'Dig', Shovel],
  ['smooth', 'Smooth', Waves], ['flatten', 'Level', SlidersHorizontal], ['erase', 'Erase', Eraser], ['water', 'Pond water', Droplets],
] as const
const emptyWork = () => ({ activity: 'Excavation', resource: 'labour' as const, tools: '', assumptions: '', quantity: '', unit: 'h' as 'h' | 'm3' | 'item', terrain_signature: null as string | null })
const costsSchema = z.object({ rows: z.array(z.object({ parent_id: z.string(), total: z.string().nullable(), status: z.string(), rate: z.string() })) })

export default function TerrainBuilder(props: Props) {
  const { data, scenario, endpoint, token, disabled, brush, onBrush, onChange, onDirty, onWorking } = props
  const t = data.scenarios[scenario].terrain
  const [datum, setDatum] = useState('Assumed local zero (concept only)'), [source, setSource] = useState(''), [base, setBase] = useState(0), [confirm, setConfirm] = useState(false)
  const [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const [work, setWork] = useState<NonNullable<WorkItem['terrain_work']>>(emptyWork), [workId, setWorkId] = useState(''), [rateId, setRateId] = useState(''), [reviewed, setReviewed] = useState(false), [formDirty, setFormDirty] = useState(false)
  const [query, setQuery] = useState(''), [rates, setRates] = useState<Rate[]>([]), [costs, setCosts] = useState<z.infer<typeof costsSchema> | null>(null)
  const [gridText, setGridText] = useState(''), [gridSource, setGridSource] = useState(''), [gridConfirmed, setGridConfirmed] = useState(false)
  const inflight = useRef(false)
  const toolTray = useRef<HTMLDivElement>(null)
  const hadTerrain = useRef(Boolean(t))
  useEffect(() => {
    if (t && !hadTerrain.current) toolTray.current?.scrollIntoView({ block: 'nearest' })
    hadTerrain.current = Boolean(t)
  }, [t])
  useEffect(() => { onDirty(formDirty || busy); return () => onDirty(false) }, [formDirty, busy, onDirty])
  useEffect(() => {
    if (!props.canPrice) return
    const controller = new AbortController()
    request(`${endpoint.replace(/\/projects\/.*$/, '')}/rates?limit=100&query=${encodeURIComponent(query)}`, rateListSchema, token, { signal: controller.signal })
      .then(result => setRates(result.items.filter(rate => !rate.archived && rate.basis === props.rateBasis)))
      .catch(reason => { if (!controller.signal.aborted) setError(reason.message) })
    return () => controller.abort()
  }, [endpoint, token, query, props.canPrice, props.rateBasis])
  useEffect(() => {
    if (props.dirty) return
    const controller = new AbortController()
    request(`${endpoint.replace(/\/workspace$/, '')}/schedule?scenario=${scenario}`, costsSchema, token, { signal: controller.signal })
      .then(setCosts).catch(reason => { if (!controller.signal.aborted) setError(reason.message) })
    return () => controller.abort()
  }, [endpoint, token, scenario, props.dirty])
  const workItems = data.scenarios[scenario].items.filter(item => item.terrain_work)
  const locked = disabled || busy
  async function validate(next: WorkspaceData) {
    if (disabled || inflight.current) return
    inflight.current = true; setBusy(true); onWorking(true); setError('')
    try {
      const checked = await request(`${endpoint.replace(/\/workspace$/, '')}/object-preview`, workspaceDataSchema, token, { method: 'POST', body: JSON.stringify(workspaceInput(next, 0)) })
      onChange(checked)
      return checked
    } catch (reason) { setError((reason as Error).message) }
    finally { inflight.current = false; setBusy(false); onWorking(false) }
  }
  async function create() {
    if (!confirm || datum.trim().length < 3 || source.trim().length < 3 || !Number.isFinite(base)) { setError('Confirm the flat starting surface and describe its datum and source or assumption.'); return }
    if (disabled || inflight.current) return
    setBusy(true); onWorking(true); inflight.current = true; setError('')
    try {
      const frame = await request(`${endpoint.replace(/\/workspace$/, '')}/terrain-frame`, z.object({ metric_crs: z.string(), bounds: z.tuple([z.number(), z.number(), z.number(), z.number()]) }), token, { method: 'POST', body: JSON.stringify(workspaceInput(data, 0)) })
      const next = structuredClone(data)
      next.scenarios[scenario].terrain = { ...frame, datum, source, size: 33, base_elevation: base, heights: Array(1089).fill(base), ponds: [] }
      const checked = await request(`${endpoint.replace(/\/workspace$/, '')}/object-preview`, workspaceDataSchema, token, { method: 'POST', body: JSON.stringify(workspaceInput(next, 0)) })
      onChange(checked); props.onScene()
      onBrush({ ...brush, radius: Math.max(15, (frame.bounds[2] - frame.bounds[0]) / 8), mode: 'raise', target: 3 })
    } catch (reason) { setError((reason as Error).message) }
    finally { inflight.current = false; setBusy(false); onWorking(false) }
  }
  async function applyAtCentre() {
    if (!t) return
    try {
      const point: [number, number] = [(t.size - 1) / 2, (t.size - 1) / 2]
      let terrain = t
      if (brush.mode === 'water') terrain = pondAt(t, point, brush)
      else for (let i = 0; i < 10; i++) terrain = terrainDab(terrain, [point], brush, .1)
      const next = structuredClone(data); next.scenarios[scenario].terrain = terrain
      await validate(next)
    } catch (reason) { setError((reason as Error).message) }
  }
  function editWork(patch: Partial<typeof work>) { setWork({ ...work, ...patch }); setReviewed(false); setFormDirty(true) }
  async function saveWork() {
    try {
      if (!t || !reviewed || !data.scenarios[scenario].terrain_signature) throw new Error('Review the quantity, tools and assumptions for the current terrain first.')
      const entry = itemSchema.parse({ id: workId || crypto.randomUUID(), name: `${work.activity} · ${work.resource}`, kind: 'manual', status: 'proposed', category: 'Site work', count: 1, geometry: null, provenance: 'manually_entered', source_note: work.assumptions, rate_id: rateId || null, quantity_override: null, height_m: null, height_source: '', pricing_status: 'provisional', terrain_work: { ...work, terrain_signature: data.scenarios[scenario].terrain_signature } })
      const next = structuredClone(data)
      next.scenarios[scenario].items = next.scenarios[scenario].items.filter(item => item.id !== workId).concat(entry)
      if (await validate(next)) { setWork(emptyWork()); setWorkId(''); setRateId(''); setReviewed(false); setFormDirty(false) }
    } catch (reason) { setError((reason as Error).message) }
  }
  function selectMode(mode: TerrainBrush['mode']) {
    onBrush({ ...brush, mode, target: mode === 'lower' ? -2 : mode === 'water' ? -1 : mode === 'raise' ? 3 : 0 }); props.onScene()
  }
  return <section className="terrain-builder" aria-label="Terrain builder">
    <span className="eyebrow">Shape your landscape</span><h3>Build hills. Carve hollows.</h3>
    <p className="terrain-intro">{!t ? 'First prepare your starting ground below. This activates the hill, digging and pond brushes.' : brush.mode === 'navigate' ? 'Choose Raise hills, Dig or another brush below to start shaping. Explore lets you pan and rotate the map.' : 'Choose a circle or square brush below, then hold and sweep over your site. Release to stop. Each stroke is one undo; Escape cancels it.'}</p>
    {(error || props.message) && <p role="alert" className="notice">{error || props.message}</p>}
    {disabled && !busy && props.disabledReason && <p role="status" className="terrain-note">{props.disabledReason}</p>}
    <div ref={toolTray} className="terrain-tools" role="group" aria-label="Terrain brushes">{modes.map(([mode, label, Icon]) => <button key={mode} type="button" aria-pressed={Boolean(t && brush.mode === mode)} disabled={!t || locked || formDirty} onClick={() => selectMode(mode)}><Icon size={24} aria-hidden="true" /><span>{label}</span></button>)}</div>
    {!t && <p className="terrain-setup-hint" role="status">Brushes activate after you describe and confirm the starting ground. Complete <strong>Start a concept surface</strong> below, then select <strong>Prepare terrain</strong>.</p>}
    {!t ? <fieldset disabled={locked} className="terrain-start"><legend>Start a concept surface</legend>
      <p>Use a declared flat starting surface. This does not import or replace a survey or provider elevation.</p>
      <label>Starting elevation (m)<input type="number" min="-500" max="9000" value={base} onChange={e => setBase(Number(e.target.value))} /></label>
      <label>Surface datum<input value={datum} onChange={e => setDatum(e.target.value)} maxLength={200} /></label>
      <label>Surface source / assumption<textarea value={source} onChange={e => setSource(e.target.value)} maxLength={1000} placeholder="For example: a flat concept baseline pending survey" /></label>
      <label className="terrain-check"><input type="checkbox" checked={confirm} onChange={e => setConfirm(e.target.checked)} />I confirm this flat starting assumption.</label>
      <button type="button" className="terrain-primary" onClick={() => void create()}>Prepare terrain</button>
    </fieldset> : <>
      {!props.sceneMode && <div className="terrain-setup-hint"><p>You are viewing the Site map. Choose a brush above, or open the terrain editing view to shape the ground.</p><button type="button" disabled={locked || formDirty} onClick={props.onScene}>Open terrain editing view</button></div>}
      {brush.mode !== 'navigate' && <fieldset className="terrain-settings" disabled={locked || formDirty}>
        <legend>{modes.find(mode => mode[0] === brush.mode)?.[1]} brush</legend>
        <div className="terrain-shapes" role="group" aria-label="Brush shape">{(['circle', 'square'] as const).map(shape => <button key={shape} type="button" aria-pressed={brush.shape === shape} onClick={() => onBrush({ ...brush, shape })}><span className={`terrain-shape ${shape}`} />{shape === 'circle' ? 'Circle' : 'Square'}</button>)}</div>
        <label>Brush size <output>{(brush.radius * 2).toFixed(1)} m across</output><input aria-label="Terrain brush size" type="range" min={Math.max(.5, Math.min(t.bounds[2] - t.bounds[0], t.bounds[3] - t.bounds[1]) / (t.size - 1))} max={Math.min(500, Math.max(t.bounds[2] - t.bounds[0], t.bounds[3] - t.bounds[1]))} step="0.5" value={brush.radius} onChange={e => onBrush({ ...brush, radius: Number(e.target.value) })} /></label>
        {brush.mode !== 'water' && <label>Brush speed <output>{brush.speed.toFixed(1)} m / second</output><input aria-label="Terrain brush speed" type="range" min="0.1" max="10" step="0.1" value={brush.speed} onChange={e => onBrush({ ...brush, speed: Number(e.target.value) })} /></label>}
        {!['erase', 'smooth'].includes(brush.mode) && <label>{brush.mode === 'water' ? 'Water level' : 'Stop at height / depth'} <span>relative to starting surface (m)</span><input aria-label="Terrain target offset" type="number" min={-500 - t.base_elevation} max={9000 - t.base_elevation} step="0.1" value={brush.target} onChange={e => onBrush({ ...brush, target: Number(e.target.value) })} /></label>}
        <label className="terrain-check"><input type="checkbox" checked={brush.soft} onChange={e => onBrush({ ...brush, soft: e.target.checked })} />Soft brush edges</label>
        <button type="button" onClick={() => void applyAtCentre()}>Apply brush at site centre (1 second)</button>
      </fieldset>}
      <p className="terrain-note">{brush.mode === 'water' ? 'Dig below your chosen water level first, then click to place a round or square water area. Use Ground quantities & rain test to calculate storage and surface-water routing.' : brush.mode === 'erase' ? 'Erase returns brushed ground toward its original elevation. Remove pond water before reshaping its bed.' : 'Raise and Dig stop at your chosen offset from original ground at each node. Level and Water use an offset from the displayed starting elevation. Switch to Explore to navigate.'}</p>
      <div className="terrain-history"><button type="button" disabled={locked || formDirty || !props.canUndo} onClick={props.onUndo}><Undo2 size={16} />Undo</button><button type="button" disabled={locked || formDirty || !props.canRedo} onClick={props.onRedo}><Redo2 size={16} />Redo</button><button type="button" disabled={locked || formDirty} onClick={() => { if (window.confirm('Reset this option to its declared original ground and remove its pond water? You can undo this.')) { const next = structuredClone(data); next.scenarios[scenario].terrain = { ...t, heights: t.reference_heights ? [...t.reference_heights] : t.heights.map(() => t.base_elevation), ponds: [] }; void validate(next) } }}><RotateCcw size={16} />Reset surface</button></div>
      <div className="terrain-facts"><span>Lowest <strong>{(Math.min(...t.heights) - t.base_elevation).toFixed(2)} m</strong></span><span>Highest <strong>+{(Math.max(...t.heights) - t.base_elevation).toFixed(2)} m</strong></span><span>Grid spacing <strong>{((t.bounds[2] - t.bounds[0]) / (t.size - 1)).toFixed(1)} × {((t.bounds[3] - t.bounds[1]) / (t.size - 1)).toFixed(1)} m</strong></span></div>
      {t.ponds.map((pond, i) => <div className="terrain-pond" key={i}><Droplets size={18} /><span>{pond.name}<small>Water {(pond.water_level - t.base_elevation).toFixed(2)} m from start · {pond.shape ?? 'square'}</small></span><button type="button" disabled={locked || formDirty} onClick={() => { const next = structuredClone(data); next.scenarios[scenario].terrain!.ponds.splice(i, 1); void validate(next) }}>Remove water</button></div>)}
      <TerrainStudy endpoint={endpoint} token={token} revision={props.revision} scenario={scenario} data={data} dirty={props.dirty} disabled={locked || formDirty} canAnalyse={props.canAnalyse} onWorking={onWorking} onOverlay={props.onWater} />
      <details className="terrain-work"><summary>Use supplied existing ground</summary><p>Import an already aligned elevation matrix: {t.size} rows from north to south, {t.size} columns from west to east. No headers. Values are metres in {t.datum}. Frame {t.metric_crs}, W/S/E/N: {t.bounds.map(value => value.toFixed(3)).join(', ')}. This is a user-supplied grid, not automatic survey verification.</p>
        <fieldset disabled={locked || formDirty}><legend>Replace starting ground</legend><label>Ground-grid CSV<input aria-label="Existing ground grid file" type="file" accept=".csv,.txt" onChange={e => { const file = e.target.files?.[0]; if (!file) return; if (file.size > 131072) { setError('Use a grid file under 128 KB.'); return } void file.text().then(text => { parseGroundGrid(text, t.size); setGridText(text); setGridConfirmed(false); setError('') }).catch(reason => setError(reason.message)) }} /></label><label>Existing ground source<input aria-label="Existing ground source" value={gridSource} maxLength={1000} onChange={e => { setGridSource(e.target.value); setGridConfirmed(false) }} /></label><label className="terrain-check"><input type="checkbox" checked={gridConfirmed} onChange={e => setGridConfirmed(e.target.checked)} />I checked the grid alignment, metre units, datum and source. Import replaces current shaping and water. The first grid elevation becomes the map display reference.</label><button type="button" disabled={!gridText || gridSource.trim().length < 3 || !gridConfirmed} onClick={() => { if (!window.confirm('Replace this option’s starting and proposed ground with the supplied grid and remove pond water? You can undo this.')) return; const heights = parseGroundGrid(gridText, t.size); const next = structuredClone(data); next.scenarios[scenario].terrain = { ...t, base_elevation: heights[0], heights, reference_heights: [...heights], reference_source: gridSource, source: gridSource, ponds: [] }; void validate(next) }}>Use supplied ground grid</button></fieldset>
      </details>
      {scenario === 'baseline' ? <p className="terrain-note">Baseline records existing context. Add proposed site work and costs in an option.</p> : <details className="terrain-work" open={workItems.length > 0 || formDirty}><summary>Site work & preliminary costs <span>{workItems.length} records</span></summary>
        <p>Record your work and resources. Enter supplied hours/items or choose backend-calculated excavation/fill volumes. Source rates and construction allowances still need review.</p>
        {terrainChanged(t) && !workItems.length && <p className="notice">Site work is not yet recorded or priced. The terrain concept is not a complete construction estimate.</p>}
        {workItems.map(item => { const row = !props.dirty ? costs?.rows.find(row => row.parent_id === item.id) : null; return <div className="terrain-work-row" key={item.id}><strong>{item.name}</strong><span>{item.terrain_work!.quantity} {item.terrain_work!.unit} · {item.terrain_work!.tools}</span><small>{item.terrain_work_stale ? 'Terrain changed — review quantity and resources' : props.dirty ? 'Save workspace to refresh cost' : row?.total ? `Saved cost MYR ${row.total} · ${row.rate}` : 'Unpriced / no compatible rate'}</small><div><button type="button" disabled={locked || formDirty} onClick={() => { setWork(item.terrain_work!); setWorkId(item.id); setRateId(item.rate_id ?? ''); setReviewed(false); setFormDirty(true); onBrush({ ...brush, mode: 'navigate' }) }}>Review / edit</button><button type="button" disabled={locked || formDirty} onClick={() => { const next = structuredClone(data); next.scenarios[scenario].items = next.scenarios[scenario].items.filter(entry => entry.id !== item.id); void validate(next) }}>Remove record</button></div></div> })}
        <fieldset disabled={locked}><legend>{workId ? 'Review work record' : 'Add work record'}</legend>
          <label>Site activity<input value={work.activity} maxLength={120} onChange={e => editWork({ activity: e.target.value })} /></label>
          <label>Resource type<select value={work.resource} onChange={e => editWork({ resource: e.target.value as typeof work.resource })}>{['labour', 'equipment', 'material', 'transport'].map(value => <option key={value}>{value}</option>)}</select></label>
          <label>Tools / resources needed<input value={work.tools} maxLength={300} placeholder="Shovels and crew, or excavator — specify your plan" onChange={e => editWork({ tools: e.target.value })} /></label>
          <label>Quantity method<select aria-label="Site work quantity method" value={work.quantity_basis ?? 'manual'} onChange={e => { const basis = e.target.value as 'manual' | 'cut' | 'fill'; editWork({ quantity_basis: basis, quantity: basis === 'manual' ? '' : '0', ...(basis !== 'manual' ? { unit: 'm3' as const } : {}) }); setRateId('') }}><option value="manual">Enter supplied quantity / time</option><option value="cut">Calculate excavation from this terrain</option><option value="fill">Calculate fill from this terrain</option></select></label>
          {(!work.quantity_basis || work.quantity_basis === 'manual') ? <div className="terrain-work-quantity"><label>Manual quantity<input type="number" min="0.0001" max="1000000" step="0.0001" value={work.quantity} onChange={e => editWork({ quantity: e.target.value })} /></label><label>Unit<select value={work.unit} onChange={e => { editWork({ unit: e.target.value as typeof work.unit }); setRateId('') }}><option value="h">Hours</option><option value="m3">Supplied m³</option><option value="item">Items / work packages</option></select></label></div> : <p className="terrain-note">The backend calculates {work.quantity_basis} m³ relative to the supplied original ground grid, or the declared flat start, clipped to the site. Review the source and bulking, compaction, disposal and access exclusions before choosing a rate.</p>}
          <label>Quantity source and assumptions<textarea maxLength={1000} value={work.assumptions} placeholder="Explain supplied quantity / time allowance, crew, access and exclusions" onChange={e => editWork({ assumptions: e.target.value })} /></label>
          <label>Find sourced rate<input value={query} onChange={e => setQuery(e.target.value)} disabled={!props.canPrice} /></label>
          <label>Compatible rate<select aria-label="Compatible rate" value={rateId} disabled={!props.canPrice} onChange={e => { setRateId(e.target.value); setReviewed(false); setFormDirty(true) }}><option value="">Unpriced — select a rate later</option>{rateId && !rates.some(rate => rate.id === rateId) && <option value={rateId}>Saved rate version — review source</option>}{rates.filter(rate => rate.unit === work.unit).map(rate => <option key={rate.id} value={rate.id}>{rate.description} · {rate.code} v{rate.version} · {rate.effective_date} · {rate.valid_until ? `valid to ${rate.valid_until}` : 'validity unknown'}</option>)}</select></label>
          {rates.find(rate => rate.id === rateId) && <p className="terrain-note">Source: {rates.find(rate => rate.id === rateId)!.source_note}. Inclusions: {rates.find(rate => rate.id === rateId)!.includes.join(', ') || 'none recorded'}.</p>}
          <label className="terrain-check"><input type="checkbox" checked={reviewed} onChange={e => { setReviewed(e.target.checked); setFormDirty(true) }} />I reviewed these quantities, resources and assumptions for the current terrain.</label>
          <button type="button" className="terrain-primary" disabled={!reviewed} onClick={() => void saveWork()}>{workId ? 'Apply reviewed work record' : 'Add work record'}</button>
          {formDirty && <button type="button" onClick={() => { setWork(emptyWork()); setWorkId(''); setRateId(''); setReviewed(false); setFormDirty(false) }}>Cancel record changes</button>}
        </fieldset><button type="button" disabled={locked || formDirty} onClick={props.onEstimate}>Review the total</button>
      </details>}
      <details className="terrain-note"><summary>Surface assumptions & limits</summary><p>{t.datum}. Source: {t.source}. {t.size} × {t.size} nodes in {t.metric_crs}. Cut/fill and water storage use clipped TIN geometry; the rain test uses a coarse cell-storage surface-routing model. These depend on supplied ground and assumptions. Pipe-network design, soil stability, erosion, terrain-aware analytical shade and certified hydraulic/flood results are not provided. Preliminary costs include only listed reviewed resources and selected rates.</p></details>
    </>}
  </section>
}
