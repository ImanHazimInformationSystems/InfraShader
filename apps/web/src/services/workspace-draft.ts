import { z } from 'zod'
import { workspaceDataSchema, provenanceSchema } from '../domain/workspace'

export const workspaceDraftSchema = z.object({
  savedAt: z.number(),
  revision: z.number().int().nonnegative(),
  data: workspaceDataSchema,
  form: z.object({
    category: z.string().default('General'),
    crown: z.string().default(''),
    scenario: z.enum(['baseline', 'option_a', 'option_b']),
    kind: z.enum([
      'boundary',
      'target',
      'area',
      'path',
      'building',
      'canopy',
      'tree',
      'bench',
      'manual',
    ]),
    name: z.string(),
    source: z.string(),
    coordinates: z.string(),
    height: z.string(),
    heightSource: z.string(),
    count: z.string(),
    override: z.string(),
    provenance: provenanceSchema,
    editingId: z.string().nullable(),
    pendingForm: z.boolean(),
  }),
})
export type WorkspaceDraft = z.infer<typeof workspaceDraftSchema>
export function workspaceDraftKey(user: string, org: string, project: string) {
  return `infrashader.workspace-recovery.v1.${user}.${org}.${project}`
}
export function readWorkspaceDraft(key: string): WorkspaceDraft | null {
  const raw = sessionStorage.getItem(key)
  if (!raw) return null
  const parsed = workspaceDraftSchema.safeParse(JSON.parse(raw))
  if (!parsed.success || Date.now() - parsed.data.savedAt > 8 * 60 * 60 * 1000) {
    sessionStorage.removeItem(key)
    return null
  }
  return parsed.data
}
export function clearWorkspaceDrafts(user: string, org?: string, project?: string) {
  const prefix =
    org && project
      ? workspaceDraftKey(user, org, project)
      : `infrashader.workspace-recovery.v1.${user}.`
  for (let index = sessionStorage.length - 1; index >= 0; index--) {
    const key = sessionStorage.key(index)
    if (key && (org && project ? key === prefix : key.startsWith(prefix)))
      sessionStorage.removeItem(key)
  }
}
