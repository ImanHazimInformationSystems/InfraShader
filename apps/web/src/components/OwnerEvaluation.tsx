import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { z } from 'zod'
import type { Project } from '../domain/projects'
import {
  FIELD_NAMES,
  READINESS_LABEL,
  dashboardSchema,
  evaluationSchema,
  stateSchema,
  weightTotal,
  type Criterion,
  type Evaluation,
  type FieldName,
  type Line,
  type OwnerState,
  type SourceRef,
  type Submission,
  suggestionsSchema,
  type Suggestions,
} from '../domain/owner-review'
import { ApiError, request } from '../services/api'
import { ReviewGuide, ReviewPreferencesButton, StepTip } from './ReviewGuide'
import { reviewProgress, suggestedStep, useReviewPreferences } from '../domain/review-guide'
import ProposalOverview from './ProposalOverview'

const baseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')
const anyEntry = z.object({ key: z.string(), revision: z.number() }).passthrough()
const STEPS = [
  'Overview',
  'Basis',
  'Rubric',
  'Offers',
  'Scores',
  'Clarifications',
  'Evaluation & decision',
] as const
type Step = (typeof STEPS)[number]
const STEP_HINT: Record<Step, string> = {
  Overview:
    'All proposals for this project side by side: site plans, prices, what is included and scores.',
  Basis: 'Step 1 of 6 · Write down what you are buying, your budget and must-have requirements.',
  Rubric: 'Step 2 of 6 · Decide how proposals will be scored, then lock the rules before scoring.',
  Offers:
    'Step 3 of 6 · Record each proposal, keep its documents and confirm its prices against them.',
  Scores:
    'Step 4 of 6 · Score each proposal against the locked rules and give a reason for each score.',
  Clarifications: 'Step 5 of 6 · Ask bidders questions and record their answers.',
  'Evaluation & decision':
    'Step 6 of 6 · Check the official ranking, write a recommendation and record the approval.',
}

function ReviewExampleNote() {
  return (
    <aside className="example-banner" aria-label="About this example review">
      <strong>This is the built-in example review.</strong>
      <p>
        The three proposals are the three Design Studio examples (A, B and C) for the same park in
        Shah Alam. Their site plans, totals and items are the same in both places. Everything up to
        the scores is done; try writing the recommendation in step 6. Fictional parties; not a real
        tender.
      </p>
    </aside>
  )
}

const money = (value?: string | null) =>
  value == null ? '—' : `MYR ${Number(value).toLocaleString('en-MY', { minimumFractionDigits: 2 })}`
const short = (id: string, me: string) => (id === me ? 'You' : `User ${id.slice(0, 8)}`)
const nullIfBlank = (value: string) => (value.trim() === '' ? null : value.trim())
const uuid = () => crypto.randomUUID()

async function fetchBlob(path: string, token: string) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) throw new ApiError('Retained file is unavailable.', response.status, 'file')
  return { blob: await response.blob(), sha: response.headers.get('X-Content-SHA256') ?? '' }
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="owner-step" aria-label={title}>
      <h3>{title}</h3>
      {children}
    </section>
  )
}

export default function OwnerEvaluation({ project, token }: { project: Project; token: string }) {
  const base = `/api/v1/organisations/${project.organisation_id}/projects/${project.id}/owner-review`
  const [state, setState] = useState<OwnerState | null>(null)
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null)
  const [chosenStep, setStep] = useState<Step | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let active = true
    Promise.all([
      request(base, stateSchema, token),
      request(`${base}/evaluation`, evaluationSchema, token),
    ])
      .then(([loaded, evaluated]) => {
        if (!active) return
        setState(loaded)
        setEvaluation(evaluated)
        setError('')
      })
      .catch(
        (reason: unknown) =>
          active && setError(String(reason instanceof Error ? reason.message : reason)),
      )
    return () => {
      active = false
    }
  }, [base, token, reload])

  const send = useCallback(
    async (
      path: string,
      body: unknown,
      method = 'POST',
      done = 'Saved as a new immutable revision.',
    ) => {
      setBusy(true)
      setError('')
      setNotice('')
      try {
        await request(`${base}${path}`, anyEntry.or(z.unknown()), token, {
          method,
          body: JSON.stringify(body),
        })
        setNotice(done)
        setReload((value) => value + 1)
        return true
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : String(reason))
        if (reason instanceof ApiError && reason.status === 409) setReload((value) => value + 1)
        return false
      } finally {
        setBusy(false)
      }
    },
    [base, token],
  )

  const download = useCallback(
    async (fileId: string, filename: string) => {
      try {
        const { blob } = await fetchBlob(`${base}/files/${fileId}`, token)
        const url = URL.createObjectURL(blob)
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = filename
        anchor.click()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : String(reason))
      }
    },
    [base, token],
  )

  const [preferences, updatePreferences] = useReviewPreferences(state?.user_id)

  if (!state)
    return (
      <section className="paper owner-review" aria-label="Owner proposal review">
        <h2>Owner proposal review</h2>
        {error ? (
          <>
            <p role="alert">{error}</p>
            <button
              type="button"
              className="button secondary"
              onClick={() => setReload((v) => v + 1)}
            >
              Retry
            </button>
          </>
        ) : (
          <p role="status">Loading owner review records…</p>
        )}
      </section>
    )

  const canPrepare = state.capabilities.includes('review_project')
  const canApprove = state.capabilities.includes('issue_developer_brief')
  const refresh = (message: string) => {
    setNotice(message)
    setReload((value) => value + 1)
  }
  const props = {
    state,
    evaluation,
    busy,
    send,
    download,
    refresh,
    canPrepare,
    canApprove,
    base,
    token,
  }
  const progress = reviewProgress(state, evaluation)
  const hasOffers = state.submissions.some((s) => !s.payload.withdrawn)
  const step: Step =
    chosenStep ??
    (preferences.start === 'overview'
      ? hasOffers
        ? 'Overview'
        : suggestedStep(progress)
      : preferences.start === 'suggested'
        ? suggestedStep(progress)
        : preferences.start === 'last'
          ? (preferences.lastStep ?? 'Basis')
          : 'Basis')
  // Fix the opening step once, so saving records never moves the reviewer elsewhere.
  if (chosenStep === null) setStep(step)
  const go = (name: Step) => {
    setStep(name)
    updatePreferences({ lastStep: name })
  }
  return (
    <section
      className={`paper owner-review density-${preferences.density}${preferences.highlight ? ' highlight-attention' : ''}`}
      aria-label="Owner proposal review"
    >
      <div className="owner-review-head">
        <div>
          <span className="eyebrow">Organisation Review · one project</span>
          <h2>{project.name}</h2>
        </div>
        <div className="owner-review-tools">
          {!preferences.guide && (
            <button
              type="button"
              className="button text compact"
              onClick={() => updatePreferences({ guide: true })}
            >
              Show guide
            </button>
          )}
          <ReviewPreferencesButton preferences={preferences} onChange={updatePreferences} />
        </div>
      </div>
      <p className="owner-review-lede">
        Compare the proposals contractors sent for this project, score them against fixed rules and
        record a decision. People, not software, confirm every price and score: nothing here is
        extracted, scored or approved automatically.
      </p>
      {project.example === 'review' && <ReviewExampleNote />}
      {preferences.guide && (
        <ReviewGuide
          progress={progress}
          current={step}
          onGo={go}
          onHide={() => updatePreferences({ guide: false })}
        />
      )}
      <nav className="owner-steps" aria-label="Owner review steps">
        {STEPS.map((name, index) => (
          <button
            key={name}
            type="button"
            className={`button ${step === name ? 'primary' : 'secondary'}${name === 'Overview' ? ' owner-step-overview' : ''}`}
            aria-current={step === name ? 'step' : undefined}
            onClick={() => go(name)}
          >
            {name === 'Overview' ? 'Overview of proposals' : `${index}. ${name}`}
            {name !== 'Overview' && progress[index - 1]?.done && (
              <span className="owner-step-done" aria-hidden="true">
                {' '}
                ✓
              </span>
            )}
          </button>
        ))}
        <button
          type="button"
          className="button text"
          disabled={busy}
          onClick={() => setReload((v) => v + 1)}
        >
          Reload
        </button>
      </nav>
      <div aria-live="polite">
        {error && (
          <p role="alert" className="notice error">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="notice">
            {notice}
          </p>
        )}
      </div>
      <p className="owner-step-hint">{STEP_HINT[step]}</p>
      {preferences.tips && step !== 'Overview' && <StepTip step={step} />}
      {step === 'Overview' && (
        <ProposalOverview
          state={state}
          evaluation={evaluation}
          base={base}
          token={token}
          onGo={go}
        />
      )}
      {step === 'Basis' && <BasisStep {...props} />}
      {step === 'Rubric' && <RubricStep {...props} />}
      {step === 'Offers' && <OffersStep {...props} />}
      {step === 'Scores' && <ScoresStep {...props} />}
      {step === 'Clarifications' && <ClarificationStep {...props} />}
      {step === 'Evaluation & decision' && <DecisionStep {...props} />}
    </section>
  )
}

type StepProps = {
  state: OwnerState
  evaluation: Evaluation | null
  busy: boolean
  canPrepare: boolean
  canApprove: boolean
  base: string
  token: string
  send: (path: string, body: unknown, method?: string, done?: string) => Promise<boolean>
  download: (fileId: string, filename: string) => Promise<void>
  refresh: (message: string) => void
}

// ------------------------------------------------------------------ basis (O02/O04/O13)

type ScopeRow = { code: string; description: string; unit: string; quantity: string }
type ReqRow = {
  code: string
  text: string
  kind: 'eligibility' | 'technical'
  mandatory: boolean
  expiry_required: boolean
}

