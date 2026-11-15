import { useEffect, useRef, useState } from 'react'
import type { Map } from 'mapbox-gl'
import {
  hasMapboxContext,
  preferredBasemap,
  providerTrees,
  safeMapError,
  switchBasemap,
  type BasemapMode,
} from '../services/map'
import MapTerrainContext from './MapTerrainContext'
import './mapbox-context.css'

export default function MapboxControls({
  map,
  hidden = false,
  elevationDisabled = false,
  onStatus,
}: {
  map: Map | null
  hidden?: boolean
  elevationDisabled?: boolean
  onStatus?: (message: string) => void
}) {
  const [mode, setMode] = useState<BasemapMode>(preferredBasemap)
  const [trees, setTrees] = useState(true),
    [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const ticket = useRef(0)
  const report = useRef(onStatus)
  useEffect(() => {
    report.current = onStatus
  }, [onStatus])
  useEffect(
    () => () => {
      ticket.current++
    },
    [map],
  )
  useEffect(() => {
    if (!map) return
    const loaded = () => {
      setPending(false)
      map.getContainer().dataset.basemapMode = mode
    }
    const failed = (event: { error?: Error }) => {
      setPending(false)
      const diagnostic = safeMapError(event.error)
      const limited = diagnostic.includes('429')
      const text = limited
        ? 'Mapbox is rate limiting content (HTTP 429). Switch to Standard or wait before retrying. Your project data is retained.'
        : diagnostic.includes('404')
          ? 'Some Mapbox tiles are absent here; coverage may be incomplete. Your project overlays are retained.'
          : 'Some Mapbox content could not load. Check connection and token URL restrictions. Your project overlays are retained.'
      setError(text)
      report.current?.(text)
    }
    map.on('style.import.load', loaded)
    map.on('error', failed)
    return () => {
      map.off('style.import.load', loaded)
      map.off('error', failed)
    }
  }, [map, mode])
  const available = !!map && hasMapboxContext(map)
  return (
    <details className="mapbox-context-controls" hidden={hidden} aria-label="Mapbox map layers">
      <summary>Map layers</summary>
      <fieldset disabled={!available || pending}>
        <legend>Mapbox context</legend>
        <label>
          Map view
          <select
            aria-label="Mapbox basemap"
            value={mode}
            onChange={async (e) => {
              const next = e.target.value as BasemapMode,
                current = ++ticket.current
              setPending(true)
              setError('')
              try {
                await switchBasemap(map!, next)
                if (ticket.current === current) {
                  setMode(next)
                  report.current?.('')
                }
              } catch (reason) {
                if (ticket.current === current)
                  setError(
                    reason instanceof Error
                      ? reason.message
                      : 'Map change failed. Project layers are retained.',
                  )
              } finally {
                if (ticket.current === current) setPending(false)
              }
            }}
          >
            <option value="standard">Standard · 3D map</option>
            <option value="satellite">Satellite · imagery + 3D</option>
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={trees}
            onChange={(e) => {
              setTrees(e.target.checked)
              providerTrees(map!, e.target.checked)
            }}
          />{' '}
          Mapbox 3D tree context
        </label>
      </fieldset>
      <MapTerrainContext map={map} disabled={elevationDisabled} />
      <p>
        Mapbox trees, buildings and imagery are visual context with variable coverage. Manage
        retained/removed project trees in Site trees. Satellite pixels are not an editable tree
        inventory.
      </p>
      {!available && (
        <p role="status">
          Mapbox content unavailable; coordinate and project editing remain available.
        </p>
      )}
      {pending && <p role="status">Loading Mapbox view…</p>}
      {error && <p role="status">{error}</p>}
    </details>
  )
}
