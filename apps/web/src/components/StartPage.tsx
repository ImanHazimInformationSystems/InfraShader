import {
  ArrowRight,
  BookOpen,
  Building2,
  CalendarDays,
  ClipboardCheck,
  FileCheck2,
  FolderOpen,
  MapPinned,
  PenTool,
  Plus,
  ReceiptText,
  Scale,
  Spline,
  type LucideIcon,
} from 'lucide-react'
import type { Project } from '../domain/projects'
import { SiteThumbnail } from './ProjectDashboardCard'
import './home.css'

type Workspace = 'studio' | 'review'

const STUDIO_STEPS: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: MapPinned, title: 'Site', text: 'Choose the site and note what still needs checking.' },
  { icon: Spline, title: 'Design', text: 'Place paths, trees, planting and objects on the map.' },
  { icon: ReceiptText, title: 'Prices', text: 'Give every item a dated, sourced rate.' },
  { icon: FileCheck2, title: 'Proposal', text: 'Review what is missing, preview the PDF, then issue.' },
]
const REVIEW_STEPS: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: ClipboardCheck, title: 'Brief', text: 'Set the requirements and the site for the project.' },
  { icon: FolderOpen, title: 'Offers', text: 'Collect proposals and their evidence in one place.' },
  { icon: Scale, title: 'Compare', text: 'Review offers side by side against agreed criteria.' },
  { icon: FileCheck2, title: 'Decision', text: 'Record the decision and keep the decision pack.' },
]

function updatedText(project: Project) {
  return new Date(project.updated_at).toLocaleDateString('en-MY', {
    timeZone: project.timezone,
    day: 'numeric',
    month: 'short',
  })
}

const statusOf = (project: Project) => (project.stage === 'brief' ? 'Draft' : 'In progress')

/** Decorative contour lines for the hero band; no geographic meaning. */
function Contours() {
  return (
    <svg className="hp-contours" viewBox="0 0 600 260" preserveAspectRatio="xMaxYMid slice" aria-hidden="true">
      {[0, 1, 2, 3, 4, 5, 6].map((index) => (
        <path
          key={index}
          d={`M${120 + index * 22} 260 C ${180 + index * 18} ${190 - index * 14}, ${300 + index * 10} ${210 - index * 20}, ${360 + index * 12} ${120 - index * 10} S ${520 - index * 6} ${40 - index * 6}, 640 ${30 + index * 8}`}
        />
      ))}
    </svg>
  )
}

function SkeletonCard({ wide = false }: { wide?: boolean }) {
  return (
    <div className={`hp-skeleton${wide ? ' is-wide' : ''}`} aria-hidden="true">
      <span className="hp-skeleton-art" />
      <span className="hp-skeleton-line" />
      <span className="hp-skeleton-line is-short" />
    </div>
  )
}

