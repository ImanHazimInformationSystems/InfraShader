import { z } from 'zod'
import type { Rate } from './calculations'
import type { ScenarioKey, WorkItem, WorkspaceData } from './workspace'

/**
 * Pricing home helpers. Every quantity, unit price and subtotal shown comes from the API
 * (saved schedule or draft preview); this module only groups, labels and plans explicit edits.
 */
export const priceRowSchema = z.object({
  id: z.string(),
  parent_id: z.string(),
  name: z.string(),
  section: z.string(),
  quantity: z.string(),
  unit: z.string(),
  source: z.string(),
  method: z.string(),
  rate: z.string(),
  specification: z.string(),
  status: z.string(),
  state: z
    .enum([
      'existing',
      'stale',
      'recipe_not_approved',
      'needs_price',
      'unit_mismatch',
      'wrong_basis',
      'priced',
      'restricted',
    ])
    .default('needs_price'),
  review: z.array(z.string()).default([]),
  rate_id: z.string().nullable(),
  unit_price: z.string().nullable().optional(),
  total: z.string().nullable(),
})
export type PriceRow = z.infer<typeof priceRowSchema>
export const priceSummarySchema = z.object({
  lines: z.number(),
  priced: z.number(),
  unpriced: z.number(),
  restricted: z.boolean().default(false),
  complete: z.boolean(),
  needs_review: z.number(),
  priced_subtotal: z.string().nullable(),
  basis: z.string(),
})
export type PriceSummary = z.infer<typeof priceSummarySchema>
const measureSchema = z.object({
  quantity: z.object({ value: z.number(), calculated: z.object({ unit: z.string() }) }).nullish(),
  schedule: z
    .array(
      z.object({
        code: z.string(),
        value: z.string(),
        unit: z.string(),
        method: z.string(),
        source_quantity: z.string(),
        source_unit: z.string(),
        surface_m2: z.string().nullish(),
        rate_id: z.string().nullish(),
      }),
    )
    .default([]),
})
export type Measure = z.infer<typeof measureSchema>
export const pricingPreviewSchema = z.object({
  draft: z.literal(true),
  scenario: z.string(),
  expected_revision: z.number(),
  saved_revision: z.number(),
  rows: z.array(priceRowSchema),
  summary: priceSummarySchema,
  // Per drawn item, summed by the API; null while any of its lines is unpriced or hidden.
  subtotals: z.record(z.string(), z.string().nullable()).default({}),
  measures: z.record(z.string(), measureSchema).default({}),
  note: z.string(),
})
export type PricingPreview = z.infer<typeof pricingPreviewSchema>

export type PriceGroup = 'trees' | 'planting' | 'objects' | 'paths' | 'roads' | 'site' | 'other'
export const GROUP_LABEL: Record<PriceGroup, string> = {
  trees: 'Trees',
  planting: 'Shrubs, flowers and planting',
  objects: 'Objects and furniture',
  paths: 'Paths, paving and surfaces',
  roads: 'Roads and driveways',
  site: 'Site work',
  other: 'Other work',
}
export const GROUP_ORDER: PriceGroup[] = [
  'trees',
  'planting',
  'objects',
  'paths',
  'roads',
  'site',
  'other',
]

export function priceGroup(item: WorkItem): PriceGroup {
  if (
    item.tree_design ||
    (item.kind === 'tree' && (!item.layout_plant || item.layout_plant === 'tree'))
  )
    return item.plant ? 'planting' : 'trees'
  if (item.layout_plant === 'shrub' || item.layout_plant === 'flowers' || item.plant)
    return 'planting'
  if (item.road || item.assembly?.use === 'road') return 'roads'
  if (item.kind === 'object' || item.kind === 'bench') return 'objects'
  if (item.terrain_work) return 'site'
  if (item.kind === 'path' || item.assembly) return 'paths'
  return 'other'
}

export type ItemState =
  | 'existing'
  | 'priced'
  | 'needs_price'
  | 'needs_spec'
  | 'needs_review'
  | 'incomplete'
  | 'stale'
  | 'restricted'
export const STATE_LABEL: Record<ItemState, string> = {
  existing: 'Existing site',
  priced: 'Priced',
  needs_price: 'Needs price',
  needs_spec: 'Needs specification',
  needs_review: 'Needs review',
  incomplete: 'Incomplete',
  stale: 'Stale',
  restricted: 'Price hidden',
}

const REVIEW_TEXT: Record<string, string> = {
  expired: 'the selected rate has expired',
  unknown_validity: 'the rate has no recorded expiry date',
  not_yet_effective: 'the rate is not effective yet',
  archived: 'the selected rate version is archived',
}

export function rowsFor(item: WorkItem, rows: PriceRow[]) {
  return rows.filter((row) => row.parent_id === item.id)
}

