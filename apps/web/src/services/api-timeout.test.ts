import { apiTimeout } from './api-timeout'

describe('hosted API wake-up timeout', () => {
  it('allows a bounded wait for a sleeping host', () => {
    expect(apiTimeout('90000')).toBe(90000)
  })
  it.each([undefined, '', 'wrong', '0', '-1', 'Infinity', '120001', '90000.5'])('keeps a finite default for %s', value => {
    expect(apiTimeout(value)).toBe(15000)
  })
})
