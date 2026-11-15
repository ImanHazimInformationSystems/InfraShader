import { useEffect, useMemo, useRef, useState } from 'react'
import type { CanvasSource, Map as GeographicMap } from 'mapbox-gl'
import { Eraser, Paintbrush } from 'lucide-react'
import { grassTextures, grassTile, paintFrame, renderGround } from '../services/ground-paint'
import { hasMapboxContext } from '../services/map'
import { request } from '../services/api'
import {
  workspaceInput,
  workspaceDataSchema,
  type WorkspaceData,
  type ScenarioKey,
  type GroundStroke,
} from '../domain/workspace'
import './ground-paint.css'

type Props = {
  map: GeographicMap | null
  data: WorkspaceData
  scenario: ScenarioKey
  revision: number
  endpoint: string
  token?: string
  active: boolean
  disabled: boolean
  onChange: (data: WorkspaceData) => void
  onActive: (active: boolean) => void
  onDirty: (dirty: boolean) => void
  onWorking: (busy: boolean) => void
}
const sourceId = 'layout-ground-paint'
const layerId = sourceId + '-layer'
const emptyPaint: GroundStroke[] = []

export default function GroundPaint({
  map,
  data,
  scenario,
  revision,
  endpoint,
  token,
  active,
  disabled,
  onChange,
  onActive,
  onDirty,
  onWorking,
}: Props) {
  const [texture, setTexture] = useState<GroundStroke['texture']>('lawn')
  const [radius, setRadius] = useState(10)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const raster = useRef<HTMLCanvasElement | null>(null)
  const live = useRef<GroundStroke | null>(null)
  const busy = useRef(false)
  const lastPixel = useRef<[number, number] | null>(null)
  const frame = useMemo(() => paintFrame(data.boundary), [data.boundary])
  const swatches = useMemo(
    () => grassTextures.map((entry) => ({ ...entry, image: grassTile(entry.id).toDataURL() })),
    [],
  )
  const saved = data.scenarios[scenario].ground_paint ?? emptyPaint
  const current = useRef({ data, scenario, revision, saved, frame, disabled, onChange })
  useEffect(() => {
    current.current = { data, scenario, revision, saved, frame, disabled, onChange }
  }, [data, scenario, revision, saved, frame, disabled, onChange])

  useEffect(() => {
    onActive(active && !disabled)
    return () => onActive(false)
  }, [active, disabled, onActive])

  useEffect(() => {
    if (!map) return
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1024
    canvas.dataset.groundPaint = 'true'
    canvas.setAttribute('aria-hidden', 'true')
    canvas.style.display = 'none'
    map.getContainer().append(canvas)
    raster.current = canvas
    const install = () => {
      if (!map.getStyle()) return
      if (!map.getSource(sourceId)) {
        if (!map.isStyleLoaded()) return
        map.addSource(sourceId, {
          type: 'canvas',
          canvas,
          coordinates: current.current.frame.corners,
          animate: false,
        })
        const context = hasMapboxContext(map)
        map.addLayer(
          {
            id: layerId,
            type: 'raster',
            source: sourceId,
            ...(context ? { slot: 'middle' } : {}),
            paint: { 'raster-opacity': 1, 'raster-fade-duration': 0 },
          },
          !context && map.getLayer('workspace-fill') ? 'workspace-fill' : undefined,
        )
      }
      renderGround(canvas, current.current.frame, current.current.saved)
      const source = map.getSource(sourceId) as CanvasSource
      if (typeof source.play === 'function') {
        source.play()
        source.pause()
      }
      map.triggerRepaint()
    }
    install()
    map.on('style.load', install)
    // A one-time idle callback admits a source after project layers finish loading.
    map.once('idle', install)
    return () => {
      map.off('style.load', install)
      map.off('idle', install)
      if (map.getStyle()) {
        if (map.getLayer(layerId)) map.removeLayer(layerId)
        if (map.getSource(sourceId)) map.removeSource(sourceId)
      }
      canvas.remove()
      raster.current = null
    }
  }, [map])

  useEffect(() => {
    if (!map || !raster.current || !map.getStyle()) return
    renderGround(raster.current, frame, saved)
    const source = map.getSource(sourceId) as CanvasSource | undefined
    if (source) {
      source.setCoordinates(frame.corners)
      if (typeof source.play === 'function') {
        source.play()
        source.pause()
      }
    }
    map.triggerRepaint()
  }, [map, frame, saved])

  async function apply(stroke?: GroundStroke) {
    if (busy.current || current.current.disabled) return
    busy.current = true
    onWorking(true)
    setError('')
    const state = current.current
    try {
      const next = await request(
        endpoint.replace(/\/workspace$/, '/spatial-edit'),
        workspaceDataSchema,
        token,
        {
          method: 'POST',
          body: JSON.stringify({
            workspace: workspaceInput(state.data, state.revision),
            scenario: state.scenario,
            operation: stroke ? 'paint' : 'clear_paint',
            ...(stroke ? { paint_stroke: stroke } : {}),
          }),
        },
      )
      state.onChange(next)
      setMessage(
        stroke
          ? 'Ground painted. Save the workspace to keep it.'
          : 'Ground paint cleared. Undo is available.',
      )
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Paint could not be applied. Previous ground retained.',
      )
      if (raster.current) renderGround(raster.current, state.frame, state.saved)
      const source = map?.getSource(sourceId) as CanvasSource | undefined
      if (source && typeof source.play === 'function') {
        source.play()
        source.pause()
      }
    } finally {
      busy.current = false
      onDirty(false)
      onWorking(false)
    }
  }
  const applyRef = useRef(apply)
  useEffect(() => {
    applyRef.current = apply
  })

  useEffect(() => {
    if (!map || !active || disabled) return
    const canvas = map.getCanvas(),
      container = map.getContainer()
    const brush = document.createElement('div')
    brush.className = 'ground-brush-cursor'
    brush.setAttribute('aria-hidden', 'true')
    container.append(brush)
    const previousCursor = canvas.style.cursor,
      pan = map.dragPan.isEnabled(),
      rotate = map.dragRotate.isEnabled(),
      double = map.doubleClickZoom.isEnabled()
    canvas.style.cursor = 'none'
    map.dragPan.disable()
    map.dragRotate.disable()
    map.doubleClickZoom.disable()
    const point = (event: PointerEvent): [number, number] => {
      const rect = canvas.getBoundingClientRect(),
        p = map.unproject([event.clientX - rect.left, event.clientY - rect.top])
      const east = map.project([
        p.lng + radius / (111320 * Math.cos((p.lat * Math.PI) / 180)),
        p.lat,
      ])
      const centre = map.project(p)
      const size = Math.max(6, Math.hypot(east.x - centre.x, east.y - centre.y) * 2)
      brush.style.width = brush.style.height = `${size}px`
      brush.style.left = `${event.clientX - rect.left}px`
      brush.style.top = `${event.clientY - rect.top}px`
      brush.style.display = 'block'
      brush.dataset.erase = String(texture === 'erase')
      return [p.lng, p.lat]
    }
    const redraw = () => {
      if (!raster.current) return
      renderGround(raster.current, current.current.frame, [
        ...current.current.saved,
        ...(live.current ? [live.current] : []),
      ])
      const source = map.getSource(sourceId) as CanvasSource | undefined
      if (source && typeof source.play === 'function') {
        source.play()
        source.pause()
      }
      map.triggerRepaint()
    }
    const down = (event: PointerEvent) => {
      if (event.button !== 0 || busy.current) return
      event.preventDefault()
      event.stopImmediatePropagation()
      live.current = { texture, radius_m: radius, points: [point(event)] }
      lastPixel.current = [event.clientX, event.clientY]
      canvas.setPointerCapture(event.pointerId)
      onDirty(true)
      redraw()
    }
    const move = (event: PointerEvent) => {
      const p = point(event)
      if (!live.current || !lastPixel.current) return
      if (
        Math.hypot(event.clientX - lastPixel.current[0], event.clientY - lastPixel.current[1]) < 4
      )
        return
      lastPixel.current = [event.clientX, event.clientY]
      if (live.current.points.length >= 64)
        live.current.points = live.current.points.filter((_, i) => i % 2 === 0)
      live.current.points.push(p)
      redraw()
    }
    const up = (event: PointerEvent) => {
      if (!live.current) return
      event.preventDefault()
      event.stopImmediatePropagation()
      const stroke = live.current
      live.current = null
      lastPixel.current = null
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
      void applyRef.current(stroke)
    }
    const cancel = () => {
      live.current = null
      lastPixel.current = null
      onDirty(false)
      redraw()
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancel()
    }
    const leave = () => {
      if (!live.current) brush.style.display = 'none'
    }
    canvas.addEventListener('pointerdown', down, true)
    canvas.addEventListener('pointermove', move, true)
    canvas.addEventListener('pointerup', up, true)
    canvas.addEventListener('pointercancel', cancel, true)
    canvas.addEventListener('pointerleave', leave)
    window.addEventListener('keydown', escape)
    return () => {
      canvas.removeEventListener('pointerdown', down, true)
      canvas.removeEventListener('pointermove', move, true)
      canvas.removeEventListener('pointerup', up, true)
      canvas.removeEventListener('pointercancel', cancel, true)
      canvas.removeEventListener('pointerleave', leave)
      window.removeEventListener('keydown', escape)
      if (live.current) cancel()
      brush.remove()
      canvas.style.cursor = previousCursor
      if (pan) map.dragPan.enable()
      if (rotate) map.dragRotate.enable()
      if (double) map.doubleClickZoom.enable()
    }
  }, [map, active, disabled, radius, texture, onDirty])

  return (
    <section className="ground-paint-panel" aria-label="Ground paint" hidden={!active}>
      <h3>Paint the ground</h3>
      <p>Pick a grass look and drag across your site. Paint stays inside its outline.</p>
      <div className="grass-texture-tray">
        {swatches.map((entry) => (
          <button
            type="button"
            key={entry.id}
            disabled={disabled}
            aria-pressed={texture === entry.id}
            onClick={() => setTexture(entry.id)}
          >
            <span style={{ backgroundImage: `url(${entry.image})` }} />
            <strong>{entry.name}</strong>
          </button>
        ))}
      </div>
      <div className="ground-brush-settings">
        <label>
          Brush radius · {radius} m
          <input
            type="range"
            aria-label="Grass brush radius"
            min="1"
            max="100"
            value={radius}
            disabled={disabled}
            onChange={(event) => setRadius(Number(event.target.value))}
          />
        </label>
        <button
          type="button"
          disabled={disabled}
          aria-pressed={texture === 'erase'}
          onClick={() => setTexture(texture === 'erase' ? 'lawn' : 'erase')}
        >
          <Eraser size={18} /> Eraser
        </button>
      </div>
      <div className="ground-paint-actions">
        <button
          type="button"
          disabled={disabled || !map}
          onClick={() => {
            if (!map) return
            const centre = map.getCenter()
            void apply({ texture, radius_m: radius, points: [[centre.lng, centre.lat]] })
          }}
        >
          Stamp at map centre
        </button>
        <button type="button" disabled={disabled || !saved.length} onClick={() => void apply()}>
          Clear ground paint
        </button>
        <span>
          <Paintbrush size={14} /> {saved.length}/128 strokes
        </span>
      </div>
      {!map && <p>The map is unavailable. Reopen it to paint the ground.</p>}
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <p className="town-note">
        Visual landscaping only. Grass paint does not add planting quantities, species, maintenance
        or cost. Save your workspace to retain it; Undo removes the last stroke.
      </p>
    </section>
  )
}
