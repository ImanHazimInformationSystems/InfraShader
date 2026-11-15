import { lazy, Suspense, useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import {
  ArrowDownToLine,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleHelp,
  FileText,
  Filter,
  FolderOpen,
  Info,
  Layers3,
  Link2,
  LockKeyhole,
  MapPin,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react'
import type { Project } from '../domain/projects'
import {
  areaFeatures,
  areas,
  priorityStage,
  type ProductFeature,
  type WorkspaceMode,
} from './model'

const SiteMap = lazy(() => import('../components/SiteMap'))
type Props = {
  demo: boolean
  workspace: WorkspaceMode
  area: string
  featureId?: string
  projects: Project[]
  activeProject: Project | null
  onNavigate: (area: string, feature?: string) => void
  onConnected: (feature: ProductFeature, project?: Project) => void
  onProjects: () => void
  onDirty: (dirty: boolean) => void
}

export default function ProductWorkspace(props: Props) {
  const { workspace, area, featureId, projects, activeProject, onNavigate } = props
  const [search, setSearch] = useState('')
  const [stage, setStage] = useState('all')
  const [inspector, setInspector] = useState(false)
  const [projectId, setProjectId] = useState(activeProject?.id ?? '')
  const activeTab = useRef<HTMLButtonElement>(null)
  const [previewDirty, setPreviewDirty] = useState(false)
  const reportDirty = props.onDirty
  const onDirty = useCallback(
    (value: boolean) => {
      setPreviewDirty(value)
      reportDirty(value)
    },
    [reportDirty],
  )
  const available = areaFeatures(workspace, area)
  const feature = featureId ? available.find((f) => f.id === featureId) : available[0]
  useEffect(() => {
    if (feature?.id && window.matchMedia('(max-width: 600px)').matches)
      activeTab.current?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'instant' })
  }, [feature?.id])
  const group = areas.find((a) => a.id === area)
  const project =
    projects.find((p) => p.id === projectId) ??
    (activeProject?.id === projectId ? activeProject : undefined)
  const choices =
    activeProject && !projects.some((p) => p.id === activeProject.id)
      ? [activeProject, ...projects]
      : projects
  const matches = available.filter(
    (f) =>
      `${f.id} ${f.name}`.toLowerCase().includes(search.toLowerCase()) &&
      (stage === 'all' || priorityStage(f) === stage),
  )
  if (!group || !feature)
    return (
      <section className="product-empty">
        <CircleAlert size={30} />
        <h1>This workflow is unavailable</h1>
        <p>
          The feature does not belong to this workspace or page. Choose another task from the
          navigation.
        </p>
        <button className="button primary" onClick={props.onProjects}>
          Return to projects
        </button>
      </section>
    )
  return (
    <div className="product-workbench" data-area={area}>
      <header className="product-page-heading">
        <div>
          <div className="product-eyebrow">
            {workspace === 'studio' ? 'DESIGN STUDIO' : 'ORGANISATION REVIEW'} <span>/</span>{' '}
            {area === 'assistant' ? 'ASSISTED WORK' : 'WORKSPACE'}
          </div>
          <h1>{group.name}</h1>
          <p>{group.description}</p>
        </div>
        <button
          className="product-subtle-button"
          aria-expanded={inspector}
          onClick={() => setInspector(!inspector)}
        >
          {inspector ? <PanelRightClose size={17} /> : <PanelRightOpen size={17} />} Workflow guide
        </button>
      </header>
      <div className="product-context-bar">
        <MapPin size={17} />
        <label htmlFor="product-project-context">Project context</label>
        <select
          id="product-project-context"
          value={projectId}
          onChange={(e) => {
            if (
              previewDirty &&
              !window.confirm('Discard unapplied preview inputs before changing project context?')
            )
              return
            setProjectId(e.target.value)
          }}
        >
          <option value="">Choose a saved project</option>
          {choices.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.archived ? ' (archived)' : ''}
            </option>
          ))}
        </select>
        <span className="product-context-note">
          {feature.id === 'L04'
            ? 'Saved project context · open the editor to view or change geometry'
            : project
              ? 'Existing project link only · preview inputs stay separate'
              : 'Preview without project data'}
        </span>
        <button onClick={props.onProjects} className="product-inline-link">
          <FolderOpen size={15} /> Browse projects
        </button>
      </div>
      <div className="product-feature-filter">
        <div className="product-search">
          <Search size={16} />
          <input
            aria-label="Find a feature in this workflow"
            placeholder="Find a tool or feature…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <label className="product-stage-filter">
          <Filter size={15} />
          <span className="sr-only">Feature delivery stage</span>
          <select
            aria-label="Feature delivery stage"
            value={stage}
            onChange={(e) => setStage(e.target.value)}
          >
            <option value="all">All stages</option>
            <option value="Core / Keep">Core & Keep</option>
            <option value="Next">Next</option>
            <option value="Later">Later</option>
          </select>
        </label>
        <span>{available.length} capabilities in this workflow</span>
      </div>
      <nav className="product-feature-tabs" aria-label="Feature sections">
        {matches.map((f) => (
          <button
            key={f.id}
            ref={f.id === feature.id ? activeTab : undefined}
            className={f.id === feature.id ? 'selected' : ''}
            aria-current={f.id === feature.id ? 'page' : undefined}
            onClick={() => onNavigate(area, f.id)}
          >
            <span>{f.id}</span>
            {f.name}
            <small className={priorityStage(f) === 'Core / Keep' ? 'core' : ''}>
              {priorityStage(f)}
            </small>
          </button>
        ))}
        {!matches.length && (
          <p>
            No matching features.{' '}
            <button
              className="product-inline-link"
              onClick={() => {
                setSearch('')
                setStage('all')
              }}
            >
              Clear filters
            </button>
          </p>
        )}
      </nav>
      <div className={`product-workbench-body ${inspector ? 'with-inspector' : ''}`}>
        {feature.id === 'L04' ? (
          <SpatialEditingEntry
            feature={feature}
            project={project}
            demo={props.demo}
            onConnected={() => props.onConnected(feature, project)}
          />
        ) : (
          <FeaturePanel
            key={`${workspace}/${feature.id}/${project?.id ?? 'none'}`}
            feature={feature}
            project={project}
            onDirty={onDirty}
            onConnected={() => props.onConnected(feature, project)}
          />
        )}
        {inspector && (
          <aside className="product-inspector" aria-label="Workflow guide">
            <span className="product-eyebrow">WORKFLOW GUIDE</span>
            <h2>Keep the source in sight.</h2>
            <p>{feature.scope}</p>
            <dl>
              <dt>Catalogue priority</dt>
              <dd>{feature.priority}</dd>
              <dt>Functional tracking status</dt>
              <dd>
                {feature.implementation}{' '}
                <small>Catalogue snapshot; interface coverage does not change this status.</small>
              </dd>
              <dt>Related references</dt>
              <dd>{feature.related || 'No additional aliases'}</dd>
              <dt>Reference resources</dt>
              <dd>{feature.resources}</dd>
            </dl>
            <div className="product-help-note">
              <ShieldCheck size={20} />
              <p>
                Private design costs, shared evidence and issued packages have different access
                boundaries. Existing server permissions still apply.
              </p>
            </div>
            <button className="product-inline-link" onClick={() => onNavigate('help', 'S12')}>
              <CircleHelp size={16} /> Capture workflow feedback
            </button>
          </aside>
        )}
      </div>
    </div>
  )
}

