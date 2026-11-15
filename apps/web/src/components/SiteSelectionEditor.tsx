import { mapStyle } from '../services/map'
import { useCallback, useEffect, useState, useRef } from 'react'
import { Marker, type Map, type MapMouseEvent, type GeoJSONSource } from 'mapbox-gl'
import type { Bounds } from '../domain/projects'
import {
  centre,
  extent,
  outlineFromPoints,
  presetSelection,
  projectPoint,
  selectionError,
  transformSelection,
  unprojectPoint,
  type Position,
  type SiteOutline,
} from '../domain/site-selection'
import './site-selection.css'

type Draft = { points: Position[]; kind: 'rectangle' | 'ellipse' | 'polygon'; drawing: boolean }
export default function SiteSelectionEditor({
  map,
  bounds,
  outline,
  unavailable,
  onApply,
  onCancel,
}: {
  map: Map
  bounds: Bounds
  outline?: SiteOutline | null
  unavailable: boolean
  onApply: (bounds: Bounds, outline: SiteOutline) => void
  onCancel: () => void
}) {
  const [initialDraft] = useState<Draft>(() => {
    if (outline)
      return { points: outline.coordinates[0].slice(0, -1), kind: 'polygon', drawing: false }
    // Seed a new locator inside the visible map, clear of the selection panel.
    // The accepted bounds may still describe a search result the user has left.
    const { clientWidth: width, clientHeight: height } = map.getContainer()
    const left = width <= 720 ? 40 : 70,
      right = width <= 720 ? 40 : 410,
      top = 100,
      bottom = width <= 720 ? Math.min(height * 0.48, height - 180) : 80
    const usableWidth = Math.max(0, width - left - right),
      usableHeight = Math.max(0, height - top - bottom)
    const sw = map.unproject([left + usableWidth * 0.25, top + usableHeight * 0.75]),
      ne = map.unproject([left + usableWidth * 0.75, top + usableHeight * 0.25])
    return {
      points: presetSelection([sw.lng, sw.lat, ne.lng, ne.lat], 'rectangle'),
      kind: 'rectangle',
      drawing: false,
    }
  })
  const [history, setHistory] = useState<{ past: Draft[]; present: Draft; future: Draft[] }>(
    () => ({
      past: [],
      present: initialDraft,
      future: [],
    }),
  )
  const handleFocus = useRef<string | null>(null)
  const [angle, setAngle] = useState('15')
  const [scale, setScale] = useState('110')
  const draft = history.present
  const frameSelection = useCallback(
    (points: Position[]) => {
      if (points.length < 3 || selectionError(points)) return
      const box = extent(points),
        width = map.getContainer().clientWidth,
        height = map.getContainer().clientHeight
      map.fitBounds(
        [
          [box[0], box[1]],
          [box[2], box[3]],
        ],
        {
          duration: 0,
          padding:
            width <= 720
              ? { top: 100, left: 40, right: 40, bottom: Math.min(height * 0.48, height - 180) }
              : { top: 100, left: 70, right: 410, bottom: 80 },
        },
      )
    },
    [map],
  )
  const error = selectionError(draft.points)
  const commit = useCallback(
    (next: Draft) =>
      setHistory((h) => ({ past: [...h.past.slice(-49), h.present], present: next, future: [] })),
    [],
  )
  const undo = () =>
    setHistory((h) =>
      h.past.length
        ? {
            past: h.past.slice(0, -1),
            present: h.past[h.past.length - 1],
            future: [h.present, ...h.future],
          }
        : h,
    )
  const redo = () =>
    setHistory((h) =>
      h.future.length
        ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) }
        : h,
    )

  useEffect(() => {
    const rotation = map.dragRotate.isEnabled(),
      pitch = map.touchZoomRotate.isEnabled(),
      doubleClick = map.doubleClickZoom.isEnabled()
    map.jumpTo({ pitch: 0, bearing: 0 })
    map.dragRotate.disable()
    map.touchZoomRotate.disableRotation()
    map.doubleClickZoom.disable()
    for (const id of ['site-fill', 'site-edge'])
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none')
    return () => {
      if (rotation) map.dragRotate.enable()
      if (pitch) map.touchZoomRotate.enableRotation()
      if (doubleClick) map.doubleClickZoom.enable()
      if (!mapStyle(map)) return
      for (const id of ['site-fill', 'site-edge'])
        if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'visible')
    }
  }, [map])

  useEffect(() => {
    if (!map.getSource('site-selection-draft')) {
      map.addSource('site-selection-draft', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      map.addLayer({
        id: 'site-selection-fill',
        type: 'fill',
        source: 'site-selection-draft',
        filter: ['==', '$type', 'Polygon'],
        paint: { 'fill-color': '#872f4c', 'fill-opacity': 0.24 },
      })
      map.addLayer({
        id: 'site-selection-edge',
        type: 'line',
        source: 'site-selection-draft',
        paint: { 'line-color': '#701f36', 'line-width': 3 },
      })
    }
    const draw = (points: Position[]) => {
      const source = map.getSource('site-selection-draft') as GeoJSONSource | undefined
      source?.setData({
        type: 'FeatureCollection',
        features:
          points.length < 2
            ? []
            : [
                {
                  type: 'Feature',
                  properties: {},
                  geometry:
                    points.length >= 3
                      ? outlineFromPoints(points)
                      : { type: 'LineString', coordinates: points },
                },
              ],
      })
    }
    draw(draft.points)
    const markers: Marker[] = []
    const handle = (
      position: Position,
      label: string,
      text: string,
      change: (p: Position) => Position[],
    ) => {
      const el = document.createElement('button')
      el.type = 'button'
      el.className = 'site-selection-handle'
      el.textContent = text
      el.title = label
      el.setAttribute('aria-label', label)
      el.addEventListener('click', (event) => event.stopPropagation())
      const marker = new Marker({ element: el, draggable: true }).setLngLat(position).addTo(map)
      // Mapbox assigns role=img to markers; these handles remain keyboard buttons.
      el.setAttribute('role', 'button')
      const next = () => {
        const p = marker.getLngLat()
        return change([p.lng, p.lat])
      }
      marker.on('drag', () => draw(next()))
      marker.on('dragend', () => commit({ ...draft, points: next() }))
      el.addEventListener('keydown', (event) => {
        const delta: Record<string, Position> = {
          ArrowLeft: [-4, 0],
          ArrowRight: [4, 0],
          ArrowUp: [0, -4],
          ArrowDown: [0, 4],
        }
        if (!delta[event.key]) return
        event.preventDefault()
        event.stopPropagation()
        const p = map.project(marker.getLngLat()),
          d = delta[event.key],
          q = map.unproject([p.x + d[0], p.y + d[1]])
        commit({ ...draft, points: change([q.lng, q.lat]) })
      })
      if (handleFocus.current === label) {
        el.focus()
        handleFocus.current = null
      }
      markers.push(marker)
    }
    if (draft.points.length) {
      if (draft.kind === 'polygon')
        draft.points.forEach((p, i) =>
          handle(p, `Move corner ${i + 1}`, String(i + 1), (q) =>
            draft.points.map((old, j) => (j === i ? q : old)),
          ),
        )
      if (!draft.drawing && draft.points.length >= 3) {
        const c = centre(draft.points),
          center = unprojectPoint(c)
        handle(center, 'Move site', '✥', (p) => {
          const q = projectPoint(p)
          return transformSelection(draft.points, 0, 1, 1, [q[0] - c[0], q[1] - c[1]])
        })
        const pts = draft.points.map(projectPoint),
          box = extent(pts),
          radius = Math.max(box[2] - box[0], box[3] - box[1]) / 2
        const turn = unprojectPoint([c[0], c[1] + radius * 1.4])
        handle(turn, 'Rotate site', '↻', (p) => {
          const q = projectPoint(p)
          return transformSelection(
            draft.points,
            ((Math.atan2(q[1] - c[1], q[0] - c[0]) - Math.PI / 2) * 180) / Math.PI,
          )
        })
        if (draft.kind !== 'polygon') {
          const corner = draft.points[0],
            a = projectPoint(corner),
            dist = Math.hypot(a[0] - c[0], a[1] - c[1])
          handle(corner, 'Resize site', '↔', (p) => {
            const q = projectPoint(p)
            return transformSelection(
              draft.points,
              0,
              Math.max(0.01, Math.hypot(q[0] - c[0], q[1] - c[1]) / dist),
            )
          })
        }
      }
    }
    const click = (e: MapMouseEvent) => {
      if (draft.drawing && draft.points.length < 64)
        commit({ ...draft, points: [...draft.points, [e.lngLat.lng, e.lngLat.lat]] })
    }
    map.on('click', click)
    map.getCanvas().style.cursor = draft.drawing ? 'crosshair' : ''
    return () => {
      if (markers.some((m) => m.getElement() === document.activeElement))
        handleFocus.current = document.activeElement?.getAttribute('aria-label') ?? null
      markers.forEach((m) => m.remove())
      map.off('click', click)
      map.getCanvas().style.cursor = ''
      if (!mapStyle(map)) return
      for (const id of ['site-selection-edge', 'site-selection-fill'])
        if (map.getLayer(id)) map.removeLayer(id)
      if (map.getSource('site-selection-draft')) map.removeSource('site-selection-draft')
    }
  }, [map, draft, commit])
  const preset = (kind: 'rectangle' | 'ellipse') =>
    commit({
      kind,
      drawing: false,
      points: presetSelection(draft.points.length >= 3 ? extent(draft.points) : bounds, kind),
    })
  return (
    <section className="site-selection-panel" aria-label="Site selection controls">
      <header>
        <div>
          <span className="eyebrow">SITE LOCATOR</span>
          <h2>Shape your site</h2>
        </div>
        <button className="button text compact" onClick={onCancel}>
          Cancel
        </button>
      </header>
      <fieldset disabled={unavailable}>
        <div className="selection-shapes" aria-label="Site shape">
          <button aria-pressed={draft.kind === 'rectangle'} onClick={() => preset('rectangle')}>
            Rectangle
          </button>
          <button aria-pressed={draft.kind === 'ellipse'} onClick={() => preset('ellipse')}>
            Ellipse
          </button>
          <button
            aria-pressed={draft.kind === 'polygon'}
            onClick={() => commit({ kind: 'polygon', drawing: true, points: [] })}
          >
            Custom polygon
          </button>
        </div>
        <p className="selection-instruction">
          {draft.drawing
            ? `Click or tap each corner (${draft.points.length}/64), then finish. Drag numbered handles to adjust.`
            : 'Drag the centre to move, the round arrow to rotate, and the resize handle to change size. Arrow keys also move focused handles.'}
        </p>
        {draft.drawing ? (
          <button
            className="button secondary full"
            disabled={!!error}
            onClick={() => commit({ ...draft, drawing: false })}
          >
            Finish polygon
          </button>
        ) : (
          <>
            <div className="selection-input-row">
              <label>
                Rotate by (degrees)
                <input
                  type="number"
                  min="-180"
                  max="180"
                  value={angle}
                  onChange={(e) => setAngle(e.target.value)}
                />
              </label>
              <button
                disabled={!angle || !Number.isFinite(+angle) || Math.abs(+angle) > 180}
                onClick={() =>
                  commit({ ...draft, points: transformSelection(draft.points, +angle) })
                }
              >
                Rotate
              </button>
            </div>
            <div className="selection-input-row">
              <label>
                Resize to (%)
                <input
                  type="number"
                  min="10"
                  max="300"
                  value={scale}
                  onChange={(e) => setScale(e.target.value)}
                />
              </label>
              <button
                disabled={!scale || +scale < 10 || +scale > 300}
                onClick={() =>
                  commit({ ...draft, points: transformSelection(draft.points, 0, +scale / 100) })
                }
              >
                Resize
              </button>
            </div>
            <button
              className="button text full"
              onClick={() => {
                const c = centre(draft.points),
                  m = map.getCenter(),
                  q = projectPoint([m.lng, m.lat])
                commit({
                  ...draft,
                  points: transformSelection(draft.points, 0, 1, 1, [q[0] - c[0], q[1] - c[1]]),
                })
              }}
            >
              Move to map centre
            </button>
          </>
        )}
        <button
          className="button text full"
          disabled={!!error}
          onClick={() => frameSelection(draft.points)}
        >
          Frame selection
        </button>
        <div className="selection-history">
          <button disabled={!history.past.length} onClick={undo}>
            Undo
          </button>
          <button disabled={!history.future.length} onClick={redo}>
            Redo
          </button>
          <button onClick={() => commit(initialDraft)}>Reset</button>
        </div>
        <p role="status" className={error ? 'field-error' : 'fine-print'}>
          {error || `${draft.points.length} outline vertices · ready to apply`}
        </p>
        <button
          className="button primary full selection-apply"
          disabled={!!error || draft.drawing}
          onClick={() => onApply(extent(draft.points), outlineFromPoints(draft.points))}
        >
          Apply site shape
        </button>
      </fieldset>
      {unavailable && (
        <p role="alert">Map unavailable. Cancel to use coordinate controls or retry the map.</p>
      )}
      <p className="fine-print">
        Planning outline only, not a surveyed boundary. Ellipses use 48 segments. Apply keeps this
        shape; Cancel leaves the previous site unchanged.
      </p>
    </section>
  )
}
