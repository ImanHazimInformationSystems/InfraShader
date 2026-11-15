import type { Rate } from './calculations'
import {
  applyBulkRate,
  compatibleRates,
  itemState,
  layerMethodText,
  planBulkRate,
  plantMethodText,
  priceGroup,
  rateUsage,
  rateValidity,
  setItemPrice,
  type PriceRow,
} from './pricing'
import type { WorkItem, WorkspaceData } from './workspace'

const id = () => crypto.randomUUID()
const item = (over: Partial<WorkItem> = {}): WorkItem =>
  ({
    id: id(),
    name: 'Item',
    kind: 'bench',
    status: 'proposed',
    rate_id: null,
    count: 1,
    geometry: { type: 'Point', coordinates: [101.5, 3.1] },
    category: 'General',
    visible: true,
    manual_basis: 'count',
    crown_diameter_m: null,
    height_m: null,
    height_source: '',
    quantity_override: null,
    provenance: 'estimated',
    source_note: 'Fixture',
    ...over,
  }) as WorkItem
const tree = (stock: string, over: Partial<WorkItem> = {}) =>
  item({
    kind: 'tree',
    layout_plant: 'tree',
    tree_design: {
      variant: 'canopy',
      scale: 1,
      rotation_deg: 0,
      stock_spec: stock,
      rate_reviewed: false,
    },
    ...over,
  })
const rate = (over: Partial<Rate> = {}): Rate => ({
  id: id(),
  code: 'BENCH',
  version: 1,
  category: 'Furniture',
  archived: false,
  metadata_revision: 1,
  description: 'Timber bench',
  unit: 'item',
  currency: 'MYR',
  basis: 'cost',
  amount: '850.0000',
  effective_date: '2026-01-01',
  valid_until: '2099-12-31',
  source_note: 'Fixture quote',
  includes: [],
  source_type: 'supplier_quote',
  supplier_name: 'Fixture Furniture',
  quote_reference: 'Q-1',
  exclusions: '',
  ...over,
})
const row = (parent: string, over: Partial<PriceRow> = {}): PriceRow => ({
  id: parent,
  parent_id: parent,
  name: 'Row',
  section: 'General',
  quantity: '1',
  unit: 'item',
  source: 'Fixture',
  method: 'count',
  rate: 'Unavailable',
  specification: '',
  status: 'unpriced / invalid rate',
  state: 'needs_price',
  review: [],
  rate_id: null,
  total: null,
  ...over,
})
const design = (items: WorkItem[]) =>
  ({
    scenarios: {
      baseline: { name: 'Baseline', items: [] },
      option_a: { name: 'Option A', items },
      option_b: { name: 'Option B', items: [] },
    },
  }) as unknown as WorkspaceData

