import { ArrowRight, CheckCircle2, Circle, CircleAlert, Scale } from 'lucide-react'
import {
  STUDY_STEPS,
  stepDone,
  stepLabel,
  type Attention,
  type OptionSummary,
  type StudiesStatus,
  type StudyStep,
} from '../domain/studies-guide'
import { ringgit } from '../services/money'
import './studies.css'

/** Step bar for the Studies panel. Every step stays mounted, so unsaved inputs are kept. */
export function StudiesStepBar({
  step,
  status,
  onStep,
  developer,
  steps = STUDY_STEPS as unknown as StudyStep[],
}: {
  step: StudyStep
  status: StudiesStatus
  onStep: (step: StudyStep) => void
  developer: boolean
  steps?: StudyStep[]
}) {
  if (steps.length < 2) return null
  return (
    <nav className="studies-steps" aria-label="Studies steps">
      {steps.map((name) => (
        <button
          key={name}
          type="button"
          className={`studies-step${step === name ? ' is-current' : ''}${
            status.next.step === name && name !== 'overview' ? ' is-next' : ''
          }`}
          aria-current={step === name ? 'step' : undefined}
          onClick={() => onStep(name)}
        >
          {name !== 'overview' && stepDone(name, status) ? (
            <CheckCircle2 size={15} aria-hidden="true" />
          ) : name === 'overview' ? null : (
            <Circle size={15} aria-hidden="true" />
          )}
          {stepLabel(name, developer)}
          {name !== 'overview' && stepDone(name, status) && (
            <span className="sr-only"> (done)</span>
          )}
        </button>
      ))}
    </nav>
  )
}

const FIX_LABEL: Record<Attention['fix'], string> = {
  save: '',
  price: 'Price it',
  materials: 'Open Materials',
  site: 'Open Site records',
  terrain: 'Open Terrain',
  estimate: 'Go to Total',
  proposal: 'Go to Proposal',
  option: '',
}

function stateText(option: OptionSummary) {
  if (option.state === 'none') return 'No total yet'
  if (option.state === 'stale') return 'Out of date'
  if (option.state === 'incomplete') return 'Incomplete'
  return 'Complete and current'
}

/**
 * Step 4 "Review": what is in the selected option, what still needs attention (each with a
 * direct fix), and an honest Option A / B comparison. Nothing here prices or issues.
 */
export function StudiesOverview({
  status,
  optionName,
  developer,
  onStep,
  attention,
  comparison,
  onFix,
}: {
  status: StudiesStatus
  optionName: string
  developer: boolean
  onStep: (step: StudyStep) => void
  attention: Attention[]
  comparison: { options: OptionSummary[]; comparable: boolean; reason: string }
  onFix: (entry: Attention) => void
}) {
  const total = status.estimate
  const shown = attention.slice(0, 10)
  return (
    <section className="studies-overview" aria-label="Review before issuing">
      <div className="studies-next">
        <div>
          <span className="eyebrow">Next step · {optionName}</span>
          <strong>{status.next.label}</strong>
          <p>{status.next.why}</p>
        </div>
        {status.next.step !== 'overview' && (
          <button
            type="button"
            className="button primary"
            onClick={() =>
              status.next.step === 'rates'
                ? onFix({ key: 'next', text: '', fix: 'price' })
                : onStep(status.next.step)
            }
          >
            {status.next.step === 'rates'
              ? 'Go to Pricing'
              : `Go to ${stepLabel(status.next.step, developer).toLowerCase()}`}
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        )}
      </div>
      <dl className="studies-facts">
        <div>
          <dt>Items with a rate</dt>
          <dd>
            {status.priced} of {status.scope}
          </dd>
          <small>
            {status.unpriced ? `${status.unpriced} still need a price` : 'All have a rate'}
          </small>
        </div>
        <div>
          <dt>{developer ? 'Indicative budget' : 'Total'}</dt>
          <dd>{total ? ringgit(total.total) : '—'}</dd>
          <small>
            {!total
              ? 'Not calculated yet'
              : total.stale
                ? 'Out of date: recalculate'
                : total.complete
                  ? 'Complete and current'
                  : `Incomplete: ${total.missing} item${total.missing === 1 ? '' : 's'} missing a price`}
          </small>
        </div>
        <div>
          <dt>{developer ? 'Decision brief' : 'Proposal'}</dt>
          <dd>{status.issued ? `Version ${status.issued.version}` : 'Not issued'}</dd>
          <small>
            {!status.issued
              ? 'Nothing has been issued yet'
              : status.issued.stale
                ? 'The design changed since this version'
                : 'Matches the saved design'}
          </small>
        </div>
      </dl>

      {developer && <section className="studies-attention" aria-label="Needs attention">
        <h4>
          {attention.length ? (
            <>
              <CircleAlert size={17} aria-hidden="true" /> Needs attention ({attention.length})
            </>
          ) : (
            <>
              <CheckCircle2 size={17} aria-hidden="true" /> Nothing needs attention
            </>
          )}
        </h4>
        {attention.length > 0 ? (
          <ul>
            {shown.map((entry) => (
              <li key={entry.key}>
                <span>{entry.text}</span>
                {FIX_LABEL[entry.fix] && (
                  <button
                    type="button"
                    className="price-link"
                    aria-label={`${FIX_LABEL[entry.fix]}: ${entry.text}`}
                    onClick={() => onFix(entry)}
                  >
                    {FIX_LABEL[entry.fix]}
                  </button>
                )}
              </li>
            ))}
            {attention.length > shown.length && (
              <li>
                <span>{attention.length - shown.length} more.</span>
                <button
                  type="button"
                  className="price-link"
                  onClick={() => onFix({ key: 'more', text: '', fix: 'price' })}
                >
                  Open Pricing
                </button>
              </li>
            )}
          </ul>
        ) : (
          <p>
            Every proposed item has a rate and the saved total is current. A commercial check of
            rates, scope and exclusions is still your responsibility before issuing.
          </p>
        )}
      </section>}

      <section className="studies-compare" aria-label="Compare options">
        <h4>
          <Scale size={17} aria-hidden="true" /> Compare Option A and Option B
        </h4>
        <table>
          <thead>
            <tr>
              <th scope="col">
                <span className="sr-only">Measure</span>
              </th>
              {comparison.options.map((option) => (
                <th key={option.key} scope="col">
                  {option.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Proposed items</th>
              {comparison.options.map((option) => (
                <td key={option.key}>{option.items}</td>
              ))}
            </tr>
            <tr>
              <th scope="row">Without a rate</th>
              {comparison.options.map((option) => (
                <td key={option.key}>{option.withoutRate}</td>
              ))}
            </tr>
            <tr>
              <th scope="row">{developer ? 'Saved budget' : 'Saved total'}</th>
              {comparison.options.map((option) => (
                <td key={option.key}>
                  {option.total === null ? '—' : ringgit(option.total)}
                  <small>{stateText(option)}</small>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
        <p className={comparison.comparable ? 'studies-compare-ok' : 'studies-compare-no'}>
          {comparison.comparable ? 'Comparable. ' : 'Not comparable yet. '}
          {comparison.reason}
        </p>
        <small>
          Each option is priced from your organisation&apos;s saved rates. InfraShader does not
          search the market or find the cheapest supplier.
        </small>
      </section>
    </section>
  )
}
