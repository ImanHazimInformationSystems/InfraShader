import { useEffect, useRef, useState } from 'react'
import { Compass, Layers } from 'lucide-react'
import * as maplibregl from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'
import { loadBasemap } from '../services/map'
import { boundsSchema, boundsPolygon, type Bounds } from '../domain/projects'
import ExploreSun from './ExploreSun'

// MapLibre 6 needs an explicit bundled worker URL under Vite.
maplibregl.setWorkerUrl(workerUrl)

type Props = {
  bounds: Bounds
  onViewport?: (bounds: Bounds) => void
  onSelect?: (bounds: Bounds) => void
  readOnly?: boolean
  onSelectionStart?: () => void
}
export default function SiteMap({
  bounds,
  onViewport,
  onSelect,
  onSelectionStart,
  readOnly = false,
}: Props) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const boundsRef = useRef(bounds)
  const viewportRef = useRef(onViewport)
  const selectRef = useRef(onSelect)
  const selecting = useRef(false)
  const firstCorner = useRef<[number, number] | null>(null)
  const [threeD, setThreeD] = useState(false)
  const [context3D, setContext3D] = useState(false)
  const [renderedBuildings, setRenderedBuildings] = useState(0)
  const [selectionMessage, setSelectionMessage] = useState('')
  const [basemap, setBasemap] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [loadedMap, setLoadedMap] = useState<maplibregl.Map | null>(null)
  const [contextFeatures, setContextFeatures] = useState(0)
  const [renderedFeatures, setRenderedFeatures] = useState(0)
  useEffect(() => {
    boundsRef.current = bounds
    viewportRef.current = onViewport
    selectRef.current = onSelect
  }, [bounds, onViewport, onSelect])
  useEffect(() => {
    if (!container.current) return
    let view: maplibregl.Map | undefined
    let observer: ResizeObserver | undefined
    let disposed = false
    void loadBasemap()
      .then(({ style, available }) => {
        if (disposed || !container.current) return
        setBasemap(available)
        try {
          view = new maplibregl.Map({
            container: container.current,
            style,
            center: [
              (boundsRef.current[0] + boundsRef.current[2]) / 2,
              (boundsRef.current[1] + boundsRef.current[3]) / 2,
            ],
            zoom: 14,
            maxPitch: 65,
            attributionControl: { compact: false },
          })
          const active = view
          map.current = active
          active.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right')
          active.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left')
          active.on('load', () => {
            const buildingLayer = style.layers.find(
              (layer) =>
                'source-layer' in layer &&
                layer['source-layer'] === 'building' &&
                'source' in layer,
            )
            if (buildingLayer && 'source' in buildingLayer && 'source-layer' in buildingLayer) {
              active.addLayer({
                id: 'explore-buildings-3d',
                type: 'fill-extrusion',
                source: buildingLayer.source,
                'source-layer': buildingLayer['source-layer'],
                minzoom: 14,
                layout: { visibility: 'none' },
                filter: [
                  '>',
                  ['to-number', ['coalesce', ['get', 'render_height'], ['get', 'height']], 0],
                  0,
                ],
                paint: {
                  'fill-extrusion-color': '#b8afa1',
                  'fill-extrusion-height': [
                    'min',
                    1000,
                    [
                      'max',
                      0,
                      ['to-number', ['coalesce', ['get', 'render_height'], ['get', 'height']], 0],
                    ],
                  ],
                  'fill-extrusion-base': ['max', 0, ['to-number', ['get', 'render_min_height'], 0]],
                  'fill-extrusion-opacity': 0.85,
                },
              })
              setContext3D(true)
            }
            active.addSource('selected-site', {
              type: 'geojson',
              data: boundsPolygon(boundsRef.current),
            })
            active.addLayer({
              id: 'site-fill',
              type: 'fill',
              source: 'selected-site',
              paint: { 'fill-color': '#2d7258', 'fill-opacity': 0.13 },
            })
            active.addLayer({
              id: 'site-edge',
              type: 'line',
              source: 'selected-site',
              paint: { 'line-color': '#174d3d', 'line-width': 2.5, 'line-dasharray': [3, 2] },
            })
            active.fitBounds(
              [
                [boundsRef.current[0], boundsRef.current[1]],
                [boundsRef.current[2], boundsRef.current[3]],
              ],
              { padding: 80, duration: 0 },
            )
            setLoaded(true)
            setLoadedMap(active)
          })
          active.on('moveend', () => {
            const extent = active.getBounds()
            viewportRef.current?.([
              Math.max(-180, extent.getWest()),
              Math.max(-85, extent.getSouth()),
              Math.min(180, extent.getEast()),
              Math.min(85, extent.getNorth()),
            ])
          })
          active.on('click', (event) => {
            if (!selecting.current) return
            const point: [number, number] = [event.lngLat.lng, event.lngLat.lat]
            if (!firstCorner.current) {
              firstCorner.current = point
              setSelectionMessage('Now click the opposite corner.')
              return
            }
            const first = firstCorner.current
            const parsed = boundsSchema.safeParse([
              Math.min(first[0], point[0]),
              Math.min(first[1], point[1]),
              Math.max(first[0], point[0]),
              Math.max(first[1], point[1]),
            ])
            if (!parsed.success) {
              setSelectionMessage(parsed.error.issues[0].message)
              firstCorner.current = null
              return
            }
            selecting.current = false
            firstCorner.current = null
            active.getCanvas().style.cursor = ''
            selectRef.current?.(parsed.data)
            setSelectionMessage('Site extent selected. Continue or refine the coordinates.')
          })
          active.on('error', () => setUnavailable(true))
          active.on('idle', () => {
            if (active.getLayer('explore-buildings-3d'))
              setRenderedBuildings(
                active.queryRenderedFeatures({ layers: ['explore-buildings-3d'] }).length,
              )
            setContextFeatures(
              active.queryRenderedFeatures().filter((feature) => feature.source !== 'selected-site')
                .length,
            )
            if (active.getLayer('site-fill'))
              setRenderedFeatures(active.queryRenderedFeatures({ layers: ['site-fill'] }).length)
          })
        } catch {
          // WebGL construction is an external capability check; expose its fallback.
          setUnavailable(true)
          return
        }
        observer = new ResizeObserver(() => view?.resize())
        observer.observe(container.current)
      })
      .catch(() => {
        if (!disposed) setUnavailable(true)
      })
    return () => {
      disposed = true
      observer?.disconnect()
      view?.remove()
      map.current = null
    }
  }, [])
  useEffect(() => {
    const view = map.current
    if (!view?.getSource('selected-site')) return
    const source = view.getSource('selected-site') as maplibregl.GeoJSONSource | undefined
    source?.setData(boundsPolygon(bounds))
    view.fitBounds(
      [
        [bounds[0], bounds[1]],
        [bounds[2], bounds[3]],
      ],
      { padding: 80, duration: 350 },
    )
  }, [bounds])
  return (
    <section
      className="site-map"
      data-map-status={unavailable ? 'unavailable' : loaded ? 'ready' : 'loading'}
      data-rendered-site-features={renderedFeatures}
      data-view-mode={threeD ? '3d' : '2d'}
      data-rendered-buildings={renderedBuildings}
      data-rendered-context-features={contextFeatures}
      aria-label={readOnly ? 'Saved site extent map' : 'Explore site map'}
    >
      <div ref={container} className="map-canvas" />
      {!readOnly && loadedMap && <ExploreSun map={loadedMap} />}
      <div className="map-chip">
        <Compass size={15} />{' '}
        {readOnly ? 'Site Plan / 2D' : threeD ? 'Explore Map / 3D context' : 'Explore Map / 2D'}
      </div>
      {!readOnly && (
        <div className="map-selection-tools">
          <button
            className="button secondary compact"
            disabled={!loaded || !context3D}
            aria-pressed={threeD}
            onClick={() => {
              const next = !threeD
              setThreeD(next)
              map.current?.setLayoutProperty(
                'explore-buildings-3d',
                'visibility',
                next ? 'visible' : 'none',
              )
              map.current?.easeTo({
                pitch: next ? 55 : 0,
                bearing: next ? -20 : 0,
                zoom: next ? Math.max(16, map.current.getZoom()) : map.current.getZoom(),
                duration: 450,
              })
            }}
          >
            {threeD ? 'Return to 2D' : 'Explore in 3D'}
          </button>
          <button
            className="button secondary compact"
            disabled={!loaded}
            onClick={() => {
              if (threeD) {
                setThreeD(false)
                map.current?.setLayoutProperty('explore-buildings-3d', 'visibility', 'none')
                map.current?.jumpTo({ pitch: 0, bearing: 0 })
              }
              selecting.current = !selecting.current
              if (selecting.current) onSelectionStart?.()
              firstCorner.current = null
              if (map.current)
                map.current.getCanvas().style.cursor = selecting.current ? 'crosshair' : ''
              setSelectionMessage(
                selecting.current
                  ? 'Click two opposite corners to select your site.'
                  : 'Selection cancelled.',
              )
            }}
          >
            Select site on map
          </button>
          <span role="status">{selectionMessage}</span>
        </div>
      )}
      <div className="map-source">
        <Layers size={14} />
        <span>
          {unavailable
            ? 'Map provider unavailable. Geometry editing remains available.'
            : !loaded
              ? 'Loading map...'
              : basemap
                ? threeD
                  ? 'Provider heights may be estimated or missing. Explorer shadows are approximate; no verified project analysis.'
                  : 'Basemap context only - verify boundaries on site'
                : 'Basemap unavailable/offline - coordinate canvas remains usable'}
        </span>
      </div>
    </section>
  )
}
