import { useCallback, useEffect, useRef, useState } from 'react'
import { mapStyle, safeMapError } from '../services/map'
import { Compass, Layers } from 'lucide-react'
import mapboxgl from 'mapbox-gl'
import workerUrl from 'mapbox-gl/dist/mapbox-gl-csp-worker.js?url'
import 'mapbox-gl/dist/mapbox-gl.css'
import {
  hasMapboxContext,
  loadBasemap,
  mapOptions,
  providerBuildings,
  visibleProviderBuildings,
} from '../services/map'
import { boundsPolygon, type Bounds } from '../domain/projects'
import ExploreSun from './ExploreSun'
import SiteSelectionEditor from './SiteSelectionEditor'
import type { SiteOutline } from '../domain/site-selection'
import type { Clock } from '../services/environment'
import type { Solar } from '../services/environment'
import type { SiteTree } from '../domain/trees'
import TreeWorkbench from './TreeWorkbench'
import MapboxControls from './MapboxControls'

// Explicit CSP worker keeps the renderer compatible with the Vite bundle.
mapboxgl.workerUrl = workerUrl

type Props = {
  trees?: SiteTree[]
  onTrees?: (trees: SiteTree[]) => void
  onTreeDirty?: (dirty: boolean) => void
  bounds: Bounds
  onViewport?: (bounds: Bounds) => void
  onSelect?: (bounds: Bounds, outline: SiteOutline) => void
  outline?: SiteOutline | null
  onSelectionEnd?: () => void
  readOnly?: boolean
  onSelectionStart?: () => void
  onClock?: (clock: Clock) => void
}
export default function SiteMap({
  trees,
  onTrees,
  onTreeDirty,
  bounds,
  onViewport,
  onSelect,
  onSelectionStart,
  onSelectionEnd,
  outline,
  onClock,
  readOnly = false,
}: Props) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<mapboxgl.Map | null>(null)
  const boundsRef = useRef(bounds)
  const viewportRef = useRef(onViewport)
  const outlineRef = useRef(outline)
  const [selectingSite, setSelectingSite] = useState(false)
  const [treesOpen, setTreesOpen] = useState(false)
  const [providerMessage, setProviderMessage] = useState('Loading Mapbox context...')
  const [solar, setSolar] = useState<Solar | null>(null)
  const [threeD, setThreeD] = useState(!readOnly)
  const threeDRef = useRef(false)
  const [context3D, setContext3D] = useState(false)
  const [renderedBuildings, setRenderedBuildings] = useState(0)
  const [selectionMessage, setSelectionMessage] = useState('')
  const [basemap, setBasemap] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const [contextLost, setContextLost] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [loadedMap, setLoadedMap] = useState<mapboxgl.Map | null>(null)
  const [contextFeatures, setContextFeatures] = useState(0)
  const [renderedFeatures, setRenderedFeatures] = useState(0)
  const [renderAttempt, setRenderAttempt] = useState(0)
  const [explorerClock, setExplorerClock] = useState<Clock | undefined>()
  const rememberClock = useCallback(
    (clock: Clock) => {
      setExplorerClock(clock)
      onClock?.(clock)
    },
    [onClock],
  )
  useEffect(() => {
    boundsRef.current = bounds
    viewportRef.current = onViewport
    outlineRef.current = outline
  }, [bounds, onViewport, outline])
  useEffect(() => {
    if (!container.current) return
    let view: mapboxgl.Map | undefined
    let observer: ResizeObserver | undefined
    let disposed = false
    void loadBasemap(renderAttempt > 0)
      .then(({ style, available, message }) => {
        setProviderMessage(message)
        if (disposed || !container.current) return
        setBasemap(available)
        try {
          view = new mapboxgl.Map({
            container: container.current,
            ...mapOptions(available),
            style,
            pitch: readOnly ? 0 : 55,
            bearing: readOnly ? 0 : -20,
            center: [
              (boundsRef.current[0] + boundsRef.current[2]) / 2,
              (boundsRef.current[1] + boundsRef.current[3]) / 2,
            ],
            zoom: 14,
            maxPitch: 85,
            attributionControl: false,
          })
          const active = view
          active.addControl(new mapboxgl.AttributionControl({ compact: false }))
          map.current = active
          active.addControl(new mapboxgl.NavigationControl({ showCompass: true }), 'top-right')
          active.addControl(new mapboxgl.ScaleControl({ unit: 'metric' }), 'bottom-left')
          let initialLoad = true
          const installSite = () => {
            // Standard imports a zoom-dependent DEM by default. Flat context remains
            // explicit until the user enables elevation in Map layers.
            active.setTerrain(null)
            setContext3D(hasMapboxContext(active))
            providerBuildings(active, threeDRef.current)
            if (!active.getSource('selected-site')) {
              active.addSource('selected-site', {
                type: 'geojson',
                data: {
                  ...boundsPolygon(boundsRef.current),
                  geometry: outlineRef.current ?? boundsPolygon(boundsRef.current).geometry,
                },
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
            }
            if (initialLoad)
              active.fitBounds(
                [
                  [boundsRef.current[0], boundsRef.current[1]],
                  [boundsRef.current[2], boundsRef.current[3]],
                ],
                { padding: 80, duration: 0 },
              )
            initialLoad = false
            setLoaded(true)
            setLoadedMap(active)
          }
          active.on('load', installSite)
          active.on('style.load', installSite)
          active.on('moveend', () => {
            const tilted = active.getPitch() > 0
            threeDRef.current = tilted
            setThreeD(tilted)
            providerBuildings(active, tilted)
            const extent = active.getBounds()!
            viewportRef.current?.([
              Math.max(-180, extent.getWest()),
              Math.max(-85, extent.getSouth()),
              Math.min(180, extent.getEast()),
              Math.min(85, extent.getNorth()),
            ])
          })
          active.on('error', (event) => {
            setUnavailable(true)
            active.getContainer().dataset.mapError = safeMapError(event.error)
          })
          active.on('webglcontextlost', () => setContextLost(true))
          active.on('webglcontextrestored', () => setContextLost(false))
          let lastCount = 0
          const updateCounts = () => {
            if (!mapStyle(active)) return
            if (performance.now() - lastCount < 800) return
            lastCount = performance.now()
            setRenderedBuildings(visibleProviderBuildings(active).length)
            setContextFeatures(visibleProviderBuildings(active).length)
            if (active.getLayer('site-fill'))
              setRenderedFeatures(active.queryRenderedFeatures({ layers: ['site-fill'] }).length)
          }
          active.on('render', updateCounts)
          active.on('idle', () => {
            lastCount = 0
            updateCounts()
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
  }, [renderAttempt, readOnly])
  useEffect(() => {
    const view = map.current
    if (!view?.getSource('selected-site')) return
    const source = view.getSource('selected-site') as mapboxgl.GeoJSONSource | undefined
    source?.setData({
      ...boundsPolygon(bounds),
      geometry: outline ?? boundsPolygon(bounds).geometry,
    })
    view.fitBounds(
      [
        [bounds[0], bounds[1]],
        [bounds[2], bounds[3]],
      ],
      { padding: 80, duration: 350 },
    )
  }, [bounds, outline])
  return (
    <section
      className="site-map"
      data-map-status={unavailable || contextLost ? 'unavailable' : loaded ? 'ready' : 'loading'}
      data-rendered-site-features={renderedFeatures}
      data-view-mode={threeD ? '3d' : '2d'}
      data-rendered-buildings={renderedBuildings}
      data-rendered-context-features={contextFeatures}
      aria-label={readOnly ? 'Saved site extent map' : 'Explore site map'}
    >
      <div ref={container} className="map-canvas" />
      {!readOnly && (
        <MapboxControls
          map={loadedMap}
          hidden={selectingSite || treesOpen}
          onStatus={(message) => {
            setUnavailable(!!message)
            if (message) setProviderMessage(message)
          }}
        />
      )}
      {!readOnly && loadedMap && (
        <ExploreSun
          map={loadedMap}
          initialClock={explorerClock}
          onClock={rememberClock}
          onSolar={setSolar}
          controlsHidden={selectingSite || treesOpen}
        />
      )}
      <div className="map-chip">
        <Compass size={15} />{' '}
        {readOnly ? 'Site Plan / 2D' : threeD ? 'Explore Map / 3D context' : 'Explore Map / 2D'}
      </div>
      {!readOnly && (
        <div className="map-selection-tools">
          {(unavailable || contextLost || (loaded && !basemap)) && (
            <button
              type="button"
              className="button secondary compact"
              onClick={() => {
                setLoadedMap(null)
                setLoaded(false)
                setUnavailable(false)
                setContextLost(false)
                setBasemap(false)
                setContext3D(false)
                setRenderedBuildings(0)
                setContextFeatures(0)
                setRenderedFeatures(0)
                setSelectingSite(false)
                setSelectionMessage('')
                setThreeD(false)
                threeDRef.current = false
                setRenderAttempt((value) => value + 1)
              }}
            >
              Retry map loading
            </button>
          )}
          <button
            className="button secondary compact"
            disabled={!loaded || contextLost}
            aria-pressed={threeD}
            onClick={() => {
              const next = !threeD
              setThreeD(next)
              threeDRef.current = next
              if (map.current) providerBuildings(map.current, next)
              map.current?.easeTo({
                pitch: next ? 65 : 0,
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
            disabled={!loaded || contextLost}
            onClick={() => {
              // Stop any search animation and keep the location the user is viewing.
              map.current?.stop()
              map.current?.jumpTo({ pitch: 0, bearing: 0 })
              setTreesOpen(false)
              setSelectingSite(true)
              onSelectionStart?.()
            }}
          >
            Select site on map
          </button>
          {onTrees && (
            <button
              className="button secondary compact"
              aria-expanded={treesOpen}
              onClick={() => setTreesOpen(!treesOpen)}
            >
              {treesOpen ? 'Close site trees' : 'Review site trees'}
            </button>
          )}
          <span role="status">{selectionMessage}</span>
        </div>
      )}
      {!readOnly && onTrees && (
        <aside
          className="explore-tree-panel"
          hidden={!treesOpen || selectingSite}
          aria-label="Tree review panel"
        >
          <button type="button" className="tree-panel-close" onClick={() => setTreesOpen(false)}>
            Close tree panel
          </button>
          <TreeWorkbench
            site={{ bounds, outline, trees }}
            map={loadedMap}
            solar={solar}
            onApply={onTrees}
            onDirty={onTreeDirty}
            active={treesOpen && !selectingSite}
          />
        </aside>
      )}
      {selectingSite && loadedMap && (
        <SiteSelectionEditor
          map={loadedMap}
          bounds={bounds}
          outline={outline}
          unavailable={contextLost}
          onCancel={() => {
            setSelectingSite(false)
            onSelectionEnd?.()
            setSelectionMessage('Selection cancelled. Previous site kept.')
          }}
          onApply={(next, shape) => {
            onSelect?.(next, shape)
            setSelectingSite(false)
            onSelectionEnd?.()
            setSelectionMessage('Site shape applied. Continue to create your project.')
          }}
        />
      )}
      <div className="map-source">
        <Layers size={14} />
        <span>
          {unavailable || contextLost
            ? 'Map context unavailable or incomplete. Your selected coordinates are kept; use site controls to continue.'
            : !loaded
              ? 'Loading map...'
              : basemap
                ? threeD
                  ? `${context3D ? 'Provider heights may be estimated or missing.' : 'Provider building heights unavailable.'} Explorer shadows are approximate; no verified project analysis.`
                  : 'Basemap context only - verify boundaries on site'
                : providerMessage}
        </span>
      </div>
    </section>
  )
}
