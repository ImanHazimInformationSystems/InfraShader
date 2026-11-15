import { useEffect, useRef } from 'react'
import type { Map } from 'mapbox-gl'
import type { Project } from '../domain/projects'
import { api } from '../services/api'
import { DemoStore } from '../services/demo'
import type { Solar } from '../services/environment'
import TreeWorkbench from './TreeWorkbench'
import { useStudioToolActive } from './studio-context'

export default function ProjectTreeWorkbench({
  project,
  token,
  demo,
  map,
  solar,
  active,
  onDirty,
  onSaved,
}: {
  project: Project
  token?: string
  demo: boolean
  map: Map | null
  solar: Solar | null
  onDirty: (dirty: boolean) => void
  onSaved: (project: Project) => void
  active: boolean
}) {
  const context = useRef('')
  const expectedRevision = useRef(project.revision)
  const key = `${project.id}/${token}/${demo}`
  useEffect(() => {
    context.current = key
    return () => {
      context.current = ''
    }
  }, [key])
  const allowed = !project.archived && (demo || !!project.capabilities?.includes('edit_project'))
  const visible = useStudioToolActive('trees')
  return (
    <TreeWorkbench
      site={project.site}
      map={map}
      solar={solar}
      disabled={!allowed}
      active={active && visible}
      saveLabel="Save project tree decisions"
      onDirty={onDirty}
      onApply={async (trees) => {
        const saved = demo
          ? new DemoStore().update(project.id, expectedRevision.current, {
              site: { ...project.site, trees },
            })
          : await api.update(
              project.organisation_id,
              project.id,
              { expected_revision: expectedRevision.current, site: { ...project.site, trees } },
              token!,
            )
        if (context.current === key) {
          expectedRevision.current = saved.revision
          onSaved(saved)
        }
      }}
      onReload={async () => {
        const saved = demo
          ? new DemoStore().list().find((p) => p.id === project.id)
          : await api.project(project.organisation_id, project.id, token!)
        if (!saved) throw new Error('Project unavailable. Your draft is retained.')
        if (context.current === key) {
          expectedRevision.current = saved.revision
          onSaved(saved)
        }
        return saved.site.trees ?? []
      }}
    />
  )
}
