import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { TerraDraw, TerraDrawPolygonMode, TerraDrawLineStringMode, TerraDrawPointMode, TerraDrawSelectMode } from 'terra-draw'
import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter'
import type { Feature, Geometry as GeoJSONGeometry } from 'geojson'
import type { Bounds } from '../domain/projects'
import { geometrySchema, type Geometry } from '../domain/workspace'
import { Button } from './ui/button'
maplibregl.setWorkerUrl(workerUrl)

type Props = { bounds: Bounds; features: Feature[]; type: Geometry['type']; onGeometry: (geometry: Geometry) => void }
export default function DrawingMap({ bounds, features, type, onGeometry }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const draw = useRef<TerraDraw | null>(null)
  const latest = useRef({ bounds, features, type, onGeometry })
  const [status, setStatus] = useState('Loading drawing canvas…')
  useEffect(() => { latest.current = { bounds, features, type, onGeometry } }, [bounds, features, type, onGeometry])
  useEffect(() => {
    if (!container.current) return
    let view: maplibregl.Map
    try {
      view = new maplibregl.Map({ container: container.current, style: { version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#e5ece0' } }] }, center: [(latest.current.bounds[0]+latest.current.bounds[2])/2, (latest.current.bounds[1]+latest.current.bounds[3])/2], zoom: 16, maxPitch: 0 })
      map.current = view
      view.on('load', () => {
        view.addSource('workspace', { type: 'geojson', data: { type: 'FeatureCollection', features: latest.current.features } })
        view.addLayer({ id: 'workspace-fill', type: 'fill', source: 'workspace', filter: ['==', '$type', 'Polygon'], paint: { 'fill-color': ['coalesce', ['get', 'color'], '#307559'], 'fill-opacity': .22 } })
        view.addLayer({ id: 'workspace-line', type: 'line', source: 'workspace', filter: ['!=', '$type', 'Point'], paint: { 'line-color': '#174d3d', 'line-width': 2 } })
        view.addLayer({ id: 'workspace-point', type: 'circle', source: 'workspace', filter: ['==', '$type', 'Point'], paint: { 'circle-radius': 7, 'circle-color': '#174d3d' } })
        const extent = latest.current.bounds
        view.fitBounds([[extent[0],extent[1]],[extent[2],extent[3]]], { padding: 45, duration: 0 })
        const drawing = new TerraDraw({ adapter: new TerraDrawMapLibreGLAdapter({ map: view }), modes: [new TerraDrawPolygonMode(), new TerraDrawLineStringMode(), new TerraDrawPointMode(), new TerraDrawSelectMode({ flags: { polygon: { feature: { draggable: true, coordinates: { draggable: true, midpoints: true, deletable: true } } }, linestring: { feature: { draggable: true, coordinates: { draggable: true } } }, point: { feature: { draggable: true } } } })] })
        drawing.start(); draw.current = drawing
        drawing.on('finish', (id) => {
          const feature = drawing.getSnapshotFeature(id)
          const parsed = geometrySchema.safeParse(feature?.geometry)
          if (parsed.success) latest.current.onGeometry(parsed.data)
          drawing.setMode('select'); setStatus('Drawing ready. Review its coordinates and source, then apply it.')
        })
        drawing.on('change', (_ids, change) => {
          if (change !== 'update' || drawing.getMode() !== 'select') return
          const parsed = geometrySchema.safeParse(drawing.getSnapshot()[0]?.geometry)
          if (parsed.success) latest.current.onGeometry(parsed.data)
        })
        setStatus('Ready to draw. Numeric coordinates are also available below.')
      })
      view.on('error', () => setStatus('Map unavailable. Enter coordinates below.'))
    } catch {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus('Map unavailable. Enter coordinates below.'); return
    }
    const observer = new ResizeObserver(() => view.resize()); observer.observe(container.current)
    return () => { observer.disconnect(); draw.current?.stop(); draw.current = null; view.remove(); map.current = null }
  }, [])
  useEffect(() => { (map.current?.getSource('workspace') as maplibregl.GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: features as Feature<GeoJSONGeometry>[] }) }, [features])
  function start() { const drawing = draw.current; if (!drawing) return; drawing.clear(); drawing.setMode(type.toLowerCase()); setStatus(type === 'Point' ? 'Click to place the point.' : 'Click vertices; finish the shape with a final click or Enter. Escape cancels.') }
  return <section aria-label="Geometry drawing canvas"><div className="flex flex-wrap items-center gap-3 py-3"><Button type="button" onClick={start}>Draw {type === 'LineString' ? 'line' : type.toLowerCase()}</Button><Button type="button" variant="outline" onClick={() => { draw.current?.clear(); draw.current?.setMode('select'); setStatus('Drawing cancelled. Saved geometry is unchanged.') }}>Cancel drawing</Button><span className="text-sm" role="status">{status}</span></div><div ref={container} className="h-[420px] min-h-80 overflow-hidden rounded-xl border border-stone-300" /></section>
}
