import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, FileText, Mail, Medal, Ruler, Send } from 'lucide-react'
import { designSnapshotSchema, siteSummary, type DesignSnapshot } from '../domain/design-preview'
import type { Evaluation, OwnerState } from '../domain/owner-review'
import { ringgit } from '../services/money'
import DesignPlan from './DesignPlan'
import './proposal-overview.css'

const baseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')
type Result = Evaluation['results'][number]
type Step = 'Basis' | 'Rubric' | 'Offers' | 'Scores' | 'Clarifications' | 'Evaluation & decision'

const PLAIN: Record<Result['readiness'], string> = {
  comparable: 'Ready to compare',
  needs_clarification: 'Needs answers before it can be ranked',
  unpriced: 'Missing prices, so it cannot be ranked',
  ineligible: 'Fails a must-have requirement',
  withdrawn: 'Withdrawn by the bidder',
}

function ordinal(rank: number) {
  return `${rank}${rank === 1 ? 'st' : rank === 2 ? 'nd' : rank === 3 ? 'rd' : 'th'}`
}

function budgetText(gap?: string | null) {
  if (gap == null) return null
  const value = Number(gap)
  if (value === 0) return 'Exactly on budget'
  return value < 0 ? `${ringgit(-value)} under budget` : `${ringgit(value)} over budget`
}

/** Loads the native design file (JSON) attached to each proposal, if any. */
function useDesignFiles(state: OwnerState, base: string, token: string) {
  const [designs, setDesigns] = useState<Record<string, DesignSnapshot | null>>({})
  const files = useMemo(
    () =>
      state.files.filter(
        (file) =>
          file.purpose === 'received' &&
          file.content_type === 'application/json' &&
          file.submission_key,
      ),
    [state.files],
  )
  useEffect(() => {
    let active = true
    Promise.all(
      files.map(async (file) => {
        try {
          const response = await fetch(`${baseUrl}${base}/files/${file.id}`, {
            headers: { Authorization: `Bearer ${token}` },
          })
          if (!response.ok) return [file.submission_key!, null] as const
          const parsed = designSnapshotSchema.safeParse(await response.json())
          return [file.submission_key!, parsed.success ? parsed.data : null] as const
        } catch {
          return [file.submission_key!, null] as const
        }
      }),
    ).then((entries) => active && setDesigns(Object.fromEntries(entries)))
    return () => {
      active = false
    }
  }, [files, base, token])
  return designs
}

