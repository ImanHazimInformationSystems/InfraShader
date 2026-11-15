import { z } from 'zod'
import { examplePreviewsSchema, type ExamplePreviews } from '../domain/design-preview'
import { projectSchema, type Project } from '../domain/projects'
import { request } from './api'

export type ExampleKind = 'studio' | 'review'
export const STUDIO_EXAMPLES = ['studio_a', 'studio_b', 'studio_c'] as const
export type ExampleMarker = (typeof STUDIO_EXAMPLES)[number] | 'review' | 'studio'

const examplesSchema = z.object({
  studio_a: z.string().uuid().nullable(),
  studio_b: z.string().uuid().nullable(),
  studio_c: z.string().uuid().nullable(),
  review: z.string().uuid().nullable(),
})
export type ExampleIndex = z.infer<typeof examplesSchema>

/** Which built-in example projects this person can open in the organisation. */
export function listExamples(organisationId: string, token: string) {
  return request(`/api/v1/organisations/${organisationId}/examples`, examplesSchema, token)
}

const previewCache = new Map<string, Promise<ExamplePreviews>>()

/** Plans and totals of the three example designs (read-only; nothing is created). */
export function examplePreviews(organisationId: string, token: string) {
  let cached = previewCache.get(organisationId)
  if (!cached) {
    cached = request(
      `/api/v1/organisations/${organisationId}/examples/previews`,
      examplePreviewsSchema,
      token,
    )
    cached.catch(() => previewCache.delete(organisationId))
    previewCache.set(organisationId, cached)
  }
  return cached
}

/**
 * Create (once) and return the example projects: Studio examples A-C, or the review.
 * The API builds them through the real workflows, so the first call takes a few seconds.
 */
export function installExample(
  organisationId: string,
  kind: ExampleKind,
  token: string,
): Promise<Project[]> {
  return request(
    `/api/v1/organisations/${organisationId}/examples/${kind}`,
    z.array(projectSchema),
    token,
    { method: 'POST', signal: AbortSignal.timeout(180000) },
  )
}
