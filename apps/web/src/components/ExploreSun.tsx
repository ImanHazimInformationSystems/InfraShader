import { useEffect, useState } from 'react'
import type { Map, GeoJSONSource } from 'maplibre-gl'
import type { FeatureCollection } from 'geojson'
import { z } from 'zod'
import { request } from '../services/api'

const responseSchema = z.object({
  status: z.enum(['preview', 'night', 'low_sun']),
  solar: z.object({ azimuth_deg: z.number(), elevation_deg: z.number() }),
  building_count: z.number(),
  omitted: z.number(),
  shadows: z.custom<FeatureCollection>(
    (value) =>
      !!value && typeof value === 'object' && 'type' in value && value.type === 'FeatureCollection',
  ),
})
const empty: FeatureCollection = { type: 'FeatureCollection', features: [] }

export default function ExploreSun({ map }: { map: Map }) {
  const [enabled, setEnabled] = useState(true)
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [minutes, setMinutes] = useState(540)
  const [offset, setOffset] = useState('8')
  const [message, setMessage] = useState('Loading building data…')
  const [solar, setSolar] = useState<z.infer<typeof responseSchema>['solar'] | null>(null)
  const [retry, setRetry] = useState(0)
  const time = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
  useEffect(() => {
    if (!map.getSource('explore-shadows')) {
      map.addSource('explore-shadows', { type: 'geojson', data: empty })
      map.addLayer(
        {
          id: 'explore-shadows',
          type: 'fill',
          source: 'explore-shadows',
          paint: { 'fill-color': '#283047', 'fill-opacity': 0.38 },
        },
        map.getLayer('explore-buildings-3d') ? 'explore-buildings-3d' : undefined,
      )
    }
    const source = map.getSource('explore-shadows') as GeoJSONSource
    let stopped = false,
      lastKey = ''
    let timer: ReturnType<typeof setTimeout>
    let controller: AbortController | undefined
    function clear() {
      clearTimeout(timer)
      controller?.abort()
      source.setData(empty)
      lastKey = ''
      setSolar(null)
    }
    function moving() {
      clear()
      setMessage('Map moving — updating shadows when it settles.')
    }
    async function calculate() {
      if (stopped || !enabled || map.isMoving()) return
      const layer = map
        .getStyle()
        .layers.find(
          (layer) =>
            'source-layer' in layer && layer['source-layer'] === 'building' && 'source' in layer,
        )
      const center = map.getCenter()
      const buildings: { ring: number[][]; height: number }[] = []
      const candidates: { ring: number[][]; height: number; distance: number }[] = []
      const seen = new Set<string>()
      let skipped = 0,
        vertices = 0
      if (layer && 'source' in layer && map.getZoom() >= 14) {
        for (const feature of map.querySourceFeatures(layer.source as string, {
          sourceLayer: 'building',
        })) {
          const height = Number(feature.properties?.render_height ?? feature.properties?.height)
          const rings =
            feature.geometry.type === 'Polygon'
              ? [feature.geometry.coordinates]
              : feature.geometry.type === 'MultiPolygon'
                ? feature.geometry.coordinates
                : []
          for (const polygon of rings) {
            const ring = polygon[0]
            const key = JSON.stringify([height, ring])
            if (seen.has(key)) continue
            seen.add(key)
            if (
              !Number.isFinite(height) ||
              height <= 0 ||
              height > 1000 ||
              polygon.length > 1 ||
              ring.length > 128 ||
              ring.some(
                ([x, y]) => Math.abs(x - center.lng) > 0.15 || Math.abs(y - center.lat) > 0.15,
              )
            ) {
              skipped++
              continue
            }
            candidates.push({
              ring,
              height,
              distance: (ring[0][0] - center.lng) ** 2 + (ring[0][1] - center.lat) ** 2,
            })
          }
        }
      }
      candidates.sort((a, b) => a.distance - b.distance)
      for (const item of candidates) {
        if (buildings.length >= 500 || vertices + item.ring.length > 10000) {
          skipped++
          continue
        }
        buildings.push({ ring: item.ring, height: item.height })
        vertices += item.ring.length
      }
      const instant = new Date(`${date}T${time}:00Z`).getTime() - Number(offset) * 3600000
      if (
        !Number.isFinite(instant) ||
        !offset.trim() ||
        !Number.isFinite(Number(offset)) ||
        Number(offset) < -12 ||
        Number(offset) > 14
      ) {
        clear()
        setMessage('Enter a valid date and UTC offset between -12 and +14.')
        return
      }
      const body = JSON.stringify({
        center: [center.lng, center.lat],
        timestamp: new Date(instant).toISOString(),
        buildings,
      })
      if (body === lastKey) return
      lastKey = body
      controller?.abort()
      controller = new AbortController()
      const current = controller
      source.setData(empty)
      setMessage('Calculating sun and estimated shadows…')
      try {
        const result = await request('/api/v1/explore/shadows', responseSchema, undefined, {
          method: 'POST',
          body,
          signal: current.signal,
        })
        if (stopped || current.signal.aborted) return
        source.setData(result.shadows)
        skipped += result.omitted
        setSolar(result.solar)
        setMessage(
          result.status === 'night'
            ? 'Night — sun below horizon; no daylight shadow preview.'
            : result.status === 'low_sun'
              ? 'Low sun — below the supported 5° elevation; shadows unavailable.'
              : map.getZoom() < 14
                ? 'Zoom in to street level to load building shadows.'
                : !result.building_count
                  ? 'No supported building heights loaded here. Sun position remains available.'
                  : `Estimated shadows from ${result.building_count} nearby building parts${skipped ? `; ${skipped} unsupported or over-limit parts omitted` : ''}. Coverage may be incomplete.`,
        )
      } catch (error) {
        if (!stopped && !current.signal.aborted) {
          setSolar(null)
          setMessage(error instanceof Error ? error.message : 'Shadow preview unavailable. Retry.')
        }
      }
    }
    function schedule() {
      clearTimeout(timer)
      timer = setTimeout(() => void calculate(), 450)
    }
    clear()
    if (enabled) {
      schedule()
      map.on('idle', schedule)
      map.on('movestart', moving)
      map.on('moveend', schedule)
    }
    return () => {
      stopped = true
      clearTimeout(timer)
      controller?.abort()
      map.off('idle', schedule)
      map.off('movestart', moving)
      map.off('moveend', schedule)
    }
  }, [map, enabled, date, time, offset, retry])
  return (
    <section className="explore-sun" aria-label="Sun and shadow explorer">
      <label>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
        />{' '}
        Sun & shadows
      </label>
      <div className="sun-inputs">
        <label>
          Date
          <input
            aria-label="Shadow date"
            type="date"
            min="2000-01-01"
            max="2100-12-31"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </label>
        <label>
          Time
          <input
            aria-label="Shadow time"
            type="time"
            value={time}
            onChange={(event) => {
              const [h, m] = event.target.value.split(':').map(Number)
              if (Number.isFinite(h + m)) setMinutes(h * 60 + m)
            }}
          />
        </label>
        <label>
          UTC offset
          <input
            aria-label="Shadow UTC offset"
            type="number"
            min="-12"
            max="14"
            step="0.25"
            value={offset}
            onChange={(event) => setOffset(event.target.value)}
          />
        </label>
      </div>
      <input
        aria-label="Time of day"
        type="range"
        min="0"
        max="1439"
        step="15"
        value={minutes}
        onChange={(event) => setMinutes(Number(event.target.value))}
      />
      {solar && (
        <p>
          ☀ Sun {solar.azimuth_deg.toFixed(1)}° clockwise from north · elevation{' '}
          {solar.elevation_deg.toFixed(1)}°
        </p>
      )}
      <p role="status">{enabled ? message : 'Shadow preview off.'}</p>
      <details>
        <summary>Preview data & limits</summary>
        <p>
          Automatic map-tile footprints and estimated heights, up to 1,000 m. Flat-ground preview
          using loaded tiles only; missing buildings, courtyards, trees and terrain can leave gaps.
          No manual modelling required. This preview does not change saved project analysis. Set UTC
          offset for your location and date (+8 for Malaysia).
        </p>
        <button type="button" onClick={() => setRetry((value) => value + 1)}>
          Retry shadows
        </button>
      </details>
    </section>
  )
}
