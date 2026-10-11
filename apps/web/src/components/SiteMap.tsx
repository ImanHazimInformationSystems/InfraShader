import { useEffect, useRef, useState } from 'react'
import { Compass, Layers, MapPin } from 'lucide-react'
import * as maplibregl from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'
import { boundsPolygon, type Bounds } from '../domain/projects'

// MapLibre 6 needs an explicit bundled worker URL under Vite.
maplibregl.setWorkerUrl(workerUrl)

type Props = { bounds: Bounds; onViewport?: (bounds: Bounds) => void; readOnly?: boolean }
export default function SiteMap({ bounds, onViewport, readOnly = false }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const boundsRef = useRef(bounds)
  const viewportRef = useRef(onViewport)
  const [unavailable, setUnavailable] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [renderedFeatures, setRenderedFeatures] = useState(0)
  useEffect(() => { boundsRef.current = bounds; viewportRef.current = onViewport }, [bounds, onViewport])
  const styleUrl = import.meta.env.VITE_MAP_STYLE_URL
  useEffect(() => {
    if (!container.current) return
    let view: maplibregl.Map
    try {
      view = new maplibregl.Map({
        container: container.current,
        style: styleUrl || { version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#e5ece0' } }] },
        center: [(boundsRef.current[0] + boundsRef.current[2]) / 2, (boundsRef.current[1] + boundsRef.current[3]) / 2],
        zoom: 14, maxPitch: 0, attributionControl: { compact: false },
      })
      map.current = view
      view.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
      view.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left')
      view.on('load', () => {
        view.addSource('selected-site', { type: 'geojson', data: boundsPolygon(boundsRef.current) })
        view.addLayer({ id: 'site-fill', type: 'fill', source: 'selected-site', paint: { 'fill-color': '#2d7258', 'fill-opacity': 0.13 } })
        view.addLayer({ id: 'site-edge', type: 'line', source: 'selected-site', paint: { 'line-color': '#174d3d', 'line-width': 2.5, 'line-dasharray': [3, 2] } })
        view.fitBounds([[boundsRef.current[0], boundsRef.current[1]], [boundsRef.current[2], boundsRef.current[3]]], { padding: 80, duration: 0 })
        setLoaded(true)
      })
      view.on('moveend', () => {
        const extent = view.getBounds()
        viewportRef.current?.([Math.max(-180, extent.getWest()), Math.max(-85, extent.getSouth()), Math.min(180, extent.getEast()), Math.min(85, extent.getNorth())])
      })
      view.on('error', () => setUnavailable(true))
      view.on('idle', () => {
        if (view.getLayer('site-fill')) setRenderedFeatures(view.queryRenderedFeatures({ layers: ['site-fill'] }).length)
      })
    } catch {
      // WebGL construction is an external capability check; expose its fallback.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUnavailable(true); return
    }
    const observer = new ResizeObserver(() => view.resize())
    observer.observe(container.current)
    return () => { observer.disconnect(); view.remove(); map.current = null }
  }, [styleUrl])
  useEffect(() => {
    const view = map.current
    if (!view?.isStyleLoaded()) return
    const source = view.getSource('selected-site') as maplibregl.GeoJSONSource | undefined
    source?.setData(boundsPolygon(bounds))
    view.fitBounds([[bounds[0], bounds[1]], [bounds[2], bounds[3]]], { padding: 80, duration: 350 })
  }, [bounds])
  return <section className="site-map" data-map-status={unavailable ? 'unavailable' : loaded ? 'ready' : 'loading'} data-rendered-site-features={renderedFeatures} aria-label={readOnly ? 'Saved site extent map' : 'Explore site map'}>
    <div ref={container} className="map-canvas" />
    <div className="map-chip"><Compass size={15} /> {readOnly ? 'Site Plan · 2D' : 'Explore Map · 2D'}</div>
    {!styleUrl && <div className="map-center-label" aria-hidden="true"><MapPin size={28} /><strong>Your site starts here</strong><span>Coordinate canvas · no basemap imagery</span></div>}
    <div className="map-source"><Layers size={14} /><span>{unavailable ? 'Map unavailable. Use the coordinate controls.' : !loaded ? 'Loading coordinate canvas…' : styleUrl ? 'Configured map provider · check attribution on map' : 'Basemap & address search pending provider review'}</span></div>
  </section>
}
