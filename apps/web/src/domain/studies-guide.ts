import type { Artifact } from './calculations'
import type { ScenarioKey, WorkspaceData } from './workspace'
import { terrainChanged } from './terrain'

/**
 * Read-only progress for the Studies panel. It only summarises saved records and never
 * prices, approves or issues anything: the backend owns every number shown.
 */
export const STUDY_STEPS = ['overview', 'rates', 'shade', 'estimate', 'proposal'] as const
export type StudyStep = (typeof STUDY_STEPS)[number]

export const STUDY_STEP_LABEL: Record<StudyStep, string> = {
  overview: 'Review',
  rates: 'Saved rates',
  shade: 'Shade study (optional)',
  estimate: 'Total',
  proposal: 'Proposal',
}

/**
 * Design Studio shows these steps from different places: Review, Total and Proposal in
 * step 4, Saved rates in step 3 and the optional shade study under More tools.
 */
export const REVIEW_STEPS: StudyStep[] = ['overview', 'estimate', 'proposal']

/** The decision-brief project issues a brief rather than a proposal, from the same step. */
export const stepLabel = (step: StudyStep, developer: boolean) =>
  step === 'proposal' && developer ? 'Decision brief' : STUDY_STEP_LABEL[step]

export type StudiesStatus = {
  issueReadiness?: number | null
  scope: number
  priced: number
  unpriced: number
  estimate: { total: string; complete: boolean; stale: boolean; missing: number } | null
  issued: { version: number; stale: boolean } | null
  next: { step: StudyStep; label: string; why: string }
}

type Item = WorkspaceData['scenarios'][ScenarioKey]['items'][number]

/**
 * A proposed line has a rate when it has one, or is built from rated recipe components.
 * This is not a full check: the server still rejects incompatible units and expired rates.
 */
export function isPriced(item: Item) {
  if (item.assembly?.pricing === 'components')
    return item.assembly.components.every((component) => Boolean(component.rate_id))
  return Boolean(item.rate_id)
}

export function studiesStatus(
  data: WorkspaceData,
  scenario: ScenarioKey,
  artifacts: Artifact[],
  dirty: boolean,
  developer: boolean,
): StudiesStatus {
  const proposed = data.scenarios[scenario].items.filter((item) => item.status === 'proposed')
  const priced = proposed.filter(isPriced).length
  const unpriced = proposed.length - priced
  const estimates = artifacts.filter(
    (item): item is Extract<Artifact, { kind: 'estimate' }> =>
      item.kind === 'estimate' && item.payload.scenario === scenario,
  )
  // Records created together can share a timestamp, so never rely on list order: prefer a
  // current estimate, then the one made from the newest saved design.
  const latest =
    [...estimates].sort(
      (a, b) => Number(a.stale) - Number(b.stale) || b.workspace_revision - a.workspace_revision,
    )[0] ?? null
  const estimate = latest
    ? {
        total: latest.payload.selling_total,
        complete: latest.payload.complete,
        stale: latest.stale,
        missing: latest.payload.missing_rates.length,
      }
    : null
  const outputs = artifacts.filter(
    (item) => item.kind === (developer ? 'developer_brief' : 'proposal'),
  )
  const newest = outputs
    .filter((item) => item.kind === 'proposal' || item.kind === 'developer_brief')
    .sort(
      (a, b) =>
        (b.payload as { version: number }).version - (a.payload as { version: number }).version,
    )[0]
  const issued =
    newest && (newest.kind === 'proposal' || newest.kind === 'developer_brief')
      ? { version: newest.payload.version, stale: newest.stale }
      : null

  let next: StudiesStatus['next']
  if (scenario === 'baseline')
    next = {
      step: 'overview',
      label: 'Choose Option A or B on the map',
      why: 'The baseline is the existing site. Prices and proposals are for a proposed option.',
    }
  else if (dirty)
    next = {
      step: 'overview',
      label: 'Save the design first',
      why: 'Totals and proposals use the last saved design. You have unsaved changes.',
    }
  else if (!proposed.length)
    next = {
      step: 'overview',
      label: 'Add something to the design',
      why: 'There is nothing proposed in this option to price yet.',
    }
  else if (unpriced > 0)
    next = {
      step: 'rates',
      label: `Give ${unpriced} item${unpriced === 1 ? '' : 's'} a price`,
      why: 'An item without a rate cannot be added up, so the estimate would be incomplete.',
    }
  else if (!estimate || estimate.stale || !estimate.complete)
    next = {
      step: 'estimate',
      label: !estimate ? 'Calculate the estimate' : 'Recalculate the estimate',
      why: !estimate
        ? 'Every item has a price. Add them up to see the total.'
        : 'The design or a price changed since the last estimate.',
    }
  else if (!issued || issued.stale)
    next = {
      step: 'proposal',
      label: developer ? 'Review and issue the decision brief' : 'Review and issue the proposal',
      why: issued
        ? 'The design changed since the last issue. Issue a new version; the old one stays unchanged.'
        : 'The estimate is complete and current. You can now review and issue it.',
    }
  else
    next = {
      step: 'proposal',
      label: 'Nothing left to do',
      why: 'The latest issued version matches the current saved design.',
    }
  return { scope: proposed.length, priced, unpriced, estimate, issued, next }
}

