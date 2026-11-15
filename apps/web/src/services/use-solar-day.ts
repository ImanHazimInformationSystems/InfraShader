import { useEffect, useState } from 'react'
import type { Map } from 'mapbox-gl'
import { request } from './api'
import { instant, solarDaySchema, type Clock, type SolarDay } from './environment'

export function useSolarDay(map: Map, clock: Clock, retry: number) {
  const [center, setCenter] = useState(
    () => [map.getCenter().lng, map.getCenter().lat] as [number, number],
  )
  const [moving, setMoving] = useState(false)
  const [result, setResult] = useState<{ key: string; data?: SolarDay; error?: string }>()
  const valid = instant(clock) !== null
  const key = JSON.stringify([center, clock.date, clock.offset, retry])
  useEffect(() => {
    const start = () => setMoving(true)
    const end = () => {
      setMoving(false)
      setCenter([map.getCenter().lng, map.getCenter().lat])
    }
    map.on('movestart', start)
    map.on('moveend', end)
    return () => {
      map.off('movestart', start)
      map.off('moveend', end)
    }
  }, [map])
  useEffect(() => {
    if (!valid || moving) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      void request('/api/v1/explore/solar-day', solarDaySchema, undefined, {
        method: 'POST',
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
        body: JSON.stringify({ center, date: clock.date, utc_offset: Number(clock.offset) }),
      })
        .then((data) => {
          if (!controller.signal.aborted) setResult({ key, data })
        })
        .catch((error) => {
          if (!controller.signal.aborted)
            setResult({
              key,
              error: error instanceof Error ? error.message : 'Solar data unavailable.',
            })
        })
    }, 250)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [key, center, clock.date, clock.offset, valid, moving])
  const data = !moving && result?.key === key ? result.data : undefined
  return {
    data,
    solar: data?.samples[clock.minutes] ?? null,
    error: !valid
      ? 'Enter a valid date and UTC offset (-12 to +14).'
      : result?.key === key
        ? result.error
        : undefined,
    loading: valid && !data && !(result?.key === key && result.error),
  }
}
