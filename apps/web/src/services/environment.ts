import { z } from 'zod'

export type Clock = { date: string; minutes: number; offset: string }
export type Solar = { azimuth_deg: number; elevation_deg: number }
export const solarDaySchema = z.object({
  date: z.string(),
  utc_offset: z.number(),
  center: z.tuple([z.number(), z.number()]),
  samples: z
    .array(z.object({ azimuth_deg: z.number().finite(), elevation_deg: z.number().finite() }))
    .length(1441),
  events: z.object({
    sunrise: z.number().nullable(),
    solar_noon: z.number().nullable(),
    sunset: z.number().nullable(),
  }),
})
export type SolarDay = z.infer<typeof solarDaySchema>
export const timeText = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
export function instant(clock: Clock) {
  const offset = Number(clock.offset)
  const date = Date.parse(`${clock.date}T00:00:00Z`)
  if (
    !clock.offset.trim() ||
    !Number.isFinite(offset) ||
    offset < -12 ||
    offset > 14 ||
    !Number.isFinite(date) ||
    clock.date < '2000-01-01' ||
    clock.date > '2100-12-31' ||
    !Number.isInteger(clock.minutes) ||
    clock.minutes < 0 ||
    clock.minutes > 1439
  )
    return null
  return new Date(date + clock.minutes * 60000 - offset * 3600000).toISOString()
}
export function localNow(offset: string, now = Date.now()): Clock {
  const shifted = new Date(now + Number(offset) * 3600000)
  return {
    date: shifted.toISOString().slice(0, 10),
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
    offset,
  }
}
export function advanceClock(clock: Clock, minutes: number): Clock {
  const value = new Date(`${clock.date}T00:00:00Z`).getTime() + (clock.minutes + minutes) * 60000
  const day = new Date(value).toISOString().slice(0, 10)
  return { ...clock, date: day, minutes: (((clock.minutes + minutes) % 1440) + 1440) % 1440 }
}
export function phase(solar: Solar | null) {
  if (!solar) return 'Solar unavailable'
  return solar.elevation_deg >= 0 ? 'Daylight' : solar.elevation_deg >= -6 ? 'Twilight' : 'Night'
}
export type Weather = {
  preset: string
  cloud: number
  rain: number
  wind: number
  direction: number
  enabled: boolean
  paused: boolean
  quality: 'Low' | 'Medium' | 'High'
}
export const presets = {
  Clear: { cloud: 0, rain: 0, wind: 15 },
  'Partly Cloudy': { cloud: 35, rain: 0, wind: 25 },
  Overcast: { cloud: 90, rain: 0, wind: 30 },
  'Light Rain': { cloud: 65, rain: 25, wind: 25 },
  'Heavy Rain': { cloud: 95, rain: 80, wind: 55 },
  Storm: { cloud: 100, rain: 100, wind: 85 },
} as const
export const initialWeather: Weather = {
  preset: 'Clear',
  ...presets.Clear,
  direction: 90,
  enabled: true,
  paused: false,
  quality: 'Medium',
}

// ENU sun direction projected into a pitched, north-referenced perspective camera.
// Bearing is clockwise from north; pitch 0 looks down, pitch 90 at the horizon.
export function sunScreen(
  solar: Solar,
  bearing: number,
  pitch: number,
  fov: number,
  aspect: number,
) {
  const rad = Math.PI / 180,
    a = (solar.azimuth_deg - bearing) * rad,
    e = solar.elevation_deg * rad,
    p = pitch * rad
  const forward = Math.cos(e) * Math.cos(a) * Math.sin(p) - Math.sin(e) * Math.cos(p)
  if (solar.elevation_deg <= 0 || forward <= 0) return null
  const x = (Math.cos(e) * Math.sin(a)) / (forward * Math.tan((fov * rad) / 2) * aspect)
  const y =
    (Math.cos(e) * Math.cos(a) * Math.cos(p) + Math.sin(e) * Math.sin(p)) /
    (forward * Math.tan((fov * rad) / 2))
  return Math.abs(x) <= 1 && Math.abs(y) <= 1 ? { x: (x + 1) / 2, y: (1 - y) / 2 } : null
}