/** Marks which steps are finished, for the tab badges. */
export function stepDone(step: StudyStep, status: StudiesStatus): boolean {
  if (step === 'rates') return status.scope > 0 && status.unpriced === 0
  if (step === 'estimate') return Boolean(status.estimate?.complete && !status.estimate.stale)
  if (step === 'proposal') return Boolean(status.issued && !status.issued.stale)
  return false
}

/** The Studies panel listens for this so other tools can open a specific step. */
export const STUDIES_STEP_EVENT = 'infrashader:studies-step'

// A step to show when the Studies panel next mounts (for example "Go to Submit" from the
// projects page opens the project directly at Proposal). Read once, then cleared.
let pendingStep: StudyStep | null = null
export function requestStudiesStep(step: StudyStep) {
  pendingStep = step
}
export function takePendingStudiesStep(): StudyStep | null {
  const step = pendingStep
  pendingStep = null
  return step
}
export function openStudiesStep(step: StudyStep) {
  window.dispatchEvent(new CustomEvent(STUDIES_STEP_EVENT, { detail: step }))
}

/** One thing the user must look at before issuing, with where to fix it. */
export type Attention = {
  key: string
  text: string
  fix: 'save' | 'price' | 'materials' | 'site' | 'terrain' | 'estimate' | 'proposal' | 'option'
  itemId?: string
}

/**
 * Read-only "needs attention" list for the Review step. It only reads the draft and saved
 * records; the server still decides completeness when the total is calculated.
 */
