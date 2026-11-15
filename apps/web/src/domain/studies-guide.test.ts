import type { Artifact } from './calculations'
import { attentionList, compareOptions, stepDone, studiesStatus } from './studies-guide'
import type { WorkspaceData } from './workspace'

const item = (over: Record<string, unknown> = {}) => ({
  id: crypto.randomUUID(),
  name: 'Item',
  kind: 'area',
  status: 'proposed',
  rate_id: null,
  ...over,
})

function design(items: unknown[]): WorkspaceData {
  return {
    scenarios: {
      baseline: { name: 'Baseline', items: [] },
      option_a: { name: 'Option A', items },
      option_b: { name: 'Option B', items: [] },
    },
  } as unknown as WorkspaceData
}

const estimate = (over: Record<string, unknown> = {}, stale = false) =>
  ({
    id: 'e1',
    kind: 'estimate',
    stale,
    workspace_revision: 1,
    payload: {
      scenario: 'option_a',
      complete: true,
      selling_total: '1000.00',
      missing_rates: [],
      ...over,
    },
  }) as unknown as Artifact
const proposal = (version: number, stale = false) =>
  ({ id: `p${version}`, kind: 'proposal', stale, payload: { version } }) as unknown as Artifact

describe('Studies guide status', () => {
  it('asks to save first, then to price, then to estimate, then to issue', () => {
    const priced = item({ rate_id: 'r1' })
    const unpriced = item()
    expect(studiesStatus(design([priced]), 'option_a', [], true, false).next.label).toBe(
      'Save the design first',
    )
    const rates = studiesStatus(design([priced, unpriced]), 'option_a', [], false, false)
    expect(rates).toMatchObject({ scope: 2, priced: 1, unpriced: 1 })
    expect(rates.next).toMatchObject({ step: 'rates', label: 'Give 1 item a price' })
    expect(studiesStatus(design([priced]), 'option_a', [], false, false).next).toMatchObject({
      step: 'estimate',
      label: 'Calculate the estimate',
    })
    const ready = studiesStatus(design([priced]), 'option_a', [estimate()], false, false)
    expect(ready.next.step).toBe('proposal')
    expect(ready.estimate).toMatchObject({ total: '1000.00', complete: true, stale: false })
    expect(stepDone('estimate', ready)).toBe(true)
  })

  it('treats recipe components as priced only when every layer has a rate', () => {
    const recipe = (rates: (string | null)[]) =>
      item({
        kind: 'path',
        assembly: { pricing: 'components', components: rates.map((rate_id) => ({ rate_id })) },
      })
    expect(studiesStatus(design([recipe(['a', 'b'])]), 'option_a', [], false, false).unpriced).toBe(
      0,
    )
    expect(
      studiesStatus(design([recipe(['a', null])]), 'option_a', [], false, false).unpriced,
    ).toBe(1)
  })

  it('marks stale estimates and issues as needing action, never as done', () => {
    const priced = item({ rate_id: 'r1' })
    const stale = studiesStatus(
      design([priced]),
      'option_a',
      [estimate({}, true), proposal(1, true)],
      false,
      false,
    )
    expect(stale.next).toMatchObject({ step: 'estimate', label: 'Recalculate the estimate' })
    expect(stepDone('estimate', stale)).toBe(false)
    const reissue = studiesStatus(
      design([priced]),
      'option_a',
      [estimate(), proposal(1, true)],
      false,
      false,
    )
    expect(reissue.next.step).toBe('proposal')
    expect(reissue.next.label).toContain('issue')
    expect(stepDone('proposal', reissue)).toBe(false)
    const done = studiesStatus(
      design([priced]),
      'option_a',
      [estimate(), proposal(2)],
      false,
      false,
    )
    expect(done.next.label).toBe('Nothing left to do')
    expect(stepDone('proposal', done)).toBe(true)
  })

  it('does not trust list order when records share a timestamp', () => {
    const priced = item({ rate_id: 'r1' })
    // Newest version listed last, and a stale estimate listed before the current one.
    const result = studiesStatus(
      design([priced]),
      'option_a',
      [estimate({ selling_total: '900.00' }, true), estimate(), proposal(1, true), proposal(2)],
      false,
      false,
    )
    expect(result.estimate).toMatchObject({ total: '1000.00', stale: false })
    expect(result.issued).toMatchObject({ version: 2, stale: false })
    expect(result.next.label).toBe('Nothing left to do')
  })

  it('does not suggest pricing the baseline or an empty option', () => {
    expect(studiesStatus(design([]), 'baseline', [], false, false).next.label).toMatch(
      /Option A or B/,
    )
    expect(studiesStatus(design([]), 'option_a', [], false, false).next.label).toBe(
      'Add something to the design',
    )
  })
})