type PreviewRow = { name: string; source: string; state: string }
function SpatialEditingEntry({
  feature,
  project,
  demo,
  onConnected,
}: {
  feature: ProductFeature
  project?: Project
  demo: boolean
  onConnected: () => void
}) {
  return (
    <section className="product-feature-panel" data-feature-id="L04" aria-labelledby="feature-L04">
      <div className="product-feature-title">
        <div>
          <div className="product-kicker">
            <span className="product-feature-id">L04</span>
            <span className="product-connected-tag">
              <Link2 size={12} /> Connected spatial tools
            </span>
          </div>
          <h2 id="feature-L04">{feature.name}</h2>
          <p>
            View sourced site geometry, edit supported work items and save revisioned quantities in
            your project.
          </p>
        </div>
      </div>
      <div className="product-disclosure">
        <Info size={18} />
        <div>
          <strong>
            {demo
              ? 'Browser Demo has limited local drawing only.'
              : 'Use the saved project spatial editor.'}
          </strong>
          <p>
            {demo
              ? 'Sign in to use backend-validated spatial operations, metric quantities and project revisions.'
              : 'Project access controls apply. Read-only members can inspect the site; editing requires a geometry grant. Changes stay in a draft until you validate and save.'}
          </p>
        </div>
      </div>
      <div className="product-existing-workflow">
        <div>
          <Layers3 size={18} />
          <p>
            {project
              ? `${project.name}${project.archived ? ' (archived)' : ''}`
              : 'Choose a saved project above, or browse projects to start.'}
          </p>
        </div>
        <button className="button primary compact" onClick={onConnected}>
          {project ? 'Open spatial editor' : 'Choose a project'}
          <ArrowRight size={15} />
        </button>
      </div>
      <div className="product-help-note">
        <ShieldCheck size={20} />
        <p>
          Keep existing Baseline separate from proposed A/B. Draw areas, paths and count locations;
          use metric offsets, dimensions, snapping, duplication and undo. Quantities use the
          declared projected CRS. Missing rates remain unpriced; a drawing is not a priced or
          surveyed result.
        </p>
      </div>
      <p>
        Switch between the site map and concept 3D view. Boundary and target outlines share the
        validated metric frame. Plans and constraint overlays remain available in the 2D view. Save,
        then use Studies for supported quantity, preliminary estimate and shade workflows.
      </p>
    </section>
  )
}
function examples(feature: ProductFeature): PreviewRow[] {
  const names =
    feature.id === 'L09'
      ? ['Courtyard shade tree', 'Native groundcover zone', 'Replacement planting']
      : feature.group === 'pricing'
        ? ['Walkway paving', 'Courtyard planting', 'Site access allowance']
        : feature.group === 'briefs'
          ? ['Landscape proposal A', 'Technical schedule', 'Site constraints appendix']
          : feature.group === 'inbox'
            ? ['Confirm nursery size', 'Confirm access hours', 'Review site photographs']
            : feature.group === 'records'
              ? ['Existing site plan', 'Survey photographs', 'Issued package manifest']
              : ['Courtyard improvement', 'Accessible route', 'Site evidence review']
  return names.map((name) => ({
    name,
    source: 'Illustrative example · source to confirm',
    state: 'Demo data',
  }))
}

