import { act, renderHook } from '@testing-library/react'
import type { Evaluation, OwnerState } from './owner-review'
import {
  DEFAULT_PREFERENCES,
  reviewProgress,
  suggestedStep,
  useReviewPreferences,
} from './review-guide'

const me = '00000000-0000-4000-8000-000000000001'
const entry = <T>(payload: T, key = 'k') => ({
  key,
  revision: 1,
  payload,
  updated_by: me,
  updated_at: '2026-11-14T00:00:00Z',
})

function state(overrides: Partial<OwnerState> = {}): OwnerState {
  return {
    project_id: 'p',
    capabilities: ['review_project'],
    user_id: me,
    eligible_reviewers: [me],
    basis: null,
    rubric: null,
    submissions: [],
    scores: [],
    clarifications: [],
    decision: null,
    files: [],
    ...overrides,
  } as OwnerState
}

describe('review guide progress', () => {
  it('suggests the basis first for an empty review', () => {
    const progress = reviewProgress(state(), null)
    expect(progress.every((item) => item.step)).toBe(true)
    expect(suggestedStep(progress)).toBe('Basis')
    expect(progress.find((p) => p.step === 'Offers')?.detail).toBe('No offers recorded yet')
  })

  it('moves on to scoring once offers are confirmed and counts only my submitted sheets', () => {
    const basis = entry({ scope_items: [{}, {}], requirements: [{}], reviewers: [me] })
    const rubric = entry({ status: 'locked', criteria: [{}, {}, {}] })
    const offer = (key: string, confirmed: boolean) =>
      entry(
        {
          withdrawn: false,
          package_version: 1,
          confirmed_package_version: confirmed ? 1 : null,
        },
        key,
      )
    const progress = reviewProgress(
      state({
        basis,
        rubric,
        submissions: [offer('a', true), offer('b', true)],
        scores: [
          entry({ reviewer_id: me, state: 'submitted' }),
          entry({ reviewer_id: 'x', state: 'submitted' }),
        ],
        clarifications: [entry({ state: 'open' })],
      } as unknown as Partial<OwnerState>),
      { official: true, results: [{ rank: 1 }, { rank: null }] } as unknown as Evaluation,
    )
    expect(progress.map((p) => p.done)).toEqual([true, true, true, false, false, false])
    expect(suggestedStep(progress)).toBe('Scores')
    expect(progress[3].detail).toBe('You submitted 1 of 2 score sheets')
    expect(progress[4].detail).toBe('1 open question')
    expect(progress[5].detail).toBe('1 offer ranked · recommendation not yet written')
  })
})

describe('review preferences', () => {
  afterEach(() => localStorage.clear())

  it('uses defaults until the reviewer is known, then stores per reviewer', () => {
    const { result, rerender } = renderHook(({ user }) => useReviewPreferences(user), {
      initialProps: { user: undefined as string | undefined },
    })
    expect(result.current[0]).toEqual(DEFAULT_PREFERENCES)
    rerender({ user: me })
    act(() => result.current[1]({ density: 'compact', tips: false }))
    expect(result.current[0].density).toBe('compact')
    expect(
      JSON.parse(localStorage.getItem(`infrashader:review-preferences:v1:${me}`)!),
    ).toMatchObject({
      density: 'compact',
      tips: false,
    })
  })

  it('ignores corrupt or unknown stored values', () => {
    localStorage.setItem(
      `infrashader:review-preferences:v1:${me}`,
      JSON.stringify({ density: 'huge', start: 'nowhere', guide: 'yes', lastStep: 'Offers' }),
    )
    const { result } = renderHook(() => useReviewPreferences(me))
    expect(result.current[0]).toMatchObject({
      density: 'comfortable',
      start: 'overview',
      guide: true,
      lastStep: 'Offers',
    })
  })
})
