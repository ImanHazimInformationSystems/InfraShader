import PlaceSearch from './components/PlaceSearch'
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Archive, ArrowLeft, ArrowRight, Check, ChevronRight, CircleHelp, FolderOpen, Leaf, LogOut, Map, MapPin, Pencil, Plus, RefreshCw, RotateCcw, ShieldCheck } from 'lucide-react'
import AuthPanel from './components/AuthPanel'
import BriefForm from './components/BriefForm'
import BoundsForm from './components/BoundsForm'
import { emptyBrief, initialBounds, purposeLabel, type Bounds, type Organisation, type Project, type ProjectInput } from './domain/projects'
import { api, ApiError } from './services/api'
import { DemoStore, DEMO_ORGANISATION_ID } from './services/demo'
import { supabase } from './services/auth'

type Screen = 'projects' | 'explore' | 'create' | 'project' | 'edit'
type UnsavedDraft = { input: ProjectInput; project: Project | null; screen: 'create' | 'edit'; orgId: string; userId: string }
const demoStore = new DemoStore()
const SiteMap = lazy(() => import('./components/SiteMap'))
const GeometryWorkspace = lazy(() => import('./components/GeometryWorkspace'))
function MapFallback() { return <div className="site-map loading-state" role="status">Loading the map workspace…</div> }
const demoOrganisation: Organisation = { id: DEMO_ORGANISATION_ID, name: 'Browser Demo', role: 'local only', capabilities: [] }

