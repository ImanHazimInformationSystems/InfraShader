import { useEffect, useRef, useState } from 'react'
import mapboxgl, { type GeoJSONSource, type Map } from 'mapbox-gl'
import type { FeatureCollection } from 'geojson'
import { request } from '../services/api'
import {
  workspaceDataSchema,
  workspaceInput,
  type WorkItem,
  type WorkspaceData,
  type ScenarioKey,
} from '../domain/workspace'
import './road-editor.css'
import { addLayoutImages, roadSurfaces } from '../services/layout-textures'
import { Route, Spline, Pentagon, Undo2, Check, X } from 'lucide-react'

type Position = [number, number]
type Draft = {
  id: string
  name: string
  source: string
  provenance: WorkItem['provenance']
  mode: 'line' | 'curve' | 'area'
  width: string
  surface: 'dirt' | 'pavement' | 'stone' | 'gravel'
  points: Position[]
}
type Props = {
  map: Map | null
  data: WorkspaceData
  scenario: ScenarioKey
  revision: number
  endpoint: string
  token?: string
  disabled: boolean
  onChange: (data: WorkspaceData) => void
  onDirty: (dirty: boolean) => void
  onActive: (active: boolean) => void
  onMaterials: (id: string) => void
  onEstimate: () => void
}
const sourceId = 'infrashader-road-preview'
const lineId = `${sourceId}-line`
const fillId = `${sourceId}-fill`

function boundedPoints(points: Position[]): Position[] {
  if (points.length <= 12) return points
  return Array.from({ length: 12 }, (_, i) => points[Math.round((i * (points.length - 1)) / 11)])
}

