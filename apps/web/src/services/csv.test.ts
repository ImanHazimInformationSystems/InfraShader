import { describe, expect, it } from 'vitest'
import { csvCell } from './csv'

describe('csvCell (S09)', () => {
  it('neutralises formula prefixes but keeps numbers', () => {
    expect(csvCell('=SUM(A1)')).toBe(`"'=SUM(A1)"`)
    expect(csvCell('\tx')).toBe(`"'\tx"`)
    expect(csvCell('-12.50')).toBe('"-12.50"')
    expect(csvCell(42)).toBe('"42"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell(null)).toBe('""')
  })
})
