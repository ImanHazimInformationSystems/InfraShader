import { z } from 'zod'
import { projectListSchema, projectSchema, sessionSchema, type ProjectInput } from '../domain/projects'

const baseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')
export class ApiError extends Error {
  constructor(message: string, public status: number, public code: string, public requestId?: string) { super(message); this.name = 'ApiError' }
}
export async function request<T>(path: string, schema: z.ZodType<T>, token?: string, init: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...init, signal: init.signal ?? AbortSignal.timeout(15000),
      headers: { ...(typeof init.body === 'string' ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers },
    })
  } catch { throw new ApiError('The API could not be reached. Check the connection and retry.', 0, 'network_error') }
  const requestId = response.headers.get('X-Request-ID') ?? undefined
  const data: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const parsed = z.object({ error: z.object({ code: z.string(), message: z.string() }), request_id: z.string().optional() }).safeParse(data)
    throw new ApiError(parsed.success ? parsed.data.error.message : 'The request failed. Please retry.', response.status, parsed.success ? parsed.data.error.code : 'request_failed', requestId)
  }
  const parsed = schema.safeParse(data)
  if (!parsed.success) throw new ApiError('The API returned an unexpected response. Retry or report this request to your operator.', 502, 'invalid_response', requestId)
  return parsed.data
}
export const healthSchema = z.object({ status: z.literal('ok'), service: z.literal('infrashader-api'), version: z.string() })
export const readinessSchema = z.object({ status: z.enum(['ready', 'unavailable']), checks: z.record(z.string(), z.string()) })
export const api = {
  health: () => request('/api/v1/health', healthSchema),
  readiness: () => request('/api/v1/readiness', readinessSchema),
  session: (token: string) => request('/api/v1/session', sessionSchema, token),
  projects: (org: string, token: string, archived = false, offset = 0) => request(`/api/v1/organisations/${org}/projects?limit=100&offset=${offset}&archived=${archived}`, projectListSchema, token),
  project: (org: string, id: string, token: string) => request(`/api/v1/organisations/${org}/projects/${id}`, projectSchema, token),
  create: (org: string, input: ProjectInput, token: string) => request(`/api/v1/organisations/${org}/projects`, projectSchema, token, { method: 'POST', body: JSON.stringify(input) }),
  update: (org: string, id: string, patch: Partial<ProjectInput> & { expected_revision: number; archived?: boolean }, token: string) => request(`/api/v1/organisations/${org}/projects/${id}`, projectSchema, token, { method: 'PATCH', body: JSON.stringify(patch) }),
}
