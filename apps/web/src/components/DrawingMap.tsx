import { readBuildingContext } from '../services/building-context'
import type { FeatureCollection, Polygon } from 'geojson'
import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import workerUrl from 'mapbox-gl/dist/mapbox-gl-csp-worker.js?url'
import {
  TerraDraw,
  TerraDrawPolygonMode,
  TerraDrawLineStringMode,
  TerraDrawPointMode,
  TerraDrawSelectMode,
} from 'terra-draw'
import { TerraDrawMapboxGLAdapter } from 'terra-draw-mapbox-gl-adapter'
import type { Feature } from 'geojson'
import type { Bounds } from '../domain/projects'
import { geometrySchema, type Geometry } from '../domain/workspace'
import { snapPosition } from '../domain/snapping'
import {
  loadBasemap,
  mapOptions,
  providerBuildings,
  visibleProviderBuildings,
} from '../services/map'
import { Button } from './ui/button'
import MapboxControls from './MapboxControls'
import { addLayoutImages } from '../services/layout-textures'
import type { PlanReference } from '../domain/plan-reference'
mapboxgl.workerUrl = workerUrl

type Props = {
  selectionBlocked?: boolean
  designActive?: boolean
  onMapReady?: (map: mapboxgl.Map | null) => void
  selectedIds?: string[]
  onToggleSelection?: (id: string) => void
  terrainEdited?: boolean
  reference?: PlanReference | null
  referenceImage?: string
  bounds: Bounds
  features: Feature[]
  type: Geometry['type']
  onGeometry: (geometry: Geometry) => void
  selected?: Feature
  onSelect?: (id: string) => void
  disabled?: boolean
}
export default function DrawingMap({
  selectionBlocked = false,
  designActive = false,
  onMapReady,
  selectedIds = [],
  onToggleSelection,
  terrainEdited = false,
  reference,
  referenceImage,
  bounds,
  features,
  type,
  onGeometry,
  selected,
  onSelect,
  disabled = false,
}: Props) {
  const mapReadyCallback = useRef(onMapReady)
  useEffect(() => {
    mapReadyCallback.current = onMapReady
  }, [onMapReady])
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<mapboxgl.Map | null>(null)
  const draw = useRef<TerraDraw | null>(null)
  const latest = useRef({ bounds, features, type, onGeometry, selected, onSelect, disabled, selectionBlocked })
  const toggleSelection = useRef(onToggleSelection)
  useEffect(() => {
    toggleSelection.current = onToggleSelection
  }, [onToggleSelection])
  const editing = useRef(false)
  const snapEnabled = useRef(false)
  const edgeEnabled = useRef(false)
  const [edgeSnapping, setEdgeSnapping] = useState(false)
  const [snapping, setSnapping] = useState(false)
  const [rendered, setRendered] = useState({ buildings: 0, shadows: 0, context: 0 })
  const [supplement, setSupplement] = useState<FeatureCollection<Polygon> | null>(null)
  const [attribution, setAttribution] = useState(
    'Overture Maps / OpenStreetMap contributors (ODbL)',
  )
  const [contextError, setContextError] = useState('')
  const [ready, setReady] = useState(false)
  const [loadedMap, setLoadedMap] = useState<mapboxgl.Map | null>(null)
  const [status, setStatus] = useState('Loading drawing canvas...')
  const [requestedThreeD, setThreeD] = useState(true)
  const threeD = requestedThreeD || designActive
  const [buildings, setBuildings] = useState(true)
  const [shadows, setShadows] = useState(true)
  const [basemapState, setBasemapState] = useState('Loading basemap...')
  useEffect(() => {
    const active = map.current
    if (!ready || !active) return
    if (!active.getSource('supplemental-buildings')) {
      active.addSource('supplemental-buildings', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      active.addLayer({
        id: 'supplemental-footprints',
        type: 'fill',
        source: 'supplemental-buildings',
        paint: { 'fill-color': '#a99063', 'fill-opacity': 0.3 },
      })
      active.addLayer({
        id: 'supplemental-buildings-3d',
        type: 'fill-extrusion',
        source: 'supplemental-buildings',
        filter: ['>', ['get', 'height'], 0],
        paint: {
          'fill-extrusion-height': ['get', 'height'],
          'fill-extrusion-color': '#b5ad9e',
          'fill-extrusion-opacity': 0.9,
        },
      })
    }
    ;(active.getSource('supplemental-buildings') as mapboxgl.GeoJSONSource).setData(
      supplement ?? { type: 'FeatureCollection', features: [] },
    )
    active.setLayoutProperty(
      'supplemental-buildings-3d',
      'visibility',
      threeD && buildings ? 'visible' : 'none',
    )
    providerBuildings(active, !supplement && threeD && buildings)
  }, [ready, supplement, threeD, buildings])
  useEffect(() => {
    const view = map.current
    if (!ready || !view) return
    if (view.getLayer('plan-reference')) view.removeLayer('plan-reference')
    if (view.getSource('plan-reference')) view.removeSource('plan-reference')
    if (referenceImage && reference?.visible && reference.corners?.length === 4) {
      const [a, b, c, d] = reference.corners
      view.addSource('plan-reference', {
        type: 'image',
        url: referenceImage,
        coordinates: [a, b, c, d],
      })
      view.addLayer(
        {
          id: 'plan-reference',
          type: 'raster',
          source: 'plan-reference',
          paint: { 'raster-opacity': reference.opacity, 'raster-fade-duration': 0 },
        },
        'workspace-fill',
      )
    }
  }, [ready, reference, referenceImage])
  useEffect(() => {
    latest.current = { bounds, features, type, onGeometry, selected, onSelect, disabled, selectionBlocked }
  }, [bounds, features, type, onGeometry, selected, onSelect, disabled, selectionBlocked])
  useEffect(() => {
    let disposed = false
    let view: mapboxgl.Map | undefined
    let observer: ResizeObserver | undefined
    void loadBasemap().then(({ style, available, message }) => {
      if (disposed || !container.current) return
      setBasemapState(message)
      try {
        const active = new mapboxgl.Map({
          container: container.current,
          ...mapOptions(available),
          style,
          center: [
            (latest.current.bounds[0] + latest.current.bounds[2]) / 2,
            (latest.current.bounds[1] + latest.current.bounds[3]) / 2,
          ],
          zoom: 16,
          maxPitch: 65,
          attributionControl: false,
        })
        view = active
        active.addControl(new mapboxgl.AttributionControl({ compact: false }))
        map.current = active
        active.addControl(new mapboxgl.NavigationControl(), 'top-right')
        active.addControl(new mapboxgl.ScaleControl({ unit: 'metric' }))
        active.on('load', () => {
          active.setTerrain(null)
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
              'circle-color': ['coalesce', ['get', 'color'], '#174d3d'],
              // Selection stays data-driven from the first frame, including while buckets load.
              'circle-stroke-color': ['case', ['==', ['get', 'item_id'], ''], '#e58a19', '#ffffff'],
              'circle-stroke-width': ['case', ['==', ['get', 'item_id'], ''], 4, 2],
            },
          })
          addLayoutImages(active)
          active.addLayer({
            id: 'workspace-road-texture', type: 'fill', source: 'workspace',
            filter: ['has', 'road_surface'],
            paint: { 'fill-pattern': ['concat', 'layout-', ['get', 'road_surface']], 'fill-opacity': 0.95 },
          }, 'workspace-line')
          active.addLayer({
            id: 'workspace-shadow',
            type: 'fill',
            source: 'workspace',
            filter: ['==', 'kind', 'shadow'],
            paint: {
              'fill-color': ['coalesce', ['get', 'color'], '#544080'],
              'fill-opacity': 0.65,
            },
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
            adapter: new TerraDrawMapboxGLAdapter({ map: active }),
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
            if (parsed.success) {
              const result = structuredClone(parsed.data)
              if (snapEnabled.current) {
                const candidates = latest.current.features
                  .filter(
                    (f) => f.id !== latest.current.selected?.id && f.properties?.kind !== 'shadow',
                  )
                  .map((f) => geometrySchema.safeParse(f.geometry))
                  .flatMap((g) => (g.success ? [g.data] : []))
                const snap = (point: [number, number]) =>
                  snapPosition(
                    point,
                    candidates,
                    (c) => active.project(c),
                    (p) => {
                      const c = active.unproject([p.x, p.y])
                      return [c.lng, c.lat]
                    },
                    edgeEnabled.current,
                  )
                if (result.type === 'Point') result.coordinates = snap(result.coordinates)
                else if (result.type === 'LineString')
                  result.coordinates = result.coordinates.map(snap)
                else result.coordinates = result.coordinates.map((ring) => ring.map(snap))
              }
              latest.current.onGeometry(result)
            }
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
            if (latest.current.selectionBlocked) return
            if (event.originalEvent.shiftKey && toggleSelection.current) {
              const hits = active.queryRenderedFeatures(event.point, {
                layers: ['workspace-point', 'workspace-line', 'workspace-fill'],
              })
              const hit = hits.find((f) => f.properties?.item_id && f.properties?.kind !== 'target')
              if (hit) toggleSelection.current(String(hit.properties?.item_id))
              return
            }
            // Viewing a project's geometry does not require a geometry-edit grant.
            // Drawing and vertex updates retain their separate disabled checks.
            if (editing.current || drawing.getMode() !== 'select') return
            const hits = active.queryRenderedFeatures(event.point, {
              layers: [
                'workspace-buildings',
                'workspace-point',
                'workspace-line',
                'workspace-fill',
              ],
            })
            const hit = hits.find((feature) => feature.properties?.item_id)
            if (hit) latest.current.onSelect?.(String(hit.properties?.item_id))
          })
          setReady(true)
          setLoadedMap(active)
          mapReadyCallback.current?.(active)
          setStatus('Ready to draw. Numeric coordinates are also available below.')
        })
        active.on('idle', () => {
          if (!active.getLayer('workspace-buildings')) return
          const next = {
            context: visibleProviderBuildings(active).length,
            buildings: active.queryRenderedFeatures({ layers: ['workspace-buildings'] }).length,
            shadows: active.queryRenderedFeatures({ layers: ['workspace-shadow'] }).length,
          }
          setRendered((previous) =>
            previous.buildings === next.buildings &&
            previous.shadows === next.shadows &&
            previous.context === next.context
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
      mapReadyCallback.current?.(null)
      view?.remove()
      map.current = null
    }
  }, [])
  useEffect(() => {
    ;(map.current?.getSource('workspace') as mapboxgl.GeoJSONSource | undefined)?.setData({
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
    if (
      !selected ||
      disabled ||
      selected.properties?.preset ||
      selected.properties?.locked ||
      (selected.geometry.type === 'Polygon' && selected.geometry.coordinates.length > 1)
    )
      return
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
    const extent = new mapboxgl.LngLatBounds()
    coordinates.forEach((point) => extent.extend(point))
    map.current?.fitBounds(extent, {
      padding: 75,
      maxZoom: 19,
      pitch: threeD ? 55 : 0,
      bearing: threeD ? -20 : 0,
      duration: 350,
    })
  }, [selected, ready, disabled, threeD, terrainEdited])
  useEffect(() => {
    if (!ready) return
    map.current?.setLayoutProperty(
      'workspace-buildings',
      'visibility',
      threeD && buildings && !terrainEdited ? 'visible' : 'none',
    )
    if (map.current) providerBuildings(map.current, threeD && buildings && !supplement)
    map.current?.setLayoutProperty('workspace-shadow', 'visibility', shadows ? 'visible' : 'none')
    map.current?.easeTo({
      pitch: threeD ? 55 : 0,
      bearing: threeD ? -20 : 0,
      duration: 450,
    })
  }, [ready, threeD, buildings, shadows, terrainEdited, supplement])
  useEffect(() => {
    const view = map.current
    if (!ready || !view) return
    const chosen = [
      'in',
      ['get', 'item_id'],
      ['literal', selectedIds],
    ] as mapboxgl.ExpressionSpecification
    view.setPaintProperty('workspace-line', 'line-width', ['case', chosen, 4, 2])
    view.setPaintProperty('workspace-point', 'circle-stroke-color', [
      'case',
      chosen,
      '#e58a19',
      '#ffffff',
    ])
    view.setPaintProperty('workspace-point', 'circle-stroke-width', ['case', chosen, 4, 2])
  }, [selectedIds, ready])
  function start() {
    const drawing = draw.current
    if (!drawing) return
    editing.current = false
    setThreeD(false)
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
      data-design-active={designActive}
      data-terrain-edited={terrainEdited}
      data-view-mode={threeD ? '3d' : '2d'}
      data-context-buildings={rendered.context}
      data-known-buildings={known}
      data-rendered-buildings={rendered.buildings}
      data-rendered-shadows={rendered.shadows}
      data-unknown-buildings={unknown}
    >
      <MapboxControls
        map={loadedMap}
        elevationDisabled={designActive || terrainEdited}
        onStatus={(message) =>
          setBasemapState(message || 'Mapbox context only. Verify site dimensions.')
        }
      />
      <span className="studio-map-state" role="status">
        {ready ? basemapState : status}
        {supplement && ` Local building context: ${supplement.features[0]?.properties?.source}.`}
      </span>
      <details className="studio-context-controls">
        <summary>Building coverage & sources</summary>
        <p>
          Provider coverage is partial. A local GeoJSON extract replaces the provider building layer
          for this tab; it never creates project quantities or shade inputs.
        </p>
        <label>
          Dataset attribution
          <input
            value={attribution}
            onChange={(e) => setAttribution(e.target.value)}
            maxLength={300}
          />
        </label>
        <label>
          Building context GeoJSON
          <input
            type="file"
            accept=".geojson,.json,application/geo+json"
            onChange={async (event) => {
              const file = event.target.files?.[0]
              if (!file) return
              try {
                if (file.size > 8000000) throw new Error('Use a file under 8 MB.')
                const value = readBuildingContext(await file.text(), bounds, attribution)
                setSupplement(value)
                setContextError('')
              } catch (error) {
                setContextError(
                  error instanceof Error ? error.message : 'Unable to read context file.',
                )
              }
              event.target.value = ''
            }}
          />
        </label>
        {contextError && <p role="alert">{contextError}</p>}
        {supplement && (
          <>
            <p role="status">
              {supplement.features.length} local footprints;{' '}
              {supplement.features.filter((f) => !f.properties?.height).length} unknown heights stay
              flat. Source: {supplement.features[0]?.properties?.source}. Reload clears this local
              overlay.
            </p>
            <Button onClick={() => setSupplement(null)}>Use provider buildings</Button>
          </>
        )}
        <a href="https://explore.overturemaps.org/" target="_blank" rel="noreferrer">
          Download a site extract from Overture Explorer
        </a>
      </details>
      <details className="studio-drawing-controls">
        <summary>Draw and snap</summary>
        <div className="flex flex-wrap items-center gap-3 py-3">
          <label>
            <input
              type="checkbox"
              checked={snapping}
              onChange={(e) => {
                setSnapping(e.target.checked)
                snapEnabled.current = e.target.checked
              }}
            />{' '}
            Snap drafted coordinates to visible vertices (12 px)
          </label>
          <label>
            <input
              type="checkbox"
              checked={edgeSnapping}
              disabled={!snapping}
              onChange={(e) => {
                setEdgeSnapping(e.target.checked)
                edgeEnabled.current = e.target.checked
              }}
            />{' '}
            Include visible edges in snapping
          </label>
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
      </details>
      <div className="studio-view-controls flex flex-wrap items-center gap-3 pb-3">
        {reference?.corners && referenceImage && (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              const extent = new mapboxgl.LngLatBounds()
              reference.corners!.forEach((point) => extent.extend(point))
              map.current?.fitBounds(extent, {
                padding: 50,
                maxZoom: 22,
                pitch: 0,
                bearing: 0,
                duration: 0,
              })
              setThreeD(false)
            }}
          >
            Fit reference plan
          </Button>
        )}
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
          disabled={!ready}
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
        Shift-click work items to toggle the batch selection. {basemapState} Green: work items.
        Gold: targets / estimated buildings. Purple: modeled backend shade.
      </p>
      <p className="text-sm">
        {known
          ? `${known} building(s) with entered heights available in 3D. Display is not surveyed or a shade result.`
          : '3D navigation is available. Map buildings appear where provider heights exist; missing coverage stays flat. Context buildings are not project quantities or shade inputs.'}{' '}
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