// Journey Review step (15 Nov 2026): read-only summaries; the server stays authoritative.
const withB = (a: unknown[], b: unknown[], constraints: unknown[] = []) =>
  ({
    constraints,
    targets: [{ id: 'target-1' }],
    scenarios: {
      baseline: { name: 'Baseline', items: [item({ status: 'existing', name: 'Old tree' })] },
      option_a: { name: 'Option A', items: a },
      option_b: { name: 'Option B', items: b },
    },
  }) as unknown as WorkspaceData
const estimateFor = (scenario: string, over: Record<string, unknown> = {}, stale = false) =>
  estimate({ scenario, currency: 'MYR', ...over }, stale)

describe('Review: needs attention', () => {
  it('lists each problem with the place that fixes it, and never the existing site', () => {
    const data = withB(
      [
        item({ name: 'Bench' }),
        item({
          name: 'Tabebuia',
          rate_id: 'r1',
          tree_design: { stock_spec: '', rate_reviewed: false },
        }),
        item({ name: 'Driveway', road: { width_m: 3 } }),
        item({
          name: 'Deck',
          assembly: { approved: false, pricing: 'components', components: [] },
        }),
        item({ name: 'Lawn', rate_id: 'r2' }),
      ],
      [],
      [
        { critical: true, status: 'unverified' },
        { critical: false, status: 'verified' },
      ],
    )
    const status = studiesStatus(data, 'option_a', [], false, false)
    const list = attentionList(data, 'option_a', status, false, false)
    const by = Object.fromEntries(list.map((entry) => [entry.text, entry.fix]))
    expect(by['Bench: no price yet']).toBe('price')
    expect(by['Tabebuia: confirm the tree stock matches its rate']).toBe('price')
    expect(by['Driveway: add its material layers before it can be priced']).toBe('materials')
    expect(by['Deck: its material recipe is not approved yet']).toBe('materials')
    expect(by['1 important site fact is not yet checked']).toBe('site')
    expect(by['The total has not been calculated yet']).toBe('estimate')
    expect(
      list.some((entry) => entry.text.includes('Lawn') || entry.text.includes('Old tree')),
    ).toBe(false)
  })

  it('asks to save first and never offers a total while unsaved', () => {
    const data = withB([item({ name: 'Bench', rate_id: 'r1' })], [])
    const status = studiesStatus(data, 'option_a', [], true, false)
    const list = attentionList(data, 'option_a', status, true, false)
    expect(list.map((entry) => entry.fix)).toEqual(['save'])
  })

  it('flags an incomplete or stale total and a proposal issued before the change', () => {
    const data = withB([item({ name: 'Bench', rate_id: 'r1' })], [])
    const incomplete = studiesStatus(
      data,
      'option_a',
      [estimate({ complete: false, missing_rates: [{}] })],
      false,
      false,
    )
    expect(attentionList(data, 'option_a', incomplete, false, false)[0].text).toBe(
      'The total is incomplete: 1 item missing a price',
    )
    const stale = studiesStatus(
      data,
      'option_a',
      [estimate({}, true), proposal(2, true)],
      false,
      false,
    )
    const texts = attentionList(data, 'option_a', stale, false, false).map((entry) => entry.text)
    expect(texts).toContain('The total is out of date: the design or a price changed')
    expect(texts.some((text) => text.includes('proposal version 2'))).toBe(true)
  })
})

