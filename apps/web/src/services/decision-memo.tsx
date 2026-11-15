import { pdf } from '@react-pdf/renderer'
import { DecisionMemoPdf } from '../components/DecisionMemoPdf'
import { decisionPackSchema, fileMeta } from '../domain/owner-review'
import { ApiError, request } from './api'

const baseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

async function sha256(buffer: ArrayBuffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** O17: render the memorandum from the retained pack and retain it (first bytes are kept). */
export async function retainDecisionMemo(base: string, token: string, packFileId: string, packSha: string) {
  const response = await fetch(`${baseUrl}${base}/files/${packFileId}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(60000),
  })
  if (!response.ok) throw new ApiError('The retained decision pack is unavailable.', response.status, 'file')
  const bytes = await response.arrayBuffer()
  if ((await sha256(bytes)) !== packSha)
    throw new Error('The decision pack failed its integrity check; the memorandum was not created.')
  const parsed = decisionPackSchema.safeParse(JSON.parse(new TextDecoder().decode(bytes)))
  if (!parsed.success) throw new Error('The decision pack format is not supported by this memorandum renderer.')
  const blob = await pdf(<DecisionMemoPdf pack={parsed.data} packSha256={packSha} />).toBlob()
  const body = new FormData()
  body.append('file', blob, 'decision-memorandum.pdf')
  body.append('pack_sha256', packSha)
  return request(`${base}/decision/memo/file`, fileMeta, token, {
    method: 'POST',
    body,
    signal: AbortSignal.timeout(60000),
  })
}
