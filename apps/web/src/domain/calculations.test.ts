import { scopeItem } from './calculations'

describe('issued scope rows', () => {
  const row = {
    id: crypto.randomUUID(),
    name: 'Site clearance, setting out and tree protection',
    kind: 'manual',
    status: 'proposed',
    quantity: '1',
    unit: 'item',
    source_note: 'Fixed-price allowance',
    provenance: 'manually_entered',
  }

  it('accepts fixed-price and count-only lines that have no map geometry', () => {
    expect(scopeItem.safeParse({ ...row, geometry: null }).success).toBe(true)
    expect(scopeItem.safeParse(row).success).toBe(true)
  })

  it('still rejects a malformed geometry', () => {
    expect(scopeItem.safeParse({ ...row, geometry: { type: 'Polygon' } }).success).toBe(false)
  })
})