function displayError(reason: unknown): string {
  if (reason instanceof ApiError) return `${reason.message}${reason.requestId ? ` Request: ${reason.requestId}` : ''}`
  return reason instanceof Error ? reason.message : 'Something went wrong. Please retry.'
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [authLoading, setAuthLoading] = useState(Boolean(supabase))
  const [recovery, setRecovery] = useState(false)
  const [expired, setExpired] = useState(false)
  const [demo, setDemo] = useState(false)
  const [screen, setScreen] = useState<Screen>('projects')
  const [organisations, setOrganisations] = useState<Organisation[]>([])
  const [orgId, setOrgId] = useState('')
  const [projects, setProjects] = useState<Project[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [archived, setArchived] = useState(false)
  const [project, setProject] = useState<Project | null>(null)
  const [bounds, setBounds] = useState<Bounds>(initialBounds)
  const [viewport, setViewport] = useState<Bounds>()
  const [dirty, setDirty] = useState(false)
  const [geometryOpen, setGeometryOpen] = useState(false)
  const [unsavedDraft, setUnsavedDraft] = useState<UnsavedDraft | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [health, setHealth] = useState<'checking' | 'reachable' | 'unavailable'>('checking')
  const [ready, setReady] = useState(false)
  const token = session?.access_token
  const organisation = demo ? demoOrganisation : organisations.find((item) => item.id === orgId)
  const requestContext = useRef({ demo, token, orgId, archived, offset })
  const navigationEpoch = useRef(0)
  const identityEpoch = useRef(0)
  const authUserId = useRef<string | null>(null)
  useLayoutEffect(() => { requestContext.current = { demo, token, orgId, archived, offset } }, [demo, token, orgId, archived, offset])

  useEffect(() => {
    if (!supabase) return
    let active = true
    void supabase.auth.getSession().then(({ data, error: reason }) => {
      if (!active) return
      authUserId.current = data.session?.user.id ?? null
      setSession(data.session); setAuthLoading(false)
      if (reason) setError('Your saved session could not be restored. Sign in again.')
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      const nextUserId = nextSession?.user.id ?? null
      if (authUserId.current !== nextUserId) {
        identityEpoch.current += 1; navigationEpoch.current += 1
        setProject(null); setProjects([]); setOrganisations([]); setOrgId(''); setScreen('projects'); setDirty(false)
        if (nextUserId) setUnsavedDraft((current) => current?.userId === nextUserId ? current : null)
        authUserId.current = nextUserId
      }
      setSession(nextSession); setAuthLoading(false)
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
      if (event === 'SIGNED_OUT') { setOrganisations([]); setOrgId(''); setProjects([]); setProject(null); setDirty(false); setScreen('projects') }
      if (event === 'SIGNED_IN') setExpired(false)
    })
    return () => { active = false; subscription.unsubscribe() }
  }, [])

  const checkHealth = useCallback(async () => {
    setHealth('checking'); setReady(false)
    try { await api.health(); setHealth('reachable'); const result = await api.readiness(); setReady(result.status === 'ready') }
    catch (reason) { if (!(reason instanceof ApiError && reason.status === 503)) setHealth('unavailable') }
  }, [])
  // This effect starts an external health request and its loading indicator.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void checkHealth() }, [checkHealth])

  function report(reason: unknown) {
    setError(displayError(reason))
    if (reason instanceof ApiError && reason.status === 401) { setExpired(true); setProject(null); setProjects([]); setDirty(false); setScreen('projects') }
  }

  const loadSession = useCallback(async () => {
    if (demo || !token) return
    const stillCurrent = () => !requestContext.current.demo && requestContext.current.token === token
    setLoading(true); setError('')
    try {
      const info = await api.session(token)
      if (!stillCurrent()) return
      setOrganisations(info.organisations)
      setOrgId((current) => info.organisations.some((item) => item.id === current) ? current : info.organisations[0]?.id ?? '')
    } catch (reason) { if (stillCurrent()) report(reason) }
    finally { if (stillCurrent()) setLoading(false) }
  }, [demo, token])
  // Session changes require an external membership lookup; loading is explicit.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadSession() }, [loadSession])

  const loadProjects = useCallback(async () => {
    if (!demo && (!token || !orgId)) return
    const stillCurrent = () => {
      const context = requestContext.current
      return context.demo === demo && context.token === token && context.orgId === orgId && context.archived === archived && context.offset === offset
    }
    setLoading(true); setError('')
    try {
      if (demo) { const items = demoStore.list().filter((item) => item.archived === archived).sort((a, b) => b.updated_at.localeCompare(a.updated_at)); setProjects(items.slice(offset, offset + 100)); setTotal(items.length) }
      else { const result = await api.projects(orgId, token!, archived, offset); if (!stillCurrent()) return; setProjects(result.items); setTotal(result.total) }
    } catch (reason) { if (stillCurrent()) { setProjects([]); report(reason) } }
    finally { if (stillCurrent()) setLoading(false) }
  }, [demo, token, orgId, archived, offset])
  // Tenant/filter changes load external records (or the separate Demo store).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadProjects() }, [loadProjects])
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  function leaveAllowed() { return !saving && (!dirty || window.confirm('You have unsaved changes. Discard them and continue?')) }
  function navigate(next: Screen) {
    if (!leaveAllowed()) return
    navigationEpoch.current += 1
    setLoading(false); setUnsavedDraft(null); setDirty(false); setError(''); setNotice(''); setScreen(next)
  }
  function startDemo() {
    if (!leaveAllowed()) return
    navigationEpoch.current += 1
    setLoading(false); setUnsavedDraft(null); setDirty(false); setDemo(true); setExpired(false); setScreen('projects'); setProject(null); setProjects([]); setOffset(0); setArchived(false); setError('')
  }
  function exitDemo() {
    if (!leaveAllowed()) return
    navigationEpoch.current += 1
    setLoading(false); setUnsavedDraft(null); setDemo(false); setProjects([]); setProject(null); setScreen('projects'); setDirty(false); setOffset(0); setArchived(false); setError('')
  }
  async function openProject(item: Project) {
    if (!leaveAllowed()) return
    const epoch = ++navigationEpoch.current
    const stillCurrent = () => navigationEpoch.current === epoch && requestContext.current.demo === demo && requestContext.current.token === token && requestContext.current.orgId === orgId
    setLoading(true); setError('')
    try {
      const fresh = demo ? demoStore.list().find((entry) => entry.id === item.id) : await api.project(orgId, item.id, token!)
      if (!stillCurrent()) return
      if (!fresh) throw new Error('This project no longer exists. Reload the project list.')
      setProject(fresh); setBounds(fresh.site.bounds); setScreen('project'); setDirty(false); setUnsavedDraft(null); setNotice(''); setGeometryOpen(false)
    } catch (reason) { if (stillCurrent()) report(reason) }
    finally { if (stillCurrent()) setLoading(false) }
  }
  async function saveBrief(input: ProjectInput) {
    const ownerEpoch = identityEpoch.current
    const stillCurrent = () => ownerEpoch === identityEpoch.current && requestContext.current.demo === demo && requestContext.current.orgId === orgId
    setSaving(true); setError('')
    try {
      const saved = screen === 'edit' && project
        ? demo ? demoStore.update(project.id, project.revision, input) : await api.update(orgId, project.id, { ...input, expected_revision: project.revision }, token!)
        : demo ? demoStore.create(input) : await api.create(orgId, input, token!)
      if (!stillCurrent()) return
      setProject(saved); setBounds(saved.site.bounds); setDirty(false); setUnsavedDraft(null); setScreen('project'); setNotice(demo ? 'Saved in this browser’s Demo storage.' : 'Project saved.'); void loadProjects()
    } catch (reason) { if (stillCurrent()) report(reason) }
    finally { setSaving(false) }
  }
  async function toggleArchive() {
    if (!project || !window.confirm(`${project.archived ? 'Restore' : 'Archive'} “${project.name}”? ${project.archived ? 'It will return to active projects.' : 'You can restore it from archived projects.'}`)) return
    setSaving(true); setError('')
    const ownerEpoch = identityEpoch.current
    const stillCurrent = () => ownerEpoch === identityEpoch.current && requestContext.current.demo === demo && requestContext.current.orgId === orgId
    try {
      const saved = demo ? demoStore.update(project.id, project.revision, { archived: !project.archived }) : await api.update(orgId, project.id, { expected_revision: project.revision, archived: !project.archived }, token!)
      if (!stillCurrent()) return
      setProject(saved); setNotice(saved.archived ? 'Project archived. You can restore it here or from the archived list.' : 'Project restored.'); void loadProjects()
    } catch (reason) { if (stillCurrent()) report(reason) }
    finally { setSaving(false) }
  }
  async function signOut() {
    if (!leaveAllowed()) return
    setSaving(true)
    try { navigationEpoch.current += 1; const result = await supabase?.auth.signOut(); if (result?.error) throw result.error; setExpired(false); setError(''); setDirty(false); setUnsavedDraft(null) }
    catch (reason) { report(reason) }
    finally { setSaving(false) }
  }
  const loggedIn = demo || (session && !expired && !recovery)
  const title = screen === 'projects' ? 'Your projects' : screen === 'explore' ? 'Explore Map' : screen === 'create' ? 'A place. A purpose. A project.' : screen === 'edit' ? 'Edit project brief' : project?.name ?? 'Site Plan'

  return <div className="app-shell">
    <a className="skip-link" href="#main-content">Skip to main content</a>
    <aside className="sidebar"><button className="brand" onClick={() => loggedIn && navigate('projects')} aria-label="InfraShader home"><span className="brand-symbol"><Leaf size={23} /></span><span>InfraShader<small>OUTDOOR PLANNING</small></span></button>
      <div className="workspace-label">{demo ? 'LOCAL WORKSPACE' : 'WORKSPACE'}</div>
      <nav aria-label="Main navigation"><button className={screen === 'projects' ? 'nav-item active' : 'nav-item'} disabled={!loggedIn} onClick={() => navigate('projects')}><FolderOpen size={19} />Projects</button><button className={screen === 'explore' || screen === 'create' ? 'nav-item active' : 'nav-item'} disabled={!loggedIn || (!demo && !orgId)} onClick={() => navigate('explore')}><Map size={19} />Explore Map<ArrowRight size={14} /></button></nav>
      <div className="sidebar-bottom"><div className="sidebar-note"><Leaf size={19} /><strong>Start with what you know.</strong><p>A site, an observation, a better possibility.</p></div><div className="sidebar-version">Ground-site foundation <span>v0.1</span></div></div>
    </aside>
    <div className="app-main"><header className="topbar"><div className="breadcrumb"><span>{loggedIn && organisation ? organisation.name : 'Workspace'}</span><ChevronRight size={14} /><strong>{loggedIn ? screen === 'projects' ? 'Projects' : 'Ground site' : 'Sign in'}</strong></div><div className="topbar-right"><span className="api-indicator" title={health === 'reachable' ? ready ? 'API and real services ready' : 'API reachable; real services require setup' : 'Local API not reachable'}><i className={health === 'reachable' ? ready ? 'ready' : 'partial' : ''} />{health === 'checking' ? 'Checking API' : health === 'reachable' ? ready ? 'Services ready' : 'API reachable · setup pending' : 'API unavailable'}</span><button className="icon-button" aria-label="Retry service health" onClick={() => void checkHealth()}><RefreshCw size={15} /></button>{loggedIn && <button className="button text compact" disabled={saving} onClick={demo ? exitDemo : () => void signOut()}><LogOut size={16} />{demo ? 'Exit Demo' : 'Sign out'}</button>}</div></header>
    {demo && <div className="demo-banner" role="status"><ShieldCheck size={16} /><strong>Browser Demo</strong><span>Local browser storage only · separate from real services · no acceptance evidence</span></div>}
    <main id="main-content" tabIndex={-1}>
      {authLoading ? <div className="loading-state" role="status">Restoring your session…</div> : !loggedIn ? <AuthPanel onDemo={startDemo} recovery={recovery} onRecovered={() => setRecovery(false)} expired={expired} /> : <>
      <div className="page-heading"><div>{screen !== 'projects' && <button className="back-link" onClick={() => navigate(screen === 'edit' ? 'project' : 'projects')}><ArrowLeft size={14} />{screen === 'edit' ? 'Back to project' : 'All projects'}</button>}<span className="eyebrow">{screen === 'projects' ? 'A clearer starting point' : screen === 'explore' ? '01 / Locate your site' : screen === 'create' ? '02 / Frame the brief' : 'Ground-site workspace'}</span><h1>{title}</h1><p>{screen === 'projects' ? 'From a place on the map to a project with purpose.' : screen === 'explore' ? 'Navigate the coordinate canvas or enter a known site extent.' : screen === 'create' ? 'Capture the essentials. The rest of your brief can grow as you learn.' : screen === 'edit' ? 'Update your purpose, stakeholder and project assumptions.' : `${project ? purposeLabel(project.purpose) : ''} · ${project?.stakeholder ?? ''}`}</p></div>
      {screen === 'projects' && <button className="button primary" disabled={!organisation || loading} onClick={() => navigate('explore')}><Plus size={18} />New project</button>}
      {screen === 'project' && <div className="heading-actions"><span className="save-badge"><Check size={14} />{saving ? 'Saving…' : `Saved · revision ${project?.revision}`}</span><button className="button secondary" disabled={saving || loading} onClick={() => navigate('edit')}><Pencil size={16} />Edit brief</button></div>}</div>
      {!demo && organisations.length > 0 && screen === 'projects' && <label className="org-picker">Organisation<select value={orgId} disabled={loading} onChange={(e) => { setOrgId(e.target.value); setProjects([]); setOffset(0); setProject(null) }}>{organisations.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.role}</option>)}</select></label>}
      {error && <div className="notice error" role="alert"><div><strong>We couldn’t complete that action.</strong><p>{error}</p></div><button className="button secondary compact" onClick={() => project && (screen === 'edit' || screen === 'project') ? void openProject(project) : orgId || demo ? void loadProjects() : void loadSession()}><RefreshCw size={15} />{screen === 'edit' ? 'Reload saved project' : 'Retry'}</button></div>}
      {notice && <div className="notice success" role="status"><Check size={17} />{notice}</div>}
      {screen === 'projects' && unsavedDraft && !demo && unsavedDraft.userId === session?.user.id && unsavedDraft.orgId === orgId && organisation && <div className="notice warning"><span>Your unsaved brief is still held in this tab. Recover it after signing in, then review before saving. Closing this tab will discard it.</span><button className="button secondary compact" onClick={() => { setProject(unsavedDraft.project); setBounds(unsavedDraft.input.site.bounds); setScreen(unsavedDraft.screen); setDirty(true); setError('') }}>Recover unsaved brief</button></div>}
      {!demo && !organisation && <div className="empty-state small"><ShieldCheck size={32} /><h2>{loading ? 'Loading organisation access…' : 'No organisation workspace available'}</h2><p>{error ? 'Resolve the service or access error above, then retry.' : 'An operator must provision your organisation membership before you can create projects.'}</p><button className="button secondary" disabled={loading} onClick={() => void loadSession()}>Retry membership lookup</button></div>}
      {screen === 'projects' && organisation && <>
        <div className="projects-toolbar"><div className="segmented" aria-label="Project list filter"><button className={!archived ? 'selected' : ''} onClick={() => { setArchived(false); setOffset(0); setProjects([]) }}>Active projects</button><button className={archived ? 'selected' : ''} onClick={() => { setArchived(true); setOffset(0); setProjects([]) }}>Archived</button></div><button className="button text compact" disabled={loading} onClick={() => void loadProjects()}><RefreshCw size={15} />Refresh</button></div>
        {loading ? <div className="loading-state" role="status">Loading projects…</div> : projects.length === 0 ? <div className="empty-state"><div className="empty-illustration" aria-hidden="true"><MapPin size={34} /><span /><span /></div><span className="eyebrow">{archived ? 'Room to return' : 'Every project begins somewhere'}</span><h2>{archived ? 'No archived projects' : 'Find your first site.'}</h2><p>{archived ? 'Projects you archive will appear here. You can restore them when you are ready.' : 'Explore the map, select a site extent, then give your project a name and a purpose.'}</p>{!archived && <button className="button primary" onClick={() => navigate('explore')}>Explore Map<ArrowRight size={17} /></button>}</div> : <div className="project-grid">{projects.map((item) => <button className="project-card" key={item.id} onClick={() => void openProject(item)}><div className="project-thumbnail" aria-hidden="true"><MapPin size={25} /><span>{item.archived ? 'ARCHIVED' : 'GROUND SITE'}</span></div><div className="project-card-body"><span className="eyebrow">{purposeLabel(item.purpose)}</span><h2>{item.name}</h2><p>{item.stakeholder}</p><div className="project-card-footer"><span>Brief · rev {item.revision}</span><span>{new Date(item.updated_at).toLocaleDateString('en-MY', { timeZone: item.timezone, day: 'numeric', month: 'short' })}<ArrowRight size={15} /></span></div></div></button>)}</div>}
        {total > 100 && <div className="pagination"><button className="button secondary" disabled={offset === 0 || loading} onClick={() => setOffset(Math.max(0, offset - 100))}>Previous</button><span>{offset + 1}–{Math.min(offset + 100, total)} of {total}</span><button className="button secondary" disabled={offset + 100 >= total || loading} onClick={() => setOffset(offset + 100)}>Next</button></div>}
        <div className="dashboard-note"><CircleHelp size={18} /><div><strong>Build understanding before comparing options.</strong><p>Start with a brief and locator, then open the geometry workspace to define targets and independent options. Real calculations require the configured local services.</p></div></div>
      </>}
      {screen === 'explore' && organisation && <div className="map-workspace"><Suspense fallback={<MapFallback />}><SiteMap bounds={bounds} onViewport={setViewport} onSelect={setBounds} /></Suspense><aside className="context-panel"><div className="panel-section"><span className="eyebrow">Your starting point</span><h2>Select a site extent</h2><p>Enter known coordinates, or pan and zoom then use the current map view. No location data is inferred.</p><PlaceSearch onSelect={setBounds} /><BoundsForm key={bounds.join(',')} initial={bounds} viewport={viewport} onApply={setBounds} /></div><div className="selected-location"><MapPin size={19} /><div><strong>Selected geographic extent</strong><span>{bounds[0].toFixed(5)}, {bounds[1].toFixed(5)} →<br />{bounds[2].toFixed(5)}, {bounds[3].toFixed(5)}</span></div></div><div className="panel-section"><button className="button primary full" onClick={() => navigate('create')}>Continue with this site<ArrowRight size={17} /></button><p className="fine-print">Small-site locator only. Draw and verify the actual boundary at the geometry milestone.</p></div></aside></div>}
      {(screen === 'create' || screen === 'edit') && organisation && <div className="brief-layout"><section className="paper"><BriefForm key={screen === 'edit' ? project?.id : 'new'} initial={unsavedDraft?.input ?? (screen === 'edit' && project ? project : emptyBrief(bounds))} saving={saving} onSave={(input) => void saveBrief(input)} onCancel={() => navigate(screen === 'edit' ? 'project' : 'explore')} onDirty={setDirty} onDraftChange={(input) => setUnsavedDraft({ input, project: screen === 'edit' ? project : null, screen, orgId, userId: session?.user.id ?? 'demo' })} editing={screen === 'edit'} /></section><aside className="brief-side"><div className="mini-site"><MapPin size={25} /><span>SELECTED SITE</span></div><h3>A grounded brief</h3><p>A good project starts with an honest account of the place, the people and the problem.</p><div className="brief-tip"><Check size={16} /><span>Name, stakeholder and site extent are required.</span></div><div className="brief-tip"><Check size={16} /><span>Save an incomplete brief and return to it later.</span></div><div className="brief-tip"><ShieldCheck size={16} /><span>Purpose changes your workflow, never your permissions.</span></div><span className="save-badge">{saving ? 'Saving…' : dirty ? 'Unsaved changes' : 'Ready to edit'}</span></aside></div>}
      {screen === 'project' && project && <><div className="project-tabs"><span className="selected"><Map size={16} />Site Plan</span><span>Brief & site locator</span>{project.archived && <span className="archive-badge">Archived project</span>}</div><div className="map-workspace"><Suspense fallback={<MapFallback />}><SiteMap key={project.id} bounds={project.site.bounds} readOnly /></Suspense><aside className="context-panel"><div className="panel-section"><span className="eyebrow">Project brief</span><h2>{project.purpose === 'contractor_proposal' ? 'Client proposal foundation' : 'Decision foundation'}</h2><dl className="brief-details"><dt>Problem</dt><dd>{project.problem || 'Not recorded yet'}</dd><dt>Intended users</dt><dd>{project.intended_users || 'Not recorded yet'}</dd><dt>Desired outcome</dt><dd>{project.desired_outcome || 'Not recorded yet'}</dd><dt>Relevant use times</dt><dd>{project.use_periods || 'Not recorded yet'}</dd><dt>Timezone / currency</dt><dd>{project.timezone} · {project.currency}</dd></dl>{(!project.problem || !project.intended_users || !project.desired_outcome) && <div className="notice small">Brief incomplete. Add your observations before comparing options.</div>}</div><div className="panel-section border-top"><h3>Site extent</h3><p className="coordinate-readout">{project.site.bounds.map((n) => n.toFixed(6)).join(' / ')}</p><p className="fine-print">EPSG:4326 · west / south / east / north. A locator, not a surveyed boundary. No metric quantities calculated.</p></div><div className="panel-section border-top"><button className="button secondary full" disabled={saving || loading} onClick={() => void openProject(project)}><RefreshCw size={15} />Reload saved project</button><button className="button text full" disabled={saving} onClick={() => void toggleArchive()}>{project.archived ? <RotateCcw size={15} /> : <Archive size={15} />}{project.archived ? 'Restore project' : 'Archive project'}</button></div></aside></div><div className="dashboard-note"><Leaf size={20} /><div><strong>Continue with boundary, targets and work items.</strong><p>Open the geometry workspace below. Real calculations and issued outputs require an authenticated organisation workspace; Browser Demo keeps draft geometry only.</p></div></div></>}
      {screen === 'project' && project && <div className="mt-6"><button className="button primary" onClick={() => { if (!geometryOpen || leaveAllowed()) { setGeometryOpen(!geometryOpen); setDirty(false) } }}>{geometryOpen ? 'Close geometry workspace' : 'Open geometry workspace'}</button>{geometryOpen && <Suspense fallback={<p role="status">Loading drawing tools…</p>}><GeometryWorkspace key={`${demo}/${project.id}`} project={project} token={token} demo={demo} onDirty={setDirty} /></Suspense>}</div>}
      </>}
    </main><footer className="app-footer"><span>InfraShader · Ground-site workspace</span><span>Local build · No deployment</span></footer></div>
  </div>
}
