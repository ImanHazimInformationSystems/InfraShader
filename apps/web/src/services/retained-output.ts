import { z } from 'zod'
import { request, ApiError } from './api'
import type { Artifact } from '../domain/calculations'

const fileSchema = z.object({
  retained: z.boolean(),
  manifest_hash: z.string(),
  sha256: z.string().optional(),
  size_bytes: z.number().optional(),
})
type Output = Extract<Artifact, { kind: 'proposal' | 'developer_brief' }>

export async function retainIssuedPdf(
  endpoint: string,
  token: string | undefined,
  artifact: Output,
) {
  const path = `${endpoint}/outputs/${artifact.id}/file`
  const state = await request(path, fileSchema, token)
  if (state.retained) return state
  const { renderOutputPdf } = await import('./pdf')
  const blob = await renderOutputPdf(artifact.payload, artifact.id, artifact.kind)
  const body = new FormData()
  body.append('pdf', blob, 'issued.pdf')
  body.append('manifest_hash', state.manifest_hash)
  return request(path, fileSchema, token, {
    method: 'POST',
    body,
    signal: AbortSignal.timeout(60000),
  })
}

export async function downloadRetainedPdf(
  endpoint: string,
  token: string | undefined,
  artifact: Output,
  canRetain: boolean,
) {
  const path = `${endpoint}/outputs/${artifact.id}/file`
  const state = canRetain
    ? await retainIssuedPdf(endpoint, token, artifact)
    : await request(path, fileSchema, token)
  if (!state.retained)
    throw new Error('PDF retention is pending. Ask an authorised issuer to complete it.')
  const base = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')
  const response = await fetch(`${base}${path}/content`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal: AbortSignal.timeout(60000),
  })
  if (!response.ok) {
    if (response.status === 401 && token)
      window.dispatchEvent(new CustomEvent('infrashader:session-expired', { detail: token }))
    throw new ApiError(
      'Retained PDF could not be downloaded. Retry; the original file is unchanged.',
      response.status,
      'output_download',
    )
  }
  const blob = await response.blob()
  const digest = Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('')
  if (digest !== state.sha256) throw new Error('PDF integrity check failed. Contact the operator.')
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${artifact.kind}-${artifact.id}-v${artifact.payload.version}.pdf`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}
