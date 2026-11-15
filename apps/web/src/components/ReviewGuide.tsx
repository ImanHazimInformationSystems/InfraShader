import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  Compass,
  Lightbulb,
  Settings2,
  X,
} from 'lucide-react'
import {
  DEFAULT_PREFERENCES,
  suggestedStep,
  type Progress,
  type ReviewPreferences,
  type ReviewStep,
  type ReviewView,
} from '../domain/review-guide'
import './examples.css'

const TIPS: Record<ReviewStep, { what: string; good: string; avoid: string }> = {
  Basis: {
    what: 'Write the common scope, budget, tax basis and requirements that every offer is measured against.',
    good: 'Scope items match how contractors price the work, with units and quantities where known.',
    avoid: 'Changing the basis after offers arrive without an addendum note that explains why.',
  },
  Rubric: {
    what: 'Set weighted criteria (totalling 100), scales, the missing-score rule and how reviewers are combined. Then lock it.',
    good: 'Guidance for each criterion so different reviewers score the same way; gates for must-pass items.',
    avoid:
      'Adjusting weights after seeing prices. Use What-if on the result screen to explore instead.',
  },
  Offers: {
    what: 'Record each offer, keep its original file, and confirm totals, terms and line items against the document.',
    good: 'Every confirmed value points to a page and line or cell. Missing or excluded scope is marked as such.',
    avoid:
      'Treating a missing price as zero. Add an allowance with a source if you must compare it.',
  },
  Scores: {
    what: 'Score each offer against the locked rubric and give a reason for every score.',
    good: 'Declare any conflict of interest before scoring; reasons refer to the offer documents.',
    avoid: 'Scoring before the offer’s prices and scope are confirmed.',
  },
  Clarifications: {
    what: 'Ask bidders targeted questions, or issue a common addendum, and record each answer with its source.',
    good: 'Due dates set and answers recorded with when and how they were received.',
    avoid: 'Accepting new prices in a clarification without recording a revised offer package.',
  },
  'Evaluation & decision': {
    what: 'Check readiness, the official ranking and reasons, then write a recommendation for an approver.',
    good: 'Explain why the recommended offer is best value, including risks and exclusions.',
    avoid: 'Recommending an offer that is not ranked first without recording the exception reason.',
  },
}

export function StepTip({ step }: { step: ReviewStep }) {
  const tip = TIPS[step]
  return (
    <aside className="review-tip" aria-label={`Tips for ${step}`}>
      <Lightbulb size={18} aria-hidden="true" />
      <dl>
        <dt>What to do here</dt>
        <dd>{tip.what}</dd>
        <dt>Good practice</dt>
        <dd>{tip.good}</dd>
        <dt>Avoid</dt>
        <dd>{tip.avoid}</dd>
      </dl>
    </aside>
  )
}