function BasisStep({ state, busy, canPrepare, send }: StepProps) {
  const current = state.basis?.payload
  const [title, setTitle] = useState(current?.title ?? '')
  const [deliverables, setDeliverables] = useState(current?.deliverables ?? '')
  const [submissionReq, setSubmissionReq] = useState(current?.submission_requirements ?? '')
  const [tax, setTax] = useState<string>(current?.tax_basis ?? '')
  const [budget, setBudget] = useState(current?.budget ?? '')
  const [horizon, setHorizon] = useState(current?.evaluation_horizon_years?.toString() ?? '')
  const [deadline, setDeadline] = useState(current?.deadline?.slice(0, 16) ?? '')
  const [selfApproval, setSelfApproval] = useState<string>(current?.self_approval ?? '')
  const [reviewers, setReviewers] = useState<string[]>(current?.reviewers ?? [])
  const [scope, setScope] = useState<ScopeRow[]>(
    current?.scope_items.map((s) => ({ ...s, quantity: s.quantity ?? '' })) ?? [
      { code: '', description: '', unit: '', quantity: '' },
    ],
  )
  const [reqs, setReqs] = useState<ReqRow[]>(current?.requirements ?? [])
  const [addendum, setAddendum] = useState('')
  const revision = state.basis?.revision ?? 0
  function save() {
    void send(
      '/basis',
      {
        expected_revision: revision,
        title,
        deliverables,
        submission_requirements: submissionReq,
        tax_basis: tax,
        budget: nullIfBlank(budget),
        evaluation_horizon_years: horizon ? Number(horizon) : null,
        deadline: deadline ? `${deadline}:00+08:00` : null,
        deadline_timezone: 'Asia/Kuala_Lumpur',
        self_approval: selfApproval,
        reviewers,
        scope_items: scope.map((s) => ({ ...s, quantity: nullIfBlank(s.quantity) })),
        requirements: reqs,
        addendum_note: addendum,
      },
      'PUT',
      revision
        ? 'Addendum recorded as a new basis version. Offers confirmed earlier now need re-confirmation.'
        : 'Comparison basis saved.',
    )
  }
  return (
    <Section title="Comparison basis and requirements">
      <p className="fine-print">
        The owner brief above stays the project record. This basis fixes the common scope, units,
        tax basis, budget and required documents that every offer is compared against. Currency is
        fixed MYR; no exchange-rate service is used. Version {revision || 'not yet saved'}.
      </p>
      {current && revision > 1 && (
        <p className="notice">Latest addendum: {current.addendum_note}</p>
      )}
      <fieldset disabled={busy || !canPrepare} className="owner-grid">
        <label>
          Basis title
          <input value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label>
          Comparison tax basis
          <select value={tax} onChange={(e) => setTax(e.target.value)}>
            <option value="">Choose…</option>
            <option value="exclusive">Tax exclusive</option>
            <option value="inclusive">Tax inclusive</option>
          </select>
        </label>
        <label>
          Owner budget (MYR, optional)
          <input inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} />
        </label>
        <label>
          Evaluation horizon, years (optional)
          <input
            type="number"
            min={1}
            max={60}
            value={horizon}
            onChange={(e) => setHorizon(e.target.value)}
          />
        </label>
        <label>
          Submission deadline (Asia/Kuala_Lumpur, UTC+08:00)
          <input
            type="datetime-local"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
          />
        </label>
        <label>
          Self-approval policy (owner decision, no default)
          <select value={selfApproval} onChange={(e) => setSelfApproval(e.target.value)}>
            <option value="">Choose…</option>
            <option value="prohibited">Prohibited — approver must differ from recommender</option>
            <option value="permitted">Permitted</option>
          </select>
        </label>
        <label className="wide">
          Deliverables
          <textarea value={deliverables} onChange={(e) => setDeliverables(e.target.value)} />
        </label>
        <label className="wide">
          Submission requirements
          <textarea value={submissionReq} onChange={(e) => setSubmissionReq(e.target.value)} />
        </label>
      </fieldset>
      <fieldset disabled={busy || !canPrepare}>
        <legend>Assigned reviewers (must hold a project review grant)</legend>
        {state.eligible_reviewers.length === 0 && (
          <p>No project member holds a review grant yet.</p>
        )}
        {state.eligible_reviewers.map((id) => (
          <label key={id} className="inline">
            <input
              type="checkbox"
              checked={reviewers.includes(id)}
              onChange={(e) =>
                setReviewers(
                  e.target.checked ? [...reviewers, id] : reviewers.filter((r) => r !== id),
                )
              }
            />
            {short(id, state.user_id)}
          </label>
        ))}
      </fieldset>
      <fieldset disabled={busy || !canPrepare}>
        <legend>Common scope items</legend>
        <div className="table-scroll" tabIndex={0} role="group" aria-label="Scrollable table">
          <table className="owner-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Description</th>
                <th>Unit</th>
                <th>Reference quantity</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {scope.map((row, i) => (
                <tr key={i}>
                  {(['code', 'description', 'unit', 'quantity'] as const).map((k) => (
                    <td key={k}>
                      <input
                        aria-label={`Scope ${i + 1} ${k}`}
                        value={row[k]}
                        onChange={(e) =>
                          setScope(
                            scope.map((r, j) => (j === i ? { ...r, [k]: e.target.value } : r)),
                          )
                        }
                      />
                    </td>
                  ))}
                  <td>
                    <button
                      type="button"
                      className="button text"
                      aria-label={`Remove scope ${i + 1}`}
                      onClick={() => setScope(scope.filter((_, j) => j !== i))}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          type="button"
          className="button secondary"
          onClick={() =>
            setScope([...scope, { code: '', description: '', unit: '', quantity: '' }])
          }
        >
          Add scope item
        </button>
      </fieldset>
      <fieldset disabled={busy || !canPrepare}>
        <legend>Eligibility and technical requirements (O04/O14)</legend>
        <div className="table-scroll" tabIndex={0} role="group" aria-label="Scrollable table">
          <table className="owner-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Requirement</th>
                <th>Kind</th>
                <th>Mandatory</th>
                <th>Expiry date needed</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {reqs.map((row, i) => (
                <tr key={i}>
                  <td>
                    <input
                      aria-label={`Requirement ${i + 1} code`}
                      value={row.code}
                      onChange={(e) =>
                        setReqs(reqs.map((r, j) => (j === i ? { ...r, code: e.target.value } : r)))
                      }
                    />
                  </td>
                  <td>
                    <input
                      aria-label={`Requirement ${i + 1} text`}
                      value={row.text}
                      onChange={(e) =>
                        setReqs(reqs.map((r, j) => (j === i ? { ...r, text: e.target.value } : r)))
                      }
                    />
                  </td>
                  <td>
                    <select
                      aria-label={`Requirement ${i + 1} kind`}
                      value={row.kind}
                      onChange={(e) =>
                        setReqs(
                          reqs.map((r, j) =>
                            j === i ? { ...r, kind: e.target.value as ReqRow['kind'] } : r,
                          ),
                        )
                      }
                    >
                      <option value="eligibility">Eligibility</option>
                      <option value="technical">Technical</option>
                    </select>
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Requirement ${i + 1} mandatory`}
                      checked={row.mandatory}
                      onChange={(e) =>
                        setReqs(
                          reqs.map((r, j) => (j === i ? { ...r, mandatory: e.target.checked } : r)),
                        )
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Requirement ${i + 1} expiry`}
                      checked={row.expiry_required}
                      onChange={(e) =>
                        setReqs(
                          reqs.map((r, j) =>
                            j === i ? { ...r, expiry_required: e.target.checked } : r,
                          ),
                        )
                      }
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="button text"
                      onClick={() => setReqs(reqs.filter((_, j) => j !== i))}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          type="button"
          className="button secondary"
          onClick={() =>
            setReqs([
              ...reqs,
              { code: '', text: '', kind: 'eligibility', mandatory: true, expiry_required: false },
            ])
          }
        >
          Add requirement
        </button>
        <p className="fine-print">
          An uploaded registration or qualification is a claim until a reviewer checks it. No
          automatic CIDB or registry verification is performed.
        </p>
      </fieldset>
      {revision > 0 && (
        <label>
          Addendum note (required: what changed and why; propagated explicitly)
          <textarea value={addendum} onChange={(e) => setAddendum(e.target.value)} />
        </label>
      )}
      {canPrepare ? (
        <button type="button" className="button primary" disabled={busy} onClick={save}>
          {revision ? 'Record basis addendum' : 'Save comparison basis'}
        </button>
      ) : (
        <p>Your grant can read this basis but not change it.</p>
      )}
    </Section>
  )
}

// ------------------------------------------------------------------ rubric (O09)

type CritRow = Omit<Criterion, 'pass_mark'> & { pass_mark: string }
const blankCriterion = (): CritRow => ({
  code: '',
  name: '',
  weight: '',
  direction: 'higher_better',
  scale_min: 0,
  scale_max: 10,
  mandatory_gate: false,
  pass_mark: '',
  evidence_requirement: '',
  guidance: '',
})

function RubricStep({ state, busy, canPrepare, send }: StepProps) {
  const current = state.rubric?.payload
  const [rows, setRows] = useState<CritRow[]>(
    current?.criteria.map((c) => ({ ...c, pass_mark: c.pass_mark?.toString() ?? '' })) ?? [
      blankCriterion(),
    ],
  )
  const [missing, setMissing] = useState<string>(current?.missing_score_rule ?? '')
  const [aggregation, setAggregation] = useState<string>(current?.reviewer_aggregation ?? '')
  const [reason, setReason] = useState('')
  const locked = current?.status === 'locked'
  const total = weightTotal(rows.map((r) => r.weight))
  const update = (i: number, patch: Partial<CritRow>) =>
    setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  return (
    <Section title="Criteria rubric">
      <p className="fine-print">
        Weights, scales, missing-score handling and reviewer aggregation are owner policy and have
        no default. Ties are reported for a human decision, never broken automatically. Scoring
        opens only after locking; changing a locked rubric needs a recorded reason and makes earlier
        score sheets stale.
      </p>
      <p className={locked ? 'notice' : 'notice error'}>
        {state.rubric
          ? locked
            ? `Version ${state.rubric.revision} locked ${current?.locked_at?.slice(0, 16).replace('T', ' ')} UTC by ${short(current?.locked_by ?? '', state.user_id)}.`
            : `Version ${state.rubric.revision} is a draft and cannot be scored yet.`
          : 'No rubric saved.'}
      </p>
      <fieldset disabled={busy || !canPrepare}>
        <div className="table-scroll" tabIndex={0} role="group" aria-label="Scrollable table">
          <table className="owner-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Criterion</th>
                <th>Weight</th>
                <th>Direction</th>
                <th>Scale min</th>
                <th>Scale max</th>
                <th>Gate</th>
                <th>Pass mark</th>
                <th>Evidence required</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>
                  <td>
                    <input
                      aria-label={`Criterion ${i + 1} code`}
                      value={row.code}
                      onChange={(e) => update(i, { code: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      aria-label={`Criterion ${i + 1} name`}
                      value={row.name}
                      onChange={(e) => update(i, { name: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      aria-label={`Criterion ${i + 1} weight`}
                      inputMode="decimal"
                      value={row.weight}
                      onChange={(e) => update(i, { weight: e.target.value })}
                    />
                  </td>
                  <td>
                    <select
                      aria-label={`Criterion ${i + 1} direction`}
                      value={row.direction}
                      onChange={(e) =>
                        update(i, { direction: e.target.value as CritRow['direction'] })
                      }
                    >
                      <option value="higher_better">Higher is better</option>
                      <option value="lower_better">Lower is better</option>
                    </select>
                  </td>
                  <td>
                    <input
                      aria-label={`Criterion ${i + 1} scale minimum`}
                      type="number"
                      min={0}
                      max={100}
                      value={row.scale_min}
                      onChange={(e) => update(i, { scale_min: Number(e.target.value) })}
                    />
                  </td>
                  <td>
                    <input
                      aria-label={`Criterion ${i + 1} scale maximum`}
                      type="number"
                      min={1}
                      max={100}
                      value={row.scale_max}
                      onChange={(e) => update(i, { scale_max: Number(e.target.value) })}
                    />
                  </td>
                  <td>
                    <input
                      aria-label={`Criterion ${i + 1} mandatory gate`}
                      type="checkbox"
                      checked={row.mandatory_gate}
                      onChange={(e) =>
                        update(i, {
                          mandatory_gate: e.target.checked,
                          pass_mark: e.target.checked ? row.pass_mark : '',
                        })
                      }
                    />
                  </td>
                  <td>
                    <input
                      aria-label={`Criterion ${i + 1} pass mark`}
                      type="number"
                      disabled={!row.mandatory_gate}
                      value={row.pass_mark}
                      onChange={(e) => update(i, { pass_mark: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      aria-label={`Criterion ${i + 1} evidence requirement`}
                      value={row.evidence_requirement}
                      onChange={(e) => update(i, { evidence_requirement: e.target.value })}
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="button text"
                      onClick={() => setRows(rows.filter((_, j) => j !== i))}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p role="status">
          Weight total: {total} {total === '100.00' ? '(valid)' : '(must equal 100.00)'}
        </p>
        <button
          type="button"
          className="button secondary"
          onClick={() => setRows([...rows, blankCriterion()])}
        >
          Add criterion
        </button>
        <div className="owner-grid">
          <label>
            Missing reviewer score rule
            <select value={missing} onChange={(e) => setMissing(e.target.value)}>
              <option value="">Choose…</option>
              <option value="not_ranked">
                Offer is not ranked until every criterion is scored
              </option>
              <option value="scale_minimum">
                Score missing criterion at scale minimum (labelled)
              </option>
            </select>
          </label>
          <label>
            Reviewer score aggregation
            <select value={aggregation} onChange={(e) => setAggregation(e.target.value)}>
              <option value="">Choose…</option>
              <option value="mean">Mean of submitted reviewer scores</option>
              <option value="median">Median of submitted reviewer scores</option>
            </select>
          </label>
          {locked && (
            <label>
              Change reason (required to reopen a locked rubric)
              <input value={reason} onChange={(e) => setReason(e.target.value)} />
            </label>
          )}
        </div>
      </fieldset>
      {canPrepare && (
        <div className="owner-actions">
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={() =>
              void send(
                '/rubric',
                {
                  expected_revision: state.rubric?.revision ?? 0,
                  criteria: rows.map((r) => ({
                    ...r,
                    pass_mark: r.mandatory_gate ? Number(r.pass_mark) : null,
                  })),
                  missing_score_rule: missing,
                  reviewer_aggregation: aggregation,
                  tie_policy: 'report_only',
                  change_reason: reason,
                },
                'PUT',
                'Rubric draft saved.',
              )
            }
          >
            Save rubric draft
          </button>
          <button
            type="button"
            className="button primary"
            disabled={busy || !state.rubric || locked}
            onClick={() =>
              void send(
                '/rubric/lock',
                { expected_revision: state.rubric?.revision },
                'POST',
                'Rubric locked. Assigned reviewers can now score.',
              )
            }
          >
            Lock rubric for scoring
          </button>
        </div>
      )}
    </Section>
  )
}

// ------------------------------------------------------------------ offers (O05/O06/O07/O14/O15)

/** O08: side-by-side view of retained offer documents (document-only comparison). */
function DocumentCompare({ state, base, token }: StepProps) {
  const docs = state.files.filter(
    (f) => f.purpose === 'received' && f.content_type === 'application/pdf',
  )
  const bidder = new Map(state.submissions.map((s) => [s.key, s.payload.bidder_name]))
  const [chosen, setChosen] = useState<[string, string]>(['', ''])
  const [urls, setUrls] = useState<[string, string]>(['', ''])
  const [error, setError] = useState('')
  const created = useRef<string[]>([])
  useEffect(() => () => created.current.forEach((url) => URL.revokeObjectURL(url)), [])
  if (docs.length < 2) return null
  async function pick(side: 0 | 1, id: string) {
    setError('')
    setChosen((current) => (side === 0 ? [id, current[1]] : [current[0], id]))
    if (!id) return setUrls((current) => (side === 0 ? ['', current[1]] : [current[0], '']))
    try {
      const { blob } = await fetchBlob(`${base}/files/${id}`, token)
      const url = URL.createObjectURL(blob)
      created.current.push(url)
      setUrls((current) => (side === 0 ? [url, current[1]] : [current[0], url]))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    }
  }
  const label = (f: (typeof docs)[number]) =>
    `${bidder.get(f.submission_key ?? '') ?? 'Offer'} — ${f.filename} (package v${f.package_version})`
  return (
    <details className="owner-compare">
      <summary>Compare two offer documents side by side (O08)</summary>
      <p className="fine-print">
        Document-only comparison. These offers carry no admitted design geometry, so no map
        comparison is shown and no geometric equivalence, scale or matching scope is inferred.
      </p>
      <div className="owner-compare-grid">
        {([0, 1] as const).map((side) => (
          <figure key={side}>
            <label>
              {side === 0 ? 'Left document' : 'Right document'}
              <select value={chosen[side]} onChange={(e) => void pick(side, e.target.value)}>
                <option value="">Choose…</option>
                {docs.map((f) => (
                  <option key={f.id} value={f.id}>
                    {label(f)}
                  </option>
                ))}
              </select>
            </label>
            {urls[side] ? (
              <iframe
                title={`${side === 0 ? 'Left' : 'Right'} compared document`}
                src={urls[side]}
              />
            ) : (
              <p className="fine-print">No document selected.</p>
            )}
          </figure>
        ))}
      </div>
      {error && <p role="alert">{error}</p>}
    </details>
  )
}

function OffersStep(props: StepProps) {
  const { state, busy, canPrepare, send } = props
  const [open, setOpen] = useState<string | null>(state.submissions[0]?.key ?? null)
  const [form, setForm] = useState({
    bidder_name: '',
    channel: 'external_document',
    supplier_registered: false,
    sender: '',
    received_at: '',
    receipt_evidence: '',
  })
  if (!state.basis)
    return (
      <Section title="Offers">
        <p>Save the comparison basis first; offers are confirmed against it.</p>
      </Section>
    )
  return (
    <Section title="Received offers">
      <p className="fine-print">
        Record each offer as received. External PDF/XLSX documents need no supplier account.
        Originals are retained privately with their SHA-256 hash and are never modified. Native JSON
        snapshots are retained as received; values still need manual confirmation.
      </p>
      <DocumentCompare {...props} />
      {canPrepare && (
        <details>
          <summary>Record a received offer</summary>
          <fieldset disabled={busy} className="owner-grid">
            <label>
              Bidder name
              <input
                value={form.bidder_name}
                onChange={(e) => {
                  const value = e.target
                  setForm((current) => ({ ...current, bidder_name: value.value }))
                }}
              />
            </label>
            <label>
              Channel
              <select
                value={form.channel}
                onChange={(e) => {
                  const value = e.target
                  setForm((current) => ({ ...current, channel: value.value }))
                }}
              >
                <option value="external_document">External document (PDF/XLSX)</option>
                <option value="native_upload">Native snapshot uploaded by owner</option>
              </select>
            </label>
            <label className="inline">
              <input
                type="checkbox"
                checked={form.supplier_registered}
                onChange={(e) => {
                  const value = e.target
                  setForm((current) => ({ ...current, supplier_registered: value.checked }))
                }}
              />{' '}
              Supplier holds an InfraShader account
            </label>
            <label>
              Sender
              <input
                value={form.sender}
                onChange={(e) => {
                  const value = e.target
                  setForm((current) => ({ ...current, sender: value.value }))
                }}
              />
            </label>
            <label>
              Received at (UTC+08:00)
              <input
                type="datetime-local"
                value={form.received_at}
                onChange={(e) => {
                  const value = e.target
                  setForm((current) => ({ ...current, received_at: value.value }))
                }}
              />
            </label>
            <label className="wide">
              Receipt evidence (e.g. email reference, courier slip)
              <input
                value={form.receipt_evidence}
                onChange={(e) => {
                  const value = e.target
                  setForm((current) => ({ ...current, receipt_evidence: value.value }))
                }}
              />
            </label>
            <button
              type="button"
              className="button primary"
              onClick={() =>
                void send(
                  '/submissions',
                  { ...form, received_at: form.received_at ? `${form.received_at}:00+08:00` : '' },
                  'POST',
                  'Offer receipt recorded. Attach its original documents next.',
                )
              }
            >
              Record receipt
            </button>
          </fieldset>
        </details>
      )}
      {state.submissions.length === 0 && <p>No offers recorded yet.</p>}
      {state.submissions.map((sub) => (
        <details key={sub.key} open={open === sub.key}>
          {/* Toggle from the click itself: a controlled <details> driven by the asynchronous
              toggle event loses clicks when a re-render lands in between. */}
          <summary
            onClick={(e) => {
              e.preventDefault()
              setOpen((current) => (current === sub.key ? null : sub.key))
            }}
          >
            {sub.payload.bidder_name} — package v{sub.payload.package_version}
            {sub.payload.channel === 'external_document'
              ? ' · document only'
              : sub.payload.channel === 'native_infrashader'
                ? ` · submitted through InfraShader (receipt ${sub.payload.native?.receipt_id ?? 'pending'})`
                : ' · native snapshot'}
            {!sub.payload.supplier_registered && ' · unregistered supplier'}
            {sub.payload.withdrawn &&
              (sub.payload.contractor_withdrawal ? ' · withdrawn by the contractor' : ' · withdrawn')}
            {sub.payload.confirmed_package_version !== sub.payload.package_version &&
              ' · not confirmed'}
          </summary>
          {open === sub.key && (
            <OfferEditor key={`${sub.key}/${sub.revision}`} sub={sub} {...props} />
          )}
        </details>
      ))}
    </Section>
  )
}

type FieldDraft = {
  state: 'unconfirmed' | 'confirmed' | 'not_provided'
  value: string
  doc: string
  loc: string
}
type LineDraft = Omit<
  Line,
  'source' | 'adjustment' | 'original_quantity' | 'original_rate' | 'original_amount' | 'scope_code'
> & {
  original_quantity: string
  original_rate: string
  original_amount: string
  scope_code: string
  doc: string
  loc: string
  adj_amount: string
  adj_reason: string
  adj_source: string
}
type RespDraft = { state: string; doc: string; loc: string; expiry: string; note: string }

const ref = (doc: string, loc: string): SourceRef | null =>
  doc && loc.trim() ? { document_id: doc, location: loc.trim() } : null

function OfferEditor({
  sub,
  state,
  busy,
  canPrepare,
  send,
  base,
  token,
  download,
  refresh,
}: StepProps & { sub: Submission }) {
  const docs = state.files.filter((f) => f.submission_key === sub.key && f.purpose === 'received')
  const draftKey = `infrashader:owner-offer:${sub.key}:${sub.revision}`
  const initial = useMemo(() => {
    const p = sub.payload
    const fields = Object.fromEntries(
      FIELD_NAMES.map((name) => {
        const f = p.fields[name]
        return [
          name,
          {
            state: f?.state ?? 'unconfirmed',
            value: f?.value == null ? '' : String(f.value),
            doc: f?.source?.document_id ?? '',
            loc: f?.source?.location ?? '',
          },
        ]
      }),
    ) as Record<FieldName, FieldDraft>
    const lines: LineDraft[] = p.lines.map((l) => ({
      ...l,
      original_quantity: l.original_quantity ?? '',
      original_rate: l.original_rate ?? '',
      original_amount: l.original_amount ?? '',
      scope_code: l.scope_code ?? '',
      doc: l.source.document_id,
      loc: l.source.location,
      adj_amount: l.adjustment?.amount ?? '',
      adj_reason: l.adjustment?.reason ?? '',
      adj_source: l.adjustment?.source ?? '',
    }))
    const responses = Object.fromEntries(
      (state.basis?.payload.requirements ?? []).map((r) => {
        const found = p.responses.find((x) => x.code === r.code)
        return [
          r.code,
          {
            state: found?.state ?? 'absent',
            doc: found?.source?.document_id ?? '',
            loc: found?.source?.location ?? '',
            expiry: found?.expiry ?? '',
            note: found?.note ?? '',
          },
        ]
      }),
    ) as Record<string, RespDraft>
    return { fields, lines, responses, withdrawn: p.withdrawn }
  }, [sub, state.basis])
  const [draft, setDraft] = useState(initial)
  const [dirty, setDirty] = useState(false)
  const [recoverable, setRecoverable] = useState(() => {
    try {
      return sessionStorage.getItem(draftKey) !== null
    } catch {
      return false
    }
  })
  const [viewer, setViewer] = useState<{ url: string; name: string } | null>(null)
  const [suggested, setSuggested] = useState<Suggestions | null>(null)
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [suggesting, setSuggesting] = useState('')
  async function suggest(id: string) {
    setSuggesting(id)
    setSuggested(null)
    setPicked(new Set())
    try {
      setSuggested(
        await request(`${base}/files/${id}/suggestions`, suggestionsSchema, token, {
          method: 'POST',
        }),
      )
    } catch (reason) {
      setSuggested({
        document_id: id,
        filename: '',
        status: 'unreadable',
        message: reason instanceof Error ? reason.message : String(reason),
        suggestions: [],
      })
    } finally {
      setSuggesting('')
    }
  }
  function addSuggested() {
    if (!suggested) return
    const chosen = suggested.suggestions.filter((_, i) => picked.has(i))
    patch({
      lines: [
        ...draft.lines,
        ...chosen.map((row) => ({
          line_id: uuid(),
          original_text: row.text,
          original_unit: '',
          original_quantity: '',
          original_rate: '',
          original_amount: row.amount,
          doc: suggested.document_id,
          loc: row.location,
          scope_code: '',
          state: 'included' as const,
          mapping_confirmed: false,
          mapping_note: 'Added from an unverified text suggestion; check against the document.',
          adj_amount: '',
          adj_reason: '',
          adj_source: '',
        })),
      ],
    })
    setPicked(new Set())
    setSuggested(null)
  }
  const [upload, setUpload] = useState<{ file: File | null; description: string }>({
    file: null,
    description: '',
  })
  const [revise, setRevise] = useState({
    reason: '',
    sender: '',
    received_at: '',
    receipt_evidence: '',
  })
  const [uploadError, setUploadError] = useState('')
  useEffect(() => {
    if (!dirty) return
    try {
      sessionStorage.setItem(draftKey, JSON.stringify(draft))
    } catch {
      /* Tab recovery is optional; saving to the API remains available. */
    }
  }, [draft, dirty, draftKey])
  useEffect(
    () => () => {
      if (viewer) URL.revokeObjectURL(viewer.url)
    },
    [viewer],
  )
  const patch = (next: Partial<typeof draft>) => {
    setDraft((current) => ({ ...current, ...next }))
    setDirty(true)
  }
  // S07: long offers (up to 500 lines) are edited one page at a time; all lines stay in the draft.
  const LINES_PER_PAGE = 50
  const [linePage, setLinePage] = useState(0)
  const pages = Math.max(1, Math.ceil(draft.lines.length / LINES_PER_PAGE))
  const page = Math.min(linePage, pages - 1)
  const firstLine = page * LINES_PER_PAGE
  const unconfirmedLines = draft.lines.filter((l) => !l.mapping_confirmed).length
  const patchLine = (index: number, next: Partial<LineDraft>) => {
    setDraft((current) => ({
      ...current,
      lines: current.lines.map((x, j) => (j === index ? { ...x, ...next } : x)),
    }))
    setDirty(true)
  }
  async function show(id: string, name: string) {
    const { blob } = await fetchBlob(`${base}/files/${id}`, token)
    setViewer({ url: URL.createObjectURL(blob), name })
  }
  async function uploadFile() {
    if (!upload.file) return
    setUploadError('')
    const body = new FormData()
    body.append('file', upload.file)
    body.append('description', upload.description || upload.file.name)
    try {
      await request(`${base}/submissions/${sub.key}/file`, z.unknown(), token, {
        method: 'POST',
        body,
      })
      setUpload({ file: null, description: '' })
      refresh('Original retained with its SHA-256 hash.')
    } catch (reason) {
      setUploadError(reason instanceof Error ? reason.message : String(reason))
    }
  }
  function save() {
    const fields = Object.fromEntries(
      FIELD_NAMES.map((name) => {
        const f = draft.fields[name]
        const value =
          name === 'warranty' || name === 'exclusions'
            ? f.state === 'not_provided'
              ? ''
              : f.value
            : name === 'tax_basis'
              ? f.value || 'not_stated'
              : f.state === 'not_provided'
                ? null
                : name === 'duration_days'
                  ? f.value === ''
                    ? null
                    : Number(f.value)
                  : nullIfBlank(f.value)
        return [name, { state: f.state, value, source: ref(f.doc, f.loc) }]
      }),
    )
    const lines = draft.lines.map((l) => ({
      line_id: l.line_id,
      original_text: l.original_text,
      original_unit: l.original_unit,
      original_quantity: nullIfBlank(l.original_quantity),
      original_rate: nullIfBlank(l.original_rate),
      original_amount: nullIfBlank(l.original_amount),
      source: ref(l.doc, l.loc),
      scope_code: nullIfBlank(l.scope_code),
      state: l.state,
      mapping_confirmed: l.mapping_confirmed,
      mapping_note: l.mapping_note,
      adjustment: l.adj_amount.trim()
        ? { amount: l.adj_amount.trim(), reason: l.adj_reason, source: l.adj_source }
        : null,
    }))
    const responses = Object.entries(draft.responses).map(([code, r]) => ({
      code,
      state: r.state,
      source: ref(r.doc, r.loc),
      expiry: nullIfBlank(r.expiry),
      note: r.note,
    }))
    void send(
      `/submissions/${sub.key}`,
      { expected_revision: sub.revision, fields, lines, responses, withdrawn: draft.withdrawn },
      'PUT',
      'Confirmed values saved as a new revision.',
    ).then((ok) => {
      if (ok)
        try {
          sessionStorage.removeItem(draftKey)
        } catch {
          /* ignore */
        }
    })
  }
  const docSelect = (value: string, onChange: (v: string) => void, label: string) => (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Source document…</option>
      {docs.map((d) => (
        <option key={d.id} value={d.id}>
          {d.filename} (v{d.package_version})
        </option>
      ))}
    </select>
  )
  const scope = state.basis?.payload.scope_items ?? []
  return (
    <div className="owner-offer">
      <p className="fine-print">
        Received {sub.payload.received_at.replace('T', ' ').slice(0, 16)} from {sub.payload.sender};
        evidence: {sub.payload.receipt_evidence}. Recorded by{' '}
        {short(sub.payload.received_by, state.user_id)}. Responds to basis v{state.basis?.revision};
        confirmed against basis v{sub.payload.confirmed_basis_revision ?? '—'}.
      </p>
      {sub.payload.revisions.length > 0 && (
        <ul className="fine-print">
          {sub.payload.revisions.map((r) => (
            <li key={r.package_version}>
              Package v{r.package_version} superseded: {r.reason}
            </li>
          ))}
        </ul>
      )}
      <div className="owner-split">
        <div>
          <h4>Retained originals</h4>
          {docs.length === 0 && (
            <p>No document attached. Attach the original before confirming values.</p>
          )}
          <ul>
            {docs.map((d) => (
              <li key={d.id}>
                {d.filename} · v{d.package_version} · {(d.size_bytes / 1024).toFixed(1)} KiB ·
                SHA-256 {d.sha256.slice(0, 12)}…{' '}
                <button
                  type="button"
                  className="button text"
                  onClick={() => void download(d.id, d.filename)}
                >
                  Download
                </button>
                {d.content_type === 'application/pdf' && (
                  <button
                    type="button"
                    className="button text"
                    onClick={() => void show(d.id, d.filename)}
                  >
                    View beside fields
                  </button>
                )}
                {canPrepare && d.content_type !== 'application/json' && (
                  <button
                    type="button"
                    className="button text"
                    disabled={Boolean(suggesting)}
                    onClick={() => void suggest(d.id)}
                  >
                    {suggesting === d.id ? 'Reading text…' : 'Suggest lines from text'}
                  </button>
                )}
              </li>
            ))}
          </ul>
          {suggested && (
            <section className="owner-suggestions" aria-label="Unverified text suggestions">
              <h5>
                Unverified suggestions{suggested.filename ? ` from ${suggested.filename}` : ''}
              </h5>
              {suggested.status !== 'ok' ? (
                <p role="status">{suggested.message}</p>
              ) : suggested.suggestions.length === 0 ? (
                <p role="status">No lines with an amount were found in the text layer.</p>
              ) : (
                <>
                  <p className="fine-print">
                    {suggested.notice}
                    {suggested.truncated ? ' Only the first results are shown.' : ''}
                  </p>
                  <ul>
                    {suggested.suggestions.map((row, i) => (
                      <li key={i}>
                        <label>
                          <input
                            type="checkbox"
                            checked={picked.has(i)}
                            onChange={(e) => {
                              const checked = e.target.checked
                              setPicked((current) => {
                                const next = new Set(current)
                                if (checked) next.add(i)
                                else next.delete(i)
                                return next
                              })
                            }}
                          />
                          {row.text} — MYR {row.amount}{' '}
                          <span className="fine-print">({row.location})</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    className="button secondary"
                    disabled={picked.size === 0}
                    onClick={addSuggested}
                  >
                    Add {picked.size} selected as unconfirmed lines
                  </button>
                </>
              )}
              <button type="button" className="button text" onClick={() => setSuggested(null)}>
                Close suggestions
              </button>
            </section>
          )}
          {canPrepare && (
            <fieldset disabled={busy}>
              <legend>Attach original (PDF, XLSX or native JSON, max 10 MiB)</legend>
              <input
                type="file"
                aria-label="Original document"
                accept=".pdf,.xlsx,.json,application/pdf,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null
                  setUpload((current) => ({ ...current, file }))
                }}
              />
              <input
                aria-label="Document description"
                placeholder="Description"
                value={upload.description}
                onChange={(e) => {
                  const description = e.target.value
                  setUpload((current) => ({ ...current, description }))
                }}
              />
              <button
                type="button"
                className="button secondary"
                disabled={!upload.file}
                onClick={() => void uploadFile()}
              >
                Retain original
              </button>
              {uploadError && <p role="alert">{uploadError}</p>}
            </fieldset>
          )}
          {viewer && (
            <figure className="owner-viewer">
              <figcaption>
                {viewer.name}{' '}
                <button type="button" className="button text" onClick={() => setViewer(null)}>
                  Close viewer
                </button>
              </figcaption>
              <iframe title={`Retained document ${viewer.name}`} src={viewer.url} />
            </figure>
          )}
        </div>
        <div>
          {recoverable && (
            <div className="notice">
              <p>An unsaved draft for this revision exists in this tab.</p>
              <button
                type="button"
                className="button secondary"
                onClick={() => {
                  try {
                    const saved = sessionStorage.getItem(draftKey)
                    if (saved) setDraft(JSON.parse(saved) as typeof draft)
                    setDirty(true)
                  } catch {
                    /* ignore damaged draft */
                  }
                  setRecoverable(false)
                }}
              >
                Restore unsaved draft
              </button>
            </div>
          )}
          <fieldset disabled={busy || !canPrepare}>
            <legend>Confirmed offer fields (O06)</legend>
            <div className="table-scroll" tabIndex={0} role="group" aria-label="Scrollable table">
              <table className="owner-table">
                <thead>
                  <tr>
                    <th>Field</th>
                    <th>Value as stated</th>
                    <th>State</th>
                    <th>Document</th>
                    <th>Page / sheet / cell</th>
                  </tr>
                </thead>
                <tbody>
                  {FIELD_NAMES.map((name) => {
                    const f = draft.fields[name]
                    const set = (next: Partial<FieldDraft>) =>
                      patch({ fields: { ...draft.fields, [name]: { ...f, ...next } } })
                    return (
                      <tr key={name}>
                        <th scope="row">{name.replaceAll('_', ' ')}</th>
                        <td>
                          {name === 'tax_basis' ? (
                            <select
                              aria-label="tax basis value"
                              value={f.value}
                              onChange={(e) => set({ value: e.target.value })}
                            >
                              <option value="not_stated">Not stated</option>
                              <option value="exclusive">Exclusive</option>
                              <option value="inclusive">Inclusive</option>
                            </select>
                          ) : (
                            <input
                              aria-label={`${name} value`}
                              type={name === 'validity_until' ? 'date' : 'text'}
                              value={f.value}
                              onChange={(e) => set({ value: e.target.value })}
                            />
                          )}
                        </td>
                        <td>
                          <select
                            aria-label={`${name} state`}
                            value={f.state}
                            onChange={(e) => set({ state: e.target.value as FieldDraft['state'] })}
                          >
                            <option value="unconfirmed">Unconfirmed</option>
                            <option value="confirmed">Confirmed by me</option>
                            <option value="not_provided">Not provided in offer</option>
                          </select>
                        </td>
                        <td>
                          {docSelect(f.doc, (doc) => set({ doc }), `${name} source document`)}
                        </td>
                        <td>
                          <input
                            aria-label={`${name} source location`}
                            value={f.loc}
                            onChange={(e) => set({ loc: e.target.value })}
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </fieldset>
        </div>
      </div>
      <fieldset disabled={busy || !canPrepare}>
        <legend>Line mapping to common scope (O07)</legend>
        <p className="fine-print">
          Original text, unit and amount are kept as quoted. A comparison-only adjustment needs a
          reason and source and never changes the quoted total.
        </p>
        {draft.lines.length > 0 && (
          <div className="owner-pager" role="group" aria-label="Offer line pages">
            <span role="status">
              Lines {firstLine + 1}–{Math.min(firstLine + LINES_PER_PAGE, draft.lines.length)} of{' '}
              {draft.lines.length}
              {unconfirmedLines > 0
                ? ` · ${unconfirmedLines} line(s) not yet mapping-confirmed across all pages`
                : ' · all lines mapping-confirmed'}
            </span>
            {pages > 1 && (
              <>
                <button
                  type="button"
                  className="button secondary"
                  disabled={page === 0}
                  onClick={() => setLinePage(page - 1)}
                >
                  Previous lines
                </button>
                <label>
                  Line page
                  <select
                    aria-label="Line page"
                    value={page}
                    onChange={(e) => setLinePage(Number(e.target.value))}
                  >
                    {Array.from({ length: pages }, (_, n) => (
                      <option key={n} value={n}>
                        {n * LINES_PER_PAGE + 1}–
                        {Math.min((n + 1) * LINES_PER_PAGE, draft.lines.length)}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="button secondary"
                  disabled={page >= pages - 1}
                  onClick={() => setLinePage(page + 1)}
                >
                  Next lines
                </button>
              </>
            )}
          </div>
        )}
        <div className="table-scroll" tabIndex={0} role="group" aria-label="Scrollable table">
          <table className="owner-table">
            <thead>
              <tr>
                <th>Original text</th>
                <th>Unit</th>
                <th>Qty</th>
                <th>Rate</th>
                <th>Amount</th>
                <th>Document</th>
                <th>Location</th>
                <th>Scope item</th>
                <th>State</th>
                <th>Mapping confirmed</th>
                <th>Adjustment (MYR ±)</th>
                <th>Adjustment reason</th>
                <th>Adjustment source</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {draft.lines.slice(firstLine, firstLine + LINES_PER_PAGE).map((l, k) => {
                const i = firstLine + k
                const set = (next: Partial<LineDraft>) => patchLine(i, next)
                return (
                  <tr key={l.line_id}>
                    <td>
                      <input
                        aria-label={`Line ${i + 1} original text`}
                        value={l.original_text}
                        onChange={(e) => set({ original_text: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`Line ${i + 1} unit`}
                        value={l.original_unit}
                        onChange={(e) => set({ original_unit: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`Line ${i + 1} quantity`}
                        value={l.original_quantity}
                        onChange={(e) => set({ original_quantity: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`Line ${i + 1} rate`}
                        value={l.original_rate}
                        onChange={(e) => set({ original_rate: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`Line ${i + 1} amount`}
                        value={l.original_amount}
                        onChange={(e) => set({ original_amount: e.target.value })}
                      />
                    </td>
                    <td>
                      {docSelect(l.doc, (doc) => set({ doc }), `Line ${i + 1} source document`)}
                    </td>
                    <td>
                      <input
                        aria-label={`Line ${i + 1} source location`}
                        value={l.loc}
                        onChange={(e) => set({ loc: e.target.value })}
                      />
                    </td>
                    <td>
                      <select
                        aria-label={`Line ${i + 1} scope item`}
                        value={l.scope_code}
                        onChange={(e) => set({ scope_code: e.target.value })}
                      >
                        <option value="">Unmapped</option>
                        {scope.map((s) => (
                          <option key={s.code} value={s.code}>
                            {s.code} — {s.description} ({s.unit})
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        aria-label={`Line ${i + 1} state`}
                        value={l.state}
                        onChange={(e) => set({ state: e.target.value as Line['state'] })}
                      >
                        {[
                          'included',
                          'excluded',
                          'optional',
                          'missing',
                          'provisional',
                          'unpriced',
                        ].map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Line ${i + 1} mapping confirmed`}
                        checked={l.mapping_confirmed}
                        onChange={(e) => set({ mapping_confirmed: e.target.checked })}
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`Line ${i + 1} adjustment amount`}
                        value={l.adj_amount}
                        onChange={(e) => set({ adj_amount: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`Line ${i + 1} adjustment reason`}
                        value={l.adj_reason}
                        onChange={(e) => set({ adj_reason: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`Line ${i + 1} adjustment source`}
                        value={l.adj_source}
                        onChange={(e) => set({ adj_source: e.target.value })}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="button text"
                        onClick={() => patch({ lines: draft.lines.filter((_, j) => j !== i) })}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <button
          type="button"
          className="button secondary"
          onClick={() => {
            setLinePage(Math.floor(draft.lines.length / LINES_PER_PAGE))
            patch({
              lines: [
                ...draft.lines,
                {
                  line_id: uuid(),
                  original_text: '',
                  original_unit: '',
                  original_quantity: '',
                  original_rate: '',
                  original_amount: '',
                  doc: docs[0]?.id ?? '',
                  loc: '',
                  scope_code: '',
                  state: 'included',
                  mapping_confirmed: false,
                  mapping_note: '',
                  adj_amount: '',
                  adj_reason: '',
                  adj_source: '',
                },
              ],
            })
          }}
        >
          Add offer line
        </button>
      </fieldset>
      {(state.basis?.payload.requirements.length ?? 0) > 0 && (
        <fieldset disabled={busy || !canPrepare}>
          <legend>Requirement and evidence coverage (O04/O14)</legend>
          <p className="fine-print">
            Absent evidence needs clarification; it is not proof of noncompliance. Only a sourced
            reviewer rejection of a mandatory requirement makes an offer ineligible.
          </p>
          <div className="table-scroll" tabIndex={0} role="group" aria-label="Scrollable table">
            <table className="owner-table">
              <thead>
                <tr>
                  <th>Requirement</th>
                  <th>Response state</th>
                  <th>Document</th>
                  <th>Location</th>
                  <th>Expiry</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {state.basis?.payload.requirements.map((req) => {
                  const r = draft.responses[req.code] ?? {
                    state: 'absent',
                    doc: '',
                    loc: '',
                    expiry: '',
                    note: '',
                  }
                  const set = (next: Partial<RespDraft>) =>
                    patch({ responses: { ...draft.responses, [req.code]: { ...r, ...next } } })
                  return (
                    <tr key={req.code}>
                      <th scope="row">
                        {req.code}
                        {req.mandatory ? ' (mandatory)' : ''}: {req.text}
                      </th>
                      <td>
                        <select
                          aria-label={`${req.code} response state`}
                          value={r.state}
                          onChange={(e) => set({ state: e.target.value })}
                        >
                          <option value="absent">Absent</option>
                          <option value="answered">Answered (claim, unchecked)</option>
                          <option value="unclear">Unclear</option>
                          <option value="not_applicable">Not applicable</option>
                          <option value="accepted">Reviewer-confirmed acceptance</option>
                          <option value="rejected">Reviewer-verified not met</option>
                        </select>
                      </td>
                      <td>
                        {docSelect(r.doc, (doc) => set({ doc }), `${req.code} source document`)}
                      </td>
                      <td>
                        <input
                          aria-label={`${req.code} source location`}
                          value={r.loc}
                          onChange={(e) => set({ loc: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          aria-label={`${req.code} expiry`}
                          type="date"
                          disabled={!req.expiry_required}
                          value={r.expiry}
                          onChange={(e) => set({ expiry: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          aria-label={`${req.code} note`}
                          value={r.note}
                          onChange={(e) => set({ note: e.target.value })}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </fieldset>
      )}
      {canPrepare && (
        <div className="owner-actions">
          <label className="inline">
            <input
              type="checkbox"
              checked={draft.withdrawn}
              onChange={(e) => patch({ withdrawn: e.target.checked })}
            />{' '}
            Offer withdrawn
          </label>
          <button type="button" className="button primary" disabled={busy} onClick={save}>
            Save confirmed offer values
          </button>
          {dirty && <span role="status">Unsaved changes (kept in this tab until saved)</span>}
        </div>
      )}
      {canPrepare && (
        <details>
          <summary>Record a revised package from this bidder (O15)</summary>
          <p className="fine-print">
            A revised package keeps earlier versions and documents, requires re-confirmation and
            makes existing score sheets stale for re-evaluation.
          </p>
          <fieldset disabled={busy} className="owner-grid">
            <label>
              Reason
              <input
                value={revise.reason}
                onChange={(e) => {
                  const value = e.target
                  setRevise((current) => ({ ...current, reason: value.value }))
                }}
              />
            </label>
            <label>
              Sender
              <input
                value={revise.sender}
                onChange={(e) => {
                  const value = e.target
                  setRevise((current) => ({ ...current, sender: value.value }))
                }}
              />
            </label>
            <label>
              Received at (UTC+08:00)
              <input
                type="datetime-local"
                value={revise.received_at}
                onChange={(e) => {
                  const value = e.target
                  setRevise((current) => ({ ...current, received_at: value.value }))
                }}
              />
            </label>
            <label>
              Receipt evidence
              <input
                value={revise.receipt_evidence}
                onChange={(e) => {
                  const value = e.target
                  setRevise((current) => ({ ...current, receipt_evidence: value.value }))
                }}
              />
            </label>
            <button
              type="button"
              className="button secondary"
              onClick={() =>
                void send(
                  `/submissions/${sub.key}/revise`,
                  {
                    ...revise,
                    expected_revision: sub.revision,
                    received_at: revise.received_at ? `${revise.received_at}:00+08:00` : '',
                  },
                  'POST',
                  'Revised package recorded. Attach its documents and re-confirm values.',
                )
              }
            >
              Record revised package
            </button>
          </fieldset>
        </details>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ scores (O10)

function ScoresStep({ state, busy, send }: StepProps) {
  const rubric = state.rubric
  const assigned = state.basis?.payload.reviewers.includes(state.user_id)
  if (!rubric || rubric.payload.status !== 'locked')
    return (
      <Section title="Reviewer scores">
        <p>Scoring opens after the rubric is locked.</p>
      </Section>
    )
  return (
    <Section title="Reviewer scores">
      <p className="fine-print">
        Each assigned reviewer keeps an independent sheet per offer. A declared conflict recuses you
        from that offer. Other reviewers&apos; submitted sheets are visible here; no peer-separation
        policy has been adopted.
      </p>
      {!assigned && (
        <p className="notice">
          You are not an assigned reviewer for this project; you can read submitted sheets only.
        </p>
      )}
      {state.submissions
        .filter((s) => !s.payload.withdrawn)
        .map((sub) => {
          const mine = state.scores.find(
            (s) => s.payload.submission_key === sub.key && s.payload.reviewer_id === state.user_id,
          )
          const others = state.scores.filter(
            (s) =>
              s.payload.submission_key === sub.key &&
              s.payload.reviewer_id !== state.user_id &&
              s.payload.state === 'submitted',
          )
          return (
            <details key={sub.key}>
              <summary>
                {sub.payload.bidder_name} (package v{sub.payload.package_version}) — my sheet:{' '}
                {mine
                  ? `${mine.payload.state}${mine.payload.package_version !== sub.payload.package_version || mine.payload.rubric_revision !== rubric.revision ? ', stale' : ''}`
                  : 'not started'}
              </summary>
              {assigned && (
                <ScoreSheet
                  key={`${sub.key}/${mine?.revision ?? 0}`}
                  sub={sub}
                  mine={mine}
                  criteria={rubric.payload.criteria}
                  rubricRevision={rubric.revision}
                  busy={busy}
                  send={send}
                  docs={state.files.filter(
                    (f) => f.submission_key === sub.key && f.purpose === 'received',
                  )}
                />
              )}
              {others.length > 0 && (
                <ul className="fine-print">
                  {others.map((s) => (
                    <li key={s.key}>
                      {short(s.payload.reviewer_id, state.user_id)}:{' '}
                      {s.payload.conflict === 'declared'
                        ? 'recused (declared conflict)'
                        : s.payload.scores
                            .map((x) => `${x.criterion} ${x.score ?? '—'}`)
                            .join(', ')}
                    </li>
                  ))}
                </ul>
              )}
            </details>
          )
        })}
    </Section>
  )
}

function ScoreSheet({
  sub,
  mine,
  criteria,
  rubricRevision,
  busy,
  send,
  docs,
}: {
  sub: Submission
  mine?: OwnerState['scores'][number]
  criteria: Criterion[]
  rubricRevision: number
  busy: boolean
  send: StepProps['send']
  docs: OwnerState['files']
}) {
  const [conflict, setConflict] = useState(mine?.payload.conflict ?? 'none')
  const [note, setNote] = useState(mine?.payload.conflict_note ?? '')
  const [rows, setRows] = useState(() =>
    Object.fromEntries(
      criteria.map((c) => {
        const found = mine?.payload.scores.find((s) => s.criterion === c.code)
        return [
          c.code,
          {
            score: found?.score?.toString() ?? '',
            rationale: found?.rationale ?? '',
            doc: found?.source?.document_id ?? '',
            loc: found?.source?.location ?? '',
          },
        ]
      }),
    ),
  )
  function save(stateValue: 'draft' | 'submitted') {
    void send(
      `/scores/${sub.key}`,
      {
        expected_revision: mine?.revision ?? 0,
        rubric_revision: rubricRevision,
        conflict,
        conflict_note: note,
        state: stateValue,
        scores:
          conflict === 'declared'
            ? []
            : criteria.map((c) => ({
                criterion: c.code,
                score: rows[c.code].score === '' ? null : Number(rows[c.code].score),
                rationale: rows[c.code].rationale,
                source: ref(rows[c.code].doc, rows[c.code].loc),
              })),
      },
      'PUT',
      stateValue === 'submitted' ? 'Score sheet submitted.' : 'Draft score sheet saved.',
    )
  }
  return (
    <fieldset disabled={busy}>
      <label>
        Conflict of interest
        <select
          value={conflict}
          onChange={(e) => setConflict(e.target.value as 'none' | 'declared')}
        >
          <option value="none">No conflict</option>
          <option value="declared">Declare conflict and recuse</option>
        </select>
      </label>
      {conflict === 'declared' && (
        <label>
          Conflict description
          <input value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      )}
      {conflict === 'none' && (
        <div className="table-scroll" tabIndex={0} role="group" aria-label="Scrollable table">
          <table className="owner-table">
            <thead>
              <tr>
                <th>Criterion</th>
                <th>Score</th>
                <th>Rationale (required to submit)</th>
                <th>Document</th>
                <th>Location</th>
              </tr>
            </thead>
            <tbody>
              {criteria.map((c) => {
                const r = rows[c.code]
                const set = (next: Partial<typeof r>) =>
                  setRows((current) => ({ ...current, [c.code]: { ...current[c.code], ...next } }))
                return (
                  <tr key={c.code}>
                    <th scope="row">
                      {c.code} — {c.name} (weight {c.weight}, {c.scale_min}–{c.scale_max},{' '}
                      {c.direction === 'higher_better' ? 'higher better' : 'lower better'}
                      {c.mandatory_gate ? `, gate ≥ ${c.pass_mark}` : ''})
                    </th>
                    <td>
                      <input
                        aria-label={`${c.code} score for ${sub.payload.bidder_name}`}
                        type="number"
                        min={c.scale_min}
                        max={c.scale_max}
                        value={r.score}
                        onChange={(e) => set({ score: e.target.value })}
                      />
                    </td>
                    <td>
                      <textarea
                        aria-label={`${c.code} rationale for ${sub.payload.bidder_name}`}
                        value={r.rationale}
                        onChange={(e) => set({ rationale: e.target.value })}
                      />
                    </td>
                    <td>
                      <select
                        aria-label={`${c.code} source document for ${sub.payload.bidder_name}`}
                        value={r.doc}
                        onChange={(e) => set({ doc: e.target.value })}
                      >
                        <option value="">None</option>
                        {docs.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.filename}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        aria-label={`${c.code} source location for ${sub.payload.bidder_name}`}
                        value={r.loc}
                        onChange={(e) => set({ loc: e.target.value })}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="owner-actions">
        <button type="button" className="button secondary" onClick={() => save('draft')}>
          Save draft
        </button>
        <button type="button" className="button primary" onClick={() => save('submitted')}>
          Submit sheet
        </button>
      </div>
    </fieldset>
  )
}

// ------------------------------------------------------------------ clarifications (O15)

function ClarificationStep({ state, busy, canPrepare, send }: StepProps) {
  const [form, setForm] = useState({ submission_key: '', question: '', due_date: '' })
  const bidder = (key: string | null) =>
    key
      ? (state.submissions.find((s) => s.key === key)?.payload.bidder_name ?? 'Unknown offer')
      : 'All offers (common addendum)'
  return (
    <Section title="Clarifications and addenda">
      <p className="fine-print">
        Nothing is sent automatically. Record each question, how it was sent, and the response
        received with its source. An open clarification keeps its offer out of ranking.
      </p>
      {state.clarifications.length === 0 && <p>No clarifications recorded.</p>}
      {state.clarifications.map((c) => (
        <ClarificationRow
          key={`${c.key}/${c.revision}`}
          entry={c}
          label={bidder(c.payload.submission_key)}
          busy={busy}
          canPrepare={canPrepare}
          send={send}
        />
      ))}
      {canPrepare && (
        <details>
          <summary>Record a new clarification</summary>
          <fieldset disabled={busy} className="owner-grid">
            <label>
              Target
              <select
                value={form.submission_key}
                onChange={(e) => {
                  const value = e.target
                  setForm((current) => ({ ...current, submission_key: value.value }))
                }}
              >
                <option value="">All offers (common addendum)</option>
                {state.submissions.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.payload.bidder_name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Due date
              <input
                type="date"
                value={form.due_date}
                onChange={(e) => {
                  const value = e.target
                  setForm((current) => ({ ...current, due_date: value.value }))
                }}
              />
            </label>
            <label className="wide">
              Question
              <textarea
                value={form.question}
                onChange={(e) => {
                  const value = e.target
                  setForm((current) => ({ ...current, question: value.value }))
                }}
              />
            </label>
            <button
              type="button"
              className="button primary"
              onClick={() =>
                void send(
                  `/clarifications/${uuid()}`,
                  {
                    expected_revision: 0,
                    submission_key: form.submission_key || null,
                    question: form.question,
                    due_date: form.due_date || null,
                    state: 'open',
                  },
                  'PUT',
                  'Clarification recorded as open.',
                )
              }
            >
              Record clarification
            </button>
          </fieldset>
        </details>
      )}
    </Section>
  )
}

function ClarificationRow({
  entry,
  label,
  busy,
  canPrepare,
  send,
}: {
  entry: OwnerState['clarifications'][number]
  label: string
  busy: boolean
  canPrepare: boolean
  send: StepProps['send']
}) {
  const p = entry.payload
  const [answer, setAnswer] = useState({
    response: p.response,
    received: p.response_received_at?.slice(0, 16) ?? '',
    source: p.response_source,
    state: p.state,
  })
  return (
    <details>
      <summary>
        [{p.state}] {label}: {p.question.slice(0, 90)}
        {p.due_date ? ` (due ${p.due_date})` : ''}
      </summary>
      <p>{p.question}</p>
      {canPrepare && (
        <fieldset disabled={busy} className="owner-grid">
          <label>
            State
            <select
              value={answer.state}
              onChange={(e) => {
                const value = e.target
                setAnswer((current) => ({ ...current, state: value.value as typeof p.state }))
              }}
            >
              <option value="open">Open</option>
              <option value="answered">Answered</option>
              <option value="closed">Closed</option>
            </select>
          </label>
          <label>
            Response received (UTC+08:00)
            <input
              type="datetime-local"
              value={answer.received}
              onChange={(e) => {
                const value = e.target
                setAnswer((current) => ({ ...current, received: value.value }))
              }}
            />
          </label>
          <label>
            Response source
            <input
              value={answer.source}
              onChange={(e) => {
                const value = e.target
                setAnswer((current) => ({ ...current, source: value.value }))
              }}
            />
          </label>
          <label className="wide">
            Response
            <textarea
              value={answer.response}
              onChange={(e) => {
                const value = e.target
                setAnswer((current) => ({ ...current, response: value.value }))
              }}
            />
          </label>
          <button
            type="button"
            className="button secondary"
            onClick={() =>
              void send(
                `/clarifications/${entry.key}`,
                {
                  expected_revision: entry.revision,
                  submission_key: p.submission_key,
                  question: p.question,
                  due_date: p.due_date,
                  state: answer.state,
                  response: answer.response,
                  response_received_at: answer.received ? `${answer.received}:00+08:00` : null,
                  response_source: answer.source,
                },
                'PUT',
                'Clarification updated.',
              )
            }
          >
            Save clarification
          </button>
        </fieldset>
      )}
    </details>
  )
}

// ------------------------------------------------------------------ evaluation and decision (O12/O13/K06/O16/O17)

type FileMeta = OwnerState['files'][number]
function DecisionMemo({
  memo,
  pack,
  canCreate,
  busy,
  error,
  download,
  onCreate,
}: {
  memo?: FileMeta
  pack?: FileMeta
  canCreate: boolean
  busy: boolean
  error: string
  download: (fileId: string, filename: string) => Promise<void>
  onCreate: (pack: FileMeta) => Promise<void>
}) {
  if (memo)
    return (
      <p>
        <button
          type="button"
          className="button text"
          onClick={() => void download(memo.id, memo.filename)}
        >
          Decision memorandum (PDF)
        </button>{' '}
        <span className="fine-print">
          Retained {memo.created_at.slice(0, 10)} · SHA-256 {memo.sha256.slice(0, 12)}… · rendered
          from the retained pack
        </span>
      </p>
    )
  if (!pack) return null
  return (
    <div>
      <p className="fine-print">
        The readable memorandum is rendered from the retained decision pack after its integrity
        check, then retained. It adds no new judgement.
      </p>
      {canCreate ? (
        <button
          type="button"
          className="button secondary"
          disabled={busy}
          onClick={() => void onCreate(pack)}
        >
          {busy ? 'Creating memorandum…' : 'Create retained decision memorandum (PDF)'}
        </button>
      ) : (
        <p className="fine-print">A reviewer or approver can create the memorandum.</p>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  )
}

function DecisionStep({
  state,
  evaluation,
  busy,
  canPrepare,
  canApprove,
  send,
  base,
  token,
  download,
  refresh,
}: StepProps) {
  const [memoBusy, setMemoBusy] = useState(false)
  const [memoError, setMemoError] = useState('')
  const [whatIf, setWhatIf] = useState<Record<string, string>>({})
  const [whatIfResult, setWhatIfResult] = useState<Evaluation | null>(null)
  const [whatIfError, setWhatIfError] = useState('')
  const [recommend, setRecommend] = useState('')
  const [rationale, setRationale] = useState('')
  const [exception, setException] = useState('')
  const [reason, setReason] = useState('')
  const decision = state.decision
  if (!evaluation)
    return (
      <Section title="Evaluation">
        <p role="status">Loading evaluation…</p>
      </Section>
    )
  const criteria = state.rubric?.payload.criteria ?? []
  async function runWhatIf() {
    setWhatIfError('')
    try {
      setWhatIfResult(
        await request(`${base}/evaluation/what-if`, evaluationSchema, token, {
          method: 'POST',
          body: JSON.stringify({
            weights: Object.fromEntries(criteria.map((c) => [c.code, whatIf[c.code] ?? c.weight])),
          }),
        }),
      )
    } catch (reason) {
      setWhatIfError(reason instanceof Error ? reason.message : String(reason))
    }
  }
  const counts = evaluation.results.reduce<Record<string, number>>(
    (acc, r) => ({ ...acc, [r.readiness]: (acc[r.readiness] ?? 0) + 1 }),
    {},
  )
  return (
    <Section title="Evaluation and decision">
      <div className={evaluation.official ? 'notice' : 'notice error'} role="status">
        <strong>
          {evaluation.official
            ? 'Official evaluation (locked rubric)'
            : 'Not official: the rubric is not locked'}
        </strong>
        <p>
          {Object.entries(counts)
            .map(([k, v]) => `${READINESS_LABEL[k as keyof typeof READINESS_LABEL]}: ${v}`)
            .join(' · ') || 'No offers'}
          . Input hash {evaluation.hash.slice(0, 16)}…
        </p>
        <p className="fine-print">{evaluation.rule}</p>
      </div>
      <ResultTable evaluation={evaluation} />
      {criteria.length > 0 && (
        <details>
          <summary>What-if weights (sensitivity, never official)</summary>
          <div className="owner-grid">
            {criteria.map((c) => (
              <label key={c.code}>
                {c.code} weight
                <input
                  inputMode="decimal"
                  value={whatIf[c.code] ?? c.weight}
                  onChange={(e) => {
                    const value = e.target
                    setWhatIf((current) => ({ ...current, [c.code]: value.value }))
                  }}
                />
              </label>
            ))}
          </div>
          <button type="button" className="button secondary" onClick={() => void runWhatIf()}>
            Run what-if
          </button>
          {whatIfError && <p role="alert">{whatIfError}</p>}
          {whatIfResult && (
            <>
              <p className="notice error">{whatIfResult.label}</p>
              <ResultTable evaluation={whatIfResult} />
            </>
          )}
        </details>
      )}
      <h4>Recommendation and signoff (O16)</h4>
      {decision ? (
        <div className="notice">
          <p>
            <strong>State: {decision.payload.state}</strong> — recommends{' '}
            {state.submissions.find((s) => s.key === decision.payload.recommended_submission)
              ?.payload.bidder_name ?? decision.payload.recommended_submission}
          </p>
          <p>Rationale: {decision.payload.rationale}</p>
          {decision.payload.exception_reason && (
            <p>Recorded exception: {decision.payload.exception_reason}</p>
          )}
          {decision.payload.decision_reason && (
            <p>Approver reason: {decision.payload.decision_reason}</p>
          )}
          {decision.payload.evaluation_hash !== evaluation.hash &&
            decision.payload.state === 'submitted' && (
              <p role="alert">
                Inputs changed after submission. Approval is blocked; return it for re-review.
              </p>
            )}
          <ol className="fine-print">
            {decision.payload.history.map((h, i) => (
              <li key={i}>
                {h.at.slice(0, 16).replace('T', ' ')} UTC — {h.action} by{' '}
                {short(h.by, state.user_id)}
                {h.reason ? `: ${h.reason}` : ''}
              </li>
            ))}
          </ol>
          {decision.payload.pack && (
            <div className="owner-pack">
              <p>Retained decision pack:</p>
              <ul>
                {decision.payload.pack.map((f) => (
                  <li key={f.id}>
                    <button
                      type="button"
                      className="button text"
                      onClick={() => void download(f.id, f.filename)}
                    >
                      {f.filename}
                    </button>{' '}
                    <span className="fine-print">SHA-256 {f.sha256.slice(0, 12)}…</span>
                  </li>
                ))}
              </ul>
              <DecisionMemo
                memo={state.files.find(
                  (f) => f.purpose === 'decision_memo' && f.package_version === decision.revision,
                )}
                pack={decision.payload.pack.find((f) => f.filename === 'decision-pack.json')}
                canCreate={canPrepare || canApprove}
                busy={memoBusy}
                error={memoError}
                download={download}
                onCreate={async (packFile) => {
                  setMemoBusy(true)
                  setMemoError('')
                  try {
                    const { retainDecisionMemo } = await import('../services/decision-memo')
                    await retainDecisionMemo(base, token, packFile.id, packFile.sha256)
                    refresh('Decision memorandum retained.')
                  } catch (reason) {
                    setMemoError(reason instanceof Error ? reason.message : String(reason))
                  } finally {
                    setMemoBusy(false)
                  }
                }}
              />
            </div>
          )}
        </div>
      ) : (
        <p>No recommendation recorded.</p>
      )}
      {canPrepare && (!decision || decision.payload.state === 'returned') && (
        <fieldset disabled={busy || !evaluation.official} className="owner-grid">
          <legend>Submit a recommendation for approval</legend>
          <label>
            Recommended offer
            <select value={recommend} onChange={(e) => setRecommend(e.target.value)}>
              <option value="">Choose…</option>
              {evaluation.results
                .filter((r) => r.readiness !== 'withdrawn')
                .map((r) => (
                  <option key={r.submission_key} value={r.submission_key}>
                    {r.bidder_name}{' '}
                    {r.rank ? `(rank ${r.rank}${r.tie ? ', tied' : ''})` : '(not ranked)'}
                  </option>
                ))}
            </select>
          </label>
          <label className="wide">
            Rationale
            <textarea value={rationale} onChange={(e) => setRationale(e.target.value)} />
          </label>
          <label className="wide">
            Exception reason (required unless the offer is ranked first)
            <textarea value={exception} onChange={(e) => setException(e.target.value)} />
          </label>
          <button
            type="button"
            className="button primary"
            onClick={() =>
              void send(
                '/decision',
                {
                  expected_revision: decision?.revision ?? 0,
                  evaluation_hash: evaluation.hash,
                  recommended_submission: recommend,
                  rationale,
                  exception_reason: exception,
                },
                'POST',
                'Recommendation submitted for approval.',
              )
            }
          >
            Submit for approval
          </button>
        </fieldset>
      )}
      {canApprove && decision?.payload.state === 'submitted' && (
        <fieldset disabled={busy} className="owner-grid">
          <legend>Approver decision</legend>
          <p className="fine-print wide">
            Self-approval is {state.basis?.payload.self_approval}. Approving retains a decision pack
            (JSON snapshot with source manifest plus CSV appendix).
          </p>
          <label className="wide">
            Reason (required)
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <div className="owner-actions">
            {(['approve', 'return', 'reject'] as const).map((action) => (
              <button
                key={action}
                type="button"
                className={`button ${action === 'approve' ? 'primary' : 'secondary'}`}
                onClick={() =>
                  void send(
                    '/decision/action',
                    {
                      expected_revision: decision.revision,
                      evaluation_hash: evaluation.hash,
                      action,
                      reason,
                    },
                    'POST',
                    `Recommendation ${action === 'approve' ? 'approved; decision pack retained' : action === 'return' ? 'returned for changes' : 'rejected'}.`,
                  )
                }
              >
                {action === 'approve'
                  ? 'Approve'
                  : action === 'return'
                    ? 'Return for changes'
                    : 'Reject'}
              </button>
            ))}
          </div>
        </fieldset>
      )}
    </Section>
  )
}

function ResultTable({ evaluation }: { evaluation: Evaluation }) {
  return (
    <div className="table-scroll" tabIndex={0} role="group" aria-label="Scrollable table">
      <table className="owner-table">
        <caption className="sr-only">Offer comparison</caption>
        <thead>
          <tr>
            <th>Offer</th>
            <th>Readiness</th>
            <th>Weighted score</th>
            <th>Rank</th>
            <th>Reasons</th>
            <th>Quoted total</th>
            <th>Adjustments</th>
            <th>Comparison total</th>
            <th>Budget gap</th>
            <th>Lifecycle (undiscounted)</th>
          </tr>
        </thead>
        <tbody>
          {evaluation.results.map((r) => (
            <tr key={r.submission_key}>
              <th scope="row">
                {r.bidder_name}
                {r.document_only ? ' (document only)' : ''}
              </th>
              <td>
                <span className={`owner-badge ${r.readiness}`}>{READINESS_LABEL[r.readiness]}</span>
              </td>
              <td>
                {r.weighted_score ??
                  (r.missing_scores?.length ? `Missing: ${r.missing_scores.join(', ')}` : '—')}
                {r.criteria?.some((c) => c.substituted_minimum) && ' (minimum substituted)'}
              </td>
              <td>
                {r.rank ? `${r.rank}${r.tie ? ' (tie — human decision)' : ''}` : 'Not ranked'}
              </td>
              <td>
                {r.reasons.length ? (
                  <ul className="fine-print">
                    {r.reasons.slice(0, 8).map((x, i) => (
                      <li key={i}>{x}</li>
                    ))}
                    {r.reasons.length > 8 && <li>…{r.reasons.length - 8} more</li>}
                  </ul>
                ) : (
                  'None'
                )}
              </td>
              <td>{money(r.quoted_total)}</td>
              <td>
                {r.adjustments_total && r.adjustments_total !== '0.00'
                  ? money(r.adjustments_total)
                  : '—'}
              </td>
              <td>{money(r.comparison_total)}</td>
              <td>{money(r.budget_gap)}</td>
              <td>{money(r.lifecycle_undiscounted)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ------------------------------------------------------------------ dashboard (O18)

export function OwnerReviewDashboard({
  organisationId,
  token,
}: {
  organisationId: string
  token: string
}) {
  const [data, setData] = useState<z.infer<typeof dashboardSchema> | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    request(
      `/api/v1/organisations/${organisationId}/owner-review/dashboard`,
      dashboardSchema,
      token,
    )
      .then((value) => active && setData(value))
      .catch(
        (reason: unknown) =>
          active && setError(reason instanceof Error ? reason.message : String(reason)),
      )
    return () => {
      active = false
    }
  }, [organisationId, token])
  if (error) return <p role="alert">Review dashboard unavailable: {error}</p>
  if (!data) return <p role="status">Loading review dashboard…</p>
  return (
    <section className="paper owner-review" aria-label="Owner review dashboard">
      <h2>Owner review dashboard</h2>
      <p className="fine-print">
        Computed {data.computed_at.slice(0, 19).replace('T', ' ')} UTC from confirmed records you
        can access.
        {data.withheld_projects
          ? ` ${data.withheld_projects} project(s) withheld by your grants.`
          : ''}
      </p>
      {data.projects.length === 0 ? (
        <p>No owner-decision projects with review access yet.</p>
      ) : (
        <div className="table-scroll" tabIndex={0} role="group" aria-label="Scrollable table">
          <table className="owner-table">
            <thead>
              <tr>
                <th>Project</th>
                <th>Offers</th>
                <th>Comparable</th>
                <th>Needs clarification</th>
                <th>Unpriced</th>
                <th>Ineligible</th>
                <th>Budget</th>
                <th>Comparison range</th>
                <th>Score sheets</th>
                <th>Rubric</th>
                <th>Decision</th>
              </tr>
            </thead>
            <tbody>
              {data.projects.map((p) => (
                <tr key={p.project_id}>
                  <th scope="row">{p.name}</th>
                  <td>
                    {p.submissions}
                    {p.document_only ? ` (${p.document_only} document only)` : ''}
                  </td>
                  <td>{p.comparable}</td>
                  <td>{p.needs_clarification}</td>
                  <td>{p.unpriced}</td>
                  <td>{p.ineligible}</td>
                  <td>{money(p.budget)}</td>
                  <td>
                    {p.lowest_comparison_total
                      ? `${money(p.lowest_comparison_total)} – ${money(p.highest_comparison_total)} (${p.priced_offers} priced)`
                      : '—'}
                  </td>
                  <td>
                    {p.reviewer_sheets_submitted} / {p.reviewer_sheets_expected}
                  </td>
                  <td>{p.rubric_locked ? 'Locked' : 'Draft / none'}</td>
                  <td>
                    {p.decision_state}
                    {p.approval_waiting_days != null
                      ? ` (${p.approval_waiting_days} d waiting)`
                      : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <details>
        <summary>Metric definitions</summary>
        <dl>
          {Object.entries(data.definitions).map(([k, v]) => (
            <div key={k}>
              <dt>{k.replaceAll('_', ' ')}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </details>
    </section>
  )
}
