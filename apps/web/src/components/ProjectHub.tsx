import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { projectSchema, type Project } from '../domain/projects'
import { request } from '../services/api'
import HubLibrary from './HubLibrary'
import { templateFromProject } from '../domain/hub'

export function OpportunitySummary({ project }: { project: Project }) {
  const opportunity = project.details?.opportunity
  return (
    <p className="fine-print">
      {(opportunity?.stage ?? 'enquiry').replaceAll('_', ' ')} ·{' '}
      {opportunity?.owner || 'Unassigned'} · Due {opportunity?.due_date ?? 'not set'}
      <br />
      {project.details?.budget != null
        ? `Budget: ${project.currency} ${project.details.budget_min ? `${project.details.budget_min}–` : ''}${project.details.budget}`
        : 'Budget not set'}
      {opportunity?.tags.length ? ` · ${opportunity.tags.join(', ')}` : ''}
    </p>
  )
}

export function ProjectClient({ project }: { project: Project }) {
  const client = project.details?.opportunity?.client
  if (!client) return null
  return (
    <details className="paper p-4 my-4">
      <summary>Client record: {client.name}</summary>
      <p>
        This contact snapshot belongs to brief revision {project.revision}. Library updates do not
        change saved projects.
      </p>
      <dl>
        {Object.entries(client).map(([key, value]) => (
          <div key={key}>
            <dt>{key}</dt>
            <dd className="whitespace-pre-wrap">{value || 'Not recorded'}</dd>
          </div>
        ))}
      </dl>
    </details>
  )
}

export function ProjectTable({
  projects,
  onOpen,
}: {
  projects: Project[]
  onOpen: (project: Project) => void
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <caption>Permitted projects in the current results page</caption>
        <thead>
          <tr>
            {[
              'Project / client',
              'Opportunity / owner',
              'Due date',
              'Expected budget',
              'Progress',
            ].map((label) => (
              <th key={label} className="p-3">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {projects.map((project) => (
            <tr key={project.id} className="border-t">
              <td className="p-3">
                <button className="button text" onClick={() => onOpen(project)}>
                  {project.name}
                </button>
                {project.example && <span className="example-badge">Example</span>}
                <p>{project.details?.opportunity?.client?.name ?? project.stakeholder}</p>
              </td>
              <td className="p-3">
                {(project.details?.opportunity?.stage ?? 'enquiry').replaceAll('_', ' ')}
                <p>{project.details?.opportunity?.owner || 'Unassigned'}</p>
              </td>
              <td className="p-3">{project.details?.opportunity?.due_date ?? 'Not set'}</td>
              <td className="p-3">
                {project.details?.budget != null
                  ? `${project.currency} ${project.details.budget_min ? `${project.details.budget_min}–` : ''}${project.details.budget}`
                  : 'Not set'}
              </td>
              <td className="p-3">
                {project.stage.replaceAll('_', ' ')} / rev {project.revision}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function ProjectHubActions({
  project,
  token,
  onCreated,
}: {
  project: Project
  token: string
  onCreated: (project: Project) => void
}) {
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const [name, setName] = useState(`${project.name} copy`.slice(0, 160))
  const [includeDesign, setIncludeDesign] = useState(false)
  const [workspaceRevision, setWorkspaceRevision] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const org = project.organisation_id
  const path = `/api/v1/organisations/${org}/projects/${project.id}`
  async function loadDesign() {
    setBusy(true)
    setError('')
    setIncludeDesign(true)
    setWorkspaceRevision(null)
    try {
      const saved = await request(`${path}/workspace`, z.object({ revision: z.number() }), token)
      setWorkspaceRevision(saved.revision)
      setIncludeDesign(true)
    } catch (reason) {
      setIncludeDesign(false)
      setError(String(reason))
    } finally {
      setBusy(false)
    }
  }
  async function duplicate() {
    setBusy(true)
    setError('')
    try {
      const result = await request(`${path}/duplicate`, projectSchema, token, {
        method: 'POST',
        body: JSON.stringify({
          name,
          expected_revision: project.revision,
          include_design: includeDesign,
          expected_workspace_revision: workspaceRevision ?? 0,
        }),
      })
      if (mounted.current) onCreated(result)
    } catch (reason) {
      setError(String(reason))
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="paper p-4 my-4" aria-label="Reuse project">
      <details>
        <summary>Duplicate this project</summary>
        <p>
          A new active project at the same site, with a fresh brief history and enquiry stage.
          Access is assigned only to you. Attachments, issued documents, estimates, pricing
          adjustments, review decisions and acceptance do not copy.
        </p>
        <label>
          New project name
          <input
            maxLength={160}
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
          />
        </label>
        {project.capabilities?.includes('edit_geometry') && (
          <label>
            <input
              type="checkbox"
              checked={includeDesign}
              disabled={busy}
              onChange={(e) => {
                if (e.target.checked) void loadDesign()
                else setIncludeDesign(false)
              }}
            />{' '}
            Include saved design at the same site
          </label>
        )}
        {includeDesign && (
          <p>
            Design revision {workspaceRevision}. Quantity inputs, terrain and objects copy;
            quantities are recalculated. Evidence links and the plan overlay are removed. Site
            constraints return to unverified. Recheck sources before using the copy.
          </p>
        )}
        {error && <p role="alert">{error}</p>}
        <button
          className="button primary"
          disabled={busy || !name.trim() || (includeDesign && workspaceRevision === null)}
          onClick={() => void duplicate()}
        >
          {busy ? 'Working…' : 'Create duplicate project'}
        </button>
      </details>
      <details className="my-4">
        <summary>Save or maintain a reusable brief template</summary>
        <HubLibrary
          org={org}
          token={token}
          kind="template"
          initial={templateFromProject(project)}
        />
      </details>
    </section>
  )
}
