import type { Feature } from 'geojson'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import type { Project } from '../domain/projects'
import type { ScenarioKey, WorkspaceData } from '../domain/workspace'
import {
  artifactListSchema,
  artifactSchema,
  rateListSchema,
  rateSchema,
  snapshotSchema,
  type Snapshot,
  type Artifact,
  type Rate,
} from '../domain/calculations'
import { request } from '../services/api'
import { Button } from './ui/button'
import ReviewPanel from './ReviewPanel'
import { settingsSchema } from '../domain/settings'
import CatalogueBrowser from './CatalogueBrowser'
import OutputPreview from './OutputPreview'

const chargeCategories = ['labour', 'transport', 'overhead', 'fixed'] as const
type ChargeDraft = {
  category: (typeof chargeCategories)[number]
  amount: string
  source_note: string
}

type Props = {
  project: Project
  token: string | undefined
  data: WorkspaceData
  revision: number
  dirty: boolean
  scenario: ScenarioKey
  onInspect: (scenario: ScenarioKey, itemId: string) => void
  onReviewDirty: (dirty: boolean) => void
  onData: (data: WorkspaceData) => void
  onShowShadows: (features: Feature[], revision: number) => void
}
export default function CalculationsPanel({
  project,
  token,
  data,
  revision,
  dirty,
  scenario,
  onData,
  onShowShadows,
  onReviewDirty,
  onInspect,
}: Props) {
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<Snapshot | null>(null)
  const [rates, setRates] = useState<Rate[]>([])
  const [catalogueRevision, setCatalogueRevision] = useState(0)
  const rateForm = useRef<HTMLFormElement>(null)
  const mergeRates = useCallback((incoming: Rate[]) => {
    setRates((previous) => [
      ...new Map([...previous, ...incoming].map((rate) => [rate.id, rate])).values(),
    ])
  }, [])
  useEffect(() => {
    let active = true
    const ids = [
      ...new Set(
        Object.values(data.scenarios).flatMap((value) =>
          value.items.flatMap((item) => (item.rate_id ? [item.rate_id] : [])),
        ),
      ),
    ]
    Promise.all(
      ids.map((id) =>
        request(`/api/v1/organisations/${project.organisation_id}/rates/${id}`, rateSchema, token),
      ),
    )
      .then((result) => {
        if (active) mergeRates(result)
      })
      .catch((reason) => {
        if (active)
          setError(reason instanceof Error ? reason.message : 'Assigned rate unavailable.')
      })
    return () => {
      active = false
    }
  }, [data, project.organisation_id, token, mergeRates])
  function reviseRate(rate: Rate) {
    const form = rateForm.current
    if (!form) return
    for (const key of [
      'code',
      'category',
      'description',
      'unit',
      'amount',
      'effective_date',
      'source_note',
    ] as const) {
      const input = form.elements.namedItem(key) as HTMLInputElement | HTMLSelectElement
      input.value = String(rate[key] ?? '')
    }
    form.querySelectorAll<HTMLInputElement>('input[name="includes"]').forEach((input) => {
      input.checked = rate.includes.includes(input.value)
    })
    const details = form.closest('details')
    if (details) details.open = true
    form.scrollIntoView({ block: 'center' })
    ;(form.elements.namedItem('amount') as HTMLInputElement).focus()
  }
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const [busy, setBusy] = useState(false)
  const [timestamp, setTimestamp] = useState(new Date().toISOString())
  const [timeMode, setTimeMode] = useState('offset')
  const [localTime, setLocalTime] = useState('')
  const [target, setTarget] = useState('')
  const [method, setMethod] = useState('markup')
  const [percent, setPercent] = useState('0')
  const percentEdited = useRef(false)
  useEffect(() => {
    let active = true
    request(`/api/v1/organisations/${project.organisation_id}/settings`, settingsSchema, token)
      .then((value) => {
        if (active && !percentEdited.current) setPercent(value.settings.default_markup)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [project.organisation_id, token])
  const [wastage, setWastage] = useState('0')
  const [fixedPrice, setFixedPrice] = useState('')
  const [charges, setCharges] = useState<ChargeDraft[]>([])
  const [estimateId, setEstimateId] = useState('')
  const [criteria, setCriteria] = useState('')
  const [notes, setNotes] = useState('')
  const [assumptions, setAssumptions] = useState('')
  const [exclusions, setExclusions] = useState('')
  const pendingIssue = useRef<{ fingerprint: string; key: string } | null>(null)
  const orgEndpoint = `/api/v1/organisations/${project.organisation_id}`
  const endpoint = `${orgEndpoint}/projects/${project.id}`
  const developer = project.purpose === 'developer_decision'
  const load = useCallback(async () => {
    const [catalogue, records] = await Promise.all([
      request(`${orgEndpoint}/rates`, rateListSchema, token),
      request(`${endpoint}/artifacts`, artifactListSchema, token),
    ])
    mergeRates(catalogue.items)
    setArtifacts(records.items)
  }, [orgEndpoint, endpoint, token, mergeRates])
  useEffect(() => {
    let active = true
    Promise.all([
      request(`${orgEndpoint}/rates`, rateListSchema, token),
      request(`${endpoint}/artifacts`, artifactListSchema, token),
    ])
      .then(([catalogue, records]) => {
        if (active) {
          mergeRates(catalogue.items)
          setArtifacts(records.items)
        }
      })
      .catch((reason) => {
        if (active)
          setError(reason instanceof Error ? reason.message : 'Could not load calculations.')
      })
    return () => {
      active = false
    }
  }, [orgEndpoint, endpoint, token, revision, mergeRates])
  async function perform(action: () => Promise<unknown>) {
    setBusy(true)
    setError('')
    try {
      await action()
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Action failed. Review and retry.')
    } finally {
      setBusy(false)
    }
  }
  async function createRate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const values = new FormData(form)
    await perform(async () => {
      const created = await request(`${orgEndpoint}/rates`, rateSchema, token, {
        method: 'POST',
        body: JSON.stringify({
          code: values.get('code'),
          category: values.get('category'),
          description: values.get('description'),
          unit: values.get('unit'),
          currency: 'MYR',
          basis: developer ? 'indicative_budget' : 'cost',
          amount: values.get('amount'),
          effective_date: values.get('effective_date'),
          source_note: values.get('source_note'),
          includes: values.getAll('includes'),
        }),
      })
      mergeRates([created])
      setCatalogueRevision((value) => value + 1)
      form.reset()
    })
  }
  function calculate(kind: 'analyses' | 'estimates') {
    const body =
      kind === 'analyses'
        ? {
            expected_revision: revision,
            request_key: crypto.randomUUID(),
            ...(timeMode === 'local' ? { local_timestamp: localTime } : { timestamp }),
            target_id: target || data.targets[0]?.id,
          }
        : {
            expected_revision: revision,
            request_key: crypto.randomUUID(),
            scenario,
            method: developer ? 'indicative' : method,
            percent: developer || method === 'fixed_selling' ? '0' : percent,
            wastage_percent: wastage,
            fixed_selling: !developer && method === 'fixed_selling' ? fixedPrice : null,
            charges,
          }
    void perform(() =>
      request(`${endpoint}/${kind}`, artifactSchema, token, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    )
  }
  function issue(draft = false) {
    if (scenario === 'baseline') {
      setError('Select Option A or B before issuing.')
      return
    }
    if (
      !draft &&
      !window.confirm(
        `Issue an immutable ${developer ? 'developer decision brief' : 'contractor client proposal'} from the saved inputs?`,
      )
    )
      return
    const body = {
      estimate_id: estimateId,
      expected_project_revision: project.revision,
      preferred_option: scenario,
      criteria: criteria
        .split('\n')
        .map((text) => text.trim())
        .filter(Boolean),
      review_notes: notes,
      assumptions,
      exclusions,
      confirmed: true,
    }
    const fingerprint = JSON.stringify(body)
    if (draft) {
      void perform(async () => {
        const snapshot = await request(
          `${endpoint}/output-preview?kind=${developer ? 'developer_brief' : 'proposal'}`,
          snapshotSchema,
          token,
          {
            method: 'POST',
            body: JSON.stringify({ ...body, request_key: crypto.randomUUID() }),
          },
        )
        setPreview(snapshot)
      })
      return
    }
    if (!pendingIssue.current || pendingIssue.current.fingerprint !== fingerprint)
      pendingIssue.current = { fingerprint, key: crypto.randomUUID() }
    const requestKey = pendingIssue.current.key
    void perform(async () => {
      await request(
        `${endpoint}/${developer ? 'developer-briefs' : 'proposals'}`,
        artifactSchema,
        token,
        { method: 'POST', body: JSON.stringify({ ...body, request_key: requestKey }) },
      )
      pendingIssue.current = null
    })
  }
  const blocked = busy || dirty || !revision || project.archived
  return (
    <section
      className="mt-8 border-t border-stone-300 pt-6"
      aria-label="Saved calculations and outputs"
    >
      <h2>Analyze, price and review saved scope</h2>
      <p>
        {dirty
          ? 'Save the workspace before calculating or issuing. Existing results may be stale.'
          : 'Calculations use saved backend revisions. Numerical shade claims remain excluded from issued PDFs until field validation.'}
      </p>
      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
      <Button variant="outline" disabled={busy} onClick={() => void perform(async () => {})}>
        Refresh saved calculations
      </Button>
      <CatalogueBrowser
        endpoint={orgEndpoint}
        token={token}
        basis={developer ? 'indicative_budget' : 'cost'}
        refresh={catalogueRevision}
        onRates={mergeRates}
        onEdit={reviseRate}
      />
      <details className="my-5 rounded-lg border border-stone-300 p-4">
        <summary>Catalogue: add an explicit dated rate</summary>
        <form
          ref={rateForm}
          onSubmit={(event) => void createRate(event)}
          className="grid gap-3 py-4 md:grid-cols-2"
        >
          <label>
            Rate code
            <input name="code" required maxLength={80} />
          </label>
          <label>
            Rate category
            <input name="category" required maxLength={80} defaultValue="General" />
          </label>
          <label>
            Description
            <input name="description" required maxLength={500} />
          </label>
          <label>
            Unit
            <select name="unit">
              <option value="m2">m²</option>
              <option value="m">m</option>
              <option value="item">item</option>
            </select>
          </label>
          <label>
            {developer ? 'Indicative budget' : 'Internal cost'} rate (MYR)
            <input name="amount" type="number" min="0" step="0.0001" required />
          </label>
          <label>
            Effective date
            <input name="effective_date" type="date" required />
          </label>
          <label>
            Rate source and exclusions
            <input name="source_note" required maxLength={2000} />
          </label>
          <fieldset>
            <legend>Included components</legend>
            {['labour', 'transport', 'overhead'].map((category) => (
              <label className="mr-3" key={category}>
                <input type="checkbox" name="includes" value={category} /> {category}
              </label>
            ))}
          </fieldset>
          <Button type="submit" disabled={busy}>
            Save new rate version
          </Button>
        </form>
        <p className="text-sm">
          A repeated code creates a new immutable reference version. Existing estimates keep their
          original rate copy. Catalogue and internal-pricing permissions are enforced by the API.
        </p>
      </details>
      <h3>Rate assignments · {data.scenarios[scenario].name}</h3>
      {data.scenarios[scenario].items
        .filter((item) => item.status === 'proposed')
        .map((item) => (
          <label className="field" key={item.id}>
            Rate for {item.name}
            <select
              disabled={busy || project.archived}
              value={item.rate_id ?? ''}
              onChange={(event) => {
                const next = structuredClone(data)
                next.scenarios[scenario].items = next.scenarios[scenario].items.map((entry) =>
                  entry.id === item.id ? { ...entry, rate_id: event.target.value || null } : entry,
                )
                onData(next)
              }}
            >
              {item.rate_id && !rates.some((rate) => rate.id === item.rate_id) && (
                <option value={item.rate_id}>
                  Assigned version unavailable - retry loading catalogue
                </option>
              )}
              <option value="">Unpriced — select a rate</option>
              {rates
                .filter(
                  (rate) =>
                    rate.basis === (developer ? 'indicative_budget' : 'cost') &&
                    (!rate.archived || rate.id === item.rate_id),
                )
                .map((rate) => (
                  <option key={rate.id} value={rate.id}>
                    {rate.code} v{rate.version} · {rate.description} · {rate.amount ?? 'restricted'}{' '}
                    MYR/{rate.unit} · {rate.effective_date}
                  </option>
                ))}
            </select>
          </label>
        ))}
      <div className="grid gap-6 py-5 lg:grid-cols-2">
        <div>
          <h3>Modeled ground shade</h3>
          <div className="field">
            <label htmlFor="analysis-target">Saved target zone</label>
            <select
              id="analysis-target"
              value={target || data.targets[0]?.id || ''}
              onChange={(event) => setTarget(event.target.value)}
            >
              {data.targets.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="analysis-time-mode">Time entry</label>
            <select
              id="analysis-time-mode"
              value={timeMode}
              onChange={(event) => setTimeMode(event.target.value)}
            >
              <option value="offset">Explicit timezone offset</option>
              <option value="local">Project local time ({project.timezone})</option>
            </select>
          </div>
          {timeMode === 'local' ? (
            <div className="field">
              <label htmlFor="analysis-local-time">Local date and time ({project.timezone})</label>
              <input
                id="analysis-local-time"
                type="datetime-local"
                value={localTime}
                onChange={(event) => setLocalTime(event.target.value)}
              />
              <p>
                The backend uses the saved project timezone. Clock-change ambiguities require an
                explicit offset.
              </p>
            </div>
          ) : (
            <div className="field">
              <label htmlFor="analysis-time">Date/time with explicit timezone offset</label>
              <input
                id="analysis-time"
                value={timestamp}
                onChange={(event) => setTimestamp(event.target.value)}
                placeholder="2026-10-11T12:00:00+08:00"
              />
            </div>
          )}
          <Button disabled={blocked || !data.targets.length} onClick={() => calculate('analyses')}>
            Calculate all three scenarios
          </Button>
          <p className="text-sm">
            Flat ground, opaque solids and elevated roofs. Trees excluded. Night and low sun return
            unavailable metrics.
          </p>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            calculate('estimates')
          }}
        >
          <h3>{developer ? 'Indicative budget' : 'Internal contractor pricing'}</h3>
          {!developer && (
            <>
              <div className="field">
                <label htmlFor="price-method">Pricing method</label>
                <select
                  id="price-method"
                  value={method}
                  onChange={(event) => setMethod(event.target.value)}
                >
                  <option value="markup">Markup on cost</option>
                  <option value="margin">Target margin</option>
                  <option value="fixed_selling">Fixed selling total</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="price-percent">
                  {method === 'fixed_selling'
                    ? 'Fixed selling total (MYR)'
                    : `${method === 'margin' ? 'Target margin' : 'Markup'} (%)`}
                </label>
                <input
                  id="price-percent"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  max={
                    method === 'margin'
                      ? '99.9999'
                      : method === 'markup'
                        ? '1000'
                        : '9999999999.9999'
                  }
                  value={method === 'fixed_selling' ? fixedPrice : percent}
                  onChange={(event) => {
                    if (method === 'fixed_selling') setFixedPrice(event.target.value)
                    else {
                      setPercent(event.target.value)
                      percentEdited.current = true
                    }
                  }}
                />
              </div>
            </>
          )}
          <div className="field">
            <label htmlFor="wastage">Explicit area/length wastage (%)</label>
            <input
              id="wastage"
              type="number"
              min="0"
              max="100"
              step="0.01"
              required
              value={wastage}
              onChange={(event) => setWastage(event.target.value)}
            />
          </div>
          <fieldset disabled={blocked} className="my-4">
            <legend>Explicit additional charges</legend>
            <p className="text-sm">
              Add each component once. The API rejects a charge already included in any selected
              rate. These inputs are saved with the next estimate.
            </p>
            {charges.map((charge) => (
              <div key={charge.category} className="my-3 rounded border border-stone-300 p-3">
                <label>
                  {charge.category} charge (MYR)
                  <input
                    type="number"
                    min="0"
                    max="9999999999.9999"
                    step="0.0001"
                    required
                    value={charge.amount}
                    onChange={(event) =>
                      setCharges((current) =>
                        current.map((entry) =>
                          entry.category === charge.category
                            ? { ...entry, amount: event.target.value }
                            : entry,
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  {charge.category} charge source and scope
                  <input
                    required
                    maxLength={2000}
                    value={charge.source_note}
                    onChange={(event) =>
                      setCharges((current) =>
                        current.map((entry) =>
                          entry.category === charge.category
                            ? { ...entry, source_note: event.target.value }
                            : entry,
                        ),
                      )
                    }
                  />
                </label>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    setCharges((current) =>
                      current.filter((entry) => entry.category !== charge.category),
                    )
                  }
                >
                  Remove {charge.category} charge
                </Button>
              </div>
            ))}
            {chargeCategories
              .filter((category) => !charges.some((charge) => charge.category === category))
              .map((category) => (
                <Button
                  type="button"
                  key={category}
                  variant="outline"
                  className="mr-2 mb-2"
                  onClick={() =>
                    setCharges((current) => [...current, { category, amount: '', source_note: '' }])
                  }
                >
                  Add {category} charge
                </Button>
              ))}
          </fieldset>
          <Button type="submit" disabled={blocked || scenario === 'baseline'}>
            Calculate selected option estimate
          </Button>
          <p className="text-sm">
            MYR · line totals rounded half up to two decimals. No implicit tax or charges. Missing
            rates produce a clearly incomplete subtotal.
          </p>
        </form>
      </div>
      <ReviewPanel
        data={data}
        project={project}
        token={token}
        revision={revision}
        dirty={dirty}
        artifacts={artifacts}
        onDirty={onReviewDirty}
      />
      <h3>Saved analysis and estimate revisions</h3>
      {artifacts
        .filter((item) => item.kind === 'analysis' || item.kind === 'estimate')
        .map((item) => (
          <article key={item.id} className="my-3 rounded-lg border border-stone-300 p-4">
            <strong>
              {item.kind === 'analysis' ? 'Modeled shade' : 'Estimate'} · workspace{' '}
              {item.workspace_revision} ·{' '}
              {item.stale || dirty ? 'STALE — recalculate' : 'Current saved inputs'}
            </strong>
            {item.kind === 'analysis' ? (
              <>
                <p>
                  {item.payload.timestamp} · {item.payload.status} · sun elevation{' '}
                  {item.payload.solar.elevation_deg.toFixed(2)}°
                </p>
                {Object.entries(item.payload.scenarios).map(([key, result]) => (
                  <p key={key}>
                    {result.name}: {result.area_m2.toFixed(2)} / {result.target_area_m2.toFixed(2)}{' '}
                    m² · {result.coverage_percent.toFixed(1)}% modeled coverage
                  </p>
                ))}
                <Button
                  variant="outline"
                  disabled={blocked || item.stale || item.payload.status !== 'modeled'}
                  onClick={() => {
                    if (item.kind !== 'analysis') return
                    const result = item.payload.scenarios[scenario]
                    if (result)
                      onShowShadows(
                        [
                          {
                            type: 'Feature',
                            geometry: result.shadow_geometry,
                            properties: { kind: 'shadow', name: `${scenario} modeled shade` },
                          },
                        ],
                        item.workspace_revision,
                      )
                  }}
                >
                  Show {scenario} shade on map
                </Button>
                <p className="text-sm">{item.payload.limitations.join(' ')}</p>
              </>
            ) : item.kind === 'estimate' ? (
              <>
                <p>
                  {item.payload.scenario} ·{' '}
                  {item.payload.complete
                    ? (item.payload.label ?? 'Checked selling total')
                    : 'INCOMPLETE — priced scope only'}
                  : {item.payload.currency} {item.payload.selling_total}
                </p>
                <details>
                  <summary>Itemised takeoff for {item.payload.scenario}</summary>
                  <div className="overflow-x-auto">
                    <table>
                      <thead>
                        <tr>
                          <th>Scope</th>
                          <th>Quantity</th>
                          <th>Rate version</th>
                          <th>Wastage</th>
                          <th>Line amount</th>
                          <th>Geometry</th>
                        </tr>
                      </thead>
                      <tbody>
                        {item.payload.takeoff.map((line) => (
                          <tr key={line.item_id}>
                            <td>
                              {line.description}
                              <br />
                              {line.quantity_source}
                            </td>
                            <td>
                              {line.quantity} {line.unit}
                            </td>
                            <td>
                              {line.rate_code} v{line.rate_version}
                              <br />
                              {line.effective_date}
                              <br />
                              {line.unit_price
                                ? `MYR ${line.unit_price}/${line.unit}`
                                : 'Price restricted'}
                            </td>
                            <td>{line.wastage_percent}%</td>
                            <td>
                              {line.line_total
                                ? `MYR ${line.line_total} (${line.price_basis})`
                                : 'Price restricted'}
                            </td>
                            <td>
                              <Button
                                variant="outline"
                                disabled={dirty || item.stale}
                                onClick={() => onInspect(item.payload.scenario, line.item_id)}
                              >
                                Inspect {line.description}
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p>
                    Backend quantities and prices from this saved estimate. Inspect opens the
                    current source item; edits require saving and recalculation. Existing items and
                    unpriced scope are excluded from priced rows.
                  </p>
                </details>
                {item.payload.cost_base && (
                  <p>
                    Internal cost base {item.payload.cost_base} ·{' '}
                    {item.payload.profit === null
                      ? 'Profit unavailable for incomplete scope'
                      : `Internal profit ${item.payload.profit}`}{' '}
                    · {item.payload.profit_basis}
                  </p>
                )}
                {item.payload.charges?.map((charge) => (
                  <p key={charge.category}>
                    Saved {charge.category} charge: {item.payload.currency} {charge.amount} ?{' '}
                    {charge.source_note}
                  </p>
                ))}
                {item.payload.missing_rates.map((missing) => (
                  <p key={missing.item_id}>
                    {missing.name}: {missing.reason}
                  </p>
                ))}
              </>
            ) : null}
          </article>
        ))}
      <details className="my-5 rounded-lg border border-stone-300 p-4">
        <summary>
          Review and issue {developer ? 'developer decision brief' : 'contractor client proposal'}
        </summary>
        <div className="field">
          <label htmlFor="issue-estimate">Complete estimate for preferred option</label>
          <select
            id="issue-estimate"
            value={estimateId}
            onChange={(event) => setEstimateId(event.target.value)}
          >
            <option value="">Select a current estimate</option>
            {artifacts
              .filter(
                (item) =>
                  item.kind === 'estimate' &&
                  !item.stale &&
                  item.payload.complete &&
                  item.payload.scenario === scenario,
              )
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.created_at} · {item.id}
                </option>
              ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="issue-criteria">Review criteria (one per line)</label>
          <textarea
            id="issue-criteria"
            value={criteria}
            onChange={(event) => setCriteria(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="issue-notes">Reviewer notes</label>
          <textarea
            id="issue-notes"
            maxLength={8000}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="issue-assumptions">Assumptions</label>
          <textarea
            id="issue-assumptions"
            maxLength={8000}
            value={assumptions}
            onChange={(event) => setAssumptions(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="issue-exclusions">Exclusions</label>
          <textarea
            id="issue-exclusions"
            maxLength={8000}
            value={exclusions}
            onChange={(event) => setExclusions(event.target.value)}
          />
        </div>
        <Button
          disabled={
            blocked ||
            !estimateId ||
            !criteria.trim() ||
            !notes.trim() ||
            !assumptions.trim() ||
            !exclusions.trim()
          }
          onClick={() => issue(false)}
        >
          Confirm and issue new version
        </Button>
        <Button
          variant="outline"
          disabled={
            blocked ||
            !estimateId ||
            !criteria.trim() ||
            !notes.trim() ||
            !assumptions.trim() ||
            !exclusions.trim()
          }
          onClick={() => issue(true)}
        >
          Preview draft PDF
        </Button>
        {preview && (
          <OutputPreview
            snapshot={preview}
            kind={developer ? 'developer_brief' : 'proposal'}
            onClose={() => setPreview(null)}
          />
        )}
      </details>
      <h3>Issued outputs</h3>
      {artifacts
        .filter((item) => item.kind === 'developer_brief' || item.kind === 'proposal')
        .map((item) =>
          item.kind === 'developer_brief' || item.kind === 'proposal' ? (
            <article className="my-3 rounded-lg border border-stone-300 p-4" key={item.id}>
              <h4>
                {item.payload.title} · version {item.payload.version}
              </h4>
              <p>
                {item.stale
                  ? 'Historical snapshot — live inputs have since changed.'
                  : 'Immutable issued snapshot.'}{' '}
                {item.id}
              </p>
              <Button
                disabled={busy}
                onClick={() => {
                  void perform(async () => {
                    const { downloadIssuedPdf } = await import('../services/pdf')
                    await downloadIssuedPdf(item.payload, item.id, item.kind)
                  })
                }}
              >
                Download {item.kind === 'developer_brief' ? 'decision brief' : 'client proposal'}{' '}
                PDF
              </Button>
              <p className="text-sm">Retrying download uses this same snapshot and price.</p>
            </article>
          ) : null,
        )}
    </section>
  )
}