describe('Review: Option A / B comparison', () => {
  const priced = () => item({ rate_id: 'r1' })
  it('is comparable only when both options have work and complete, current totals', () => {
    const data = withB([priced()], [priced(), priced()])
    const both = [estimateFor('option_a'), estimateFor('option_b', { selling_total: '1500.00' })]
    const ok = compareOptions(data, both, false)
    expect(ok.comparable).toBe(true)
    expect(ok.options.map((option) => [option.items, option.total, option.state])).toEqual([
      [1, '1000.00', 'current'],
      [2, '1500.00', 'current'],
    ])
    expect(compareOptions(data, both, true)).toMatchObject({
      comparable: false,
      reason: 'At least one total is out of date. Recalculate it.',
    })
    expect(compareOptions(data, [both[0]], false)).toMatchObject({
      comparable: false,
      reason: 'Calculate a total for each option first.',
    })
    const partial = [both[0], estimateFor('option_b', { complete: false })]
    expect(compareOptions(data, partial, false).reason).toBe(
      'At least one total is incomplete, so a difference would be misleading.',
    )
    expect(compareOptions(withB([priced()], []), both, false)).toMatchObject({
      comparable: false,
      reason: 'One option has no proposed work yet.',
    })
  })
})

describe('Review: terrain site work', () => {
  const hill = {
    base_elevation: 0,
    heights: [0, 0, 2, 0],
    ponds: [],
    size: 2,
    bounds: [0, 0, 1, 1],
  }
  const withTerrain = (items: unknown[], terrain: unknown) =>
    ({
      constraints: [],
      targets: [{ id: 'target-1' }],
      scenarios: {
        baseline: { name: 'Baseline', items: [] },
        option_a: { name: 'Option A', items, terrain },
        option_b: { name: 'Option B', items: [] },
      },
    }) as unknown as WorkspaceData

  it('counts site-work lines like any item and flags stale ones for review', () => {
    const work = {
      activity: 'Excavate',
      resource: 'equipment',
      tools: '',
      assumptions: '',
      quantity: '5',
      unit: 'm3',
      terrain_signature: 'a',
    }
    const data = withTerrain(
      [
        item({ name: 'Excavation', terrain_work: work }),
        item({ name: 'Fill', rate_id: 'r1', terrain_work: work, terrain_work_stale: true }),
      ],
      hill,
    )
    const status = studiesStatus(data, 'option_a', [], false, false)
    expect(status).toMatchObject({ scope: 2, unpriced: 1 })
    const list = attentionList(data, 'option_a', status, false, false)
    const by = Object.fromEntries(list.map((entry) => [entry.text, entry.fix]))
    expect(by['Excavation: no price yet']).toBe('price')
    expect(
      by['Fill: the ground changed after this site-work line was entered; review its quantity'],
    ).toBe('terrain')
    expect(list.some((entry) => entry.key === 'terrain-pending')).toBe(false)
  })

  it('asks for a site-work line when the ground was reshaped without one', () => {
    const data = withTerrain([item({ name: 'Bench', rate_id: 'r1' })], hill)
    const status = studiesStatus(data, 'option_a', [], false, false)
    const pending = attentionList(data, 'option_a', status, false, false).find(
      (entry) => entry.key === 'terrain-pending',
    )
    expect(pending?.fix).toBe('terrain')
    const flat = withTerrain([item({ name: 'Bench', rate_id: 'r1' })], {
      ...hill,
      heights: [0, 0, 0, 0],
    })
    expect(
      attentionList(flat, 'option_a', status, false, false).some(
        (entry) => entry.key === 'terrain-pending',
      ),
    ).toBe(false)
  })
})

describe('Review: proposal area', () => {
  it('asks for a proposal area (target zone) when none is marked', () => {
    const data = {
      constraints: [],
      targets: [],
      scenarios: {
        baseline: { name: 'Baseline', items: [] },
        option_a: { name: 'Option A', items: [item({ rate_id: 'r1' })] },
        option_b: { name: 'Option B', items: [] },
      },
    } as unknown as WorkspaceData
    const status = studiesStatus(data, 'option_a', [], false, false)
    const entry = attentionList(data, 'option_a', status, false, false).find(
      (e) => e.key === 'target',
    )
    expect(entry?.fix).toBe('site')
  })
})
