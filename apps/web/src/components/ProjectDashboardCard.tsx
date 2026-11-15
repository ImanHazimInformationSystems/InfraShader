import { ArrowRight, CalendarDays, Layers3, MapPin } from 'lucide-react'
import { purposeLabel, type Project } from '../domain/projects'
import { ExampleBadge } from './ExampleProjects'

export function SiteThumbnail({ project }: { project: Project }) {
  const [west, south, east, north] = project.site.bounds
  const ring = project.site.outline?.coordinates[0] ?? [
    [west, south],
    [east, south],
    [east, north],
    [west, north],
    [west, south],
  ]
  const outline = ring
    .map(([longitude, latitude], index) => {
      const x = 52 + ((longitude - west) / (east - west)) * 496
      const y = 138 - ((latitude - south) / (north - south)) * 96
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  return (
    <div className="project-site-thumbnail" aria-hidden="true">
      <svg viewBox="0 0 600 180" preserveAspectRatio="xMidYMid slice">
        <path className="site-art-park" d="M0 0h178l-30 60 44 44-28 76H0z" />
        <path className="site-art-park site-art-park-alt" d="M424 0h176v180H446l25-53-34-39z" />
        <path className="site-art-road" d="M-20 150 155 80 330 102 620 22" />
        <path className="site-art-road-edge" d="M-20 150 155 80 330 102 620 22" />
        <path className="site-art-path" d="M44 26c88 50 111 72 155 63s76-48 139-31 79 48 145 44" />
        <path className="site-art-boundary" d={`${outline} Z`} />
        <circle className="site-art-pin-halo" cx="300" cy="87" r="16" />
        <circle className="site-art-pin" cx="300" cy="87" r="6" />
      </svg>
      <span>Site outline · schematic</span>
    </div>
  )
}

function projectBudget(project: Project) {
  if (project.details?.budget == null) return 'Budget not set'
  const minimum = project.details.budget_min
  return `Budget: ${project.currency} ${minimum ? `${minimum}–` : ''}${project.details.budget}`
}

export default function ProjectDashboardCard({
  project,
  onOpen,
}: {
  project: Project
  onOpen: (project: Project) => void
}) {
  const status = project.archived
    ? 'Archived'
    : project.stage === 'brief'
      ? 'Draft'
      : 'In progress'
  const updated = new Date(project.updated_at).toLocaleDateString('en-MY', {
    timeZone: project.timezone,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })

  return (
    <article className="project-dashboard-card">
      <button
        className="project-dashboard-main"
        type="button"
        onClick={() => onOpen(project)}
      >
        <SiteThumbnail project={project} />
        <div className="project-dashboard-body">
          <div className="project-dashboard-kicker">
            <span className="eyebrow">{purposeLabel(project.purpose)}</span>
            <ExampleBadge project={project} />
            <span className={`project-status-badge ${project.archived ? 'is-archived' : project.stage === 'brief' ? 'is-draft' : 'is-progress'}`}>
              <i aria-hidden="true" /> {status}
            </span>
          </div>
          <h3>{project.name}</h3>
          <p className="project-dashboard-stakeholder">{project.stakeholder}</p>
          <div className="project-dashboard-meta">
            <span><MapPin size={15} aria-hidden="true" /> {project.site.outline ? 'Site outline saved' : 'Site extent saved'}</span>
            <span><Layers3 size={15} aria-hidden="true" /> {projectBudget(project)}</span>
          </div>
          <div className="project-dashboard-updated">
            <CalendarDays size={15} aria-hidden="true" /> Updated {updated}
          </div>
        </div>
      </button>
      <div className="project-dashboard-footer">
        <button type="button" onClick={() => onOpen(project)}>
          Open project <ArrowRight size={16} aria-hidden="true" />
        </button>
        <span>Brief revision {project.revision}</span>
      </div>
    </article>
  )
}
