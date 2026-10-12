import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import {
  TerraDraw,
  TerraDrawPolygonMode,
  TerraDrawLineStringMode,
  TerraDrawPointMode,
  TerraDrawSelectMode,
} from 'terra-draw'
import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter'
import type { Feature } from 'geojson'
import type { Bounds } from '../domain/projects'
import { geometrySchema, type Geometry } from '../domain/workspace'
import { loadBasemap } from '../services/map'
import { Button } from './ui/button'
maplibregl.setWorkerUrl(workerUrl)

type Props = {
  bounds: Bounds
  features: Feature[]
  type: Geometry['type']
  onGeometry: (geometry: Geometry) => void
  selected?: Feature
  onSelect?: (id: string) => void
  disabled?: boolean
}
export default function DrawingMap({
  bounds,
  features,
  type,
  onGeometry,
  selected,
  onSelect,
  disabled = false,
}: Props) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const draw = useRef<TerraDraw | null>(null)
  const latest = useRef({ bounds, features, type, onGeometry, selected, onSelect, disabled })
  const editing = useRef(false)
  const [rendered, setRendered] = useState({ buildings: 0, shadows: 0 })
  const [ready, setReady] = useState(false)
  const [status, setStatus] = useState('Loading drawing canvas...')
  const [threeD, setThreeD] = useState(false)
  const [buildings, setBuildings] = useState(true)
  const [shadows, setShadows] = useState(true)
  const [basemapState, setBasemapState] = useState('Loading basemap...')
  useEffect(() => {
    latest.current = { bounds, features, type, onGeometry, selected, onSelect, disabled }
  }, [bounds, features, type, onGeometry, selected, onSelect, disabled])
  useEffect(() => {
    let disposed = false
    let view: maplibregl.Map | undefined
    let observer: ResizeObserver | undefined
    void loadBasemap().then(({ style, available }) => {
      if (disposed || !container.current) return
      setBasemapState(
        available
          ? 'Basemap context only. Verify site dimensions.'
          : 'Basemap unavailable/offline. Your geometry remains editable.',
      )
      try {
        const active = new maplibregl.Map({
          container: container.current,
          style,
          center: [
            (latest.current.bounds[0] + latest.current.bounds[2]) / 2,
            (latest.current.bounds[1] + latest.current.bounds[3]) / 2,
          ],
          zoom: 16,
          maxPitch: 65,
          attributionControl: { compact: false },
        })
        view = active
        map.current = active
        active.addControl(new maplibregl.NavigationControl(), 'top-right')
        active.addControl(new maplibregl.ScaleControl({ unit: 'metric' }))
        active.on('load', () => {
          active.addSource('workspace', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: latest.current.features },
          })
          active.addLayer({
            id: 'workspace-fill',
            type: 'fill',
            source: 'workspace',
            filter: ['all', ['==', '$type', 'Polygon'], ['!=', 'kind', 'shadow']],
            paint: { 'fill-color': ['coalesce', ['get', 'color'], '#307559'], 'fill-opacity': 0.2 },
          })
          active.addLayer({
            id: 'workspace-line',
            type: 'line',
            source: 'workspace',
            filter: ['all', ['!=', '$type', 'Point'], ['!=', 'kind', 'shadow']],
            paint: { 'line-color': ['coalesce', ['get', 'color'], '#174d3d'], 'line-width': 2 },
          })
          active.addLayer({
            id: 'workspace-point',
            type: 'circle',
            source: 'workspace',
            filter: ['==', '$type', 'Point'],
            paint: {
              'circle-radius': 8,
              'circle-color': '#174d3d',
              'circle-stroke-color': '#fff',
              'circle-stroke-width': 2,
            },
          })
          active.addLayer({
            id: 'workspace-shadow',
            type: 'fill',
            source: 'workspace',
            filter: ['==', 'kind', 'shadow'],
            paint: { 'fill-color': '#544080', 'fill-opacity': 0.45 },
          })
          active.addLayer({
            id: 'workspace-buildings',
            type: 'fill-extrusion',
            source: 'workspace',
            filter: ['all', ['==', 'kind', 'building'], ['>', 'height', 0]],
            layout: { visibility: 'none' },
            paint: {
              'fill-extrusion-height': ['get', 'height'],
              'fill-extrusion-base': 0,
              'fill-extrusion-color': [
                'case',
                ['==', ['get', 'provenance'], 'estimated'],
                '#c0954c',
                '#72958d',
              ],
              'fill-extrusion-opacity': 0.85,
            },
          })
          const extent = latest.current.bounds
          active.fitBounds(
            [
              [extent[0], extent[1]],
              [extent[2], extent[3]],
            ],
            { padding: 45, duration: 0 },
          )
          const drawing = new TerraDraw({
            adapter: new TerraDrawMapLibreGLAdapter({ map: active }),
            modes: [
              new TerraDrawPolygonMode(),
              new TerraDrawLineStringMode(),
              new TerraDrawPointMode(),
              new TerraDrawSelectMode({
                flags: {
                  polygon: {
                    feature: {
                      draggable: true,
                      coordinates: { draggable: true, midpoints: true, deletable: true },
                    },
                  },
                  linestring: { feature: { draggable: true, coordinates: { draggable: true } } },
                  point: { feature: { draggable: true } },
                },
              }),
            ],
          })
          drawing.start()
          drawing.setMode('select')
          draw.current = drawing
          const transfer = (id?: string | number) => {
            if (latest.current.disabled) return
            const feature =
              id === undefined ? drawing.getSnapshot()[0] : drawing.getSnapshotFeature(id)
            const parsed = geometrySchema.safeParse(feature?.geometry)
            if (parsed.success) latest.current.onGeometry(parsed.data)
          }
          drawing.on('finish', (id) => {
            transfer(id)
            drawing.setMode('select')
            setStatus('Drawing ready. Review its coordinates and source, then apply it.')
          })
          drawing.on('change', (_ids, change) => {
            if (editing.current && change === 'update' && drawing.getMode() === 'select') transfer()
          })
          active.on('click', (event) => {
            if (editing.current || latest.current.disabled || drawing.getMode() !== 'select') return
            const hits = active.queryRenderedFeatures(event.point, {
              layers: [
                'workspace-buildings',
                'workspace-point',
                'workspace-line',
                'workspace-fill',
              ],
            })
            const hit = hits.find((feature) => feature.properties?.item_id)
            if (hit) latest.current.onSelect?.(String(hit.properties.item_id))
          })
          setReady(true)
          setStatus('Ready to draw. Numeric coordinates are also available below.')
        })
        active.on('idle', () => {
          if (!active.getLayer('workspace-buildings')) return
          const next = {
            buildings: active.queryRenderedFeatures({ layers: ['workspace-buildings'] }).length,
            shadows: active.queryRenderedFeatures({ layers: ['workspace-shadow'] }).length,
          }
          setRendered((previous) =>
            previous.buildings === next.buildings && previous.shadows === next.shadows
              ? previous
              : next,
          )
        })
        active.on('error', () =>
          setBasemapState(
            'Map provider unavailable. Saved geometry and numeric editing remain available.',
          ),
        )
        observer = new ResizeObserver(() => active.resize())
        observer.observe(container.current)
      } catch {
        setStatus('Map unavailable. Enter coordinates below.')
      }
    })
    return () => {
      disposed = true
      observer?.disconnect()
      draw.current?.stop()
      draw.current = null
      view?.remove()
      map.current = null
    }
  }, [])
  useEffect(() => {
    ;(map.current?.getSource('workspace') as maplibregl.GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features,
    })
  }, [features, ready])
  useEffect(() => {
    const drawing = draw.current
    if (!ready || !drawing) return
    editing.current = false
    drawing.clear()
    drawing.setMode('select')
    if (!selected || disabled) return
    const parsed = geometrySchema.safeParse(selected.geometry)
    if (!parsed.success) return
    const feature = {
      type: 'Feature' as const,
      id: selected.id,
      geometry: parsed.data,
      properties: { mode: parsed.data.type.toLowerCase() },
    }
    const result = drawing.addFeatures([feature] as Parameters<TerraDraw['addFeatures']>[0])
    if (result[0]?.valid && selected.id !== undefined) {
      drawing.selectFeature(selected.id)
      editing.current = true
    }
    const coordinates =
      parsed.data.type === 'Point'
        ? [parsed.data.coordinates]
        : parsed.data.type === 'Polygon'
          ? parsed.data.coordinates[0]
          : parsed.data.coordinates
    const extent = new maplibregl.LngLatBounds()
    coordinates.forEach((point) => extent.extend(point))
    map.current?.fitBounds(extent, {
      padding: 75,
      maxZoom: 19,
      pitch: threeD ? 55 : 0,
      bearing: threeD ? -20 : 0,
      duration: 350,
    })
  }, [selected, ready, disabled, threeD])
  useEffect(() => {
    if (!ready) return
    map.current?.setLayoutProperty(
      'workspace-buildings',
      'visibility',
      threeD && buildings ? 'visible' : 'none',
    )
    map.current?.setLayoutProperty('workspace-shadow', 'visibility', shadows ? 'visible' : 'none')
    map.current?.easeTo({ pitch: threeD ? 55 : 0, bearing: threeD ? -20 : 0, duration: 450 })
  }, [ready, threeD, buildings, shadows])
  function start() {
    const drawing = draw.current
    if (!drawing) return
    editing.current = false
    drawing.clear()
    drawing.setMode(type.toLowerCase())
    editing.current = true
    setStatus(
      type === 'Point'
        ? 'Click to place the point.'
        : 'Click vertices; finish the shape with a final click or Enter. Escape cancels.',
    )
  }
  const known = features.filter(
    (feature) => feature.properties?.kind === 'building' && Number(feature.properties.height) > 0,
  ).length
  const unknown = features.filter(
    (feature) => feature.properties?.kind === 'building' && !feature.properties.height,
  ).length
  return (
    <section
      aria-label="Geometry drawing canvas"
      data-view-mode={threeD ? '3d' : '2d'}
      data-known-buildings={known}
      data-rendered-buildings={rendered.buildings}
      data-rendered-shadows={rendered.shadows}
      data-unknown-buildings={unknown}
    >
      <div className="flex flex-wrap items-center gap-3 py-3">
        <Button type="button" disabled={!ready || disabled} onClick={start}>
          Draw {type === 'LineString' ? 'line' : type.toLowerCase()}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            editing.current = false
            draw.current?.clear()
            draw.current?.setMode('select')
            setStatus('Drawing cancelled. Saved geometry is unchanged.')
          }}
        >
          Cancel drawing
        </Button>
        <span className="text-sm" role="status">
          {status}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-3 pb-3">
        <Button
          type="button"
          variant="outline"
          aria-pressed={!threeD}
          onClick={() => setThreeD(false)}
        >
          2D plan
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={!ready || !known}
          aria-pressed={threeD}
          onClick={() => setThreeD(true)}
        >
          3D buildings
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            const [w, s, e, n] = bounds
            map.current?.fitBounds(
              [
                [w, s],
                [e, n],
              ],
              { padding: 45, pitch: threeD ? 55 : 0, bearing: 0, duration: 350 },
            )
          }}
        >
          Reset site view
        </Button>
        <label>
          <input
            type="checkbox"
            checked={buildings}
            onChange={(event) => setBuildings(event.target.checked)}
          />{' '}
          Building extrusions
        </label>
        <label>
          <input
            type="checkbox"
            checked={shadows}
            onChange={(event) => setShadows(event.target.checked)}
          />{' '}
          Backend shade overlay
        </label>
      </div>
      <div
        ref={container}
        className="h-[480px] min-h-80 overflow-hidden rounded-xl border border-stone-300"
      />
      <p className="text-sm">
        {basemapState} Green: work items. Gold: targets / estimated buildings. Purple: modeled
        backend shade.
      </p>
      <p className="text-sm">
        {known
          ? `${known} building(s) with entered heights available in 3D. Display is not surveyed or a shade result.`
          : '3D unavailable: add a building footprint with a known height and source. 2D editing remains available.'}{' '}
        {unknown > 0 &&
          `${unknown} building height(s) unknown; footprints stay 2D and shade comparison is blocked.`}
      </p>
      {selected && (
        <p className="notice">
          Selected: {selected.properties?.name} - {selected.properties?.provenance}; height{' '}
          {selected.properties?.height
            ? `${selected.properties.height} m`
            : 'unknown / not applicable'}
          . {selected.properties?.height_source} Drag vertices in 2D or edit the numeric coordinates
          below, then apply and save.
        </p>
      )}
    </section>
  )
}
