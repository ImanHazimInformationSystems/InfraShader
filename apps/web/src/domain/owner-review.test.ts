import { describe, expect, it } from 'vitest'
import { READINESS_LABEL, weightTotal } from './owner-review'

describe('owner review display helpers', () => {
  it('totals weights exactly in hundredths without floating drift', () => {
    expect(weightTotal(['33.33', '33.33', '33.34'])).toBe('100.00')
    expect(weightTotal(['60', '40'])).toBe('100.00')
    expect(weightTotal(['0.1', '0.2'])).toBe('0.30')
    expect(weightTotal(['50', 'abc'])).toBe('invalid')
    expect(weightTotal(['1.234'])).toBe('invalid')
  })
  it('labels every readiness state separately', () => {
    expect(new Set(Object.values(READINESS_LABEL)).size).toBe(5)
  })
})