/** The item's status and a plain reason, from the API rows for that item. */
export function itemState(item: WorkItem, rows: PriceRow[]): { state: ItemState; why: string } {
  if (item.status === 'existing')
    return { state: 'existing', why: 'Existing site context. It is shown but never priced.' }
  const own = rowsFor(item, rows)
  if (item.tree_design && !item.rate_id && !item.tree_design.stock_spec.trim())
    return {
      state: 'needs_spec',
      why: 'Describe the purchased stock (species, size, pot or root ball) before choosing a rate.',
    }
  if (!own.length)
    return {
      state: 'needs_price',
      why: 'No quantity yet. Save or check the drawing, then price it.',
    }
  if (own.some((row) => row.state === 'stale'))
    return {
      state: 'stale',
      why: 'The ground changed. Review the site-work quantity and resources.',
    }
  if (own.some((row) => row.state === 'recipe_not_approved'))
    return {
      state: 'needs_review',
      why: 'The material recipe is not approved yet, so its layers cannot be priced.',
    }
  const bad = own.find((row) => row.state === 'unit_mismatch' || row.state === 'wrong_basis')
  if (bad)
    return {
      state: 'needs_review',
      why:
        bad.state === 'unit_mismatch'
          ? `The selected rate does not use ${unitLabel(bad.unit)}. Choose a rate measured the same way.`
          : 'The selected rate is the wrong type for this project (cost versus indicative budget).',
    }
  if (own.every((row) => row.state === 'restricted'))
    return {
      state: 'restricted',
      why: 'A rate is selected, but your role cannot see internal prices.',
    }
  const priced = own.filter((row) => row.state === 'priced' || row.state === 'restricted')
  if (priced.length && priced.length < own.length)
    return {
      state: 'incomplete',
      why: `${own.length - priced.length} of ${own.length} layers still need a price.`,
    }
  if (!priced.length)
    return {
      state: 'needs_price',
      why: own.length > 1 ? 'No layer has a price yet.' : 'Choose a saved rate for this item.',
    }
  const review = [...new Set(own.flatMap((row) => row.review))]
  if (review.length)
    return {
      state: 'needs_review',
      why: `Priced, but ${review.map((code) => REVIEW_TEXT[code] ?? code).join(' and ')}.`,
    }
  return { state: 'priced', why: 'Every line has a compatible, current rate.' }
}

export const unitLabel = (unit: string) =>
  ({ m2: 'm²', m3: 'm³', m: 'm', item: 'each', h: 'hours' })[unit] ?? unit

/** "per-item rate", "per-m³ rate", "hourly rate": how a rate is described in sentences. */
export const rateNoun = (unit: string) =>
  ({ item: 'per-item', h: 'hourly', m: 'per-metre' })[unit] ?? `per-${unitLabel(unit)}`

