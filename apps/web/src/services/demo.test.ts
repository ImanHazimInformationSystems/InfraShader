import { emptyBrief, initialBounds } from '../domain/projects'
import { DemoStore, DEMO_STORAGE_KEY } from './demo'

describe('Browser Demo storage boundary', () => {
  beforeEach(() => localStorage.clear())
  const input = { ...emptyBrief(initialBounds), name: 'Local courtyard', stakeholder: 'Demo sponsor' }
  it('saves and reloads the selected site, supports rename/archive/restore and rejects stale writes', () => {
    const store = new DemoStore()
    const created = store.create(input)
    expect(new DemoStore().list()[0].site.bounds).toEqual(initialBounds)
    const renamed = store.update(created.id, 1, { name: 'Renamed courtyard' })
    expect(renamed.revision).toBe(2)
    expect(() => store.update(created.id, 1, { name: 'Stale edit' })).toThrow('another tab')
    const archived = store.update(created.id, 2, { archived: true })
    expect(archived.archived).toBe(true)
    expect(store.update(created.id, 3, { archived: false }).archived).toBe(false)
    expect(localStorage.length).toBe(1)
    expect(localStorage.key(0)).toBe(DEMO_STORAGE_KEY)
  })
  it('never overwrites corrupt demo storage or reports a failed write as saved', () => {
    localStorage.setItem(DEMO_STORAGE_KEY, '{broken')
    expect(() => new DemoStore().create(input)).toThrow('could not be read')
    expect(localStorage.getItem(DEMO_STORAGE_KEY)).toBe('{broken')
    const brokenStorage = { getItem: () => null, setItem: () => { throw new Error('Quota') } }
    expect(() => new DemoStore(brokenStorage).create(input)).toThrow('could not save')
  })
})
