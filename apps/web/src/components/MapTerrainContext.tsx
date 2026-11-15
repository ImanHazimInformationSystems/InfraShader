import { mapStyle } from '../services/map'
import { hasMapboxContext } from '../services/map'
import { useEffect, useState } from 'react'
import type { Map, ErrorEvent } from 'mapbox-gl'

// Explicit context toggle. Mapbox DEM follows the configured Mapbox account; custom DEM remains optional.
export default function MapTerrainContext({
  map,
  disabled = false,
}: {
  map: Map | null
  disabled?: boolean
}) {
  const url = import.meta.env.VITE_TERRAIN_TILE_URL as string | undefined
  const provider = !!map && hasMapboxContext(map) && !url
  const attribution =
    (import.meta.env.VITE_TERRAIN_ATTRIBUTION as string | undefined) ??
    (provider ? 'Mapbox Terrain DEM' : undefined)
  const configured = provider || (!!url && !!attribution && url !== 'offline')
  const [enabled, setEnabled] = useState(false),
    [error, setError] = useState('')
  useEffect(() => {
    if (!map || !configured || !enabled || disabled) return
    const install = () => {
      if (!mapStyle(map)) return
      if (!map.getSource('site-context-dem'))
        map.addSource('site-context-dem', {
          type: 'raster-dem',
          ...(provider
            ? { url: 'mapbox://mapbox.mapbox-terrain-dem-v1', tileSize: 512 }
            : { tiles: [url!], tileSize: 256 }),
          encoding: import.meta.env.VITE_TERRAIN_ENCODING === 'terrarium' ? 'terrarium' : 'mapbox',
          maxzoom: 14,
          attribution: attribution!,
        })
      map.setTerrain({ source: 'site-context-dem', exaggeration: 1 })
    }
    const fail = (event: ErrorEvent & { sourceId?: string }) => {
      if (event.sourceId === 'site-context-dem') {
        setError('Elevation tiles unavailable or incomplete. Return to flat context to continue.')
        map.setTerrain(null)
      }
    }
    install()
    map.on('style.load', install)
    map.on('style.import.load', install)
    map.on('error', fail)
    return () => {
      map.off('style.load', install)
      map.off('style.import.load', install)
      map.off('error', fail)
      if (!mapStyle(map)) return
      if (map.getTerrain()?.source === 'site-context-dem') map.setTerrain(null)
      if (map.getSource('site-context-dem')) map.removeSource('site-context-dem')
    }
  }, [map, enabled, configured, url, attribution, provider, disabled])
  return (
    <details className="map-terrain-context">
      <summary>Terrain context</summary>
      {configured ? (
        <>
          <label>
            <input
              type="checkbox"
              disabled={!map || disabled}
              checked={enabled}
              onChange={(e) => {
                setEnabled(e.target.checked)
                setError('')
              }}
            />{' '}
            Show elevation terrain
          </label>
          <p>
            {attribution}. Display context only; data resolution and vertical datum must be checked.
            Concept earthworks remain in the Terrain tool.
          </p>
        </>
      ) : (
        <p>
          Elevation context is unavailable. The map uses flat ground with available land-cover
          context. Concept terrain remains available in the saved project's Terrain tool.
        </p>
      )}
      {error && <p role="status">{error}</p>}
      {disabled && (
        <p>
          Elevation context is paused while editing concept objects or terrain. Return to the
          geographic plan to view it; concept elevations have a separate declared datum.
        </p>
      )}
    </details>
  )
}