export default function RoadEditor({
  map,
  data,
  scenario,
  revision,
  endpoint,
  token,
  disabled,
  onChange,
  onDirty,
  onActive,
  onMaterials,
  onEstimate,
}: Props) {
  const [draft, setDraft] = useState<Draft | null>(null)
  const [preview, setPreview] = useState<{ key: string; data: WorkspaceData } | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const markers = useRef<mapboxgl.Marker[]>([])
  const latest = useRef(draft)
  const lastPointer = useRef<{ x: number; y: number } | null>(null)
  const roads = data.scenarios[scenario].items.filter(
    (item) => item.road || item.assembly?.use === 'road',
  )
  const editable = !disabled && scenario !== 'baseline'
  const key = JSON.stringify({ draft, data, revision, scenario })
  const valid =
    draft &&
    draft.name.trim() &&
    draft.source.trim() &&
    draft.points.length >= (draft.mode === 'area' ? 3 : 2) &&
    (draft.mode === 'area' || (Number(draft.width) > 0 && Number(draft.width) <= 100))

  useEffect(() => {
    latest.current = draft
  }, [draft])
  useEffect(() => {
    onDirty(Boolean(draft))
    onActive(Boolean(draft) && editable)
    return () => {
      onDirty(false)
      onActive(false)
    }
  }, [draft, editable, onDirty, onActive])

  useEffect(() => {
    if (!draft || !valid || !editable) return
    let active = true
    const timer = setTimeout(() => {
      const item: WorkItem = {
        id: draft.id,
        name: draft.name,
        kind: 'area',
        status: 'proposed',
        road: {
          mode: draft.mode,
          surface: draft.surface,
          points: draft.points,
          width_m: draft.mode === 'area' ? 1 : Number(draft.width),
        },
        geometry: null,
        source_note: draft.source,
        provenance: draft.provenance,
        count: 1,
        height_m: null,
        height_source: '',
        quantity_override: null,
        rate_id: null,
        manual_basis: 'count',
        category: 'Roads and driveways',
        visible: true,
        crown_diameter_m: null,
      }
      request(endpoint.replace(/\/workspace$/, '/spatial-edit'), workspaceDataSchema, token, {
        method: 'POST',
        body: JSON.stringify({
          workspace: workspaceInput(data, revision),
          scenario,
          operation: 'road',
          ids: [],
          road_item: item,
        }),
      })
        .then((checked) => {
          if (active) {
            setPreview({ key, data: checked })
            setError('')
          }
        })
        .catch((reason) => {
          if (active) {
            setPreview(null)
            setError(
              reason instanceof Error
                ? reason.message
                : 'Road preview is unavailable. Your draft is retained.',
            )
          }
        })
    }, 220)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [key, draft, valid, editable, endpoint, token, data, revision, scenario])

  const currentPreview = preview?.key === key ? preview.data : null
  const checkedRoad = currentPreview?.scenarios[scenario].items.find(
    (item) => item.id === draft?.id,
  )
  const validatedGeometry = useRef<WorkItem['geometry']>(null)
  useEffect(() => {
    validatedGeometry.current = checkedRoad?.geometry ?? null
  }, [checkedRoad])

  // The centreline responds immediately. The filled footprint always comes from the backend.
  useEffect(() => {
    if (!map) return
    const render = () => {
      if (!map.getStyle()) return
      if (!map.getSource(sourceId) && !map.isStyleLoaded()) return
      addLayoutImages(map)
      if (!map.getSource(sourceId)) {
        map.addSource(sourceId, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        })
        map.addLayer({
          id: fillId,
          type: 'fill',
          source: sourceId,
          paint: { 'fill-pattern': 'layout-pavement', 'fill-opacity': 0.9 },
          filter: ['==', '$type', 'Polygon'],
        })
        map.addLayer({
          id: lineId,
          type: 'line',
          source: sourceId,
          paint: { 'line-color': '#701f36', 'line-width': 4, 'line-dasharray': [2, 1] },
        })
      }
      const features: FeatureCollection['features'] = []
      map.setPaintProperty(fillId, 'fill-pattern', `layout-${draft?.surface ?? 'pavement'}`)
      if (checkedRoad?.geometry)
        features.push({ type: 'Feature', properties: {}, geometry: checkedRoad.geometry })
      if (draft && draft.points.length >= 2)
        features.push({
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: draft.mode === 'area' ? [...draft.points, draft.points[0]] : draft.points,
          },
        })
      ;(map.getSource(sourceId) as GeoJSONSource).setData({ type: 'FeatureCollection', features })
    }
    render()
    map.on('style.load', render)
    return () => {
      map.off('style.load', render)
    }
  }, [map, draft, checkedRoad])

  const drawing = Boolean(draft)
  useEffect(() => {
    if (!map || !drawing || !editable) return
    const canvas = map.getCanvas()
    const wasPan = map.dragPan.isEnabled()
    const wasDouble = map.doubleClickZoom.isEnabled()
    map.dragPan.disable()
    map.doubleClickZoom.disable()
    const previousCursor = canvas.style.cursor
    canvas.style.cursor = 'crosshair'
    let gesture: Position[] | null = null
    let start: { x: number; y: number } | null = null
    const position = (event: PointerEvent): Position => {
      const rect = canvas.getBoundingClientRect()
      const point = { x: event.clientX - rect.left, y: event.clientY - rect.top }
      lastPointer.current = point
      const lngLat = map.unproject([point.x, point.y])
      return [lngLat.lng, lngLat.lat]
    }
    const down = (event: PointerEvent) => {
      if (event.button !== 0) return
      event.preventDefault()
      event.stopImmediatePropagation()
      gesture = [position(event)]
      start = { x: event.clientX, y: event.clientY }
      canvas.setPointerCapture(event.pointerId)
    }
    const move = (event: PointerEvent) => {
      const point = position(event)
      if (gesture) {
        const previous = map.project(gesture[gesture.length - 1])
        if (
          lastPointer.current &&
          Math.hypot(previous.x - lastPointer.current.x, previous.y - lastPointer.current.y) > 40
        ) {
          gesture.push(point)
          const points = boundedPoints(gesture)
          setDraft((current) => current && { ...current, points })
        }
      } else if (latest.current?.points.length) {
        const line = [...latest.current.points, point]
        ;(map.getSource(sourceId) as GeoJSONSource | undefined)?.setData({
          type: 'FeatureCollection',
          features: [
            ...(validatedGeometry.current
              ? [{ type: 'Feature' as const, properties: {}, geometry: validatedGeometry.current }]
              : []),
            {
              type: 'Feature',
              properties: {},
              geometry: { type: 'LineString', coordinates: line },
            },
          ],
        })
      }
    }
    const up = (event: PointerEvent) => {
      if (!gesture || !start) return
      event.preventDefault()
      event.stopImmediatePropagation()
      const end = position(event)
      const isClick = Math.hypot(event.clientX - start.x, event.clientY - start.y) < 4
      const points = boundedPoints(
        [...gesture, end].filter(
          (point, i, all) => i === 0 || point[0] !== all[i - 1][0] || point[1] !== all[i - 1][1],
        ),
      )
      setDraft(
        (current) =>
          current && {
            ...current,
            points: isClick ? [...current.points, end].slice(0, 12) : points,
          },
      )
      gesture = null
      start = null
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
    }
    const cancelGesture = () => {
      gesture = null
      start = null
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDraft(null)
    }
    canvas.addEventListener('pointerdown', down, true)
    canvas.addEventListener('pointermove', move, true)
    canvas.addEventListener('pointerup', up, true)
    canvas.addEventListener('pointercancel', cancelGesture, true)
    window.addEventListener('keydown', escape)
    return () => {
      canvas.removeEventListener('pointerdown', down, true)
      canvas.removeEventListener('pointermove', move, true)
      canvas.removeEventListener('pointerup', up, true)
      canvas.removeEventListener('pointercancel', cancelGesture, true)
      window.removeEventListener('keydown', escape)
      if (wasPan) map.dragPan.enable()
      if (wasDouble) map.doubleClickZoom.enable()
      canvas.style.cursor = previousCursor
    }
    // Keep the gesture listeners stable while pointer movement updates control points.
  }, [map, drawing, editable])

  useEffect(() => {
    if (!map || !draft || !editable) return
    markers.current = draft.points.map((point, index) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'road-control-point'
      button.textContent = String(index + 1)
      button.setAttribute(
        'aria-label',
        `Road control point ${index + 1}; edit coordinates in the road panel`,
      )
      const marker = new mapboxgl.Marker({ element: button, draggable: true })
        .setLngLat(point)
        .addTo(map)
      marker.on('dragend', () => {
        const location = marker.getLngLat()
        setDraft(
          (current) =>
            current && {
              ...current,
              points: current.points.map((p, i) =>
                i === index ? [location.lng, location.lat] : p,
              ),
            },
        )
      })
      return marker
    })
    return () => {
      markers.current.forEach((marker) => marker.remove())
      markers.current = []
    }
  }, [map, draft, editable])

  useEffect(
    () => () => {
      if (!map || !map.getStyle()) return
      if (map.getLayer(lineId)) map.removeLayer(lineId)
      if (map.getLayer(fillId)) map.removeLayer(fillId)
      if (map.getSource(sourceId)) map.removeSource(sourceId)
    },
    [map],
  )

  function begin(item?: WorkItem, surface?: Draft['surface']) {
    if (!editable) return
    setPreview(null)
    setError('')
    setNotice('')
    setDraft({
      id: item?.id ?? crypto.randomUUID(),
      name: item?.name ?? 'Road / driveway',
      source:
        item?.source_note ?? 'Concept sketch on the selected site map; estimated and not surveyed.',
      provenance: item?.provenance ?? 'estimated',
      mode: item?.road?.mode ?? 'line',
      width: item?.road && item.road.mode !== 'area' ? String(item.road.width_m) : '4',
      surface: surface ?? item?.road?.surface ?? 'pavement',
      points: item?.road?.points ?? [],
    })
  }
  return (
    <section className="road-editor" aria-label="Roads and driveways">
      <h3>Build a road or path</h3>
      <p>Pick a look, then drag a route or click to add bends.</p>
      <div className="road-surface-tray" aria-label="Road surfaces">
        {roadSurfaces.map((surface) => (
          <button
            type="button"
            key={surface.id}
            aria-pressed={draft?.surface === surface.id}
            disabled={!editable}
            onClick={() =>
              draft ? setDraft({ ...draft, surface: surface.id }) : begin(undefined, surface.id)
            }
          >
            <span
              className={`road-swatch road-swatch-${surface.id}`}
              style={{ backgroundColor: surface.color }}
            />
            <strong>{surface.name}</strong>
          </button>
        ))}
      </div>
      {scenario === 'baseline' && <p>Choose Option A or B to place a proposed road.</p>}
      {!draft && (
        <button type="button" disabled={!editable} onClick={() => begin()}>
          Draw a road
        </button>
      )}
      {draft && (
        <div className="road-draft">
          <label>
            Road name
            <input
              value={draft.name}
              maxLength={160}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              disabled={!editable}
            />
          </label>
          <div className="road-shape-tray" aria-label="Road drawing shapes">
            {(
              [
                { mode: 'line', label: 'Straight / bends', Icon: Route },
                { mode: 'curve', label: 'Curved', Icon: Spline },
                { mode: 'area', label: 'Free shape', Icon: Pentagon },
              ] as const
            ).map(({ mode, label, Icon }) => (
              <button
                key={mode}
                type="button"
                aria-pressed={draft.mode === mode}
                disabled={!editable}
                onClick={() => setDraft({ ...draft, mode })}
              >
                <Icon size={19} aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
          <label className="road-accessible-select">
            Road shape
            <select
              value={draft.mode}
              disabled={!editable}
              onChange={(event) =>
                setDraft({ ...draft, mode: event.target.value as Draft['mode'] })
              }
            >
              <option value="line">Line / connected route</option>
              <option value="curve">Smooth curve</option>
              <option value="area">Area / polygon shape</option>
            </select>
          </label>
          {draft.mode !== 'area' && (
            <div className="road-width-control">
              <label>
                Width · {draft.width} m
                <input
                  type="range"
                  aria-label="Road width slider"
                  min="0.5"
                  max="20"
                  step="0.5"
                  value={draft.width}
                  disabled={!editable}
                  onChange={(event) => setDraft({ ...draft, width: event.target.value })}
                />
              </label>
              <label>
                Road width (m)
                <input
                  type="number"
                  min="0.01"
                  max="100"
                  step="any"
                  value={draft.width}
                  placeholder="Enter a width"
                  disabled={!editable}
                  onChange={(event) => setDraft({ ...draft, width: event.target.value })}
                />
              </label>
              <span>Editable concept width, not a road standard.</span>
            </div>
          )}
          <details className="road-detail-section">
            <summary>Measurement notes</summary>
            <label>
              Road measurement source / assumptions
              <textarea
                value={draft.source}
                maxLength={2000}
                placeholder="Describe the concept trace, dimensions and uncertainty"
                disabled={!editable}
                onChange={(event) => setDraft({ ...draft, source: event.target.value })}
              />
            </label>
            <label>
              Road measurement basis
              <select
                value={draft.provenance}
                disabled={!editable}
                onChange={(event) =>
                  setDraft({ ...draft, provenance: event.target.value as WorkItem['provenance'] })
                }
              >
                {(
                  [
                    'estimated',
                    'measured',
                    'sourced',
                    'manually_entered',
                    'imported',
                    'calculated',
                  ] as const
                ).map((value) => (
                  <option key={value} value={value}>
                    {value.replace('_', ' ')}
                  </option>
                ))}
              </select>
            </label>
          </details>
          <p>
            Drag to sketch. Click to add bends. Drag the numbered points to reshape. Escape cancels.
          </p>
          {!map && <p>Map unavailable. Enter longitude / latitude points below to keep editing.</p>}
          <details className="road-detail-section">
            <summary>Precise points &amp; coordinates</summary>
            <div className="road-points">
              {draft.points.map((point, index) => (
                <div key={index} className="road-point-row">
                  <span>{index + 1}</span>
                  {([0, 1] as const).map((axis) => (
                    <label key={axis}>
                      {axis === 0 ? 'Longitude' : 'Latitude'}
                      <input
                        type="number"
                        step="any"
                        aria-label={`Road point ${index + 1} ${axis === 0 ? 'longitude' : 'latitude'}`}
                        value={point[axis]}
                        disabled={!editable}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            points: draft.points.map((p, i) =>
                              i === index
                                ? (p.map((value, j) =>
                                    j === axis ? Number(event.target.value) : value,
                                  ) as Position)
                                : p,
                            ),
                          })
                        }
                      />
                    </label>
                  ))}
                  <button
                    type="button"
                    disabled={!editable}
                    aria-label={`Remove road point ${index + 1}`}
                    onClick={() =>
                      setDraft({ ...draft, points: draft.points.filter((_, i) => i !== index) })
                    }
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <div className="road-actions">
              <button
                type="button"
                disabled={!editable || draft.points.length >= 12}
                onClick={() => {
                  const last = draft.points.at(-1)
                  const centre = map?.getCenter()
                  const bounds =
                    data.boundary.type === 'Polygon' ? data.boundary.coordinates[0] : []
                  const first = bounds[0] ?? [0, 0]
                  setDraft({
                    ...draft,
                    points: [
                      ...draft.points,
                      last
                        ? [last[0] + 0.00001, last[1]]
                        : [centre?.lng ?? first[0], centre?.lat ?? first[1]],
                    ],
                  })
                }}
              >
                Add control point
              </button>
              <button
                type="button"
                disabled={!draft.points.length || !editable}
                onClick={() => setDraft({ ...draft, points: draft.points.slice(0, -1) })}
              >
                Undo last point
              </button>
            </div>
          </details>
          <button
            type="button"
            className="road-undo-point"
            disabled={!draft.points.length || !editable}
            onClick={() => setDraft({ ...draft, points: draft.points.slice(0, -1) })}
          >
            <Undo2 size={15} aria-hidden="true" /> Undo point
          </button>
          <p role="status">
            {checkedRoad
              ? `Validated preview: ${checkedRoad.quantity?.value.toFixed(2)} m². Not yet added to the draft.`
              : valid
                ? 'Checking the road footprint…'
                : 'Add points, measurement assumptions and a positive width (up to 100 m) to preview.'}
          </p>
          {error && <p role="alert">{error}</p>}
          <div className="road-actions">
            <button
              type="button"
              className="road-confirm"
              aria-label="Confirm road footprint"
              disabled={!editable || !currentPreview}
              onClick={() => {
                if (!currentPreview) return
                onChange(currentPreview)
                setDraft(null)
                setPreview(null)
                setNotice(
                  'Road added to your draft. Save the workspace, then define road layers and rates.',
                )
              }}
            >
              <Check size={17} aria-hidden="true" /> Place road
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(null)
                setPreview(null)
                setError('')
              }}
            >
              <X size={17} aria-hidden="true" /> Cancel road
            </button>
          </div>
        </div>
      )}
      {notice && <p role="status">{notice}</p>}
      <ul className="road-saved-list">
        {roads.map((item) => (
          <li key={item.id}>
            <strong>{item.name}</strong>
            <span>
              {item.quantity?.value.toFixed(2) ?? 'Unvalidated'} m² ·{' '}
              {item.assembly
                ? `${item.assembly.components.length} layer(s)`
                : 'Layers missing — unpriced'}
            </span>
            {item.assembly && (
              <span>
                {item.assembly.components.filter((component) => !component.rate_id).length} layer(s)
                without selected rates
              </span>
            )}
            <div className="road-actions">
              {item.road && (
                <button
                  type="button"
                  disabled={!editable || Boolean(draft) || item.editor_locked}
                  onClick={() => begin(item)}
                >
                  Edit road shape
                </button>
              )}
              <button type="button" disabled={Boolean(draft)} onClick={() => onMaterials(item.id)}>
                Road layers and cost
              </button>
            </div>
          </li>
        ))}
      </ul>
      {roads.length > 0 && (
        <button type="button" disabled={Boolean(draft)} onClick={onEstimate}>
          Review preliminary estimate
        </button>
      )}
      <p className="road-limitations">
        Surface textures are visual choices. Layers, thicknesses and prices are added separately.
        Concept roads use constant width and flat ends. Separate roads cannot overlap. No
        earthworks, drainage or engineered road design is calculated.
      </p>
    </section>
  )
}
