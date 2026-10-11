import { z } from 'zod'
import { projectInputSchema, projectSchema, type ProjectInput, type Project } from '../domain/projects'

export const DEMO_STORAGE_KEY = 'infrashader:browser-demo:projects:v1'
export const DEMO_ORGANISATION_ID = '00000000-0000-4000-8000-000000000001'
export class DemoStore {
  constructor(private storage?: Pick<Storage, 'getItem' | 'setItem'>) {}
  private browserStorage() {
    try { return this.storage ?? window.localStorage }
    catch { throw new Error('Browser Demo storage is unavailable. Enable storage access for this local site, then retry.') }
  }
  list(): Project[] {
    let raw: string | null
    try { raw = this.browserStorage().getItem(DEMO_STORAGE_KEY) }
    catch { throw new Error('Browser Demo storage is unavailable. Enable storage access for this local site, then retry.') }
    if (!raw) return []
    try { return z.array(projectSchema).parse(JSON.parse(raw)) }
    catch { throw new Error('Browser Demo data could not be read. Export or clear this browser’s Demo storage before continuing.') }
  }
  create(input: ProjectInput): Project {
    const project = projectSchema.parse({ ...projectInputSchema.parse(input), id: crypto.randomUUID(), organisation_id: DEMO_ORGANISATION_ID, archived: false, revision: 1, updated_at: new Date().toISOString() })
    this.write([...this.list(), project])
    return project
  }
  update(id: string, expectedRevision: number, patch: Partial<ProjectInput> & { archived?: boolean }): Project {
    const items = this.list()
    const current = items.find((item) => item.id === id)
    if (!current) throw new Error('This Demo project no longer exists. Reload the project list.')
    if (current.revision !== expectedRevision) throw new Error('This project changed in another tab. Reload before saving your changes.')
    const next = projectSchema.parse({ ...current, ...patch, revision: current.revision + 1, updated_at: new Date().toISOString() })
    this.write(items.map((item) => item.id === id ? next : item))
    return next
  }
  private write(items: Project[]) {
    try { this.browserStorage().setItem(DEMO_STORAGE_KEY, JSON.stringify(items)) }
    catch { throw new Error('Browser Demo could not save. Check browser storage access and available space, then retry.') }
  }
}
