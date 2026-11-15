import { describe, expect, it } from 'vitest'
import { advanceClock, instant, localNow, phase, sunScreen } from './environment'

describe('explicit-site clock and geographic sun', () => {
  it('converts Now without using browser timezone, including date boundaries', () => {
    expect(localNow('5.75', Date.parse('2026-10-17T21:00:00Z'))).toEqual({
      date: '2026-10-18',
      minutes: 165,
      offset: '5.75',
    })
    expect(instant({ date: '2026-10-18', minutes: 165, offset: '5.75' })).toBe(
      '2026-10-17T21:00:00.000Z',
    )
    expect(instant({ date: '2026-10-17', minutes: 0, offset: '' })).toBeNull()
  })
  it('advances through midnight, month/year and leap-day boundaries', () => {
    expect(advanceClock({ date: '2028-02-28', minutes: 1435, offset: '8' }, 15)).toEqual({
      date: '2028-02-29',
      minutes: 10,
      offset: '8',
    })
    expect(advanceClock({ date: '2026-12-31', minutes: 1439, offset: '-4' }, 5).date).toBe(
      '2027-01-01',
    )
  })
  it('classifies twilight by elevation and never invents unavailable solar data', () => {
    expect(phase(null)).toBe('Solar unavailable')
    for (const [e, label] of [
      [5, 'Daylight'],
      [-3, 'Twilight'],
      [-7, 'Night'],
    ] as const)
      expect(phase({ azimuth_deg: 0, elevation_deg: e })).toBe(label)
  })
  it('keeps the sun geographic as the camera rotates and pitches', () => {
    const sun = { azimuth_deg: 90, elevation_deg: 5 }
    expect(sunScreen(sun, 90, 80, 40, 1)?.x).toBeCloseTo(0.5)
    expect(sunScreen(sun, 80, 80, 40, 1)!.x).toBeGreaterThan(0.5)
    expect(sunScreen(sun, 100, 80, 40, 1)!.x).toBeLessThan(0.5)
    expect(sunScreen(sun, 270, 80, 40, 1)).toBeNull()
    expect(sunScreen(sun, 90, 0, 40, 1)).toBeNull()
    expect(sunScreen({ ...sun, elevation_deg: -1 }, 90, 80, 40, 1)).toBeNull()
  })
})
