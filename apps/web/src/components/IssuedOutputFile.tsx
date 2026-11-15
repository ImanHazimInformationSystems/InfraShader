import { useEffect, useState } from 'react'
import { z } from 'zod'
import type { Artifact } from '../domain/calculations'
import { request } from '../services/api'
import { Button } from './ui/button'

type Output = Extract<Artifact, { kind: 'proposal' | 'developer_brief' }>
const schema = z.object({
  retained: z.boolean(),
  sha256: z.string().optional(),
  size_bytes: z.number().optional(),
})
export default function IssuedOutputFile({
  endpoint,
  token,
  artifact,
  canRetain,
}: {
  endpoint: string
  token?: string
  artifact: Output
  canRetain: boolean
}) {
  const [state, setState] = useState<z.infer<typeof schema> | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    let active = true
    request(`${endpoint}/outputs/${artifact.id}/file`, schema, token)
      .then((value) => {
        if (active) setState(value)
      })
      .catch((reason) => {
        if (active) setError(reason.message)
      })
    return () => {
      active = false
    }
  }, [endpoint, artifact.id, token, refresh])
  return (
    <section aria-label="Retained output file">
      <p>
        {state
          ? state.retained
            ? `Original PDF retained (${state.size_bytes} bytes). SHA-256 ${state.sha256}`
            : 'PDF retention pending. The snapshot is saved; an authorised issuer must complete the PDF.'
          : 'Checking retained file...'}
      </p>
      {error && <p role="alert">{error}</p>}
      <Button
        disabled={busy || (!canRetain && !state?.retained)}
        onClick={async () => {
          setBusy(true)
          setError('')
          try {
            const { downloadRetainedPdf } = await import('../services/retained-output')
            await downloadRetainedPdf(endpoint, token, artifact, canRetain)
            setRefresh((v) => v + 1)
          } catch (reason) {
            setError(reason instanceof Error ? reason.message : 'Download failed. Retry.')
          } finally {
            setBusy(false)
          }
        }}
      >
        Download {artifact.kind === 'developer_brief' ? 'decision brief' : 'client proposal'} PDF
      </Button>
      <p className="text-sm">
        Retries download the original bytes. An interrupted first rendering may be completed here;
        existing retained files are never replaced.
      </p>
    </section>
  )
}
