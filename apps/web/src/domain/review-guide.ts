import { useCallback, useState } from 'react'
import type { Evaluation, OwnerState } from './owner-review'

export const REVIEW_STEPS = [
  'Basis',
  'Rubric',
  'Offers',
  'Scores',
  'Clarifications',
  'Evaluation & decision',
] as const
export type ReviewStep = (typeof REVIEW_STEPS)[number]
/** 'Overview' is the side-by-side summary of all proposals; it is not a stage of work. */
export type ReviewView = 'Overview' | ReviewStep

/**
 * Personal display preferences for the review screen. They only change how this screen looks
 * for one person in one browser; they never change rubric, scoring or approval rules, which
 * are recorded per project (no procurement policy defaults, REC-010).
 */
export type ReviewPreferences = {
  guide: boolean
  tips: boolean
  density: 'comfortable' | 'compact'
  start: 'overview' | 'suggested' | 'last' | 'Basis'
  highlight: boolean
  lastStep?: ReviewView
}
export const DEFAULT_PREFERENCES: ReviewPreferences = {
  guide: true,
  tips: true,
  density: 'comfortable',
  start: 'overview',
  highlight: true,
}
const KEY = (user: string) => `infrashader:review-preferences:v1:${user}`

function load(user: string): ReviewPreferences {
  try {
    const raw = localStorage.getItem(KEY(user))
    if (!raw) return DEFAULT_PREFERENCES
    const parsed = JSON.parse(raw) as Partial<ReviewPreferences>
    return {
      guide: typeof parsed.guide === 'boolean' ? parsed.guide : DEFAULT_PREFERENCES.guide,
      tips: typeof parsed.tips === 'boolean' ? parsed.tips : DEFAULT_PREFERENCES.tips,
      density: parsed.density === 'compact' ? 'compact' : 'comfortable',
      start:
        (['suggested', 'last', 'Basis'] as const).find((v) => v === parsed.start) ?? 'overview',
      highlight:
        typeof parsed.highlight === 'boolean' ? parsed.highlight : DEFAULT_PREFERENCES.highlight,
      lastStep: (['Overview', ...REVIEW_STEPS] as const).find((step) => step === parsed.lastStep),
    }
  } catch {
    return DEFAULT_PREFERENCES
  }
}

export function useReviewPreferences(user?: string) {
  const [stored, setStored] = useState(() => ({
    user,
    value: user ? load(user) : DEFAULT_PREFERENCES,
  }))
  let current = stored
  if (stored.user !== user) {
    // The signed-in reviewer becomes known after the review loads; adopt their preferences.
    current = { user, value: user ? load(user) : DEFAULT_PREFERENCES }
    setStored(current)
  }
  const update = useCallback((change: Partial<ReviewPreferences>) => {
    setStored((previous) => {
      const value = { ...previous.value, ...change }
      if (previous.user)
        try {
          localStorage.setItem(KEY(previous.user), JSON.stringify(value))
        } catch {
          // Storage unavailable (private window): preferences last for this visit only.
        }
      return { ...previous, value }
    })
  }, [])
  return [current.value, update] as const
}

export type Progress = { step: ReviewStep; done: boolean; detail: string }

/** Read-only progress derived from the saved records; it never decides anything. */
export function reviewProgress(state: OwnerState, evaluation: Evaluation | null): Progress[] {
  const active = state.submissions.filter((s) => !s.payload.withdrawn)
  const unconfirmed = active.filter(
    (s) => s.payload.confirmed_package_version !== s.payload.package_version,
  ).length
  const reviewer = state.basis?.payload.reviewers.includes(state.user_id) ?? false
  const mine = state.scores.filter(
    (s) => s.payload.reviewer_id === state.user_id && s.payload.state === 'submitted',
  ).length
  const open = state.clarifications.filter((c) => c.payload.state === 'open').length
  const rubric = state.rubric?.payload
  const decision = state.decision?.payload.state
  const ranked = evaluation?.results.filter((r) => r.rank != null).length ?? 0
  return [
    {
      step: 'Basis',
      done: Boolean(state.basis),
      detail: state.basis
        ? `${state.basis.payload.scope_items.length} scope items · ${state.basis.payload.requirements.length} requirements`
        : 'Define the common scope before recording offers',
    },
    {
      step: 'Rubric',
      done: rubric?.status === 'locked',
      detail: !rubric
        ? 'Not started'
        : rubric.status === 'locked'
          ? `Locked · ${rubric.criteria.length} criteria`
          : 'Draft: lock it before anyone scores',
    },
    {
      step: 'Offers',
      done: active.length > 0 && unconfirmed === 0,
      detail: active.length
        ? unconfirmed
          ? `${active.length} offers · ${unconfirmed} need confirmation`
          : `${active.length} offers confirmed`
        : 'No offers recorded yet',
    },
    {
      step: 'Scores',
      done: !reviewer || (active.length > 0 && mine >= active.length),
      detail: reviewer
        ? `You submitted ${mine} of ${active.length} score sheets`
        : 'You are not an assigned reviewer on this project',
    },
    {
      step: 'Clarifications',
      done: open === 0,
      detail: open ? `${open} open question${open === 1 ? '' : 's'}` : 'No open questions',
    },
    {
      step: 'Evaluation & decision',
      done: decision === 'approved',
      detail:
        decision === 'approved'
          ? 'Approved · decision pack retained'
          : decision === 'submitted'
            ? 'Recommendation awaiting approval'
            : evaluation?.official
              ? `${ranked} offer${ranked === 1 ? '' : 's'} ranked · recommendation not yet written`
              : 'Official result not available yet',
    },
  ]
}

export function suggestedStep(progress: Progress[]): ReviewStep {
  return progress.find((item) => !item.done)?.step ?? 'Evaluation & decision'
}