export function attentionList(
  data: WorkspaceData,
  scenario: ScenarioKey,
  status: StudiesStatus,
  dirty: boolean,
  developer: boolean,
): Attention[] {
  const list: Attention[] = []
  if (scenario === 'baseline') {
    list.push({
      key: 'option',
      text: 'You are looking at the existing site. Choose Option A or B to review a proposal.',
      fix: 'option',
    })
    return list
  }
  if (dirty)
    list.push({
      key: 'save',
      text: 'The design has unsaved changes. Save it before calculating the total.',
      fix: 'save',
    })
  const proposed = data.scenarios[scenario].items.filter((item) => item.status === 'proposed')
  for (const item of proposed) {
    // Site-work lines from terrain edits are priced like any item (server price_rows); a line
    // whose terrain changed after it was entered is stale until reviewed.
    if (item.terrain_work && item.terrain_work_stale)
      list.push({
        key: `terrain-${item.id}`,
        text: `${item.name}: the ground changed after this site-work line was entered; review its quantity`,
        fix: 'terrain',
        itemId: item.id,
      })
    else if (item.road && !item.assembly)
      list.push({
        key: `layers-${item.id}`,
        text: `${item.name}: add its material layers before it can be priced`,
        fix: 'materials',
        itemId: item.id,
      })
    else if (item.assembly && !item.assembly.approved)
      list.push({
        key: `recipe-${item.id}`,
        text: `${item.name}: its material recipe is not approved yet`,
        fix: 'materials',
        itemId: item.id,
      })
    else if (!isPriced(item))
      list.push({
        key: `price-${item.id}`,
        text: `${item.name}: no price yet`,
        fix: 'price',
        itemId: item.id,
      })
    else if (
      item.tree_design &&
      (!item.tree_design.stock_spec?.trim() || !item.tree_design.rate_reviewed)
    )
      list.push({
        key: `tree-${item.id}`,
        text: `${item.name}: confirm the tree stock matches its rate`,
        fix: 'price',
        itemId: item.id,
      })
  }
  if (
    terrainChanged(data.scenarios[scenario].terrain) &&
    !proposed.some((item) => item.terrain_work)
  )
    list.push({
      key: 'terrain-pending',
      text: 'The ground was reshaped but no site-work line prices it yet',
      fix: 'terrain',
    })
  if (!data.targets?.length)
    list.push({
      key: 'target',
      text: 'No proposal area is marked yet. The proposal site plan needs one.',
      fix: 'site',
    })
  const unchecked = data.constraints.filter(
    (record) => record.critical && !['verified', 'resolved'].includes(record.status),
  ).length
  if (unchecked)
    list.push({
      key: 'site',
      text: `${unchecked} important site fact${unchecked === 1 ? ' is' : 's are'} not yet checked`,
      fix: 'site',
    })
  if (proposed.length && !dirty) {
    if (!status.estimate)
      list.push({ key: 'estimate', text: 'The total has not been calculated yet', fix: 'estimate' })
    else if (status.estimate.stale)
      list.push({
        key: 'estimate',
        text: 'The total is out of date: the design or a price changed',
        fix: 'estimate',
      })
    else if (!status.estimate.complete)
      list.push({
        key: 'estimate',
        text: `The total is incomplete: ${status.estimate.missing} item${status.estimate.missing === 1 ? '' : 's'} missing a price`,
        fix: 'estimate',
      })
  }
  if (status.issued?.stale)
    list.push({
      key: 'proposal',
      text: `The design changed since ${developer ? 'decision brief' : 'proposal'} version ${status.issued.version}. Issue a new version; the old one stays unchanged.`,
      fix: 'proposal',
    })
  return list
}

export type OptionSummary = {
  key: 'option_a' | 'option_b'
  name: string
  items: number
  withoutRate: number
  total: string | null
  currency: string | null
  state: 'none' | 'stale' | 'incomplete' | 'current'
}

/**
 * Side-by-side Option A / Option B facts from the draft and each option's latest saved
 * estimate. Totals are only called comparable when both are complete and current.
 */
export function compareOptions(data: WorkspaceData, artifacts: Artifact[], dirty: boolean) {
  const options: OptionSummary[] = (['option_a', 'option_b'] as const).map((key) => {
    const proposed = data.scenarios[key].items.filter((item) => item.status === 'proposed')
    const latest = artifacts
      .filter(
        (item): item is Extract<Artifact, { kind: 'estimate' }> =>
          item.kind === 'estimate' && item.payload.scenario === key,
      )
      .sort(
        (a, b) => Number(a.stale) - Number(b.stale) || b.workspace_revision - a.workspace_revision,
      )[0]
    return {
      key,
      name: data.scenarios[key].name,
      items: proposed.length,
      withoutRate: proposed.filter((item) => !isPriced(item)).length,
      total: latest ? latest.payload.selling_total : null,
      currency: latest ? latest.payload.currency : null,
      state: !latest
        ? 'none'
        : latest.stale || dirty
          ? 'stale'
          : latest.payload.complete
            ? 'current'
            : 'incomplete',
    }
  })
  const comparable =
    options.every((option) => option.state === 'current' && option.items > 0) &&
    options[0].currency === options[1].currency
  const reason = comparable
    ? 'Both totals are complete, current and in the same currency.'
    : options.some((option) => option.items === 0)
      ? 'One option has no proposed work yet.'
      : options.some((option) => option.state === 'none')
        ? 'Calculate a total for each option first.'
        : options.some((option) => option.state === 'stale')
          ? 'At least one total is out of date. Recalculate it.'
          : options.some((option) => option.state === 'incomplete')
            ? 'At least one total is incomplete, so a difference would be misleading.'
            : 'The totals use different currencies.'
  return { options, comparable, reason }
}