export default function StartPage({
  name,
  timezone,
  workspace,
  workspaces,
  projects,
  loading,
  onOpenWorkspace,
  onExplore,
  onReviewGuide,
  onProjects,
  onOpenProject,
  onQuickGuide,
}: {
  name: string
  timezone: string
  workspace: Workspace
  workspaces: Workspace[]
  projects: Project[]
  loading: boolean
  onOpenWorkspace: (workspace: Workspace) => void
  onExplore: () => void
  onReviewGuide: () => void
  onProjects: () => void
  onOpenProject: (project: Project) => void
  onQuickGuide: () => void
}) {
  const hour = Number(
    new Intl.DateTimeFormat('en', { hour: '2-digit', hourCycle: 'h23', timeZone: timezone }).format(
      new Date(),
    ),
  )
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const today = new Intl.DateTimeFormat('en-MY', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: timezone,
  }).format(new Date())
  const active = projects.filter((project) => !project.archived)
  // Each project appears once: the latest as the spotlight, the next three as cards.
  const [latest, ...others] = active
  const recent = others.slice(0, 3)
  const hasWorkspace = workspaces.includes(workspace)
  const studio = workspaces.includes('studio')
  const workspaceName = workspace === 'studio' ? 'Design Studio' : 'Organisation Review'
  const steps = studio ? STUDIO_STEPS : REVIEW_STEPS

  return (
    <section className="hp" aria-labelledby="home-greeting">
      <header className="hp-hero">
        <Contours />
        <div className="hp-hero-copy">
          <span className="hp-date">
            <CalendarDays size={15} aria-hidden="true" />
            {today}
          </span>
          <h1 id="home-greeting">
            {greeting}
            {name ? `, ${name}` : ''}
          </h1>
          <p>
            {workspaces.length
              ? studio
                ? 'Pick a site, place the work, price it and send a clear proposal.'
                : 'Set the brief, compare offers and record a clear decision.'
              : 'Your account is ready. Join or set up an organisation to begin.'}
          </p>
          {hasWorkspace && (
            <div className="hp-hero-actions">
              {studio && workspace === 'studio' && (
                <button className="hp-btn hp-btn-light" onClick={onExplore}>
                  <Plus size={17} aria-hidden="true" /> Start a new site
                </button>
              )}
              <button className="hp-btn hp-btn-ghost" onClick={onProjects}>
                <FolderOpen size={17} aria-hidden="true" /> All projects
              </button>
            </div>
          )}
        </div>

        {hasWorkspace && (
          <div className="hp-spotlight" aria-busy={loading}>
            <span className="hp-eyebrow">Pick up where you left off</span>
            {loading ? (
              <SkeletonCard wide />
            ) : latest ? (
              <button
                className="hp-spotlight-card"
                onClick={() => onOpenProject(latest)}
                title={latest.name}
              >
                <SiteThumbnail project={latest} />
                <span className="hp-spotlight-body">
                  <strong>{latest.name}</strong>
                  <small>
                    <Building2 size={14} aria-hidden="true" />
                    {latest.stakeholder || 'No client recorded'}
                  </small>
                  <span className="hp-meta">
                    <span className={`hp-status is-${latest.stage === 'brief' ? 'draft' : 'progress'}`}>
                      {statusOf(latest)}
                    </span>
                    <span>Updated {updatedText(latest)}</span>
                  </span>
                </span>
                <span className="hp-spotlight-go">
                  Continue <ArrowRight size={16} aria-hidden="true" />
                </span>
              </button>
            ) : (
              <div className="hp-empty">
                <MapPinned size={22} aria-hidden="true" />
                <div>
                  <strong>No projects yet</strong>
                  <p>
                    {studio && workspace === 'studio'
                      ? 'Start by choosing a site on the map.'
                      : 'Ask a project manager to share a project with you.'}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </header>

      {workspaces.length > 0 ? (
        <section className="hp-section" aria-labelledby="hp-workspaces">
          <div className="hp-section-head">
            <h2 id="hp-workspaces">Your workspaces</h2>
          </div>
          <div className={`hp-workspaces${workspaces.length === 1 ? ' is-single' : ''}`}>
            {studio && (
              <article className="hp-workspace">
                <span className="hp-workspace-icon" aria-hidden="true">
                  <PenTool size={22} />
                </span>
                <div className="hp-workspace-copy">
                  <h3>Design Studio</h3>
                  <p>For contractors and landscapers: plan outdoor work on a map, price it and prepare client proposals.</p>
                </div>
                <div className="hp-workspace-actions">
                  <button className="hp-btn hp-btn-primary" onClick={() => onOpenWorkspace('studio')}>
                    Open Design Studio <ArrowRight size={16} aria-hidden="true" />
                  </button>
                  <button className="hp-link" onClick={onExplore}>
                    Explore a site
                  </button>
                </div>
              </article>
            )}
            {workspaces.includes('review') && (
              <article className="hp-workspace is-review">
                <span className="hp-workspace-icon" aria-hidden="true">
                  <Scale size={22} />
                </span>
                <div className="hp-workspace-copy">
                  <h3>Organisation Review</h3>
                  <p>For owner teams: set requirements, compare proposals fairly and record decisions.</p>
                </div>
                <div className="hp-workspace-actions">
                  <button className="hp-btn hp-btn-primary" onClick={() => onOpenWorkspace('review')}>
                    Open Organisation Review <ArrowRight size={16} aria-hidden="true" />
                  </button>
                  <button className="hp-link" onClick={onReviewGuide}>
                    Preview review workflow
                  </button>
                </div>
              </article>
            )}
          </div>
        </section>
      ) : (
        <div className="hp-empty hp-no-workspace" role="status">
          <Building2 size={24} aria-hidden="true" />
          <div>
            <strong>Set up your organisation to get started</strong>
            <p>Create or join an organisation below. An administrator assigns your workspace access.</p>
          </div>
        </div>
      )}

      {hasWorkspace && (loading || recent.length > 0) && (
        <section className="hp-section" aria-labelledby="home-recent-heading" aria-busy={loading}>
          <div className="hp-section-head">
            <div>
              <h2 id="home-recent-heading">Recent projects</h2>
              <p>Other projects you can open in {workspaceName}.</p>
            </div>
            <button className="hp-link" onClick={onProjects}>
              View all projects <ArrowRight size={15} aria-hidden="true" />
            </button>
          </div>
          <div className="hp-recent">
            {loading
              ? [0, 1, 2].map((index) => <SkeletonCard key={index} />)
              : recent.map((project) => (
                  <button
                    className="hp-project"
                    key={project.id}
                    onClick={() => onOpenProject(project)}
                    title={project.name}
                  >
                    <SiteThumbnail project={project} />
                    <span className="hp-project-body">
                      <strong>{project.name}</strong>
                      <small>{project.stakeholder || 'No client recorded'}</small>
                      <span className="hp-meta">
                        <span className={`hp-status is-${project.stage === 'brief' ? 'draft' : 'progress'}`}>
                          {statusOf(project)}
                        </span>
                        <span>Updated {updatedText(project)}</span>
                      </span>
                    </span>
                  </button>
                ))}
          </div>
        </section>
      )}

      <section className="hp-section hp-how" aria-labelledby="hp-how-heading">
        <div className="hp-section-head">
          <div>
            <h2 id="hp-how-heading">
              How {studio ? 'Design Studio' : 'Organisation Review'} works
            </h2>
            <p>Four steps, shown at the top of every project.</p>
          </div>
          <button className="hp-link" onClick={onQuickGuide}>
            <BookOpen size={15} aria-hidden="true" /> Quick guide
          </button>
        </div>
        <ol className="hp-steps">
          {steps.map((step, index) => {
            const Icon = step.icon
            return (
              <li key={step.title}>
                <span className="hp-step-icon" aria-hidden="true">
                  <Icon size={20} />
                </span>
                <span className="hp-step-number">Step {index + 1}</span>
                <strong>{step.title}</strong>
                <p>{step.text}</p>
              </li>
            )
          })}
        </ol>
      </section>
    </section>
  )
}