describe('pricing home helpers', () => {
  it('shows only rates with the same unit and project basis, and names reuse', () => {
    const bench = rate()
    const area = rate({ unit: 'm2', code: 'PAVE' })
    const budget = rate({ basis: 'indicative_budget', code: 'BUDGET' })
    const archived = rate({ archived: true, code: 'OLD' })
    expect(compatibleRates([bench, area, budget, archived], 'item', 'cost')).toEqual([bench])
    const first = item({ name: 'Bench 1', rate_id: bench.id })
    const second = item({ name: 'Bench 2' })
    expect(rateUsage(bench.id, [first, second], second.id)).toEqual(['Bench 1'])
    expect(rateUsage(bench.id, [first], first.id)).toEqual([])
  })

  it('plans a bulk rate: skips existing, locked, layered, wrong-unit and mixed-stock items', () => {
    const bench = rate()
    const a = item({ name: 'Bench 1' })
    const b = item({ name: 'Bench 2', rate_id: rate().id })
    const existing = item({ name: 'Old bench', status: 'existing' })
    const locked = item({ name: 'Locked bench', editor_locked: true })
    const paving = item({ name: 'Paving', kind: 'area' })
    const road = item({
      name: 'Driveway',
      kind: 'area',
      assembly: {
        code: 'R',
        version: 1,
        use: 'road',
        material: 'Fixture',
        finish: 'Fixture',
        source: 'Fixture',
        width_m: 1,
        height_m: 1,
        approved: true,
        pricing: 'components',
        components: [],
      },
    })
    const units = {
      [a.id]: 'item',
      [b.id]: 'item',
      [existing.id]: 'item',
      [locked.id]: 'item',
      [paving.id]: 'm2',
      [road.id]: 'm2',
    }
    const plan = planBulkRate(
      [a, b, existing, locked, paving, road],
      Object.keys(units),
      bench,
      units,
    )
    expect(plan.apply.map((entry) => entry.name)).toEqual(['Bench 1', 'Bench 2'])
    const reasons = Object.fromEntries(plan.skip.map((entry) => [entry.item.name, entry.reason]))
    expect(reasons['Old bench']).toMatch(/Existing site item/)
    expect(reasons['Locked bench']).toMatch(/Locked/)
    expect(reasons.Paving).toMatch(/Measured in m²; this rate is per each/)
    expect(reasons.Driveway).toMatch(/layer by layer/)

    const oak = tree('Oak 2.5 m, 45 L pot', { name: 'Oak 1' })
    const oak2 = tree('Oak 2.5 m, 45 L pot', { name: 'Oak 2' })
    const palm = tree('Palm 3 m root ball', { name: 'Palm' })
    const blank = tree('', { name: 'Unspecified' })
    const treeUnits = Object.fromEntries(
      [oak, oak2, palm, blank].map((entry) => [entry.id, 'item']),
    )
    const treePlan = planBulkRate(
      [oak, oak2, palm, blank],
      Object.keys(treeUnits),
      rate({ code: 'OAK' }),
      treeUnits,
    )
    expect(treePlan.apply.map((entry) => entry.name)).toEqual(['Oak 1', 'Oak 2'])
    expect(treePlan.trees).toBe(2)
    expect(treePlan.skip.map((entry) => entry.item.name)).toEqual(['Palm', 'Unspecified'])

    // Without the person's confirmation, trees are not given the rate; other items are.
    const data = design([oak, oak2, a])
    const mixedPlan = planBulkRate([oak, oak2, a], [oak.id, oak2.id, a.id], bench, {
      [oak.id]: 'item',
      [oak2.id]: 'item',
      [a.id]: 'item',
    })
    const unconfirmed = applyBulkRate(data, 'option_a', mixedPlan, bench.id, false)
    const byName = (next: WorkspaceData, name: string) =>
      next.scenarios.option_a.items.find((entry) => entry.name === name)!
    expect(byName(unconfirmed, 'Oak 1').rate_id).toBeNull()
    expect(byName(unconfirmed, 'Bench 1').rate_id).toBe(bench.id)
    const confirmed = applyBulkRate(data, 'option_a', mixedPlan, bench.id, true)
    expect(byName(confirmed, 'Oak 1')).toMatchObject({
      rate_id: bench.id,
      tree_design: { stock_spec: 'Oak 2.5 m, 45 L pot', rate_reviewed: true },
    })
    // The original draft and Option B are untouched.
    expect(byName(data, 'Oak 1').rate_id).toBeNull()
    expect(confirmed.scenarios.option_b.items).toEqual([])
  })

  it('keeps tree review tied to a rate, and prices layers separately', () => {
    const oak = tree('Oak 2.5 m')
    const next = setItemPrice(design([oak]), 'option_a', oak.id, {
      rateId: 'r1',
      stockSpec: 'Oak 3 m',
      reviewed: true,
    })
    expect(next.scenarios.option_a.items[0].tree_design).toMatchObject({
      stock_spec: 'Oak 3 m',
      rate_reviewed: true,
    })
    const cleared = setItemPrice(next, 'option_a', oak.id, { rateId: null, reviewed: true })
    expect(cleared.scenarios.option_a.items[0].tree_design?.rate_reviewed).toBe(false)
  })

  it('derives plain states from API rows and never calls a partial item priced', () => {
    const bench = item()
    expect(itemState(bench, []).state).toBe('needs_price')
    expect(itemState(bench, [row(bench.id)]).state).toBe('needs_price')
    expect(itemState(bench, [row(bench.id, { state: 'priced', total: '850.00' })]).state).toBe(
      'priced',
    )
    expect(
      itemState(bench, [row(bench.id, { state: 'priced', total: '850.00', review: ['expired'] })]),
    ).toMatchObject({ state: 'needs_review', why: expect.stringMatching(/expired/) })
    expect(itemState(bench, [row(bench.id, { state: 'unit_mismatch' })]).state).toBe('needs_review')
    expect(itemState(bench, [row(bench.id, { state: 'restricted' })]).state).toBe('restricted')
    const layered = item({ kind: 'area' })
    expect(
      itemState(layered, [
        row(layered.id, { id: `${layered.id}:base`, state: 'priced', total: '10.00' }),
        row(layered.id, { id: `${layered.id}:sand` }),
      ]),
    ).toMatchObject({ state: 'incomplete', why: '1 of 2 layers still need a price.' })
    expect(itemState(tree(''), []).state).toBe('needs_spec')
    expect(itemState(item({ status: 'existing' }), []).state).toBe('existing')
  })

  it('explains quantities with the API values and groups items by what they are', () => {
    const layer = {
      code: 'base',
      name: 'Crushed base',
      category: 'material' as const,
      basis: 'volume' as const,
      unit: 'm3' as const,
      factor: 1,
      thickness_mm: 150,
      wastage_percent: 5,
      rate_id: null,
    }
    expect(
      layerMethodText(layer, {
        code: 'base',
        value: '18.9000',
        unit: 'm3',
        method: 'volume',
        source_quantity: '120',
        source_unit: 'm2',
        surface_m2: '120',
        rate_id: null,
      }),
    ).toBe('Area 120 m² × 150 mm thick + 5% material waste = 18.9 m³')
    const shrubs = item({
      kind: 'area',
      plant: {
        code: 'P',
        version: 1,
        scientific_name: 'Fixture',
        common_name: 'Fixture shrub',
        source: 'Fixture',
        nursery_size: 'Pot',
        current_crown_m: 0,
        mature_crown_m: 0,
        spacing_m: 0.5,
        method: 'square_spacing',
        sun_water: '',
        suitability: '',
        maintenance: '',
        availability_date: null,
        substitution: '',
      },
    })
    expect(
      plantMethodText(shrubs, {
        quantity: null,
        schedule: [
          {
            code: 'P',
            value: '48',
            unit: 'item',
            method: 'square_spacing',
            source_quantity: '12',
            source_unit: 'm2',
            rate_id: null,
          },
        ],
      }),
    ).toBe('Planting area 12 m² ÷ (0.5 m × 0.5 m spacing) = 48 plants, rounded up.')
    expect(priceGroup(shrubs)).toBe('planting')
    expect(priceGroup(tree('x'))).toBe('trees')
    expect(priceGroup(item())).toBe('objects')
    expect(rateValidity(rate({ valid_until: '2020-01-01' }), '2026-11-15').tone).toBe('bad')
    expect(rateValidity(rate({ valid_until: null }), '2026-11-15').text).toBe('No expiry recorded')
  })
})