export default function ProposalOverview({
  state,
  evaluation,
  base,
  token,
  onGo,
}: {
  state: OwnerState
  evaluation: Evaluation | null
  base: string
  token: string
  onGo: (step: Step) => void
}) {
  const designs = useDesignFiles(state, base, token)
  // In the order received, so the cards and table columns stay stable across visits.
  const offers = state.submissions
    .filter((s) => !s.payload.withdrawn)
    .sort((a, b) => a.payload.received_at.localeCompare(b.payload.received_at))
  const [focus, setFocus] = useState<string | null>(null)
  const results = new Map((evaluation?.results ?? []).map((r) => [r.submission_key, r]))
  const basis = state.basis?.payload
  const scope = basis?.scope_items ?? []
  const focused = focus ?? offers[0]?.key ?? null
  const focusDesign = focused ? designs[focused] : null

  if (!offers.length)
    return (
      <section className="proposal-overview" aria-label="Overview of proposals">
        <div className="overview-empty">
          <h3>No proposals recorded yet</h3>
          <p>
            Start by writing down what you are buying (step 1, Basis) and how you will score it
            (step 2, Rubric). Then record each proposal you receive in step 3, Offers. They will
            appear here side by side.
          </p>
          <button type="button" className="button primary" onClick={() => onGo('Basis')}>
            Go to step 1: Basis
          </button>
        </div>
      </section>
    )

  const facts = (key: string) => {
    const fields = offers.find((o) => o.key === key)?.payload.fields ?? {}
    const value = (name: string) => {
      const field = fields[name]
      if (!field || field.state === 'unconfirmed') return 'Not confirmed yet'
      if (field.state === 'not_provided') return 'Not offered'
      return String(field.value ?? '')
    }
    return {
      programme: value('duration_days'),
      warranty: value('warranty'),
      maintenance: value('annual_maintenance'),
    }
  }
  const lineFor = (key: string, code: string) =>
    offers.find((o) => o.key === key)?.payload.lines.filter((line) => line.scope_code === code)
  const summaries = offers.map((offer) => {
    const design = designs[offer.key]
    return design ? siteSummary(design.preview) : null
  })

  return (
    <section className="proposal-overview" aria-label="Overview of proposals">
      <header className="overview-head">
        <div>
          <span className="eyebrow">This review</span>
          <h3>{basis?.title ?? 'Proposals for this project'}</h3>
          <p>
            You are looking at <strong>one project</strong> with{' '}
            <strong>
              {offers.length} proposal{offers.length === 1 ? '' : 's'}
            </strong>{' '}
            from different contractors. Each card below is one proposal: its site plan, price and
            what it includes.
            {basis?.budget ? ` Your budget is ${ringgit(basis.budget)}.` : ''}
          </p>
        </div>
      </header>

      <div className="overview-cards">
        {offers.map((offer) => {
          const result = results.get(offer.key)
          const design = designs[offer.key]
          const info = facts(offer.key)
          const emailed = offer.payload.channel === 'external_document'
          const missing = (result?.missing_scope ?? []).map(
            (code) => scope.find((item) => item.code === code)?.description ?? code,
          )
          return (
            <article
              key={offer.key}
              className={`overview-card ${result?.rank === 1 ? 'is-first' : ''}`}
              aria-label={`Proposal from ${offer.payload.bidder_name}`}
            >
              <header>
                <span className={`overview-rank ${result?.rank ? '' : 'is-unranked'}`}>
                  {result?.rank ? (
                    <>
                      <Medal size={14} aria-hidden="true" /> Ranked {ordinal(result.rank)}
                      {result.tie ? ' (tie)' : ''}
                    </>
                  ) : (
                    'Not ranked'
                  )}
                </span>
                <h4>{offer.payload.bidder_name}</h4>
                <span className="overview-channel">
                  {emailed ? (
                    <Mail size={13} aria-hidden="true" />
                  ) : (
                    <Send size={13} aria-hidden="true" />
                  )}
                  {emailed
                    ? `Emailed documents${offer.payload.supplier_registered ? '' : ' · no InfraShader account'}`
                    : 'Sent through InfraShader'}
                </span>
              </header>
              <button
                type="button"
                className="overview-plan"
                onClick={() => setFocus(offer.key)}
                aria-label={`Show the site plan of ${offer.payload.bidder_name} larger`}
              >
                {design ? (
                  <DesignPlan
                    preview={design.preview}
                    title={`${offer.payload.bidder_name} site plan`}
                    compact
                  />
                ) : (
                  <span className="overview-no-plan">
                    <FileText size={20} aria-hidden="true" />
                    No site design file attached. Read the plan in the offer documents.
                  </span>
                )}
              </button>
              {design && <p className="overview-design-title">{design.design_title}</p>}
              <div className="overview-price">
                <strong>{ringgit(result?.comparison_total ?? result?.quoted_total)}</strong>
                <span>{budgetText(result?.budget_gap) ?? 'Price not confirmed yet'}</span>
              </div>
              <p className={`overview-readiness is-${result?.readiness ?? 'needs_clarification'}`}>
                {result?.readiness === 'comparable' ? (
                  <CheckCircle2 size={15} aria-hidden="true" />
                ) : (
                  <AlertTriangle size={15} aria-hidden="true" />
                )}
                <span>
                  {result ? PLAIN[result.readiness] : 'Not evaluated yet'}
                  {missing.length > 0 && <small>Not included: {missing.join(', ')}</small>}
                </span>
              </p>
              {result?.weighted_score && (
                <div
                  className="overview-score"
                  aria-label={`Weighted score ${result.weighted_score} out of 100`}
                >
                  <span>Score {result.weighted_score} / 100</span>
                  <i aria-hidden="true">
                    <b style={{ width: `${Math.min(100, Number(result.weighted_score))}%` }} />
                  </i>
                </div>
              )}
              <dl className="overview-facts">
                <div>
                  <dt>Programme</dt>
                  <dd>
                    {/^\d+$/.test(info.programme) ? `${info.programme} days` : info.programme}
                  </dd>
                </div>
                <div>
                  <dt>Warranty</dt>
                  <dd>{info.warranty}</dd>
                </div>
                <div>
                  <dt>Maintenance a year</dt>
                  <dd>
                    {/^\d/.test(info.maintenance) ? ringgit(info.maintenance) : info.maintenance}
                  </dd>
                </div>
              </dl>
              <div className="overview-actions">
                <button
                  type="button"
                  className="button secondary compact"
                  onClick={() => onGo('Offers')}
                >
                  Documents and prices
                </button>
                <button
                  type="button"
                  className="button text compact"
                  onClick={() => onGo('Scores')}
                >
                  Scores
                </button>
              </div>
            </article>
          )
        })}
      </div>

      {focused && (
        <section className="overview-focus" aria-label="Site plan, larger view">
          <header>
            <h4>
              <Ruler size={16} aria-hidden="true" /> Look closer at a site plan
            </h4>
            <div className="segmented" role="group" aria-label="Choose a proposal to show">
              {offers.map((offer) => (
                <button
                  key={offer.key}
                  type="button"
                  className={offer.key === focused ? 'selected' : ''}
                  aria-pressed={offer.key === focused}
                  onClick={() => setFocus(offer.key)}
                >
                  {offer.payload.bidder_name}
                </button>
              ))}
            </div>
          </header>
          {focusDesign ? (
            <div className="overview-focus-body">
              <DesignPlan preview={focusDesign.preview} title={`${focusDesign.bidder} site plan`} />
              <div>
                <h5>{focusDesign.design_title}</h5>
                <p>{focusDesign.summary}</p>
                <p className="fine-print">
                  Drawn from the design file the bidder attached ({focusDesign.preview.option_name}
                  ). Hover over any shape to see its name and size. {focusDesign.notice}
                </p>
              </div>
            </div>
          ) : (
            <p className="fine-print">This proposal has no design file; use its PDF documents.</p>
          )}
        </section>
      )}

      {summaries.some(Boolean) && (
        <section className="overview-table-block" aria-label="What each proposal puts on the site">
          <h4>What each proposal puts on the site</h4>
          <p className="fine-print">
            Counted from each attached design file. Higher is not always better: compare against
            your brief.
          </p>
          <div className="table-scroll">
            <table className="owner-table overview-table">
              <thead>
                <tr>
                  <th scope="col">On site</th>
                  {offers.map((offer) => (
                    <th scope="col" key={offer.key}>
                      {offer.payload.bidder_name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(summaries.find(Boolean) ?? []).map((row, index) => (
                  <tr key={row.label}>
                    <th scope="row">{row.label}</th>
                    {summaries.map((summary, column) => (
                      <td key={offers[column].key}>
                        {summary
                          ? summary[index].value
                            ? `${summary[index].value.toLocaleString('en-MY')}${row.unit ? ` ${row.unit}` : ''}`
                            : 'None'
                          : '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="overview-table-block" aria-label="Prices side by side">
        <h4>Prices side by side</h4>
        <p className="fine-print">
          Each row is one item from your common scope (step 1). Amounts are the confirmed figures
          from each proposal’s documents. “Not included” means the bidder left it out, so that
          proposal cannot be ranked until it is priced.
        </p>
        <div className="table-scroll">
          <table className="owner-table overview-table">
            <thead>
              <tr>
                <th scope="col">Scope item</th>
                {offers.map((offer) => (
                  <th scope="col" key={offer.key}>
                    {offer.payload.bidder_name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {scope.map((item) => (
                <tr key={item.code}>
                  <th scope="row">
                    <span className="overview-code">{item.code}</span> {item.description}
                  </th>
                  {offers.map((offer) => {
                    const rows = lineFor(offer.key, item.code) ?? []
                    const included = rows.filter((r) =>
                      ['included', 'provisional'].includes(r.state),
                    )
                    const amount = included.reduce(
                      (total, r) => total + Number(r.original_amount ?? 0),
                      0,
                    )
                    return (
                      <td key={offer.key} className={included.length ? '' : 'is-missing'}>
                        {included.length
                          ? ringgit(amount)
                          : rows.length
                            ? 'Not included'
                            : 'Not recorded'}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Total</th>
                {offers.map((offer) => (
                  <td key={offer.key}>
                    <strong>{ringgit(results.get(offer.key)?.comparison_total)}</strong>
                  </td>
                ))}
              </tr>
              <tr>
                <th scope="row">Against budget</th>
                {offers.map((offer) => (
                  <td key={offer.key}>{budgetText(results.get(offer.key)?.budget_gap) ?? '—'}</td>
                ))}
              </tr>
              {basis?.evaluation_horizon_years && (
                <tr>
                  <th scope="row">
                    Price plus {basis.evaluation_horizon_years} years of maintenance
                  </th>
                  {offers.map((offer) => (
                    <td key={offer.key}>
                      {results.get(offer.key)?.lifecycle_undiscounted
                        ? ringgit(results.get(offer.key)?.lifecycle_undiscounted)
                        : 'Maintenance not priced'}
                    </td>
                  ))}
                </tr>
              )}
            </tfoot>
          </table>
        </div>
      </section>

      <details className="overview-glossary">
        <summary>What do these words mean?</summary>
        <dl>
          <dt>Proposal (offer)</dt>
          <dd>What one contractor sent you: their price, design and terms.</dd>
          <dt>Basis</dt>
          <dd>
            Your own list of what you are buying, so every proposal is priced against the same
            items.
          </dd>
          <dt>Rubric</dt>
          <dd>
            The scoring rules (criteria and weights), fixed before scoring so nobody can tilt the
            result.
          </dd>
          <dt>Score out of 100</dt>
          <dd>
            Each criterion’s score multiplied by its weight and added up. Only complete, confirmed
            proposals are ranked.
          </dd>
          <dt>Not ranked</dt>
          <dd>
            The proposal is missing a price, needs an answer or fails a must-have. It is shown but
            not placed.
          </dd>
          <dt>Clarification</dt>
          <dd>A recorded question to a bidder and their answer.</dd>
          <dt>Recommendation and approval</dt>
          <dd>
            One person recommends a proposal with reasons; an approver accepts, returns or rejects
            it.
          </dd>
        </dl>
      </details>
    </section>
  )
}
