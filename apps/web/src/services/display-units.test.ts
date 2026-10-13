import { displayQuantity } from './display-units'

describe('display conversion leaves canonical quantities explicit', () => {
  it('uses the exact international foot conversion for lengths and areas', () => {
    expect(displayQuantity(10, 'm', 'imperial')).toBe('32.81 ft (10.00 m canonical)')
    expect(displayQuantity(10, 'm2', 'imperial')).toBe('107.64 ft2 (10.00 m2 canonical)')
    expect(displayQuantity(10, 'm2', 'metric')).toBe('10.00 m2')
  })
  it('preserves item counts and refuses nonfinite values', () => {
    expect(displayQuantity(3, 'item', 'imperial')).toBe('3.00 item')
    expect(displayQuantity(NaN, 'm2', 'imperial')).toBe('Unavailable')
  })
})
