import { mapStyle } from '../services/map'
import { reloadMapbox, visibleProviderBuildings } from '../services/map'
import { collectBuildings, type BuildingCoverage } from '../services/explore-buildings'
import { useEffect, useState } from 'react'
import MapEnvironment from './MapEnvironment'
import EnvironmentControls from './EnvironmentControls'
import {
  advanceClock,
  initialWeather,
  instant,
  localNow,
  phase,
  timeText,
  type Clock,
  type Solar,
} from '../services/environment'
import { useSolarDay } from '../services/use-solar-day'
import type { Map, GeoJSONSource } from 'mapbox-gl'
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

export default function ExploreSun({
  map,
  onClock,
  initialClock,
  onSolar,
  controlsHidden = false,
}: {
  map: Map
  initialClock?: Clock
  onClock?: (clock: Clock) => void
  onSolar?: (solar: Solar | null) => void
  controlsHidden?: boolean
}) {
  const [enabled, setEnabled] = useState(true)
  const [clock, setClock] = useState<Clock>(
    () => initialClock ?? { ...localNow('8'), minutes: 540 },
  )
  const { date, minutes, offset } = clock
  const time = timeText(minutes)
  const [message, setMessage] = useState('Loading building data…')
  const [coverage, setCoverage] = useState<BuildingCoverage | null>(null)
  const [retry, setRetry] = useState(0)
  const [weather, setWeather] = useState(initialWeather)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(5)
  const [path, setPath] = useState(false)
  const [reduced, setReduced] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  const { data, solar, error, loading } = useSolarDay(map, clock, retry)
  useEffect(() => {
    onSolar?.(enabled ? solar : null)
  }, [solar, enabled, onSolar])
  useEffect(() => {
    onClock?.(clock)
  }, [clock, onClock])
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => {
      setReduced(media.matches)
      if (media.matches) setPlaying(false)
    }
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  useEffect(() => {
    if (!playing || reduced) return
    const timer = setInterval(() => {
      if (!document.hidden)
        setClock((c) => {
          const next = advanceClock(c, speed)
          return next.date > '2100-12-31' ? c : next
        })
    }, 1000)
    return () => clearInterval(timer)
  }, [playing, reduced, speed])
  useEffect(() => {
    function install() {
      if (!mapStyle(map)) return
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
    }
    install()
    const updateSource = (data: FeatureCollection) => {
      if (mapStyle(map))
        (map.getSource('explore-shadows') as GeoJSONSource | undefined)?.setData(data)
    }
    let stopped = false,
      lastKey = ''
    let timer: ReturnType<typeof setTimeout>
    let controller: AbortController | undefined
    function clear() {
      clearTimeout(timer)
      controller?.abort()
      updateSource(empty)
      lastKey = ''
      setCoverage(null)
      setMessage('Updating shadows for the selected location and time…')
    }
    function moving() {
      clear()
      setMessage('Map moving — updating shadows when it settles.')
    }
    async function calculate() {
      if (stopped || !enabled || map.isMoving()) return
      if (!mapStyle(map)) return
      if (map.getTerrain()) {
        clear()
        setMessage(
          'Elevation terrain is visual context. The flat-ground explorer shadow overlay is paused; Mapbox lighting remains illustrative.',
        )
        return
      }
      const style = mapStyle(map)
      if (!style) return
      const center = map.getCenter()
      const { buildings, coverage: counts } = collectBuildings(
        visibleProviderBuildings(map),
        center,
      )
      let skipped = counts.unknownHeight + counts.unsupported + counts.limited
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
      setCoverage(counts)
      lastKey = body
      controller?.abort()
      controller = new AbortController()
      const current = controller
      updateSource(empty)
      setMessage('Calculating sun and estimated shadows…')
      try {
        const result = await request('/api/v1/explore/shadows', responseSchema, undefined, {
          method: 'POST',
          body,
          signal: AbortSignal.any([current.signal, AbortSignal.timeout(15000)]),
        })
        if (stopped || current.signal.aborted) return
        updateSource(result.shadows)
        skipped += result.omitted
        setCoverage({
          ...counts,
          used: result.building_count,
          unsupported: counts.unsupported + result.omitted,
        })
        setMessage(
          result.status === 'night'
            ? 'No direct sunlight — Night or twilight; sun below horizon.'
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
          setMessage(error instanceof Error ? error.message : 'Shadow preview unavailable. Retry.')
        }
      }
    }
    function schedule() {
      clearTimeout(timer)
      timer = setTimeout(() => void calculate(), 450)
    }
    function sourceLoaded(event: { sourceId?: string; isSourceLoaded?: boolean }) {
      if (
        event.sourceId !== 'explore-shadows' &&
        event.sourceId !== 'selected-site' &&
        event.isSourceLoaded
      )
        schedule()
    }
    function styleReload() {
      install()
      clear()
      schedule()
    }
    map.on('style.load', styleReload)
    clear()
    if (enabled) {
      schedule()
      map.on('idle', schedule)
      map.on('movestart', moving)
      map.on('moveend', schedule)
      map.on('sourcedata', sourceLoaded)
      map.on('terrain', moving)
      map.on('terrain', schedule)
    }
    return () => {
      stopped = true
      clearTimeout(timer)
      controller?.abort()
      map.off('idle', schedule)
      map.off('movestart', moving)
      map.off('moveend', schedule)
      map.off('sourcedata', sourceLoaded)
      map.off('terrain', moving)
      map.off('terrain', schedule)
      map.off('style.load', styleReload)
      updateSource(empty)
    }
  }, [map, enabled, date, time, offset, retry])
  return (
    <>
      <MapEnvironment
        map={map}
        solar={enabled ? solar : null}
        weather={weather}
        reduced={reduced}
        path={path ? data : undefined}
      />
      <section
        className="explore-sun"
        style={controlsHidden ? { display: 'none' } : undefined}
        aria-label="Sun and shadow explorer"
        data-solar-phase={phase(solar)}
      >
        <div className="timeline-heading">
          <strong>
            {phase(solar)} · {time}
          </strong>
          <label>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />{' '}
            Sun &amp; shadows
          </label>
        </div>
        <div className="sun-inputs">
          <label>
            Date
            <input
              aria-label="Shadow date"
              type="date"
              min="2000-01-01"
              max="2100-12-31"
              value={date}
              onChange={(e) => {
                setPlaying(false)
                setClock({ ...clock, date: e.target.value })
              }}
            />
          </label>
          <label>
            Time
            <input
              aria-label="Shadow time"
              type="time"
              value={time}
              onChange={(e) => {
                const [h, m] = e.target.value.split(':').map(Number)
                if (Number.isFinite(h + m)) {
                  setPlaying(false)
                  setClock({ ...clock, minutes: h * 60 + m })
                }
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
              onChange={(e) => {
                setPlaying(false)
                setClock({ ...clock, offset: e.target.value })
              }}
            />
          </label>
        </div>
        <input
          aria-label="Time of day"
          type="range"
          min="0"
          max="1439"
          step="1"
          value={minutes}
          onChange={(e) => {
            setPlaying(false)
            setClock({ ...clock, minutes: Number(e.target.value) })
          }}
        />
        <div className="timeline-ticks" aria-hidden="true">
          <span>00:00</span>
          <span>06:00</span>
          <span>12:00</span>
          <span>18:00</span>
          <span>24:00</span>
        </div>
        <div className="timeline-actions">
          <button
            type="button"
            disabled={reduced || !instant(clock)}
            onClick={() => setPlaying(!playing)}
          >
            {playing ? 'Pause time' : 'Play time'}
          </button>
          <label>
            Playback speed
            <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
              <option value="1">1 min / second</option>
              <option value="5">5 min / second</option>
              <option value="15">15 min / second</option>
            </select>
          </label>
          <button
            type="button"
            disabled={!instant(clock)}
            onClick={() => {
              setPlaying(false)
              setClock(localNow(offset))
            }}
          >
            Now
          </button>
          {(['sunrise', 'solar_noon', 'sunset'] as const).map((key) => (
            <button
              key={key}
              type="button"
              disabled={data?.events[key] == null}
              title={
                data?.events[key] == null
                  ? 'No event on this local date, or solar data unavailable'
                  : `Approximately ${timeText(data.events[key]!)}`
              }
              onClick={() => {
                setPlaying(false)
                setClock({ ...clock, minutes: data!.events[key]! })
              }}
            >
              {key === 'solar_noon' ? 'Solar noon' : key === 'sunrise' ? 'Sunrise' : 'Sunset'}
            </button>
          ))}
        </div>
        {solar && (
          <p>
            Sun {solar.azimuth_deg.toFixed(1)}° clockwise from north · elevation{' '}
            {solar.elevation_deg.toFixed(1)}°
          </p>
        )}
        <p role="status">
          {error || (loading ? 'Updating solar position. ' : '')}
          {enabled ? message : 'Shadow preview off.'}
        </p>
        {data && (data.events.sunrise === null || data.events.sunset === null) && (
          <p>
            No {data.events.sunrise === null ? 'sunrise' : ''}
            {data.events.sunrise === null && data.events.sunset === null ? ' or ' : ''}
            {data.events.sunset === null ? 'sunset' : ''} on this local date.
          </p>
        )}
        <EnvironmentControls weather={weather} onChange={setWeather} reduced={reduced} />
        <details>
          <summary>Preview data &amp; limits</summary>
          <label>
            <input type="checkbox" checked={path} onChange={(e) => setPath(e.target.checked)} />{' '}
            Show sun path (visible sky only)
          </label>
          <button
            type="button"
            disabled={!solar || solar.elevation_deg <= 0}
            onClick={() =>
              solar &&
              map.easeTo({ bearing: solar.azimuth_deg, pitch: 85, duration: reduced ? 0 : 500 })
            }
          >
            Face sun direction
          </button>
          <p>
            Daylight: solar centre ≥0°. Civil twilight: −6° to 0°. Night: below −6°. Dawn/evening
            colour follows elevation. Events use an approximate −0.833° horizon and one-minute
            samples; no terrain correction. Sun/path may be outside a top-down view.
          </p>
          {coverage && (
            <p aria-label="Loaded building coverage">
              Loaded building parts: {coverage.loaded}. Supported provider-height parts:{' '}
              {coverage.used}. Unknown or missing height: {coverage.unknownHeight}. Unsupported
              geometry/height: {coverage.unsupported}. Over preview capacity: {coverage.limited}.
              Counts describe loaded tiles only; provider heights may be estimated.
            </p>
          )}
          <p>
            Automatic loaded map footprints and estimated heights, up to 1,000 m. Flat-ground
            preview only; missing buildings, courtyards, trees and terrain leave gaps. No manual
            modelling required. Weather is visual only and does not change saved analysis. Use the
            correct site/date UTC offset (+8 Malaysia). Moving/scrubbing hides obsolete shadows
            until recalculated.
          </p>
          <button type="button" onClick={() => setRetry((v) => v + 1)}>
            Retry shadows
          </button>
          <button
            type="button"
            onClick={() =>
              void reloadMapbox(map).catch(() =>
                setMessage(
                  'Mapbox reload failed. Your site, tree and workspace layers are retained. Check token configuration or retry later.',
                ),
              )
            }
          >
            Reload map rendering
          </button>
        </details>
      </section>
    </>
  )
}
