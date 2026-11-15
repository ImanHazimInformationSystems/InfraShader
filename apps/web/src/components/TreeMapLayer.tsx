import { mapStyle } from '../services/map'
import { useEffect, useRef } from 'react'
import type { Map, GeoJSONSource, MapMouseEvent } from 'mapbox-gl'
import type { Solar } from '../services/environment'
import { treeScene, treeShadowPreview, type DisplayTree } from '../services/tree-scene'

export default function TreeMapLayer({
  map,
  trees,
  selected,
  onSelect,
  solar,
  shadows,
  onError,
}: {
  map: Map | null
  trees: DisplayTree[]
  selected?: string
  onSelect: (id: string) => void
  solar: Solar | null
  shadows: boolean
  onError: (message: string) => void
}) {
  const callbacks = useRef({ onSelect, onError })
  useEffect(() => {
    callbacks.current = { onSelect, onError }
  }, [onSelect, onError])
  useEffect(() => {
    if (!map) return
    let alive = true
    const clear = () => {
      if (!mapStyle(map)) return
      for (const id of ['tree-models', 'tree-points', 'tree-shadow-preview'])
        if (map.getLayer(id)) map.removeLayer(id)
      for (const id of ['tree-points', 'tree-shadow-preview'])
        if (map.getSource(id)) map.removeSource(id)
    }
    const install = () => {
      if (!alive || !mapStyle(map)) return
      clear()
      map.addSource('tree-points', {
        type: 'geojson',
        attribution: [...new Set(trees.map((t) => t.attribution))]
          .map((value) =>
            value.replace(
              /[&<>"']/g,
              (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
            ),
          )
          .join(' | '),
        data: {
          type: 'FeatureCollection',
          features: trees.map((t) => ({
            type: 'Feature',
            properties: {
              id: t.id,
              context: t.context,
              color: t.status === 'remove' ? '#ae3b46' : t.context ? '#758375' : '#20704b',
            },
            geometry: { type: 'Point', coordinates: [t.longitude, t.latitude] },
          })),
        },
      })
      map.addLayer({
        id: 'tree-points',
        type: 'circle',
        source: 'tree-points',
        paint: {
          'circle-radius': ['case', ['==', ['get', 'id'], selected ?? ''], 10, 6],
          'circle-color': ['get', 'color'],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
        },
      })
      map.addSource('tree-shadow-preview', {
        type: 'geojson',
        data: treeShadowPreview(trees, shadows && !map.getTerrain() ? solar : null),
      })
      map.addLayer(
        {
          id: 'tree-shadow-preview',
          type: 'fill',
          source: 'tree-shadow-preview',
          paint: { 'fill-color': '#303d37', 'fill-opacity': 0.22 },
        },
        'tree-points',
      )
      try {
        map.addLayer(treeScene(map, trees, solar), 'tree-points')
        callbacks.current.onError('')
      } catch {
        callbacks.current.onError(
          'Tree 3D rendering unavailable. Tree markers and numeric editing remain available.',
        )
      }
      map.triggerRepaint()
    }
    const refreshTerrain = () => {
      if (!mapStyle(map) || !map.getLayer('tree-points')) return
      const source = map.getSource('tree-shadow-preview') as GeoJSONSource | undefined
      source?.setData(treeShadowPreview(trees, shadows && !map.getTerrain() ? solar : null))
      if (map.getLayer('tree-models')) map.removeLayer('tree-models')
      try {
        map.addLayer(treeScene(map, trees, solar), 'tree-points')
      } catch {
        /* Numeric controls remain usable. */
      }
    }
    const click = (event: MapMouseEvent) => {
      if (!map.getLayer('tree-points')) return
      const hit = map
        .queryRenderedFeatures(
          [
            [event.point.x - 10, event.point.y - 10],
            [event.point.x + 10, event.point.y + 10],
          ],
          { layers: ['tree-points'] },
        )
        .find((f) => !f.properties?.context)
      if (hit) callbacks.current.onSelect(String(hit.properties?.id))
    }
    let elevationTimer: ReturnType<typeof setTimeout>
    const elevationLoaded = (event: { sourceId?: string; isSourceLoaded?: boolean }) => {
      if (event.sourceId !== 'site-context-dem' || !event.isSourceLoaded) return
      clearTimeout(elevationTimer)
      elevationTimer = setTimeout(refreshTerrain, 100)
    }
    const lost = () =>
      callbacks.current.onError(
        'Map graphics were interrupted. Tree decisions are retained; numeric editing remains available.',
      )
    install()
    map.on('style.load', install)
    map.on('terrain', refreshTerrain)
    map.on('sourcedata', elevationLoaded)
    map.on('click', click)
    map.on('webglcontextlost', lost)
    map.on('webglcontextrestored', install)
    return () => {
      alive = false
      clearTimeout(elevationTimer)
      map.off('style.load', install)
      map.off('terrain', refreshTerrain)
      map.off('sourcedata', elevationLoaded)
      map.off('click', click)
      map.off('webglcontextlost', lost)
      map.off('webglcontextrestored', install)
      clear()
    }
  }, [map, trees, selected, solar, shadows])
  return null
}
