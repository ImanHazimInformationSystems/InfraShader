import { useEffect, useRef, useState } from 'react'
import mapboxgl, { type Map } from 'mapbox-gl'
import type { ObjectInstance, ObjectPreset } from '../domain/objects'
import type { WorkItem } from '../domain/workspace'
import { useStudioToolActive } from './studio-context'
import './object-builder.css'

type Props = {
  map: Map | null; presets: ObjectPreset[]; form: ObjectInstance; selected?: WorkItem
  items: WorkItem[]; disabled: boolean; pending: boolean; busy: boolean
  readOnlySelection: boolean
  onPreset: (preset: ObjectPreset) => void; onForm: (patch: Partial<ObjectInstance>) => void
  onPlace: (point: [number, number], create: boolean) => Promise<void>
  onFence: (points: [number, number][]) => Promise<void>
  onApply: () => void; onSelect: (id: string) => void
  onAction: (action: 'duplicate' | 'delete' | 'visibility' | 'lock') => void
  onActive: (active: boolean) => void; onDraft: (dirty: boolean) => void
}
export default function ObjectBuilder(p: Props) {
  const { onActive, onDraft } = p
  const active = useStudioToolActive('objects')
  const [category, setCategory] = useState('All'), [placing, setPlacing] = useState(false)
  const [fenceStart, setFenceStart] = useState<[number, number] | null>(null)
  const latest = useRef(p)
  useEffect(() => { latest.current = p })
  const preset = p.presets.find((asset) => asset.id === p.form.asset_id)
  const locked = Boolean(p.selected?.object_instance?.locked) || p.readOnlySelection
  useEffect(() => { onActive(active && placing); return () => onActive(false) }, [active, placing, onActive])
  useEffect(() => { onDraft(Boolean(fenceStart)); return () => onDraft(false) }, [fenceStart, onDraft])
  useEffect(() => {
    if (!p.map || !active || !placing || p.disabled) return
    const map = p.map, canvas = map.getCanvas(), previous = canvas.style.cursor
    const marker = new mapboxgl.Marker({ element: Object.assign(document.createElement('img'), {
      src: `/objects/${p.form.asset_id}.svg`, className: 'object-cursor-card', alt: '',
    }) })
    canvas.style.cursor = 'crosshair'
    const source = 'object-fence-draft'
    if (!map.getSource(source)) {
      map.addSource(source, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer({ id: source, type: 'line', source, paint: { 'line-color': '#7c2741', 'line-width': 5, 'line-dasharray': [2, 1] } })
    }
    let start: [number, number] | null = null, downPoint: { x: number; y: number } | null = null
    let dragging = false, suppress = false, working = false
    const pan = map.dragPan.isEnabled()
    const clear = () => { start = null; setFenceStart(null); (map.getSource(source) as mapboxgl.GeoJSONSource)?.setData({ type: 'FeatureCollection', features: [] }); if (pan) map.dragPan.enable() }
    const finish = async (end: [number, number]) => {
      if (!start || working) return
      const points = [start, end]; working = true; clear()
      try { await latest.current.onFence(points) } finally { working = false }
    }
    const move = (event: mapboxgl.MapMouseEvent) => {
      const point: [number, number] = [event.lngLat.lng, event.lngLat.lat]
      marker.setLngLat(point).addTo(map)
      if (start) (map.getSource(source) as mapboxgl.GeoJSONSource).setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [start, point] } })
      if (downPoint && Math.hypot(event.point.x - downPoint.x, event.point.y - downPoint.y) > 5) dragging = true
    }
    const down = (event: mapboxgl.MapMouseEvent) => {
      if (p.form.asset_id !== 'fence' || latest.current.busy) return
      downPoint = event.point
      if (!start) { start = [event.lngLat.lng, event.lngLat.lat]; setFenceStart(start) }
      map.dragPan.disable()
    }
    const up = (event: mapboxgl.MapMouseEvent) => {
      if (p.form.asset_id === 'fence' && dragging) { suppress = true; void finish([event.lngLat.lng, event.lngLat.lat]) }
      downPoint = null; dragging = false
      if (pan) map.dragPan.enable()
    }
    const click = (event: mapboxgl.MapMouseEvent) => {
      if (suppress) { suppress = false; return }
      if (latest.current.busy || working) return
      const point: [number, number] = [event.lngLat.lng, event.lngLat.lat]
      if (p.form.asset_id === 'fence') {
        if (start && (Math.abs(start[0] - point[0]) + Math.abs(start[1] - point[1])) > 0.0000001) void finish(point)
      } else void latest.current.onPlace(point, true)
    }
    const cancel = (e: KeyboardEvent) => { if (e.key === 'Escape') { clear(); setPlacing(false) } }
    map.on('mousemove', move); map.on('mousedown', down); map.on('mouseup', up); map.on('click', click)
    window.addEventListener('keydown', cancel)
    return () => {
      marker.remove(); canvas.style.cursor = previous
      if (pan) map.dragPan.enable()
      map.off('mousemove', move); map.off('mousedown', down); map.off('mouseup', up); map.off('click', click)
      window.removeEventListener('keydown', cancel)
      if (map.getStyle()) { if (map.getLayer(source)) map.removeLayer(source); if (map.getSource(source)) map.removeSource(source) }
    }
    // Preserve the in-progress fence anchor while its status updates.
  }, [p.map, active, placing, p.disabled, p.form.asset_id])
  useEffect(() => {
    if (!p.map || !active || placing || !p.selected?.object_instance || locked || p.disabled || p.pending) return
    const item = p.selected.object_instance
    const element = document.createElement('button'); element.className = 'object-move-handle'; element.textContent = '↔'; element.setAttribute('aria-label', 'Drag selected object to move it')
    const marker = new mapboxgl.Marker({ element, draggable: true }).setLngLat([item.longitude, item.latitude]).addTo(p.map)
    marker.on('dragend', () => { const point = marker.getLngLat(); void latest.current.onPlace([point.lng, point.lat], false) })
    return () => { marker.remove() }
  }, [p.map, p.selected, active, placing, locked, p.disabled, p.pending])
  const controls: [string, keyof ObjectInstance, number, number, number][] = [
    ['Rotation', 'rotation_deg', 0, 359, 1], ['Overall size', 'scale', 0.5, 2, 0.05],
    ['Width', 'stretch_x', 0.25, 4, 0.05], ['Height', 'stretch_y', 0.25, 4, 0.05], ['Depth', 'stretch_z', 0.25, 4, 0.05],
    ['Tilt forward / back', 'tilt_deg', -80, 80, 1], ['Lean left / right', 'lean_deg', -80, 80, 1],
    ['Lift from ground (m)', 'elevation_offset_m', -10, 10, 0.05],
  ]
  return <section className="object-builder" aria-label="Landscape object builder">
    <span className="town-eyebrow">BUILD YOUR LANDSCAPE</span><h3>Make room for people</h3>
    <p>Pick an object, then click the site. For fences, drag a run or click its two ends. Escape cancels placement.</p>
    <div className="object-category-tabs">{['All', 'Furniture', 'Structures', 'Lighting'].map((c) => <button key={c} type="button" aria-pressed={category === c} onClick={() => setCategory(c)}>{c}</button>)}</div>
    <div className="object-builder-tray">{p.presets.filter((a) => !['tree', 'path', 'toilet', 'play'].includes(a.id) && (category === 'All' || (category === 'Lighting' ? a.category === 'Lighting' : category === 'Structures' ? ['Shelters', 'Pergolas', 'Solar modules', 'Fencing'].includes(a.category) : ['Benches', 'Bins', 'Bike racks', 'Planters'].includes(a.category)))).map((asset) => <button key={asset.id} type="button" disabled={p.disabled || p.pending || Boolean(fenceStart)} aria-pressed={placing && preset?.id === asset.id} onClick={() => { p.onPreset(asset); setPlacing(true) }}>
      <img src={`/objects/${asset.id}.svg`} alt="" /><strong>{asset.id === 'light' ? 'Lamp post' : asset.name}</strong>
    </button>)}</div>
    <div className="object-builder-actions"><button type="button" onClick={() => { setPlacing(false); setFenceStart(null) }}>Select / stop placing</button><button type="button" disabled={p.disabled || locked || Boolean(fenceStart)} onClick={() => p.map && void p.onPlace([p.map.getCenter().lng, p.map.getCenter().lat], placing || !p.selected)}>Place / move at map centre</button></div>
    {fenceStart && <p role="status">Fence started. Drag or click the other end; Escape cancels. Runs: 0.6–100 m.</p>}
    <h4>{placing ? `Placing ${preset?.name ?? 'object'}` : p.selected?.name ?? 'Object controls'}</h4>
    {preset && <p>Standard model: {preset.dimensions.join(' × ')} m (width × height × depth). Size controls are multipliers.</p>}
    {placing && preset?.id === 'fence' && <p>Draw with standard fence modules, then select a segment to resize or tilt it. Precision controls can move or rotate the whole run.</p>}
    <fieldset disabled={p.disabled || locked || Boolean(fenceStart) || (placing && preset?.id === 'fence')} className="object-builder-controls">{controls.map(([label, key, min, max, step]) => <label key={key}>{label}<output>{Number(p.form[key]).toFixed(key.includes('deg') ? 0 : 2)}{key.includes('deg') ? '°' : key === 'elevation_offset_m' ? ' m' : '×'}</output><input aria-label={label} type="range" min={min} max={max} step={step} value={Number(p.form[key])} onChange={(e) => p.onForm({ [key]: Number(e.target.value) })} /></label>)}</fieldset>
    {preset?.category === 'Lighting' && <fieldset disabled={p.disabled || locked} className="object-light-controls"><legend>Lighting · dusk to dawn</legend><label><input type="checkbox" checked={p.form.light_on} onChange={(e) => p.onForm({ light_on: e.target.checked })} />Enable this light</label><label>Visual brightness<input aria-label="Visual brightness" type="range" min="0" max="2" step="0.1" value={p.form.light_intensity} onChange={(e) => p.onForm({ light_intensity: Number(e.target.value) })} /></label></fieldset>}
    <div className="object-builder-actions"><button type="button" disabled={!p.pending || p.disabled || locked} onClick={p.onApply}>Apply object changes</button>{p.selected && <><button disabled={p.disabled || locked} onClick={() => p.onAction('duplicate')}>Duplicate</button><button disabled={p.disabled || locked} onClick={() => p.onAction('delete')}>Remove</button><button disabled={p.disabled || p.readOnlySelection} onClick={() => p.onAction('lock')}>{locked ? 'Unlock' : 'Lock'}</button><button disabled={p.disabled || p.readOnlySelection} onClick={() => p.onAction('visibility')}>{p.selected.visible ? 'Hide' : 'Show'}</button></>}</div>
    {p.readOnlySelection && <p>Shared Baseline object. Choose a new preset to place proposed work, or edit this item in Baseline.</p>}
    {p.selected?.object_instance?.group.startsWith('Fence ') && <p>Fence segments are grouped. Precision object controls include movement and rotation for the whole run.</p>}
    <p className="town-note">Shadows and warm light pools follow Sun context on flat ground. All enabled fixtures glow; up to eight fixtures illuminate 3D objects. Lighting is illustrative, not lux, electrical design or a safety assessment. Sizes are concept assumptions; unpriced work stays unpriced.</p>
    <div className="object-builder-list">{p.items.map((item) => <button type="button" key={item.id} disabled={p.pending || Boolean(fenceStart)} onClick={() => { setPlacing(false); p.onSelect(item.id); const object = item.object_instance!; p.map?.easeTo({ center: [object.longitude, object.latitude], zoom: Math.max(p.map.getZoom(), 20), pitch: 55, duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 250 }) }}>{item.name} · {item.quantity?.value.toFixed(1)} {item.quantity?.calculated.unit} · {item.rate_id ? 'rate linked' : 'unpriced'}</button>)}</div>
  </section>
}
