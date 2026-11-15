import { useEffect, useState } from 'react'
import { z } from 'zod'
import { request } from '../services/api'
const schema = z.object({
  priced_count: z.number(),
  scope_count: z.number(),
  warnings: z.array(z.object({ code: z.string(), message: z.string() })),
  coverage_note: z.string(),
})
export default function PricingIssueReadiness({
  endpoint,
  estimateId,
  validUntil,
  token,
}: {
  endpoint: string
  estimateId: string
  validUntil: string
  token?: string
}) {
  const [result, setResult] = useState<z.infer<typeof schema> | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    if (!estimateId) return
    request(
      `${endpoint}/estimates/${estimateId}/readiness${validUntil ? `?valid_until=${encodeURIComponent(validUntil)}` : ''}`,
      schema,
      token,
    )
      .then((value) => {
        if (active) {
          setResult(value)
          setError('')
        }
      })
      .catch((reason) => {
        if (active) {
          setResult(null)
          setError(reason.message)
        }
      })
    return () => {
      active = false
    }
  }, [endpoint, estimateId, validUntil, token])
  if (!estimateId) return null
  return (
    <section aria-label="Proposal pricing review" className="notice">
      <h4>Proposal pricing review</h4>
      {error && <p role="alert">{error}</p>}
      {result && (
        <>
          <p>
            {result.priced_count} of {result.scope_count} lines priced. Validity and archive state
            are checked again when issuing.
          </p>
          {result.warnings.length ? (
            result.warnings.map((w, i) => <p key={i}>{w.message}</p>)
          ) : (
            <p>No rate-validity warnings for the selected dates.</p>
          )}
          <p>{result.coverage_note}</p>
        </>
      )}
    </section>
  )
}