export const money = (value: string | null | undefined) =>
  value == null
    ? '—'
    : `RM ${Number(value).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export const tidy = (value: string | number) =>
  Number(value).toLocaleString('en-MY', { maximumFractionDigits: 2 })

export function rateValidity(rate: Rate, today = new Date().toISOString().slice(0, 10)) {
  if (rate.archived) return { tone: 'warn', text: 'Archived version' } as const
  if (rate.effective_date > today)
    return { tone: 'warn', text: `Not effective until ${rate.effective_date}` } as const
  if (!rate.valid_until) return { tone: 'warn', text: 'No expiry recorded' } as const
  if (rate.valid_until < today) return { tone: 'bad', text: `Expired ${rate.valid_until}` } as const
  return { tone: 'ok', text: `Valid until ${rate.valid_until}` } as const
}

/** Rates that measure the same unit and are the right basis for this project. */
export function compatibleRates(rates: Rate[], unit: string | undefined, basis: Rate['basis']) {
  return rates.filter((rate) => rate.unit === unit && rate.basis === basis && !rate.archived)
}

/** Which other proposed items in this option already use a rate, for visible reuse. */
export function rateUsage(rateId: string, items: WorkItem[], exceptId?: string) {
  return items
    .filter(
      (item) =>
        item.status === 'proposed' &&
        item.id !== exceptId &&
        (item.rate_id === rateId ||
          item.assembly?.components.some((component) => component.rate_id === rateId)),
    )
    .map((item) => item.name)
}

export type BulkPlan = {
  apply: WorkItem[]
  skip: { item: WorkItem; reason: string }[]
  trees: number
}

/** Decide, item by item, whether one rate can safely be applied; nothing is assumed. */
export function planBulkRate(
  items: WorkItem[],
  ids: string[],
  rate: Rate,
  units: Record<string, string | undefined>,
): BulkPlan {
  const apply: WorkItem[] = []
  const skip: BulkPlan['skip'] = []
  let stock: string | undefined
  for (const id of ids) {
    const item = items.find((entry) => entry.id === id)
    if (!item) continue
    const unit = units[id]
    const reason =
      item.status !== 'proposed'
        ? 'Existing site item: context only, never priced.'
        : item.editor_locked
          ? 'Locked in Layout. Unlock it first.'
          : item.road || item.assembly?.pricing === 'components'
            ? 'Priced layer by layer. Use Price this item.'
            : !unit
              ? 'No measured quantity yet. Save or fix the drawing first.'
              : unit !== rate.unit
                ? `Measured in ${unitLabel(unit)}; this rate is per ${unitLabel(rate.unit)}.`
                : item.tree_design && !item.tree_design.stock_spec.trim()
                  ? 'Needs a purchased-stock specification first.'
                  : item.tree_design &&
                      stock !== undefined &&
                      item.tree_design.stock_spec.trim() !== stock
                    ? `Different purchased stock (“${item.tree_design.stock_spec.trim()}”).`
                    : ''
    if (reason) {
      skip.push({ item, reason })
      continue
    }
    if (item.tree_design && stock === undefined) stock = item.tree_design.stock_spec.trim()
    apply.push(item)
  }
  return { apply, skip, trees: apply.filter((item) => item.tree_design).length }
}

function edit(
  data: WorkspaceData,
  scenario: ScenarioKey,
  change: (item: WorkItem) => void,
  ids: string[],
) {
  const next = structuredClone(data)
  for (const item of next.scenarios[scenario].items) if (ids.includes(item.id)) change(item)
  return next
}

/** Apply one rate to planned items. Trees need the person's explicit stock/rate confirmation. */
export function applyBulkRate(
  data: WorkspaceData,
  scenario: ScenarioKey,
  plan: BulkPlan,
  rateId: string,
  treesConfirmed: boolean,
) {
  const ids = plan.apply
    .filter((item) => !item.tree_design || treesConfirmed)
    .map((item) => item.id)
  return edit(
    data,
    scenario,
    (item) => {
      item.rate_id = rateId
      if (item.tree_design) item.tree_design = { ...item.tree_design, rate_reviewed: true }
    },
    ids,
  )
}

export function setItemPrice(
  data: WorkspaceData,
  scenario: ScenarioKey,
  itemId: string,
  choice: {
    rateId: string | null
    stockSpec?: string
    reviewed?: boolean
    layers?: Record<string, string | null>
  },
) {
  return edit(
    data,
    scenario,
    (item) => {
      if (item.assembly?.pricing === 'components') {
        item.rate_id = null
        item.assembly = {
          ...item.assembly,
          components: item.assembly.components.map((component) => ({
            ...component,
            rate_id: choice.layers?.[component.code] ?? component.rate_id,
          })),
        }
        return
      }
      item.rate_id = choice.rateId
      if (item.tree_design)
        item.tree_design = {
          ...item.tree_design,
          stock_spec: choice.stockSpec ?? item.tree_design.stock_spec,
          rate_reviewed: Boolean(choice.rateId && choice.reviewed),
        }
    },
    [itemId],
  )
}

/** Plain-language quantity method using API-derived values only. */
export function plantMethodText(item: WorkItem, measure?: Measure) {
  const plant = item.plant
  const row = measure?.schedule[0]
  if (!plant || !row) return null
  const spacing = tidy(plant.spacing_m)
  if (plant.method === 'explicit_count')
    return `Counted: ${tidy(row.value)} plants, entered or placed one by one.`
  if (plant.method === 'square_spacing')
    return `Planting area ${tidy(row.source_quantity)} m² ÷ (${spacing} m × ${spacing} m spacing) = ${tidy(row.value)} plants, rounded up.`
  return `Row length ${tidy(row.source_quantity)} m ÷ ${spacing} m spacing, plus one at the start = ${tidy(row.value)} plants, rounded up.`
}

export function layerMethodText(
  component: NonNullable<WorkItem['assembly']>['components'][number],
  row: Measure['schedule'][number] | undefined,
) {
  if (!row) return 'Save or fix the drawing to measure this layer.'
  const extras = `${component.factor !== 1 ? ` × ${tidy(component.factor)}` : ''}${component.wastage_percent ? ` + ${tidy(component.wastage_percent)}% material waste` : ''}`
  const surface = row.surface_m2 ? tidy(row.surface_m2) : tidy(row.source_quantity)
  const result = `${tidy(row.value)} ${unitLabel(row.unit)}`
  switch (component.basis) {
    case 'volume':
      return `Area ${surface} m² × ${tidy(component.thickness_mm)} mm thick${extras} = ${result}`
    case 'surface':
      return `Area ${surface} m²${extras} = ${result}`
    case 'length':
      return `Length ${tidy(row.source_quantity)} m${extras} = ${result}`
    case 'per_surface':
      return `${surface} m²${extras} = ${result}`
    default:
      return `Fixed allowance = ${result}`
  }
}

export const PRICE_ITEM_EVENT = 'infrashader:price-item'
export function openPricing(itemId?: string) {
  window.dispatchEvent(new CustomEvent(PRICE_ITEM_EVENT, { detail: itemId ?? null }))
}
