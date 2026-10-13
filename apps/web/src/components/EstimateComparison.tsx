import { useState } from 'react'
import type { Artifact } from '../domain/calculations'
import { displayQuantity, useDisplayUnits } from '../services/display-units'

export default function EstimateComparison({
  artifacts,
  dirty,
}: {
  artifacts: Artifact[]
  dirty: boolean
}) {
  const estimates = artifacts.filter((item) => item.kind === 'estimate')
  const [left, setLeft] = useState(''),
    [right, setRight] = useState('')
  const units = useDisplayUnits()
  if (estimates.length < 2) return null
  return (
    <section
      aria-label="Estimate revision comparison"
      className="my-4 rounded border border-stone-300 p-4"
    >
      <h3>Compare saved estimates</h3>
      <p>
        Compare the saved quantities, rate versions and totals. Different scope revisions and
        partial estimates are labelled; a historical total is not a current quotation.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        {[
          { side: 'Earlier', id: left, set: setLeft },
          { side: 'Later', id: right, set: setRight },
        ].map(({ side, id, set }) => {
          const item = estimates.find((record) => record.id === id)
          return (
            <div key={side}>
              <label>
                {side} estimate
                <select value={id} onChange={(event) => set(event.target.value)}>
                  <option value="">Select saved estimate</option>
                  {estimates.map((record) => (
                    <option key={record.id} value={record.id}>
                      {record.payload.scenario} / {record.created_at} / {record.id}
                    </option>
                  ))}
                </select>
              </label>
              {item && (
                <article>
                  <p>
                    {item.stale || dirty ? 'Historical or stale inputs' : 'Current saved inputs'};
                    workspace {item.workspace_revision}; brief {item.project_revision}
                  </p>
                  <p>
                    {item.payload.complete ? 'Complete total' : 'Partial subtotal'}:{' '}
                    {item.payload.currency} {item.payload.selling_total}
                  </p>
                  {item.payload.method && (
                    <p>
                      Method: {item.payload.method}; percentage:{' '}
                      {item.payload.percent ?? 'not applicable'}%
                    </p>
                  )}
                  {item.payload.cost_base !== undefined && (
                    <p>
                      Internal cost: {item.payload.cost_base}; profit:{' '}
                      {item.payload.profit ?? 'Unavailable'}
                    </p>
                  )}
                  {item.payload.takeoff.map((line) => (
                    <p key={line.item_id}>
                      {line.description}: {displayQuantity(Number(line.quantity), line.unit, units)}
                      ; {line.rate_code} v{line.rate_version}; wastage {line.wastage_percent}%;{' '}
                      {line.line_total === undefined
                        ? 'Price restricted'
                        : `MYR ${line.line_total}`}
                    </p>
                  ))}
                  {item.payload.charges?.map((charge) => (
                    <p key={charge.category}>
                      {charge.category}: {charge.amount}; {charge.source_note}
                    </p>
                  ))}
                  {item.payload.missing_rates.map((missing) => (
                    <p key={missing.item_id}>
                      Unpriced: {missing.name} - {missing.reason}
                    </p>
                  ))}
                </article>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