function displayScope(feature: ProductFeature) {
  return feature.scope.split('Audited subset:')[0].split('31 October:')[0].trim()
}

function FeaturePanel({
  feature,
  project,
  onDirty,
  onConnected,
}: {
  feature: ProductFeature
  project?: Project
  onDirty: Props['onDirty']
  onConnected: () => void
}) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [sample, setSample] = useState(false)
  const [rows, setRows] = useState<PreviewRow[]>([])
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('asc')
  const [page, setPage] = useState(0)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [dirty, setDirty] = useState(false)
  const [option, setOption] = useState('Baseline')
  const [layers, setLayers] = useState({ boundary: true, planting: true, routes: true })
  const [sections, setSections] = useState([
    'Scope & assumptions',
    'Evidence & source notes',
    'Exclusions & next steps',
  ])
  const [weights, setWeights] = useState([40, 35, 25])
  const [files, setFiles] = useState<string[]>([])
  const dialog = useRef<HTMLDialogElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const form = useRef<HTMLFormElement>(null)
  useEffect(() => () => onDirty(false), [onDirty])
  function edit() {
    setDirty(true)
    onDirty(true)
    setNotice('')
    setError('')
  }
  function apply(event: FormEvent) {
    event.preventDefault()
    if (feature.template === 'scorecard' && weights.reduce((a, b) => a + b, 0) !== 100) {
      setError(
        'Illustrative weights must total 100% before applying this preview. No evaluation is calculated.',
      )
      return
    }
    setRows((previous) => [
      ...previous,
      {
        name: values[feature.fields[0]] ?? 'Preview entry',
        source: values[feature.fields[1]] ?? 'Source to confirm',
        state: 'Tab-only preview',
      },
    ])
    setDirty(false)
    onDirty(false)
    setNotice(
      'Applied to this preview only. Nothing was uploaded, calculated, issued or saved to a project.',
    )
    setError('')
  }
  const dataset = [...(sample ? examples(feature) : []), ...rows]
    .filter((r) => `${r.name} ${r.source}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => (sort === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name)))
  const pageRows = dataset.slice(page * 5, page * 5 + 5)
  const isAI = feature.template === 'assistant'
  const hasConnected = Boolean(feature.tool)
  return (
    <section
      className="product-feature-panel"
      aria-labelledby={`feature-${feature.id}`}
      data-feature-id={feature.id}
    >
      <div className="product-feature-title">
        <div>
          <div className="product-kicker">
            <span className="product-feature-id">{feature.id}</span>
            <span className="product-readiness">
              <span aria-hidden="true">◌</span>{' '}
              {feature.state === 'Planned' ? 'Planned · UI preview' : 'UI preview'}
            </span>
            {hasConnected && (
              <span className="product-connected-tag">
                <Link2 size={12} /> Existing tools available
              </span>
            )}
          </div>
          <h2 id={`feature-${feature.id}`}>{feature.name}</h2>
          <p>{displayScope(feature)}</p>
        </div>
        <span className="product-draft-state">
          {dirty ? 'Unsaved preview inputs' : 'Preview · not project data'}
        </span>
      </div>
      <div className="product-disclosure">
        <Info size={18} />
        <div>
          <strong>
            {isAI
              ? 'Assistance is not connected to a model.'
              : 'Review the interface before connecting the workflow.'}
          </strong>
          <p>
            {isAI
              ? 'You can draft a request and inspect source/review controls. No generated answer, ranking or recommendation is produced.'
              : 'Inputs and illustrative rows live only on this screen. They are separate from your saved project and verified results.'}
          </p>
        </div>
      </div>
      {hasConnected && (
        <div className="product-existing-workflow">
          <div>
            <Link2 size={17} />
            <p>{feature.connection}</p>
          </div>
          <button className="button primary compact" onClick={onConnected}>
            {['projects', 'explore', 'settings', 'switcher'].includes(feature.tool)
              ? 'Open existing workflow'
              : project
                ? 'Open project tools'
                : 'Choose project / open projects'}
            <ArrowRight size={15} />
          </button>
        </div>
      )}
      {notice && (
        <div className="product-feedback" role="status">
          <Check size={17} />
          <span>{notice}</span>
          <button aria-label="Dismiss preview feedback" onClick={() => setNotice('')}>
            <X size={15} />
          </button>
        </div>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {feature.template === 'canvas' && (
        <div className="product-canvas-card">
          <div className="product-surface-heading">
            <div>
              <Layers3 size={17} />
              <h3>{project ? project.name : 'Site context'}</h3>
            </div>
            <span>
              {project ? 'Saved locator · view only' : 'Schematic preview · not geographic data'}
            </span>
          </div>
          {project ? (
            <Suspense fallback={<p role="status">Loading saved site locator…</p>}>
              <SiteMap
                key={project.id}
                bounds={project.site.bounds}
                outline={project.site.outline}
                readOnly
              />
            </Suspense>
          ) : (
            <div className="product-schematic">
              <svg
                viewBox="0 0 900 420"
                role="img"
                aria-label="Illustrative outdoor site plan, not a real site"
              >
                <defs>
                  <pattern
                    id={`grid-${feature.id}`}
                    width="30"
                    height="30"
                    patternUnits="userSpaceOnUse"
                  >
                    <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#d8dadd" strokeWidth=".7" />
                  </pattern>
                </defs>
                <rect width="900" height="420" fill="#e9ece8" />
                <rect width="900" height="420" fill={`url(#grid-${feature.id})`} />
                <path d="M0 330 L900 60 M270 0 L420 420" stroke="#d1d3d1" strokeWidth="45" />
                <path d="M0 330 L900 60 M270 0 L420 420" stroke="#fafafa" strokeWidth="24" />
                <path
                  d="M480 65h230v95H480z M110 70h135v100H110z M620 275h160v100H620z"
                  fill="#d4d8da"
                  stroke="#bcc2c6"
                  strokeWidth="2"
                />
                {layers.boundary && (
                  <path
                    d="M330 95L590 185L525 350L375 310Z"
                    fill="#7c29431a"
                    stroke="#7c2943"
                    strokeWidth="3"
                    strokeDasharray="9 6"
                  />
                )}
                {layers.routes && (
                  <path
                    d="M370 140L535 205L480 300"
                    fill="none"
                    stroke="#b89a80"
                    strokeWidth="12"
                  />
                )}
                {layers.planting && (
                  <g fill="#a4b7a0" stroke="#6f8b6c" strokeWidth="2">
                    {[
                      [400, 160],
                      [445, 180],
                      [490, 200],
                      [460, 275],
                      [420, 255],
                    ].map(([cx, cy]) => (
                      <circle key={cx} cx={cx} cy={cy} r="16" />
                    ))}
                  </g>
                )}
                <text x="450" y="390" textAnchor="middle" fill="#605b64" fontSize="13">
                  SCHEMATIC EXAMPLE · NO MEASUREMENTS OR QUANTITIES
                </text>
              </svg>
              <div className="product-schematic-legend">
                {Object.entries(layers).map(([key, checked]) => (
                  <label key={key}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => setLayers({ ...layers, [key]: e.target.checked })}
                    />
                    {key}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      {feature.template === 'comparison' && (
        <div className="product-comparison">
          <div className="product-surface-heading">
            <h3>Common-basis comparison</h3>
            <span>UI preview · no comparison calculated</span>
          </div>
          <div className="product-option-grid">
            {['Baseline', 'Option A', 'Option B'].map((name, i) => (
              <button
                key={name}
                className={`product-option ${option === name ? 'selected' : ''}`}
                aria-pressed={option === name}
                onClick={() => {
                  setOption(name)
                  setNotice(
                    `${name} selected for this preview only. No preference or evaluation has been recorded.`,
                  )
                }}
              >
                <span className="product-option-number">0{i + 1}</span>
                <h4>{name}</h4>
                <p>{i === 0 ? 'Existing-site reference' : 'Proposed alternative'}</p>
                <dl>
                  <dt>Source version</dt>
                  <dd>Not connected</dd>
                  <dt>Budget / estimate</dt>
                  <dd>Not calculated</dd>
                  <dt>Evidence coverage</dt>
                  <dd>Not assessed</dd>
                </dl>
                <span className="product-option-select">
                  {option === name ? <Check size={15} /> : <Plus size={15} />}
                  {option === name ? 'Selected in preview' : 'Inspect option'}
                </span>
              </button>
            ))}
          </div>
          <div className="product-help-note">
            <CircleAlert size={18} />
            <p>
              Confirm scope, proposal versions, site/time basis, currency and exclusions before
              using any connected comparison. No winner or score is inferred here.
            </p>
          </div>
        </div>
      )}
      {feature.template === 'dashboard' && (
        <div className="product-dashboard-preview">
          <div className="product-surface-heading">
            <h3>Decision context</h3>
            <span>Aggregation not connected</span>
          </div>
          <div className="product-indicator-grid">
            {['Project coverage', 'Budget basis', 'Review progress'].map((name) => (
              <article key={name}>
                <span>{name}</span>
                <strong>Awaiting sources</strong>
                <p>Connect authorised records before reporting totals.</p>
              </article>
            ))}
          </div>
        </div>
      )}
      <div className="product-editor-grid">
        <form ref={form} className="product-preview-form" onSubmit={apply}>
          <div className="product-surface-heading">
            <h3>
              {isAI
                ? 'Prepare a reviewed request'
                : feature.template === 'settings'
                  ? 'Configuration preview'
                  : 'Prepare the workflow'}
            </h3>
            <span>Tab only</span>
          </div>
          <p className="product-field-hint">
            Required fields are marked *. Keep assumptions and sources explicit.
          </p>
          {feature.fields.map((field, i) => (
            <label key={field} htmlFor={`preview-${feature.id}-${i}`}>
              {field} *
              {i === 2 || isAI ? (
                <textarea
                  id={`preview-${feature.id}-${i}`}
                  aria-label={`${field} *`}
                  required
                  maxLength={2000}
                  value={values[field] ?? ''}
                  placeholder={
                    isAI
                      ? 'Describe the request and its source boundary…'
                      : 'Record a source, assumption or limitation…'
                  }
                  onChange={(e) => {
                    setValues({ ...values, [field]: e.target.value })
                    edit()
                  }}
                />
              ) : (
                <input
                  id={`preview-${feature.id}-${i}`}
                  aria-label={`${field} *`}
                  required
                  maxLength={300}
                  type={
                    field.includes('(m)') || field.includes('(%)')
                      ? 'number'
                      : /\bdate\b/i.test(field)
                        ? 'date'
                        : 'text'
                  }
                  step="any"
                  value={values[field] ?? ''}
                  placeholder={
                    field.includes('(m)')
                      ? 'Metres · conceptual, not surveyed'
                      : 'Enter for preview…'
                  }
                  onChange={(e) => {
                    setValues({ ...values, [field]: e.target.value })
                    edit()
                  }}
                />
              )}
            </label>
          ))}
          {feature.template === 'settings' && (
            <fieldset className="product-preference-options">
              <legend>Preview preferences</legend>
              <label>
                <input type="checkbox" onChange={edit} /> Limit optional motion
              </label>
              <label>
                <input type="checkbox" defaultChecked onChange={edit} /> Show units and source
                labels
              </label>
              <p>
                Configuration here is illustrative. Use existing settings for connected organisation
                preferences.
              </p>
            </fieldset>
          )}
          {feature.template === 'scorecard' && (
            <fieldset className="product-weight-editor">
              <legend>Illustrative rubric · no scores calculated</legend>
              {['Technical approach', 'Cost basis', 'Maintenance response'].map((label, i) => (
                <label key={label}>
                  {label}
                  <span>
                    <input
                      aria-label={`${label} weight`}
                      type="number"
                      min="0"
                      max="100"
                      value={weights[i]}
                      onChange={(e) => {
                        setWeights(
                          weights.map((value, j) => (i === j ? Number(e.target.value) : value)),
                        )
                        edit()
                      }}
                    />{' '}
                    %
                  </span>
                </label>
              ))}
              <p>
                Preview weight total: <strong>{weights.reduce((a, b) => a + b, 0)}%</strong>.
                Policies, evidence and a locked version must be confirmed before actual evaluation.
              </p>
            </fieldset>
          )}
          <div className="product-form-actions">
            <button className="button primary" type="submit">
              Apply to preview <ArrowRight size={15} />
            </button>
            <button
              className="product-subtle-button"
              type="button"
              onClick={() => {
                if (dirty && !window.confirm('Discard unapplied preview inputs?')) return
                setValues({})
                setDirty(false)
                onDirty(false)
                setError('')
                setNotice('Preview inputs cleared. No project record changed.')
              }}
            >
              Clear inputs
            </button>
          </div>
          <p className="product-field-hint">
            Preview changes are discarded when you leave this feature.
          </p>
        </form>
        <div className="product-preview-content">
          {feature.template === 'document' ? (
            <div className="product-document">
              <div className="product-document-head">
                <FileText size={18} />
                <span>DOCUMENT STRUCTURE · PREVIEW</span>
              </div>
              <div className="product-paper-preview">
                <span className="product-eyebrow">INFRASHADER / {feature.id}</span>
                <h3>{values[feature.fields[0]] || feature.name}</h3>
                <p className="product-document-watermark">UI PREVIEW · NOT AN ISSUED DOCUMENT</p>
                {sections.map((section) => (
                  <section key={section}>
                    <h4>{section}</h4>
                    <p>
                      Authorised content and reviewed sources will appear here when the workflow is
                      connected.
                    </p>
                    <div className="product-placeholder-line" />
                    <div className="product-placeholder-line short" />
                  </section>
                ))}
              </div>
              <div className="product-document-sections">
                <h4>Sections to show</h4>
                {['Scope & assumptions', 'Evidence & source notes', 'Exclusions & next steps'].map(
                  (section) => (
                    <label key={section}>
                      <input
                        type="checkbox"
                        checked={sections.includes(section)}
                        onChange={(e) =>
                          setSections(
                            e.target.checked
                              ? [...sections, section]
                              : sections.filter((s) => s !== section),
                          )
                        }
                      />
                      {section}
                    </label>
                  ),
                )}
              </div>
            </div>
          ) : isAI ? (
            <div className="product-ai-preview">
              <div className="product-ai-icon">
                <Sparkles size={25} />
              </div>
              <span className="product-eyebrow">HUMAN REVIEW REQUIRED</span>
              <h3>
                Good answers start with
                <br />
                traceable sources.
              </h3>
              <p>
                This planned assistant will work within project permissions and show the evidence
                behind each suggestion. No model is running on this screen.
              </p>
              <div className="product-ai-boundary">
                <LockKeyhole size={18} />
                <div>
                  <strong>Source boundary</strong>
                  <p>No files are sent, no model is selected and no answer is generated.</p>
                </div>
              </div>
              <button
                className="button secondary"
                type="button"
                onClick={() =>
                  setNotice(
                    'Not connected: no AI request was sent. A reviewed model, source permissions and evaluation evidence are required before enabling generation.',
                  )
                }
              >
                <Sparkles size={16} /> Check assistant availability
              </button>
            </div>
          ) : (
            <div className="product-records">
              <div className="product-surface-heading">
                <h3>
                  {feature.template === 'schedule'
                    ? 'Sequence & responsibilities'
                    : 'Review register'}
                </h3>
                <button className="product-inline-link" onClick={() => dialog.current?.showModal()}>
                  <ArrowDownToLine size={15} /> Format guide
                </button>
              </div>
              <label className="product-sample-switch">
                <input
                  type="checkbox"
                  checked={sample}
                  onChange={(e) => {
                    setSample(e.target.checked)
                    setPage(0)
                  }}
                />{' '}
                Show illustrative rows <span>Demo data</span>
              </label>
              <div className="product-table-tools">
                <div className="product-search">
                  <Search size={15} />
                  <input
                    ref={input}
                    aria-label="Search preview records"
                    value={query}
                    placeholder="Filter preview rows…"
                    onChange={(e) => {
                      setQuery(e.target.value)
                      setPage(0)
                    }}
                  />
                </div>
                <select
                  aria-label="Sort preview records"
                  value={sort}
                  onChange={(e) => {
                    setSort(e.target.value)
                    setPage(0)
                  }}
                >
                  <option value="asc">Name A-Z</option>
                  <option value="desc">Name Z-A</option>
                </select>
              </div>
              <div className="product-table-scroll">
                <table>
                  <caption className="sr-only">
                    Illustrative or tab-only preview records, not saved project records
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">
                        {feature.template === 'schedule' ? 'Work item / phase' : 'Item / reference'}
                      </th>
                      <th scope="col">Source / assumption</th>
                      <th scope="col">State</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((row, i) => (
                      <tr key={`${i}/${row.name}`}>
                        <td>
                          <FileText size={14} />
                          {row.name}
                        </td>
                        <td>{row.source}</td>
                        <td>
                          <span className="product-row-status">{row.state}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!pageRows.length && (
                <div className="product-empty-state">
                  <FolderOpen size={28} />
                  <h4>{query ? 'No matching preview rows' : 'A clear starting point.'}</h4>
                  <p>
                    {query
                      ? 'Try another search or clear your filter.'
                      : 'Apply a preview entry or show illustrative rows to review this interface.'}
                  </p>
                  {query && (
                    <button
                      className="product-inline-link"
                      onClick={() => {
                        setQuery('')
                        setPage(0)
                      }}
                    >
                      Clear search
                    </button>
                  )}
                </div>
              )}
              <div className="product-pagination">
                <span>{dataset.length} preview rows · not a project total</span>
                <div>
                  <button
                    aria-label="Previous preview page"
                    disabled={page === 0}
                    onClick={() => setPage(Math.max(0, page - 1))}
                  >
                    <ChevronLeft size={17} />
                  </button>
                  <span>
                    {page + 1} / {Math.max(1, Math.ceil(dataset.length / 5))}
                  </span>
                  <button
                    aria-label="Next preview page"
                    disabled={(page + 1) * 5 >= dataset.length}
                    onClick={() => setPage(page + 1)}
                  >
                    <ChevronRight size={17} />
                  </button>
                </div>
              </div>
            </div>
          )}
          {['records', 'briefs', 'site'].includes(feature.group) && (
            <div className="product-file-preview">
              <h4>Source file selection</h4>
              <p>Preview file names only. Files are not read, uploaded or retained.</p>
              <label className="product-file-label">
                Choose files for preview
                <input
                  type="file"
                  multiple
                  onChange={(e) => {
                    setFiles(Array.from(e.target.files ?? []).map((file) => file.name))
                    setNotice(
                      'File names selected for preview only. Use existing project tools for a real private upload.',
                    )
                  }}
                />
              </label>
              {files.length > 0 && (
                <ul>
                  {files.map((name, i) => (
                    <li key={`${i}/${name}`}>{name} · not uploaded</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
      <details className="product-readiness-details">
        <summary>
          <ShieldCheck size={17} /> Readiness, limitations & next connection{' '}
          <ChevronDown size={15} />
        </summary>
        <p>{feature.connection}</p>
        <p>
          Current source priority: <strong>{feature.priority}</strong>.{' '}
          {priorityStage(feature) === 'Later'
            ? 'This expansion remains gated; reviewing this UI does not activate it.'
            : 'Only existing connected workflows can produce authoritative records.'}
        </p>
        <p>
          UI location: {feature.group} / {feature.id}. Sources, units, revisions and permissions
          must be checked when this workflow is connected.
        </p>
      </details>
      <dialog ref={dialog} className="product-dialog" aria-labelledby={`format-${feature.id}`}>
        <button
          className="product-dialog-close"
          aria-label="Close format guide"
          onClick={() => dialog.current?.close()}
        >
          <X size={19} />
        </button>
        <span className="product-eyebrow">FORMAT & SOURCE GUIDE</span>
        <h2 id={`format-${feature.id}`}>Keep the original context.</h2>
        <p>
          For {feature.name}, retain the original reference, source version, units, author and
          assumptions. Preview rows are illustrative and cannot be issued as verified evidence.
        </p>
        <p>
          Import, export and retention will use the admitted data contract when this feature is
          connected. No export job has been started.
        </p>
        <button className="button primary" onClick={() => dialog.current?.close()}>
          Understood
        </button>
      </dialog>
    </section>
  )
}
