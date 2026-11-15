import { useEffect, useState } from 'react'
import { z } from 'zod'
import { request } from '../services/api'
import { terrainStudySchema, type TerrainStudy as Study, type TerrainWaterPreview } from '../domain/terrain-study'
import type { WorkspaceData, ScenarioKey } from '../domain/workspace'

type Outlet = { row: number; column: number; capacity_ls: string; invert_m: string }
type Props = { endpoint: string; token?: string; revision: number; scenario: ScenarioKey; data: WorkspaceData; dirty: boolean; disabled: boolean; canAnalyse: boolean; onWorking: (busy: boolean) => void; onOverlay: (preview: TerrainWaterPreview | null) => void }
export default function TerrainStudy(props: Props) {
  const { endpoint, token, revision, scenario, data, dirty, disabled, onWorking, onOverlay } = props
  const [studies, setStudies] = useState<Study[]>([]), [selected, setSelected] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const [rain, setRain] = useState(''), [minutes, setMinutes] = useState('30'), [infiltration, setInfiltration] = useState(''), [roughness, setRoughness] = useState(''), [source, setSource] = useState('')
  const [timeStep, setTimeStep] = useState('5')
  const [outlets, setOutlets] = useState<Outlet[]>([]), [frame, setFrame] = useState(0), [show, setShow] = useState(true), [playing, setPlaying] = useState(false)
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => { const media = window.matchMedia('(prefers-reduced-motion: reduce)'); const change = () => setReduced(media.matches); media.addEventListener('change', change); return () => media.removeEventListener('change', change) }, [])
  const t = data.scenarios[scenario].terrain
  const study = studies.find(item => item.id === selected)
  const result = study?.payload
  const stale = dirty || study?.stale || result?.terrain_signature !== data.scenarios[scenario].terrain_signature
  useEffect(() => {
    const controller = new AbortController()
    request(`${endpoint.replace(/\/workspace$/, '')}/terrain-studies`, z.object({ items: z.array(terrainStudySchema) }), token, { signal: controller.signal })
      .then(response => { const items = response.items.filter(item => item.payload.scenario === scenario); setStudies(items); setSelected(items[0]?.id ?? ''); setFrame(0); setPlaying(false) })
      .catch(reason => { if (!controller.signal.aborted) setError(reason.message) })
    return () => controller.abort()
  }, [endpoint, token, revision, scenario])
  useEffect(() => {
    if (!playing || !result || reduced) return
    const timer = window.setInterval(() => setFrame(value => (value + 1) % result.water.frames.length), 650)
    return () => clearInterval(timer)
  }, [playing, result, reduced])
  useEffect(() => {
    if (!result || stale || !show) { onOverlay(null); return }
    const current = result.water.frames[Math.min(frame, result.water.frames.length - 1)]
    const center = (i: number): [number, number] | undefined => {
      const ring = result.water.cells[i]?.geometry.coordinates[0]
      return ring ? [ring.slice(0, -1).reduce((sum, p) => sum + p[0], 0) / (ring.length - 1), ring.slice(0, -1).reduce((sum, p) => sum + p[1], 0) / (ring.length - 1)] : undefined
    }
    onOverlay({ signature: result.terrain_signature, cells: result.water.cells.flatMap((cell, i) => current.depths_m[i] > .00001 ? [{ geometry: cell.geometry, level: cell.bed_m + current.depths_m[i], depth: current.depths_m[i], flowTo: center(current.flow_to[i]) }] : []) })
    return () => onOverlay(null)
  }, [result, stale, frame, show, onOverlay])
  async function run() {
    if (busy || disabled || dirty || !t) return
    if ([rain, minutes, infiltration, roughness].some(value => !value.trim() || !Number.isFinite(Number(value))) || source.trim().length < 10) { setError('Enter rainfall, duration, infiltration, roughness and their source or test assumptions.'); return }
    if (outlets.some(outlet => !outlet.capacity_ls.trim() || !outlet.invert_m.trim())) { setError('Each drain needs an explicit capacity and inlet elevation.'); return }
    setBusy(true); onWorking(true); setError('')
    try {
      const response = await request(`${endpoint.replace(/\/workspace$/, '')}/terrain-studies`, terrainStudySchema, token, { method: 'POST', body: JSON.stringify({ expected_revision: revision, request_key: crypto.randomUUID(), scenario, rainfall_mmh: Number(rain), duration_minutes: Number(minutes), step_seconds: Number(timeStep), infiltration_mmh: Number(infiltration), roughness_n: Number(roughness), source, outlets: outlets.map(outlet => ({ ...outlet, capacity_ls: Number(outlet.capacity_ls), invert_m: Number(outlet.invert_m) })) }) })
      setStudies(previous => [response, ...previous]); setSelected(response.id); setFrame(response.payload.water.frames.length - 1); setPlaying(false)
    } catch (reason) { setError((reason as Error).message) }
    finally { setBusy(false); onWorking(false) }
  }
  return <details className="terrain-work terrain-study" aria-label="Ground and water calculations">
    <summary>Ground quantities & rain test</summary>
    <p>Calculate excavation, fill and pond storage against your declared starting surface. Test where specified rainfall collects and how listed drains remove it.</p>
    {error && <p role="alert" className="notice">{error}</p>}
    {(dirty || !t) && <p className="notice">Save the current terrain before calculating. Previous results remain labelled with their saved revision.</p>}
    <fieldset disabled={disabled || busy || !props.canAnalyse || !t}><legend>Rain test assumptions</legend>
      <label>Rainfall (mm/hour)<input aria-label="Test rainfall" type="number" min="0" max="500" value={rain} onChange={e => setRain(e.target.value)} /></label>
      <label>Rain duration (minutes)<input aria-label="Test duration" type="number" min="1" max="120" value={minutes} onChange={e => setMinutes(e.target.value)} /></label>
      <label>Constant infiltration (mm/hour)<input aria-label="Test infiltration" type="number" min="0" max="500" value={infiltration} onChange={e => setInfiltration(e.target.value)} /></label>
      <label>Surface roughness n<input aria-label="Test roughness" type="number" min="0.01" max="1" step="0.005" value={roughness} onChange={e => setRoughness(e.target.value)} /></label>
      <label>Simulation step (seconds)<input aria-label="Water simulation step" type="number" min="1" max="10" step="0.5" value={timeStep} onChange={e => setTimeStep(e.target.value)} /></label>
      <label>Rain, ground and drainage sources / assumptions<textarea aria-label="Water test sources" value={source} maxLength={2000} onChange={e => setSource(e.target.value)} placeholder="State test rainfall or recorded source, soil infiltration basis, roughness and drain assumptions" /></label>
      <p className="terrain-note">No drains means a closed site boundary. Infiltration is constant across wet cells, including ponds. Existing pond water is included at the start. External inflow, underground pipes and backwater are excluded.</p>
      <p className="terrain-note">The rain model uses supplied terrain only. Map buildings, roads and trees do not automatically become hydraulic barriers or roof catchments.</p>
      {outlets.map((outlet, i) => <fieldset key={i}><legend>Drain {i + 1} · grid cell</legend>{(['row', 'column', 'capacity_ls', 'invert_m'] as const).map(key => <label key={key}>{({ row: 'Cell row (from north, starts at 0)', column: 'Cell column (from west, starts at 0)', capacity_ls: 'Supplied drain capacity (L/s)', invert_m: 'Inlet elevation in declared datum (m)' })[key]}<input aria-label={`Drain ${i + 1} ${key}`} type="number" step={key === 'row' || key === 'column' ? '1' : 'any'} value={outlet[key]} onChange={e => setOutlets(previous => previous.map((value, j) => i === j ? { ...value, [key]: key === 'row' || key === 'column' ? Number(e.target.value) : e.target.value } : value))} /></label>)}<button type="button" onClick={() => setOutlets(previous => previous.filter((_, j) => i !== j))}>Remove drain</button></fieldset>)}
      <button type="button" disabled={outlets.length >= 8} onClick={() => setOutlets(previous => [...previous, { row: 0, column: 0, capacity_ls: '', invert_m: String(t?.base_elevation ?? 0) }])}>Add a drain</button>
      <button type="button" className="terrain-primary" disabled={dirty} onClick={() => void run()}>{busy ? 'Calculating…' : 'Calculate and save ground & water study'}</button>
    </fieldset>
    {studies.length > 0 && <label>Retained study<select aria-label="Retained terrain study" value={selected} onChange={e => { setSelected(e.target.value); setFrame(0); setPlaying(false) }}>{studies.map(item => <option key={item.id} value={item.id}>Revision {item.workspace_revision} · {new Date(item.created_at).toLocaleString()} {item.stale ? '· stale' : ''}</option>)}</select></label>}
    {result && <div className="terrain-study-results">
      {stale && <p role="status" className="notice">Historical result — terrain or workspace changed. Recalculate before using this result; its map overlay is hidden.</p>}
      <div className="terrain-facts"><span>Excavation <strong>{result.quantities.cut_m3.toFixed(3)} m³</strong></span><span>Fill <strong>{result.quantities.fill_m3.toFixed(3)} m³</strong></span></div>
      <p className="terrain-note">Reference: {result.quantities.reference}</p>
      {result.quantities.ponds.map((pond, i) => <p key={i}>{pond.name}: <strong>{pond.storage_m3.toFixed(3)} m³</strong> geometric water storage.</p>)}
      <div className="terrain-facts">{[['Initial water', result.water.initial_water_m3], ['Rain added', result.water.rain_m3], ['Infiltrated', result.water.infiltrated_m3], ['Drained', result.water.discharged_m3], ['Water remaining', result.water.remaining_m3]].map(([label, value]) => <span key={label}>{label}<strong>{Number(value).toFixed(3)} m³</strong></span>)}</div>
      <p>Peak specified-drain discharge: {result.water.peak_outlet_ls.toFixed(2)} L/s. Balance error: {result.water.balance_error_m3.toExponential(2)} m³.</p>
      <label className="terrain-check"><input type="checkbox" checked={show} onChange={e => setShow(e.target.checked)} />Show water cells and downhill flow arrows</label>
      <p className="terrain-note">Pale to dark blue shows increasing cell-average depth. The film is draped over ground for visibility; its outline is not a calculated flood boundary. Arrows show routing direction, not velocity.</p>
      <label>Simulation time: {(result.water.frames[Math.min(frame, result.water.frames.length - 1)].seconds / 60).toFixed(1)} min<input aria-label="Water simulation time" type="range" min="0" max={result.water.frames.length - 1} value={frame} onChange={e => { setFrame(Number(e.target.value)); setPlaying(false) }} /></label>
      <button type="button" onClick={() => setPlaying(!playing)} disabled={stale || reduced}>{playing ? 'Pause water playback' : 'Play water playback'}</button>
      <details><summary>Calculation methods and assumptions</summary><p>{result.quantities.method}</p><p>{result.water.method}</p><p>Saved test: {result.inputs.rainfall_mmh} mm/h for {result.inputs.duration_minutes} min; infiltration {result.inputs.infiltration_mmh} mm/h; n={result.inputs.roughness_n}. {result.inputs.source}</p><p>Grid-step {result.water.time_step_s} s; {result.water.limited_transfers} limited transfers. Cell-average depths and arrows are screening results. Refine terrain and compare resolutions/time steps before hydraulic design. No flow velocity, flood certification or pipe sizing is produced.</p></details>
    </div>}
  </details>
}