export function ReviewGuide({
  progress,
  current,
  onGo,
  onHide,
}: {
  progress: Progress[]
  current: ReviewView
  onGo: (step: ReviewStep) => void
  onHide: () => void
}) {
  const [open, setOpen] = useState(true)
  const done = progress.filter((item) => item.done).length
  const next = suggestedStep(progress)
  return (
    <section className="review-guide" aria-label="Review guide">
      <header className="review-guide-head">
        <span className="review-guide-icon" aria-hidden="true">
          <Compass size={18} />
        </span>
        <div>
          <strong>Review guide</strong>
          <span>
            {done} of {progress.length} stages complete
            {done < progress.length ? ` · suggested next: ${next}` : ' · review complete'}
          </span>
        </div>
        <div className="review-guide-meter" aria-hidden="true">
          <span style={{ width: `${(done / progress.length) * 100}%` }} />
        </div>
        <button
          type="button"
          className="button text compact"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          {open ? 'Collapse' : 'Expand'}
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label="Hide the review guide (turn it back on in Preferences)"
          onClick={onHide}
        >
          <X size={16} />
        </button>
      </header>
      {open && (
        <ol className="review-guide-steps">
          {progress.map((item, index) => (
            <li
              key={item.step}
              className={`${item.done ? 'is-done' : ''} ${item.step === current ? 'is-current' : ''} ${item.step === next && !item.done ? 'is-next' : ''}`}
            >
              <button
                type="button"
                onClick={() => onGo(item.step)}
                aria-current={item.step === current ? 'step' : undefined}
              >
                {item.done ? (
                  <CheckCircle2 size={17} aria-hidden="true" />
                ) : (
                  <Circle size={17} aria-hidden="true" />
                )}
                <span>
                  <strong>
                    <span aria-hidden="true">{index + 1}. </span>
                    {item.step}
                    <span className="sr-only">{item.done ? ' (complete)' : ' (not complete)'}</span>
                  </strong>
                  <small>{item.detail}</small>
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

export function ReviewPreferencesButton({
  preferences,
  onChange,
}: {
  preferences: ReviewPreferences
  onChange: (change: Partial<ReviewPreferences>) => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = dialog.current
    return () => {
      if (element?.open) element.close()
    }
  }, [])
  return (
    <>
      <button
        type="button"
        className="button secondary compact"
        onClick={() => dialog.current?.showModal()}
      >
        <Settings2 size={15} aria-hidden="true" /> Preferences
      </button>
      {createPortal(
        <dialog
          ref={dialog}
          className="review-preferences"
          aria-labelledby="review-preferences-title"
        >
          <form method="dialog">
            <header>
              <h3 id="review-preferences-title">Review preferences</h3>
              <button type="submit" className="icon-button" aria-label="Close preferences">
                <X size={16} />
              </button>
            </header>
            <p className="fine-print">
              These settings only change how this screen looks for you in this browser. They never
              change a project’s rubric, scoring rules or approval rules.
            </p>
            <fieldset>
              <legend>Help</legend>
              <label className="review-switch">
                <input
                  type="checkbox"
                  checked={preferences.guide}
                  onChange={(e) => onChange({ guide: e.target.checked })}
                />
                <span>
                  <strong>Show the review guide</strong>
                  <small>Progress through the six stages and the suggested next step.</small>
                </span>
              </label>
              <label className="review-switch">
                <input
                  type="checkbox"
                  checked={preferences.tips}
                  onChange={(e) => onChange({ tips: e.target.checked })}
                />
                <span>
                  <strong>Show tips on each step</strong>
                  <small>What to do, good practice and common mistakes.</small>
                </span>
              </label>
            </fieldset>
            <fieldset>
              <legend>Opening a review</legend>
              {(
                [
                  [
                    'overview',
                    'Overview of proposals',
                    'Start with all proposals side by side (when there are any).',
                  ],
                  [
                    'suggested',
                    'Suggested next step',
                    'Go straight to the first stage that is not complete.',
                  ],
                  ['last', 'Last step I used', 'Return to where you left off in this browser.'],
                  ['Basis', 'Always start at Basis', 'Begin at the comparison basis every time.'],
                ] as const
              ).map(([value, label, hint]) => (
                <label key={value} className="review-switch">
                  <input
                    type="radio"
                    name="review-start"
                    checked={preferences.start === value}
                    onChange={() => onChange({ start: value })}
                  />
                  <span>
                    <strong>{label}</strong>
                    <small>{hint}</small>
                  </span>
                </label>
              ))}
            </fieldset>
            <fieldset>
              <legend>Display</legend>
              <label className="review-switch">
                <input
                  type="checkbox"
                  checked={preferences.density === 'compact'}
                  onChange={(e) =>
                    onChange({ density: e.target.checked ? 'compact' : 'comfortable' })
                  }
                />
                <span>
                  <strong>Compact tables</strong>
                  <small>Tighter rows to see more lines and offers at once.</small>
                </span>
              </label>
              <label className="review-switch">
                <input
                  type="checkbox"
                  checked={preferences.highlight}
                  onChange={(e) => onChange({ highlight: e.target.checked })}
                />
                <span>
                  <strong>Highlight items needing attention</strong>
                  <small>Emphasise unconfirmed values and readiness reasons.</small>
                </span>
              </label>
            </fieldset>
            <footer>
              <button
                type="button"
                className="button text compact"
                onClick={() => onChange({ ...DEFAULT_PREFERENCES, lastStep: preferences.lastStep })}
              >
                Restore defaults
              </button>
              <button type="submit" className="button primary compact">
                Done
              </button>
            </footer>
          </form>
        </dialog>,
        document.body,
      )}
    </>
  )
}
