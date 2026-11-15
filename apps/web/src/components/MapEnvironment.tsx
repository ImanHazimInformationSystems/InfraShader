import { mapStyle } from '../services/map'
import { hasMapboxContext } from '../services/map'
import { useEffect, useRef, useState } from 'react'
import type { Map } from 'mapbox-gl'
import { sunScreen, type Solar, type SolarDay, type Weather } from '../services/environment'
import { weatherLayer } from '../services/weather-layer'

const mix = (a: number[], b: number[], t: number) =>
  `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`
export default function MapEnvironment({
  map,
  solar,
  weather,
  reduced,
  path,
}: {
  map: Map
  solar: Solar | null
  weather: Weather
  reduced: boolean
  path?: SolarDay
}) {
  const latest = useRef({ weather, reduced, elevation: solar?.elevation_deg ?? 30 })
  useEffect(() => {
    latest.current = { weather, reduced, elevation: solar?.elevation_deg ?? 30 }
    map.triggerRepaint()
  }, [map, weather, reduced, solar])
  const [failure, setFailure] = useState(false)
  const [camera, setCamera] = useState(() => ({
    bearing: map.getBearing(),
    pitch: map.getPitch(),
    fov: map.getVerticalFieldOfView(),
    width: map.getContainer().clientWidth,
    height: map.getContainer().clientHeight,
  }))
  useEffect(() => {
    const update = () =>
      setCamera({
        bearing: map.getBearing(),
        pitch: map.getPitch(),
        fov: map.getVerticalFieldOfView(),
        width: map.getContainer().clientWidth,
        height: map.getContainer().clientHeight,
      })
    const install = () => {
      const style = mapStyle(map)
      if (!style) return
      if (!map.getLayer('explore-weather')) {
        const firstLabel = style.layers.find((l) => l.type === 'symbol')?.id
        setFailure(false)
        map.addLayer(
          weatherLayer(
            map,
            () => latest.current,
            () => setFailure(true),
          ),
          firstLabel,
        )
      }
      map.triggerRepaint()
    }
    const canvas = map.getCanvas()
    const visibility = () => map.triggerRepaint()
    const lost = () => setFailure(true)
    const restored = () => {
      // Mapbox may still be rebuilding its style; style.load retries installation.
      if (!mapStyle(map)) return
      if (mapStyle(map) && map.getLayer('explore-weather')) map.removeLayer('explore-weather')
      install()
    }
    install()
    map.on('move', update)
    map.on('resize', update)
    map.on('style.load', install)
    document.addEventListener('visibilitychange', visibility)
    canvas?.addEventListener('webglcontextlost', lost)
    canvas?.addEventListener('webglcontextrestored', restored)
    return () => {
      map.off('move', update)
      map.off('resize', update)
      map.off('style.load', install)
      document.removeEventListener('visibilitychange', visibility)
      canvas?.removeEventListener('webglcontextlost', lost)
      canvas?.removeEventListener('webglcontextrestored', restored)
      if (mapStyle(map) && map.getLayer('explore-weather')) map.removeLayer('explore-weather')
    }
  }, [map])
  useEffect(() => {
    const apply = () => {
      const style = mapStyle(map)
      if (!style) return
      const e = solar?.elevation_deg ?? 30
      const cloud = weather.enabled ? weather.cloud / 100 : 0
      const day = Math.max(0, Math.min(1, (e + 6) / 16)) * (1 - cloud * 0.4)
      const warm = e > -6 && e < 12
      if (hasMapboxContext(map)) {
        const preset = e < -6 ? 'night' : e < 6 ? 'dawn' : e < 12 ? 'dusk' : 'day'
        map.setConfigProperty('basemap', 'lightPreset', preset)
      }
      map.setFog({
        range: [1, 16],
        color: mix([22, 30, 48], [200, 214, 221], day),
        'high-color': mix([8, 17, 40], [91, 163, 220], day),
        'space-color': '#080f20',
        'horizon-blend': 0.12,
        'star-intensity': Math.max(0, 1 - day),
      })
      // Mapbox directional light: azimuth clockwise from north; polar angle from zenith.
      map.setLights([
        {
          id: 'infra-ambient',
          type: 'ambient',
          properties: {
            color: e < 0 ? '#8aa3ce' : '#ffffff',
            intensity: 0.22 + day * 0.55,
          },
        },
        {
          id: 'infra-sun',
          type: 'directional',
          properties: {
            direction: [solar?.azimuth_deg ?? 180, 90 - Math.max(0, e)],
            color: warm ? '#ffd4a3' : '#ffffff',
            intensity: Math.max(0, day * (1 - cloud * 0.7)),
            'cast-shadows': !!solar && e >= 5,
            'shadow-intensity': 0.6 * (1 - cloud * 0.65),
          },
        },
      ])
      if (map.getLayer('background'))
        map.setPaintProperty(
          'background',
          'background-color',
          mix([18, 28, 43], [226, 233, 218], day),
        )
      if (map.getLayer('infra-satellite'))
        map.setPaintProperty('infra-satellite', 'raster-brightness-max', 0.25 + day * 0.75)
    }
    apply()
    map.on('style.load', apply)
    map.on('style.import.load', apply)
    return () => {
      map.off('style.load', apply)
      map.off('style.import.load', apply)
    }
  }, [map, solar, weather.cloud, weather.enabled])
  const pos =
    solar &&
    sunScreen(solar, camera.bearing, camera.pitch, camera.fov, camera.width / camera.height)
  const points =
    path?.samples
      .filter((_, i) => i % 10 === 0)
      .map((s) =>
        sunScreen(s, camera.bearing, camera.pitch, camera.fov, camera.width / camera.height),
      ) ?? []
  return (
    <>
      <div className="sun-scene" aria-hidden="true">
        {pos && (
          <span
            className="solar-disc"
            style={{
              left: `${pos.x * 100}%`,
              top: `${pos.y * 100}%`,
              opacity: 1 - (weather.enabled ? weather.cloud / 140 : 0),
            }}
          />
        )}
        {points.map(
          (p, i) =>
            p && (
              <span
                key={i}
                className="solar-path-point"
                style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
              />
            ),
        )}
      </div>
      <div className="environment-indicator">
        <strong>Simulated weather · {weather.enabled ? weather.preset : 'Effects off'}</strong>
        {solar && (
          <span>
            <span
              aria-hidden="true"
              style={{
                display: 'inline-block',
                transform: `rotate(${solar.azimuth_deg - camera.bearing}deg)`,
              }}
            >
              ↑
            </span>{' '}
            Sun {solar.azimuth_deg.toFixed(0)}° from north ·{' '}
            {solar.elevation_deg <= 0 ? 'below horizon' : pos ? 'in view' : 'outside view'}
          </span>
        )}
        {failure && <span>Weather GPU effect unavailable; map and controls remain usable.</span>}
      </div>
    </>
  )
}
