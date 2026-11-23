import { z } from 'zod'
import { apiTimeout } from './api-timeout'
import {
  projectListSchema,
  projectSchema,
  sessionSchema,
  type ProjectInput,
} from '../domain/projects'

const baseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
    public requestId?: string,
    /** Parsed response body, when the server sent one (e.g. readiness checks on 503). */
    public body?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/** Codes for failures where no HTTP response was read. Status is 0 for all of them. */
export type TransportFailure = 'timeout' | 'offline' | 'aborted' | 'network_error'

/**
 * Explain a fetch that produced no readable response. A timeout is not the same as an
 * unreachable server: a sleeping pilot host or a long calculation can exceed the limit.
 */
export function transportFailure(reason: unknown, callerAborted: boolean): ApiError {
  const name = reason instanceof Error || reason instanceof DOMException ? reason.name : ''
  if (callerAborted || name === 'AbortError')
    return new ApiError('The request was cancelled.', 0, 'aborted')
  if (name === 'TimeoutError')
    return new ApiError(
      'The server did not answer in time. It may be starting up or still working; wait a moment and retry. Unsaved work stays in this tab.',
      0,
      'timeout',
    )
  if (typeof navigator !== 'undefined' && navigator.onLine === false)
    return new ApiError(
      'This device appears to be offline. Reconnect, then retry. Unsaved work stays in this tab.',
      0,
      'offline',
    )
  return new ApiError(
    'The API could not be reached. Check the connection and retry.',
    0,
    'network_error',
  )
}

/** Short reference shown to users for server-side failures; logs hold the full request ID. */
export function reference(requestId?: string) {
  return requestId ? ` Reference: ${requestId.slice(0, 8)}.` : ''
}
export async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  token?: string,
  init: RequestInit = {},
): Promise<T> {
  let response: Response | undefined
  // Safe reads are retried once after a transient network failure (dropped keep-alive socket,
  // brief connectivity loss). Writes are never retried automatically; caller aborts are respected.
  const idempotent = ['GET', 'HEAD'].includes((init.method ?? 'GET').toUpperCase())
  for (let attempt = 0; !response; attempt += 1) {
    try {
      response = await fetch(`${baseUrl}${path}`, {
        ...init,
        signal: init.signal ?? AbortSignal.timeout(apiTimeout(import.meta.env.VITE_API_TIMEOUT_MS)),
        headers: {
          ...(typeof init.body === 'string' ? { 'Content-Type': 'application/json' } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...init.headers,
        },
      })
    } catch (reason) {
      const failure = transportFailure(reason, Boolean(init.signal?.aborted))
      // Retry a dropped socket once; a timeout already waited the full limit.
      if (idempotent && attempt === 0 && failure.code === 'network_error') {
        await new Promise((resolve) => setTimeout(resolve, 400))
        continue
      }
      throw failure
    }
  }
  const requestId = response.headers.get('X-Request-ID') ?? undefined
  const data: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    if (response.status === 401 && token)
      window.dispatchEvent(new CustomEvent('infrashader:session-expired', { detail: token }))
    const parsed = z
      .object({
        error: z.object({
          code: z.string(),
          message: z.string(),
          details: z
            .array(z.object({ field: z.string(), message: z.string() }))
            .optional()
            .catch(undefined),
        }),
        request_id: z.string().optional(),
      })
      .safeParse(data)
    const detail = parsed.success
      ? (parsed.data.error.details ?? [])
          .slice(0, 10)
          .map((item) => `${item.field.replace(/^body\./, '')}: ${item.message}`)
          .join('; ')
      : ''
    const serverSide = response.status >= 500
    const message = parsed.success
      ? [parsed.data.error.message, detail].filter(Boolean).join(' ')
      : serverSide
        ? `The server or its gateway failed (HTTP ${response.status}). It may be restarting; retry shortly.`
        : `The request failed (HTTP ${response.status}). Please retry.`
    throw new ApiError(
      `${message}${serverSide ? reference(requestId ?? parsed.data?.request_id) : ''}`,
      response.status,
      parsed.success
        ? parsed.data.error.code
        : serverSide
          ? 'upstream_unavailable'
          : 'request_failed',
      requestId ?? parsed.data?.request_id,
      data,
    )
  }
  const parsed = schema.safeParse(data)
  if (!parsed.success)
    throw new ApiError(
      'The API returned an unexpected response. Retry or report this request to your operator.',
      502,
      'invalid_response',
      requestId,
    )
  return parsed.data
}
export const healthSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('infrashader-api'),
  version: z.string(),
})
export const readinessSchema = z.object({
  status: z.enum(['ready', 'unavailable']),
  checks: z.record(z.string(), z.string()),
})
export const api = {
  health: () => request('/api/v1/health', healthSchema),
  readiness: () => request('/api/v1/readiness', readinessSchema),
  session: (token: string) => request('/api/v1/session', sessionSchema, token),
  projects: (
    org: string,
    token: string,
    archived = false,
    offset = 0,
    query = '',
    sort = 'updated',
    stage = '',
    opportunity = '',
    purpose = '',
  ) =>
    request(
      `/api/v1/organisations/${org}/projects?limit=100&offset=${offset}&archived=${archived}&query=${encodeURIComponent(query)}&sort=${sort}&stage=${stage}&opportunity=${opportunity}&purpose=${purpose}`,
      projectListSchema,
      token,
    ),
  project: (org: string, id: string, token: string) =>
    request(`/api/v1/organisations/${org}/projects/${id}`, projectSchema, token),
  create: (org: string, input: ProjectInput, token: string) =>
    request(`/api/v1/organisations/${org}/projects`, projectSchema, token, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  update: (
    org: string,
    id: string,
    patch: Partial<ProjectInput> & { expected_revision: number; archived?: boolean },
    token: string,
  ) =>
    request(`/api/v1/organisations/${org}/projects/${id}`, projectSchema, token, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
}
