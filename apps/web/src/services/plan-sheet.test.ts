import { describe, expect, it } from 'vitest'
import { incompleteTasks, niceLength, printRatio, sheetScale } from './plan-sheet'
import type { PlanSheet } from '../domain/calculations'

describe('plan sheet scale (L23 template v3)', () => {
  it('chooses 1/2/5 x 10^k scale-bar lengths no longer than the target', () => {
    expect(niceLength(55.6)).toBe(50)
    expect(niceLength(19)).toBe(10)
    expect(niceLength(0.3)).toBe(0.2)
    expect(niceLength(0)).toBe(1)
  })
  it('states the print ratio for the drawn scale (hand check)', () => {
    // 1 pt = 0.352778 mm; at 1 pt per metre the plan is 1 m : 0.352778 mm = 1:2834.6 -> 1:2800.
    expect(printRatio(1)).toBe(2800)
    // 2.075 pt/m (a 222 m site in 463 pt) -> 1:1366 -> 1:1400.
    expect(printRatio(2.075)).toBe(1400)
  })
  it('fits the limiting dimension with one uniform scale', () => {
    const sheet = { extent_m: { width: 223.03, height: 221.9 } } as PlanSheet
    // (300 - 52 - 18) / 221.9 = 1.0365 pt/m limits before (515 - 52) / 223.03 = 2.076.
    expect(sheetScale(sheet)).toBeCloseTo(230 / 221.9, 6)
  })
  it('counts checklist rows missing a task or frequency', () => {
    const row = { task: 'Sweep', responsibility: 'client' as const, frequency: 'Weekly', included_in_price: false, assumptions: '' }
    expect(incompleteTasks([row, { ...row, frequency: ' ' }, { ...row, task: '' }])).toBe(2)
  })
})
