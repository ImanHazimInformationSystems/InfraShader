import type { SiteOutline } from './domain/site-selection'
import WorkspaceNavigation from './product/WorkspaceNavigation'
import { productPath, type ProductFeature } from './product/model'
import type { Tool } from './components/StudioShell'
import BriefCheckpointPanel from './components/BriefCheckpointPanel'
import { captureOpportunityToken } from './domain/opportunities'
import { requestStudiesStep } from './domain/studies-guide'
import DeleteProject, { DeletedProjectFiles } from './components/DeleteProject'
import {
  OpportunitySummary,
  ProjectTable,
  ProjectHubActions,
  ProjectClient,
} from './components/ProjectHub'
import HubLibrary from './components/HubLibrary'
import OrganisationOnboarding from './components/OrganisationOnboarding'
import StartPage from './components/StartPage'
import ProjectAccess from './components/ProjectAccess'
import { ExampleBanner, ReviewExample, StudioExamples } from './components/ExampleProjects'
import { ProjectRecords, ReviewProjectDetails, ReviewFolderIntro } from './components/ReviewLayout'
import ProjectDashboardCard from './components/ProjectDashboardCard'
import { timeText, type Clock } from './services/environment'
import BriefReadiness from './components/BriefReadiness'
import { DisplayUnitsContext, type DisplayUnits } from './services/display-units'
import { useBlocker, useLocation, useNavigate } from 'react-router-dom'
import { parseRoute, screenPath, type Screen } from './services/routes'
import { clearWorkspaceDrafts } from './services/workspace-draft'
import SettingsPage from './components/SettingsPage'
import { settingsSchema } from './domain/settings'
import { request } from './services/api'
import ProjectHistory from './components/ProjectHistory'
import ExploreWorkspace from './components/ExploreWorkspace'
import type { SiteTree } from './domain/trees'
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  CircleHelp,
  CircleDot,
  FileText,
  FolderOpen,
  LayoutGrid,
  Leaf,
  LogOut,
  List,
  Map,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  UserRound,
} from 'lucide-react'
import AuthPanel from './components/AuthPanel'
import BriefForm from './components/BriefForm'
import {
  emptyBrief,
  opportunityStages,
  initialBounds,
  purposeLabel,
  type Bounds,
  type Organisation,
  type Project,
  type ProjectInput,
} from './domain/projects'
import { api, ApiError, readinessSchema, reference } from './services/api'
import { DemoStore, DEMO_ORGANISATION_ID } from './services/demo'
import { supabase } from './services/auth'

type UnsavedDraft = {
  input: ProjectInput
  project: Project | null
  screen: 'create' | 'edit'
  orgId: string
  userId: string
}
const demoStore = new DemoStore()
const SiteMap = lazy(() => import('./components/SiteMap'))
const GeometryWorkspace = lazy(() => import('./components/GeometryWorkspace'))
const OwnerEvaluation = lazy(() => import('./components/OwnerEvaluation'))
const OpportunityInvitations = lazy(() => import('./components/OpportunityInvitations'))
const OpportunityAccept = lazy(() => import('./components/OpportunityAccept'))
const StudioOpportunities = lazy(() => import('./components/StudioOpportunities'))

const ChangeRegister = lazy(() => import('./components/ChangeRegister'))
const OwnerReviewDashboard = lazy(() =>
  import('./components/OwnerEvaluation').then((module) => ({
    default: module.OwnerReviewDashboard,
  })),
)
const ProductWorkspace = lazy(() => import('./product/ProductWorkspace'))
function MapFallback() {
  return (
    <div className="site-map loading-state" role="status">
      Loading the map workspace…
    </div>
  )
}
const demoOrganisation: Organisation = {
  id: DEMO_ORGANISATION_ID,
  name: 'Browser Demo',
  role: 'local only',
  capabilities: [],
}

function displayError(reason: unknown): string {
  // Server-side failures already carry their short reference in the message.
  if (reason instanceof ApiError)
    return `${reason.message}${reason.status < 500 ? reference(reason.requestId) : ''}`
  return reason instanceof Error ? reason.message : 'Something went wrong. Please retry.'
}

export default function App() {
  const [defaultTimezone, setDefaultTimezone] = useState('Asia/Kuala_Lumpur')
  const [displayUnits, setDisplayUnits] = useState<DisplayUnits>('metric')
  const [session, setSession] = useState<Session | null>(null)
  const [authLoading, setAuthLoading] = useState(Boolean(supabase))
  const [recovery, setRecovery] = useState(false)
  const [expired, setExpired] = useState(false)
  const [demo, setDemo] = useState(false)
  const [screen, setScreenState] = useState<Screen>('home')
  const location = useLocation()
  const routeNavigate = useNavigate()
  const handledRoute = useRef('')
  const [organisations, setOrganisations] = useState<Organisation[]>([])
  const [sessionReady, setSessionReady] = useState(false)
  const [orgId, setOrgId] = useState('')
  const [workspaceMode, setWorkspaceMode] = useState<'studio' | 'review'>('studio')
  const workspaceModeRef = useRef(workspaceMode)
  useLayoutEffect(() => {
    workspaceModeRef.current = workspaceMode
  }, [workspaceMode])
  const [joining, setJoining] = useState(() => window.location.hash.startsWith('#invite='))
  const [invitation] = useState(() => {
    const value = new URLSearchParams(window.location.hash.slice(1)).get('invite') ?? ''
    if (value) window.history.replaceState(null, '', window.location.pathname)
    return value
  })
  const [projects, setProjects] = useState<Project[]>([])
  // S03/L25: an opportunity invitation token from the URL fragment, removed from the URL at once.
  const [opportunityToken, setOpportunityToken] = useState(() => captureOpportunityToken())
  const [opportunityRefresh, setOpportunityRefresh] = useState(0)
  const [opportunityId, setOpportunityId] = useState('')
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [archived, setArchived] = useState(false)
  const [projectQuery, setProjectQuery] = useState('')
  const [searchText, setSearchText] = useState('')
  const [projectSort, setProjectSort] = useState('updated')
  const [projectStage, setProjectStage] = useState('')
  const [projectPurpose, setProjectPurpose] = useState('')
  const [opportunityFilter, setOpportunityFilter] = useState('')
  const [tableView, setTableView] = useState(false)
  const [project, setProject] = useState<Project | null>(null)
  const [siteOutline, setSiteOutline] = useState<SiteOutline | null>(null)
  const treeOwner = `${orgId}/${session?.user.id ?? 'demo'}/${demo}`
  const [treeDraft, setTreeDraft] = useState<{ owner: string; trees: SiteTree[] }>({
    owner: treeOwner,
    trees: [],
  })
  const siteTrees = treeDraft.owner === treeOwner ? treeDraft.trees : []
  const setSiteTrees = (trees: SiteTree[]) => setTreeDraft({ owner: treeOwner, trees })
  const [bounds, setBounds] = useState<Bounds>(initialBounds)
  const [explorerClock, setExplorerClock] = useState<Clock | null>(null)
  const [viewport, setViewport] = useState<Bounds>()
  const [dirty, setDirty] = useState(false)
  const [geometryOpen, setGeometryOpen] = useState(false)
  const [workspaceEntryTool, setWorkspaceEntryTool] = useState<Tool>()
  const [unsavedDraft, setUnsavedDraft] = useState<UnsavedDraft | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [health, setHealth] = useState<'checking' | 'reachable' | 'unavailable'>('checking')
  const [ready, setReady] = useState(false)
  const [setupNote, setSetupNote] = useState<'' | 'migrations' | 'waking'>('')
  const token = session?.access_token
  const organisation = demo ? demoOrganisation : organisations.find((item) => item.id === orgId)
  useEffect(() => {
    let active = true
    if (!demo && orgId && token)
      request(`/api/v1/organisations/${orgId}/settings`, settingsSchema, token)
        .then((value) => {
          if (active) {
            setDefaultTimezone(value.settings.timezone)
            setDisplayUnits(value.settings.units)
          }
        })
        .catch(() => {})
    return () => {
      active = false
    }
  }, [demo, orgId, token, organisations])
  const can = (cap: string) => demo || Boolean(organisation?.capabilities.includes(cap))
  const projectCan = (cap: string) => demo || Boolean(project?.capabilities?.includes(cap))
  const hasWorkspace = demo || Boolean(organisation?.workspaces?.includes(workspaceMode))
  const requestContext = useRef({
    demo,
    token,
    orgId,
    archived,
    offset,
    projectQuery,
    projectSort,
    projectStage,
    projectPurpose,
    opportunityFilter,
    workspaceMode: 'studio' as 'studio' | 'review',
  })
  const navigationEpoch = useRef(0)
  const identityEpoch = useRef(0)
  const authUserId = useRef<string | null>(null)
  const routeContext = useRef({ project, demo })
  useLayoutEffect(() => {
    routeContext.current = { project, demo }
  }, [project, demo])
  const setScreen = useCallback(
    (next: Screen, selected: Project | null = routeContext.current.project) => {
      setScreenState(next)
      const path = screenPath(next, selected, routeContext.current.demo, workspaceModeRef.current)
      if (path !== window.location.pathname) void routeNavigate(path)
    },
    [routeNavigate],
  )

  useLayoutEffect(() => {
    requestContext.current = {
      demo,
      token,
      orgId,
      archived,
      offset,
      projectQuery,
      projectSort,
      projectStage,
      projectPurpose,
      opportunityFilter,
      workspaceMode,
    }
  }, [
    demo,
    token,
    orgId,
    archived,
    offset,
    projectQuery,
    projectSort,
    projectStage,
    projectPurpose,
    opportunityFilter,
    workspaceMode,
  ])

  useEffect(() => {
    if (!supabase) return
    let active = true
    void supabase.auth.getSession().then(({ data, error: reason }) => {
      if (!active) return
      authUserId.current = data.session?.user.id ?? null
      setSession(data.session)
      setAuthLoading(false)
      if (reason) setError('Your saved session could not be restored. Sign in again.')
    })
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      const nextUserId = nextSession?.user.id ?? null
      if (authUserId.current !== nextUserId) {
        identityEpoch.current += 1
        navigationEpoch.current += 1
        setProject(null)
        setProjects([])
        setSessionReady(false)
        setOrganisations([])
        setOrgId('')
        setScreenState('projects')
        setDirty(false)
        setJoining(Boolean(invitation))
        if (nextUserId)
          setUnsavedDraft((current) => (current?.userId === nextUserId ? current : null))
        authUserId.current = nextUserId
      }
      setSession(nextSession)
      setAuthLoading(false)
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
      if (event === 'SIGNED_OUT') {
        setSessionReady(false)
        setOrganisations([])
        setOrgId('')
        setProjects([])
        setProject(null)
        setDirty(false)
        void routeNavigate('/home', { replace: true })
      }
      if (event === 'SIGNED_IN') setExpired(false)
    })
    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [setScreen, invitation, routeNavigate])

  const checkHealth = useCallback(async () => {
    setHealth('checking')
    setReady(false)
    setSetupNote('')
    try {
      await api.health()
      setHealth('reachable')
      const result = await api.readiness()
      setReady(result.status === 'ready')
    } catch (reason) {
      if (!(reason instanceof ApiError && reason.status === 503)) {
        setHealth('unavailable')
        if (reason instanceof ApiError && reason.code === 'timeout') setSetupNote('waking')
        return
      }
      const checks = readinessSchema.safeParse(reason.body).data?.checks ?? {}
      setSetupNote(checks.database === 'migrations_pending' ? 'migrations' : '')
    }
  }, [])
  // This effect starts an external health request and its loading indicator.
  useEffect(() => {
    // External request with an explicit loading state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void checkHealth()
  }, [checkHealth])

  const report = useCallback(
    (reason: unknown) => {
      setError(displayError(reason))
      if (reason instanceof ApiError && reason.status === 401) {
        setExpired(true)
        setProject(null)
        setProjects([])
        setDirty(false)
        setScreen('projects')
      }
    },
    [setScreen],
  )

  const loadSession = useCallback(async () => {
    if (demo || !token) return
    const stillCurrent = () =>
      !requestContext.current.demo && requestContext.current.token === token
    setLoading(true)
    setError('')
    try {
      const info = await api.session(token)
      if (!stillCurrent()) return
      setOrganisations(info.organisations)
      let preference: { org?: string; workspace?: 'studio' | 'review' } = {}
      try {
        const stored = JSON.parse(
          localStorage.getItem(`infrashader.access.${session?.user.id}`) ?? '{}',
        )
        if (stored && typeof stored === 'object' && !Array.isArray(stored)) preference = stored
      } catch {
        /* Preferences are optional. */
      }
      // A project deep link names its organisation. With several memberships nothing else would
      // select it, and the route waits for a selection, so the link stopped at "Choose an
      // organisation". It is an explicit request, so it outranks the stored preference.
      const routeOrg = parseRoute(window.location.pathname)?.org
      const selected =
        info.organisations.find((o) => o.id === requestContext.current.orgId) ??
        info.organisations.find((o) => o.id === routeOrg) ??
        info.organisations.find((o) => o.id === preference.org) ??
        (info.organisations.length === 1 ? info.organisations[0] : undefined)
      setSessionReady(true)
      setOrgId(selected?.id ?? '')
      const requested = parseRoute(window.location.pathname)?.workspace
      const chosen =
        requested && selected?.workspaces?.includes(requested)
          ? requested
          : preference.workspace && selected?.workspaces?.includes(preference.workspace)
            ? preference.workspace
            : selected?.workspaces?.includes('studio')
              ? 'studio'
              : (selected?.workspaces?.[0] ?? 'studio')
      setWorkspaceMode(chosen)
      workspaceModeRef.current = chosen
      if (!selected || selected.id !== requestContext.current.orgId) {
        navigationEpoch.current++
        setProject(null)
        setProjects([])
        setGeometryOpen(false)
        setDirty(false)
        handledRoute.current = ''
      }
      if (
        selected &&
        routeContext.current.project &&
        routeContext.current.project.organisation_id === selected.id
      ) {
        try {
          const fresh = await api.project(selected.id, routeContext.current.project.id, token)
          if (stillCurrent())
            setProject((current) =>
              current?.id === fresh.id
                ? {
                    ...current,
                    capabilities: fresh.capabilities,
                    organisation_capabilities: fresh.organisation_capabilities,
                  }
                : current,
            )
        } catch {
          if (stillCurrent()) {
            setProject(null)
            setProjects([])
            setGeometryOpen(false)
            setDirty(false)
            setError('Project access changed. Choose an available project.')
            setScreen('projects')
          }
        }
      }
    } catch (reason) {
      if (stillCurrent()) report(reason)
    } finally {
      if (stillCurrent()) setLoading(false)
    }
  }, [demo, token, report, session, setScreen])
  // Session changes require an external membership lookup; loading is explicit.
  useEffect(() => {
    // External request with an explicit loading state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadSession()
  }, [loadSession])

  useEffect(() => {
    if (!token || demo) return
    const refresh = () => void loadSession()
    const timer = window.setInterval(refresh, 30000)
    window.addEventListener('focus', refresh)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', refresh)
    }
  }, [token, demo, loadSession])
  useEffect(() => {
    if (!demo && session && organisation) {
      try {
        localStorage.setItem(
          `infrashader.access.${session.user.id}`,
          JSON.stringify({ org: organisation.id, workspace: workspaceMode }),
        )
      } catch {
        /* Optional preferences. */
      }
    }
  }, [demo, session, organisation, workspaceMode])
  useEffect(() => {
    const expired = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== requestContext.current.token) return
      setExpired(true)
      setProject(null)
      setProjects([])
      setDirty(false)
    }
    window.addEventListener('infrashader:session-expired', expired)
    return () => window.removeEventListener('infrashader:session-expired', expired)
  }, [])
  const loadProjects = useCallback(async () => {
    if (!demo && (!token || !orgId)) return
    const stillCurrent = () => {
      const context = requestContext.current
      return (
        context.demo === demo &&
        context.token === token &&
        context.orgId === orgId &&
        context.archived === archived &&
        context.offset === offset &&
        context.projectQuery === projectQuery &&
        context.projectSort === projectSort &&
        context.projectStage === projectStage &&
        context.projectPurpose === projectPurpose &&
        context.opportunityFilter === opportunityFilter &&
        context.workspaceMode === workspaceMode
      )
    }
    // Organisation Review lists reviews (owner-decision projects) only; Studio lists everything.
    const listPurpose = projectPurpose || (workspaceMode === 'review' ? 'developer_decision' : '')
    setLoading(true)
    setError('')
    try {
      if (demo) {
        const items = demoStore
          .list()
          .filter(
            (item) =>
              item.archived === archived &&
              (!projectStage || item.stage === projectStage) &&
              (!listPurpose || item.purpose === listPurpose) &&
              (!opportunityFilter ||
                (item.details?.opportunity?.stage ?? 'enquiry') === opportunityFilter) &&
              `${item.name} ${item.stakeholder} ${item.details?.opportunity?.owner ?? ''} ${item.details?.opportunity?.source ?? ''} ${item.details?.opportunity?.client?.name ?? ''} ${item.details?.opportunity?.tags.join(' ') ?? ''}`
                .toLowerCase()
                .includes(projectQuery.toLowerCase()),
          )
          .sort((a, b) =>
            projectSort === 'due'
              ? (a.details?.opportunity?.due_date ?? '9999').localeCompare(
                  b.details?.opportunity?.due_date ?? '9999',
                )
              : projectSort === 'name'
                ? a.name.localeCompare(b.name)
                : projectSort === 'created'
                  ? (b.created_at ?? b.updated_at).localeCompare(a.created_at ?? a.updated_at)
                  : b.updated_at.localeCompare(a.updated_at),
          )
        setProjects(items.slice(offset, offset + 100))
        setTotal(items.length)
      } else {
        const result = await api.projects(
          orgId,
          token!,
          archived,
          offset,
          projectQuery,
          projectSort,
          projectStage,
          opportunityFilter,
          listPurpose,
        )
        if (!stillCurrent()) return
        setProjects(result.items)
        setTotal(result.total)
      }
    } catch (reason) {
      if (stillCurrent()) {
        setProjects([])
        report(reason)
      }
    } finally {
      if (stillCurrent()) setLoading(false)
    }
  }, [
    demo,
    token,
    orgId,
    archived,
    offset,
    projectQuery,
    projectSort,
    projectStage,
    projectPurpose,
    opportunityFilter,
    workspaceMode,
    report,
  ])
  // Tenant/filter changes load external records (or the separate Demo store).
  useEffect(() => {
    // External request with an explicit loading state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadProjects()
  }, [loadProjects])
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const blocker = useBlocker(
    ({ historyAction, currentLocation, nextLocation }) =>
      historyAction === 'POP' &&
      (dirty || saving) &&
      currentLocation.pathname !== nextLocation.pathname,
  )
  useEffect(() => {
    if (blocker.state !== 'blocked') return
    if (!saving && window.confirm('You have unsaved changes. Discard them and continue?')) {
      if (screen !== 'product' && !demo && session && project) {
        try {
          clearWorkspaceDrafts(session.user.id, orgId, project.id)
        } catch {
          /* Tab storage can be unavailable. */
        }
      }
      // The external browser-history navigation was confirmed; clear its abandoned form state.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDirty(false)
      setUnsavedDraft(null)
      blocker.proceed()
    } else blocker.reset()
  }, [blocker, saving, demo, session, project, orgId, screen])
  useEffect(() => {
    if (!demo && (!session || expired || recovery || !orgId)) return
    const key = `${demo ? 'demo' : session?.user.id}/${orgId}/${workspaceMode}/${location.pathname}`
    if (handledRoute.current === key) return
    const route = parseRoute(location.pathname)
    let active = true
    async function followRoute() {
      if (!route) {
        setError('This page does not exist. Choose Projects or Explore Map.')
        setScreenState('projects')
        handledRoute.current = key
        return
      }
      if (!demo && route.project && route.org !== orgId) {
        if (organisations.some((org) => org.id === route.org)) {
          setProject(null)
          setProjects([])
          setOrgId(route.org!)
          return
        }
        setProject(null)
        setError('This project is unavailable to your account.')
        setScreenState('projects')
        handledRoute.current = key
        return
      }
      const activeOrg = organisations.find((o) => o.id === orgId)
      if (
        !demo &&
        route.screen !== 'settings' &&
        route.workspace &&
        !activeOrg?.workspaces?.includes(route.workspace)
      ) {
        setProject(null)
        setScreenState('projects')
        setError(
          'This workspace is not permitted for your membership. Choose an available workspace or Settings.',
        )
        handledRoute.current = key
        return
      }
      if (route.workspace && route.workspace !== workspaceMode) {
        setWorkspaceMode(route.workspace)
        workspaceModeRef.current = route.workspace
      }
      if (!demo && !route.workspace && activeOrg?.workspaces?.length && !route.project) {
        void routeNavigate(screenPath(route.screen, null, false, workspaceModeRef.current), {
          replace: true,
        })
      }
      if (!route.project) {
        if (route.screen === 'home') {
          setArchived(false)
          setOffset(0)
          setProjectQuery('')
          setSearchText('')
          setProjectStage('')
          setProjectPurpose('')
          setOpportunityFilter('')
        }
        setScreenState(route.screen)
        handledRoute.current = key
        return
      }
      if (Boolean(route.demo) !== demo) {
        setError(
          'This link belongs to a different workspace mode. Sign in for real projects or open Browser Demo for demo projects.',
        )
        setScreenState('projects')
        handledRoute.current = key
        return
      }
      if (project?.id === route.project) {
        setScreenState(route.screen)
        handledRoute.current = key
        return
      }
      setLoading(true)
      setError('')
      setProject(null)
      try {
        const fresh = demo
          ? demoStore.list().find((item) => item.id === route.project)
          : await api.project(route.org!, route.project!, token!)
        if (!active) return
        if (!fresh) throw new Error('This project is unavailable to your account.')
        if (!demo && !route.workspace) {
          void routeNavigate(screenPath(route.screen, fresh, false, workspaceModeRef.current), {
            replace: true,
          })
        }
        setProject(fresh)
        setBounds(fresh.site.bounds)
        setSiteOutline(fresh.site.outline ?? null)
        setScreenState(route.screen)
        setGeometryOpen(false)
        setDirty(false)
        setUnsavedDraft(null)
        handledRoute.current = key
      } catch (reason) {
        if (active) {
          setError(displayError(reason))
          setScreenState('projects')
          handledRoute.current = key
        }
      } finally {
        if (active) setLoading(false)
      }
    }
    void followRoute()
    return () => {
      active = false
    }
  }, [
    location.pathname,
    demo,
    session,
    expired,
    recovery,
    orgId,
    organisations,
    project?.id,
    token,
    workspaceMode,
    routeNavigate,
  ])

  function leaveAllowed() {
    if (
      saving ||
      (dirty && !window.confirm('You have unsaved changes. Discard them and continue?'))
    )
      return false
    if (dirty && screen !== 'product' && !demo && session && project) {
      try {
        clearWorkspaceDrafts(session.user.id, orgId, project.id)
      } catch {
        /* Storage may be disabled. */
      }
    }
    return true
  }
  function navigate(next: Screen) {
    if (!leaveAllowed()) return
    navigationEpoch.current += 1
    setLoading(false)
    setUnsavedDraft(null)
    setDirty(false)
    setError('')
    setNotice('')
    if (next === 'home') {
      setArchived(false)
      setOffset(0)
      setProjectQuery('')
      setSearchText('')
      setProjectStage('')
      setProjectPurpose('')
      setOpportunityFilter('')
    }
    setScreen(next)
  }
  function selectOrganisation(id: string) {
    if (!leaveAllowed()) return
    const selected = organisations.find((o) => o.id === id)
    navigationEpoch.current++
    handledRoute.current = ''
    setProject(null)
    setProjects([])
    setGeometryOpen(false)
    setDirty(false)
    setUnsavedDraft(null)
    setOffset(0)
    setError('')
    setOrgId(id)
    setJoining(false)
    const mode = selected?.workspaces?.includes(workspaceMode)
      ? workspaceMode
      : selected?.workspaces?.includes('studio')
        ? 'studio'
        : (selected?.workspaces?.[0] ?? 'studio')
    setWorkspaceMode(mode)
    workspaceModeRef.current = mode
    setScreen(screen === 'home' ? 'home' : 'projects', null)
  }
  function selectWorkspace(mode: 'studio' | 'review') {
    if ((!demo && !organisation?.workspaces?.includes(mode)) || !leaveAllowed()) return
    navigationEpoch.current++
    workspaceModeRef.current = mode
    setProject(null)
    setGeometryOpen(false)
    setDirty(false)
    setUnsavedDraft(null)
    // Let the destination route change the active workspace atomically. Updating
    // mode before React Router commits can reapply the previous URL's workspace.
    setScreenState('projects')
    void routeNavigate(`/${mode}`)
  }
  function startDemo() {
    if (!leaveAllowed()) return
    const requested = parseRoute(window.location.pathname)
    const resume = requested?.screen === 'product'
    const mode = resume ? (requested.workspace ?? 'studio') : 'studio'
    setWorkspaceMode(mode)
    workspaceModeRef.current = mode
    navigationEpoch.current += 1
    setLoading(false)
    setUnsavedDraft(null)
    setDirty(false)
    setDemo(true)
    setExpired(false)
    if (resume) {
      setScreenState('product')
      void routeNavigate(productPath(mode, requested.area!, requested.feature), { replace: true })
    } else {
      setScreenState('projects')
      void routeNavigate('/projects')
    }
    setProject(null)
    setProjects([])
    setOffset(0)
    setArchived(false)
    setError('')
  }
  function exitDemo() {
    if (!leaveAllowed()) return
    navigationEpoch.current += 1
    setLoading(false)
    setUnsavedDraft(null)
    setDemo(false)
    setProjects([])
    setProject(null)
    setScreen('projects')
    setDirty(false)
    setOffset(0)
    setArchived(false)
    setError('')
  }
  async function openProject(item: Project, entryTool?: Tool) {
    if (!leaveAllowed()) return
    const epoch = ++navigationEpoch.current
    const stillCurrent = () =>
      navigationEpoch.current === epoch &&
      requestContext.current.demo === demo &&
      requestContext.current.token === token &&
      requestContext.current.orgId === orgId
    setLoading(true)
    setError('')
    try {
      const fresh = demo
        ? demoStore.list().find((entry) => entry.id === item.id)
        : await api.project(orgId, item.id, token!)
      if (!stillCurrent()) return
      if (!fresh) throw new Error('This project no longer exists. Reload the project list.')
      setProject(fresh)
      setBounds(fresh.site.bounds)
      setSiteOutline(fresh.site.outline ?? null)
      setScreen('project', fresh)
      setDirty(false)
      setUnsavedDraft(null)
      setNotice('')
      setWorkspaceEntryTool(entryTool)
      setGeometryOpen(Boolean(entryTool) || workspaceMode !== 'review')
    } catch (reason) {
      if (stillCurrent()) report(reason)
    } finally {
      if (stillCurrent()) setLoading(false)
    }
  }
  async function saveBrief(input: ProjectInput) {
    const ownerEpoch = identityEpoch.current
    const stillCurrent = () =>
      ownerEpoch === identityEpoch.current &&
      requestContext.current.demo === demo &&
      requestContext.current.orgId === orgId
    setSaving(true)
    setError('')
    try {
      const saved =
        screen === 'edit' && project
          ? demo
            ? demoStore.update(project.id, project.revision, input)
            : await api.update(
                orgId,
                project.id,
                { ...input, expected_revision: project.revision },
                token!,
              )
          : demo
            ? demoStore.create(input)
            : await api.create(orgId, input, token!)
      if (!stillCurrent()) return
      setProject(saved)
      setBounds(saved.site.bounds)
      setSiteOutline(saved.site.outline ?? null)
      setDirty(false)
      setUnsavedDraft(null)
      setScreen('project', saved)
      setNotice(demo ? 'Saved in this browser’s Demo storage.' : 'Project saved.')
      setSiteTrees([])
      void loadProjects()
    } catch (reason) {
      if (stillCurrent()) report(reason)
    } finally {
      setSaving(false)
    }
  }
  async function toggleArchive() {
    if (
      !project ||
      !window.confirm(
        `${project.archived ? 'Restore' : 'Archive'} “${project.name}”? ${project.archived ? 'It will return to active projects.' : 'You can restore it from archived projects.'}`,
      )
    )
      return
    setSaving(true)
    setError('')
    const ownerEpoch = identityEpoch.current
    const stillCurrent = () =>
      ownerEpoch === identityEpoch.current &&
      requestContext.current.demo === demo &&
      requestContext.current.orgId === orgId
    try {
      const saved = demo
        ? demoStore.update(project.id, project.revision, { archived: !project.archived })
        : await api.update(
            orgId,
            project.id,
            { expected_revision: project.revision, archived: !project.archived },
            token!,
          )
      if (!stillCurrent()) return
      setProject(saved)
      setNotice(
        saved.archived
          ? 'Project archived. You can restore it here or from the archived list.'
          : 'Project restored.',
      )
      void loadProjects()
    } catch (reason) {
      if (stillCurrent()) report(reason)
    } finally {
      setSaving(false)
    }
  }
  async function signOut() {
    if (!leaveAllowed()) return
    setSaving(true)
    try {
      if (session) {
        try {
          clearWorkspaceDrafts(session.user.id)
        } catch {
          /* Disabled tab storage must not prevent sign-out. */
        }
      }
      navigationEpoch.current += 1
      const result = await supabase?.auth.signOut()
      if (result?.error) throw result.error
      setExpired(false)
      setError('')
      setDirty(false)
      setUnsavedDraft(null)
    } catch (reason) {
      report(reason)
    } finally {
      setSaving(false)
    }
  }
  const loggedIn = demo || Boolean(session && !expired && !recovery)
  const accountName =
    (typeof session?.user.user_metadata?.full_name === 'string'
      ? session.user.user_metadata.full_name
      : typeof session?.user.user_metadata?.display_name === 'string'
        ? session.user.user_metadata.display_name
        : '') ||
    session?.user.email?.split('@')[0] ||
    ''
  function selectSite(next: Bounds, shape: SiteOutline | null) {
    setBounds(next)
    setSiteOutline(shape)
    setUnsavedDraft((previous) =>
      previous && previous.orgId === orgId && previous.userId === (session?.user.id ?? 'demo')
        ? {
            ...previous,
            input: {
              ...previous.input,
              site: {
                ...previous.input.site,
                bounds: next,
                crs: 'EPSG:4326',
                outline: shape,
                trees: siteTrees,
              },
            },
          }
        : previous,
    )
  }
  const studioHome = screen === 'projects' && workspaceMode === 'studio'
  // Organisation Review: the comparison is the page; studio-style panels fold away below it.
  const reviewFocus =
    screen === 'project' &&
    !demo &&
    Boolean(token) &&
    workspaceMode === 'review' &&
    project?.purpose === 'developer_decision' &&
    (projectCan('review_project') || projectCan('issue_developer_brief'))
  const productRoute = parseRoute(location.pathname)
  function navigateProduct(area: string, feature?: string) {
    if (!leaveAllowed()) return
    navigationEpoch.current += 1
    setLoading(false)
    setDirty(false)
    setUnsavedDraft(null)
    setError('')
    setNotice('')
    void routeNavigate(productPath(workspaceMode, area, feature))
  }
  function openConnectedFeature(feature: ProductFeature, selected?: Project) {
    if (feature.tool === 'projects') return navigate('projects')
    if (feature.tool === 'explore') return navigate('explore')
    if (feature.tool === 'switcher') {
      setNotice(
        'Use the workspace switcher in the navigation. Available workspaces follow your active membership.',
      )
      return
    }
    if (feature.tool === 'settings') {
      if (!demo) return navigate('settings')
      setNotice(
        'Connected organisation settings require sign-in. Browser Demo does not change organisation records.',
      )
      return
    }
    if (!selected) {
      navigate('projects')
      setNotice(
        'Choose a saved project to open its existing tools. The preview has not changed project data.',
      )
      return
    }
    const tool = [
      'layout',
      'trees',
      'objects',
      'terrain',
      'materials',
      'pricing',
      'analysis',
      'rates',
      'shade',
      'sources',
    ].includes(feature.tool)
      ? (feature.tool as Tool)
      : undefined
    void openProject(selected, tool)
  }
  const hasProjectFilters = Boolean(
    projectQuery || projectStage || projectPurpose || opportunityFilter,
  )

  function clearProjectFilters() {
    setSearchText('')
    setProjectQuery('')
    setProjectStage('')
    setProjectPurpose('')
    setOpportunityFilter('')
    setOffset(0)
  }

  const title =
    screen === 'settings'
      ? 'Settings and members'
      : screen === 'projects'
        ? demo
          ? 'Your projects'
          : workspaceMode === 'review'
            ? 'Organisation Review'
            : 'Design Studio'
        : screen === 'explore'
          ? 'Explore Map'
          : screen === 'create'
            ? 'A place. A purpose. A project.'
            : screen === 'edit'
              ? 'Edit project brief'
              : (project?.name ?? 'Site Plan')

  // Brief acknowledgement and project copy/template actions. Design Studio shows them inside
  // the Project records disclosure; Organisation Review keeps them in place.
  const current = screen === 'project' ? project : null
  const projectAgreement = current && (
    <>
      {!demo && token && (
        <BriefCheckpointPanel
          key={`${current.id}:${current.revision}:${token}`}
          project={current}
          token={token}
        />
      )}
      {!demo && token && can('create_project') && projectCan('edit_project') && (
        <ProjectHubActions
          key={`${current.id}:${current.revision}:${orgId}:${token}`}
          project={current}
          token={token}
          onCreated={(created) => {
            void openProject(created)
            void loadProjects()
          }}
        />
      )}
    </>
  )
  return (
    <DisplayUnitsContext.Provider value={demo ? 'metric' : displayUnits}>
      <div className={screen === 'explore' && loggedIn ? 'app-shell explore-mode' : 'app-shell'}>
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        <WorkspaceNavigation
          workspace={workspaceMode}
          available={demo ? ['studio', 'review'] : (organisation?.workspaces ?? [])}
          loggedIn={loggedIn}
          demo={demo}
          screen={screen}
          area={productRoute?.area}
          onWorkspace={selectWorkspace}
          onPage={navigate}
          onArea={navigateProduct}
        />
        <div className="app-main">
          <header className="topbar">
            <div className="breadcrumb">
              {!demo && loggedIn && organisations.length > 0 ? (
                <select
                  className="product-org-picker"
                  aria-label="Active organisation"
                  value={orgId}
                  onChange={(event) => selectOrganisation(event.target.value)}
                >
                  {organisations.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name}
                    </option>
                  ))}
                </select>
              ) : (
                <span>{loggedIn && organisation ? organisation.name : 'Workspace'}</span>
              )}
              <ChevronRight size={14} />
              <strong>
                {loggedIn
                  ? screen === 'home'
                    ? 'Home'
                    : `${workspaceMode === 'studio' ? 'Design Studio' : 'Organisation Review'}${project && screen === 'project' ? ` / ${project.name}` : ''}`
                  : 'Sign in'}
              </strong>
            </div>
            <div className="topbar-right">
              <span
                className="api-indicator"
                title={
                  health === 'reachable'
                    ? ready
                      ? 'API and real services ready'
                      : setupNote === 'migrations'
                        ? 'The database needs pending migrations before some features work. An operator must run scripts/api.ps1 migrate.'
                        : 'API reachable; real services require setup'
                    : setupNote === 'waking'
                      ? 'The API did not answer in time. A sleeping host can take up to a minute to start; retry shortly.'
                      : 'API not reachable'
                }
              >
                <i className={health === 'reachable' ? (ready ? 'ready' : 'partial') : ''} />
                {health === 'checking'
                  ? 'Checking API'
                  : health === 'reachable'
                    ? ready
                      ? 'Services ready'
                      : setupNote === 'migrations'
                        ? 'API reachable · migrations pending'
                        : 'API reachable · setup pending'
                    : setupNote === 'waking'
                      ? 'API starting or slow'
                      : 'API unavailable'}
              </span>
              <button
                className="icon-button"
                aria-label="Retry service health"
                onClick={() => void checkHealth()}
              >
                <RefreshCw size={15} />
              </button>
              {loggedIn && !demo && (
                <button
                  className="button text compact account-profile-button"
                  onClick={() => navigate('settings')}
                  aria-label={`Open account settings${accountName ? ` for ${accountName}` : ''}`}
                >
                  <UserRound size={16} />
                  <span>{accountName || 'My account'}</span>
                </button>
              )}
              {loggedIn && (
                <button
                  className="button text compact"
                  disabled={saving}
                  onClick={demo ? exitDemo : () => void signOut()}
                >
                  <LogOut size={16} />
                  {demo ? 'Exit Demo' : 'Sign out'}
                </button>
              )}
            </div>
          </header>
          {demo && (
            <div className="demo-banner" role="status">
              <ShieldCheck size={16} />
              <strong>Browser Demo</strong>
              <span>
                Local browser storage only · separate from real services · no acceptance evidence
              </span>
            </div>
          )}
          <main
            id="main-content"
            className={loggedIn && workspaceMode === 'studio' ? 'studio-workspace-page' : undefined}
            data-screen={screen}
            tabIndex={-1}
          >
            {authLoading ? (
              <div className="loading-state" role="status">
                Restoring your session…
              </div>
            ) : !loggedIn ? (
              <AuthPanel
                onDemo={startDemo}
                recovery={recovery}
                onRecovered={() => setRecovery(false)}
                expired={expired}
              />
            ) : (
              <>
                {screen !== 'home' && (
                  <div className="page-heading">
                    <div>
                      {screen !== 'projects' && (
                        <button
                          className="back-link"
                          onClick={() => navigate(screen === 'edit' ? 'project' : 'projects')}
                        >
                          <ArrowLeft size={14} />
                          {screen === 'edit' ? 'Back to project' : 'All projects'}
                        </button>
                      )}
                      <span className="eyebrow">
                        {screen === 'projects'
                          ? studioHome
                            ? 'Your design workspace'
                            : 'A clearer starting point'
                          : screen === 'explore'
                            ? '01 / Locate your site'
                            : screen === 'create'
                              ? '02 / Frame the brief'
                              : workspaceMode === 'review'
                                ? 'Organisation Review project'
                                : 'Design Studio project'}
                      </span>
                      <h1>{title}</h1>
                      <p>
                        {screen === 'projects'
                          ? studioHome
                            ? 'Open a project to continue designing, or start a new one from the map.'
                            : 'From a place on the map to a project with purpose.'
                          : screen === 'settings'
                            ? 'Manage your profile, organisation defaults and member access.'
                            : screen === 'explore'
                              ? 'Explore the map in 2D or 3D and select your site.'
                              : screen === 'create'
                                ? 'Capture the essentials. The rest of your brief can grow as you learn.'
                                : screen === 'edit'
                                  ? 'Update your purpose, stakeholder and project assumptions.'
                                  : `${project ? purposeLabel(project.purpose) : ''} · ${project?.stakeholder ?? ''}`}
                      </p>
                    </div>
                    {screen === 'projects' && hasWorkspace && can('create_project') && (
                      <button
                        className="button primary"
                        disabled={!organisation || loading}
                        onClick={() => navigate(workspaceMode === 'review' ? 'create' : 'explore')}
                      >
                        <Plus size={18} />
                        New project
                      </button>
                    )}
                    {screen === 'project' && project && (
                      <div className="heading-actions">
                        <span className="save-badge">
                          <Check size={14} />
                          {saving ? 'Saving…' : `Brief saved · version ${project.revision}`}
                        </span>
                        <button
                          className="button secondary"
                          hidden={!projectCan('edit_project')}
                          disabled={saving || loading}
                          onClick={() => navigate('edit')}
                        >
                          <Pencil size={16} />
                          Edit brief
                        </button>
                        <button
                          className="button primary"
                          onClick={() => {
                            if (!geometryOpen || leaveAllowed()) {
                              setGeometryOpen(!geometryOpen)
                              setDirty(false)
                            }
                          }}
                        >
                          {workspaceMode === 'review' && !demo
                            ? geometryOpen
                              ? 'Close project review'
                              : 'Open project review'
                            : geometryOpen
                              ? 'Close design map'
                              : 'Open design map'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
                {(opportunityToken || opportunityId) && token && !demo && (
                  <Suspense fallback={<p role="status">Opening invitation…</p>}>
                    <OpportunityAccept
                      token={opportunityToken || undefined}
                      invitationId={opportunityId || undefined}
                      sessionToken={token}
                      onDismiss={() => {
                        setOpportunityToken('')
                        setOpportunityId('')
                      }}
                      onAccepted={(_, acceptedOrg) => {
                        setOpportunityToken('')
                        setOpportunityId('')
                        setOpportunityRefresh((value) => value + 1)
                        if (acceptedOrg !== orgId) selectOrganisation(acceptedOrg)
                        workspaceModeRef.current = 'studio'
                        setScreenState('projects')
                        void routeNavigate('/studio')
                      }}
                    />
                  </Suspense>
                )}
                {screen === 'home' && (
                  <StartPage
                    name={accountName}
                    timezone={demo ? 'Asia/Kuala_Lumpur' : defaultTimezone}
                    workspace={workspaceMode}
                    workspaces={demo ? ['studio', 'review'] : (organisation?.workspaces ?? [])}
                    projects={projects}
                    loading={loading}
                    onOpenWorkspace={selectWorkspace}
                    onExplore={() => void routeNavigate('/studio/explore')}
                    onReviewGuide={() => void routeNavigate(productPath('review', 'briefs', 'O02'))}
                    onProjects={() => navigate('projects')}
                    onOpenProject={(item) => void openProject(item)}
                    onQuickGuide={() => navigateProduct('help', 'S12')}
                  />
                )}
                {!demo &&
                  organisations.length > 0 &&
                  screen !== 'home' &&
                  (screen === 'projects' || !organisation || !hasWorkspace || joining) && (
                    <details
                      className={
                        studioHome ? 'home-workspace-settings' : 'workspace-settings-expanded'
                      }
                      open={!studioHome || !organisation || !hasWorkspace}
                    >
                      <summary hidden={!studioHome}>
                        <span>{organisation?.name ?? 'Choose your organisation'}</span>
                        <span className="home-context-action">Change workspace</span>
                      </summary>
                      <section
                        className="workspace-switcher"
                        aria-label="Active organisation and workspace"
                      >
                        <label>
                          Organisation
                          <select
                            aria-label="Organisation"
                            value={orgId}
                            onChange={(e) => selectOrganisation(e.target.value)}
                          >
                            <option value="" disabled>
                              Choose an organisation
                            </option>
                            {organisations.map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.name} / {o.role}
                              </option>
                            ))}
                          </select>
                        </label>
                        {organisation && (
                          <label>
                            Workspace
                            <select
                              aria-label="Workspace"
                              value={hasWorkspace ? workspaceMode : ''}
                              onChange={(e) =>
                                selectWorkspace(e.target.value as 'studio' | 'review')
                              }
                            >
                              <option value="" disabled>
                                No working workspace assigned
                              </option>
                              {organisation.workspaces?.map((w) => (
                                <option key={w} value={w}>
                                  {w === 'studio' ? 'Design Studio' : 'Organisation Review'}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                        <button
                          className="button secondary"
                          onClick={() => {
                            if (leaveAllowed()) {
                              setJoining(!joining)
                              setDirty(false)
                            }
                          }}
                        >
                          Create or join organisation
                        </button>
                      </section>
                    </details>
                  )}
                {!demo &&
                  token &&
                  (!organisations.length || joining || (invitation && joining)) &&
                  sessionReady && (
                    <OrganisationOnboarding
                      key={session?.user.id}
                      token={token}
                      invitation={invitation}
                      onChanged={() => {
                        setJoining(false)
                        handledRoute.current = ''
                        void loadSession()
                      }}
                    />
                  )}
                {!demo && organisation?.workspace_setup_required && (
                  <details className="home-setup-note">
                    <summary>Workspace setup needs an administrator review</summary>
                    <p>
                      Your existing access is available. An administrator should confirm enabled
                      workspaces in Settings.
                    </p>
                  </details>
                )}
                {!demo && organisation && !hasWorkspace && (
                  <p className="notice">
                    No working workspace is assigned. Settings remain available; ask an
                    administrator for explicit workspace and project access.
                  </p>
                )}

                {error && (
                  <div className="notice error" role="alert">
                    <div>
                      <strong>We couldn’t complete that action.</strong>
                      <p>{error}</p>
                    </div>
                    <button
                      className="button secondary compact"
                      onClick={() =>
                        project && (screen === 'edit' || screen === 'project')
                          ? void openProject(project)
                          : orgId || demo
                            ? void loadProjects()
                            : void loadSession()
                      }
                    >
                      <RefreshCw size={15} />
                      {screen === 'edit' ? 'Reload saved project' : 'Retry'}
                    </button>
                  </div>
                )}
                {notice && (
                  <div className="notice success" role="status">
                    <Check size={17} />
                    {notice}
                  </div>
                )}
                {screen === 'projects' &&
                  unsavedDraft &&
                  !demo &&
                  unsavedDraft.userId === session?.user.id &&
                  unsavedDraft.orgId === orgId &&
                  organisation && (
                    <div className="notice warning">
                      <span>
                        Your unsaved brief is still held in this tab. Recover it after signing in,
                        then review before saving. Closing this tab will discard it.
                      </span>
                      <button
                        className="button secondary compact"
                        onClick={() => {
                          setProject(unsavedDraft.project)
                          setBounds(unsavedDraft.input.site.bounds)
                          setSiteOutline(unsavedDraft.input.site.outline ?? null)
                          setSiteTrees(unsavedDraft.input.site.trees ?? [])
                          setScreen(unsavedDraft.screen)
                          setDirty(true)
                          setError('')
                        }}
                      >
                        Recover unsaved brief
                      </button>
                    </div>
                  )}
                {!demo && !organisation && organisations.length > 0 && (
                  <p role="status">Choose an organisation above to continue.</p>
                )}
                {screen === 'product' && organisation && hasWorkspace && (
                  <Suspense fallback={<p role="status">Loading workflow?</p>}>
                    <ProductWorkspace
                      demo={demo}
                      workspace={workspaceMode}
                      area={productRoute?.area ?? ''}
                      featureId={productRoute?.feature}
                      projects={projects}
                      activeProject={project}
                      onNavigate={navigateProduct}
                      onConnected={openConnectedFeature}
                      onProjects={() => navigate('projects')}
                      onDirty={setDirty}
                    />
                  </Suspense>
                )}
                {screen === 'projects' && organisation && hasWorkspace && (
                  <>
                    {workspaceMode === 'review' && !demo && <ReviewFolderIntro />}
                    {workspaceMode === 'review' && !demo && token && can('review') && (
                      <Suspense fallback={<p role="status">Loading review dashboard…</p>}>
                        <OwnerReviewDashboard organisationId={organisation.id} token={token} />
                      </Suspense>
                    )}
                    {studioHome && (
                      <section className="project-summary-strip" aria-label="Project summary">
                        <div className="project-summary-item">
                          <span className="project-summary-icon">
                            <FolderOpen size={20} />
                          </span>
                          <span>
                            <small>Projects matching view</small>
                            <strong>{loading ? '…' : total}</strong>
                          </span>
                        </div>
                        <div className="project-summary-item">
                          <span className="project-summary-icon project-summary-accent">
                            <CircleDot size={20} />
                          </span>
                          <span>
                            <small>Drafts on this page</small>
                            <strong>
                              {loading
                                ? '…'
                                : projects.filter((item) => item.stage === 'brief').length}
                            </strong>
                          </span>
                        </div>
                        <div className="project-summary-item">
                          <span className="project-summary-icon">
                            <FileText size={20} />
                          </span>
                          <span>
                            <small>In progress on this page</small>
                            <strong>
                              {loading
                                ? '…'
                                : projects.filter((item) => item.stage !== 'brief').length}
                            </strong>
                          </span>
                        </div>
                      </section>
                    )}
                    {studioHome && !demo && token && organisation && (
                      <Suspense fallback={null}>
                        <StudioOpportunities
                          organisationId={orgId}
                          token={token}
                          projects={projects}
                          refresh={opportunityRefresh}
                          onReview={setOpportunityId}
                          onOpenProject={(id, submit) => {
                            if (!submit) {
                              void routeNavigate(`/studio/organisations/${orgId}/projects/${id}`)
                              return
                            }
                            // Open the project map directly at Proposal, where Submit lives.
                            requestStudiesStep('proposal')
                            const known = projects.find((item) => item.id === id)
                            void (
                              known ? Promise.resolve(known) : api.project(orgId, id, token)
                            ).then((item) => openProject(item, 'analysis'), report)
                          }}
                        />
                      </Suspense>
                    )}
                    {studioHome && (
                      <div className="home-project-heading">
                        <h2>Your projects</h2>
                        <p>Select a project card to open its design workspace.</p>
                      </div>
                    )}
                    <form
                      className={`project-search-bar flex flex-wrap items-end gap-3 py-4 ${studioHome ? 'project-dashboard-search' : ''}`}
                      onSubmit={(event) => {
                        event.preventDefault()
                        setProjectQuery(searchText.trim())
                        setOffset(0)
                      }}
                    >
                      <div className="field project-search-field">
                        {studioHome && <Search size={18} aria-hidden="true" />}
                        <label htmlFor="project-search">Search projects or stakeholders</label>
                        <input
                          id="project-search"
                          placeholder="Search projects or stakeholders"
                          maxLength={160}
                          value={searchText}
                          onChange={(event) => setSearchText(event.target.value)}
                        />
                        {studioHome && (
                          <button
                            className="project-search-submit"
                            type="submit"
                            aria-label="Search projects"
                            disabled={loading}
                          >
                            <ArrowRight size={16} aria-hidden="true" />
                          </button>
                        )}
                      </div>
                      {studioHome ? (
                        <>
                          <label className="dashboard-filter">
                            Status
                            <select
                              aria-label="Status"
                              value={projectStage}
                              onChange={(event) => {
                                setProjectStage(event.target.value)
                                setOffset(0)
                              }}
                            >
                              <option value="">All statuses</option>
                              <option value="brief">Draft</option>
                              <option value="site">Site selected</option>
                              <option value="option">Options</option>
                              <option value="estimate">Estimate</option>
                              <option value="developer_brief">Developer brief</option>
                              <option value="proposal">Proposal</option>
                            </select>
                          </label>
                          <label className="dashboard-filter">
                            Project type
                            <select
                              aria-label="Project type"
                              value={projectPurpose}
                              onChange={(event) => {
                                setProjectPurpose(event.target.value)
                                setOffset(0)
                              }}
                            >
                              <option value="">All project types</option>
                              <option value="developer_decision">Developer decision</option>
                              <option value="contractor_proposal">Contractor proposal</option>
                            </select>
                          </label>
                        </>
                      ) : (
                        <button className="button secondary" type="submit" disabled={loading}>
                          Search projects
                        </button>
                      )}
                    </form>
                    <details
                      className={
                        studioHome ? 'home-project-options' : 'workspace-settings-expanded'
                      }
                      open={!studioHome}
                    >
                      <summary hidden={!studioHome}>
                        More filters and options{hasProjectFilters ? ' · filters active' : ''}
                      </summary>
                      <div className="home-filter-fields">
                        <div className="field">
                          <label htmlFor="project-sort">Sort projects</label>
                          <select
                            id="project-sort"
                            value={projectSort}
                            onChange={(event) => {
                              setProjectSort(event.target.value)
                              setOffset(0)
                            }}
                          >
                            <option value="updated">Recently updated</option>
                            <option value="created">Recently created</option>
                            <option value="name">Project name</option>
                            <option value="due">Due date</option>
                          </select>
                        </div>
                        {!studioHome && (
                          <div className="field">
                            <label htmlFor="project-stage">Workflow stage</label>
                            <select
                              id="project-stage"
                              value={projectStage}
                              onChange={(event) => {
                                setProjectStage(event.target.value)
                                setOffset(0)
                              }}
                            >
                              <option value="">All stages</option>
                              {[
                                'brief',
                                'site',
                                'option',
                                'estimate',
                                'developer_brief',
                                'proposal',
                              ].map((stage) => (
                                <option key={stage} value={stage}>
                                  {stage.replaceAll('_', ' ')}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                      <div className="project-secondary-filters flex flex-wrap gap-3 my-3">
                        <label>
                          Opportunity stage filter
                          <select
                            aria-label="Opportunity stage filter"
                            value={opportunityFilter}
                            onChange={(e) => {
                              setOpportunityFilter(e.target.value)
                              setOffset(0)
                            }}
                          >
                            <option value="">All opportunities</option>
                            {opportunityStages.map((stage) => (
                              <option key={stage} value={stage}>
                                {stage.replaceAll('_', ' ')}
                              </option>
                            ))}
                          </select>
                        </label>
                        {!studioHome && (
                          <button
                            className="button secondary"
                            onClick={() => setTableView(!tableView)}
                          >
                            {tableView ? 'Show project cards' : 'Show project table'}
                          </button>
                        )}
                      </div>
                      {!demo && token && can('create_project') && (
                        <details className="my-4">
                          <summary>My reusable client contacts</summary>
                          <HubLibrary
                            key={`${orgId}:${token}`}
                            org={orgId}
                            token={token}
                            kind="contact"
                          />
                        </details>
                      )}
                    </details>
                    {hasProjectFilters && (
                      <div className="home-active-filters" role="status">
                        <span>
                          {total} matching project{total === 1 ? '' : 's'}
                          {projectQuery ? ` for “${projectQuery}”` : ''}.
                        </span>
                      </div>
                    )}
                    {!demo && token && (
                      <DeletedProjectFiles key={orgId} org={orgId} token={token} />
                    )}
                    {!demo && token && !archived && !hasProjectFilters && (
                      <>
                        {workspaceMode === 'review' ? (
                          <ReviewExample
                            key={`${orgId}:review`}
                            organisationId={orgId}
                            token={token}
                            canCreate={can('create_project')}
                            onOpen={(item) => {
                              void loadProjects()
                              void openProject(item)
                            }}
                          />
                        ) : (
                          <StudioExamples
                            key={`${orgId}:studio`}
                            organisationId={orgId}
                            token={token}
                            canCreate={can('create_project')}
                            onOpen={(item) => {
                              void loadProjects()
                              void openProject(item)
                            }}
                          />
                        )}
                      </>
                    )}
                    <div className="projects-toolbar">
                      <div className="segmented" aria-label="Project list filter">
                        <button
                          className={!archived ? 'selected' : ''}
                          aria-pressed={!archived}
                          onClick={() => {
                            setArchived(false)
                            setOffset(0)
                            setProjects([])
                          }}
                        >
                          Active projects
                        </button>
                        <button
                          className={archived ? 'selected' : ''}
                          aria-pressed={archived}
                          onClick={() => {
                            setArchived(true)
                            setOffset(0)
                            setProjects([])
                          }}
                        >
                          Archived
                        </button>
                      </div>
                      {studioHome && (
                        <div className="project-toolbar-actions">
                          <button
                            className="button text compact"
                            onClick={clearProjectFilters}
                            disabled={!hasProjectFilters}
                          >
                            Clear filters
                          </button>
                          <div
                            className="project-view-toggle"
                            role="group"
                            aria-label="Project view"
                          >
                            <button
                              type="button"
                              aria-pressed={!tableView}
                              aria-label="Grid view"
                              className={!tableView ? 'selected' : ''}
                              onClick={() => setTableView(false)}
                            >
                              <LayoutGrid size={18} />
                            </button>
                            <button
                              type="button"
                              aria-pressed={tableView}
                              aria-label="List view"
                              className={tableView ? 'selected' : ''}
                              onClick={() => setTableView(true)}
                            >
                              <List size={18} />
                            </button>
                          </div>
                        </div>
                      )}
                      <button
                        className="button text compact project-refresh"
                        disabled={loading}
                        onClick={() => void loadProjects()}
                      >
                        <RefreshCw size={15} />
                        Refresh
                      </button>
                    </div>
                    {loading ? (
                      <div className="loading-state" role="status">
                        Loading projects…
                      </div>
                    ) : projects.length === 0 ? (
                      <div className="empty-state">
                        <div className="empty-illustration" aria-hidden="true">
                          <MapPin size={34} />
                          <span />
                          <span />
                        </div>
                        <span className="eyebrow">
                          {archived ? 'Room to return' : 'Every project begins somewhere'}
                        </span>
                        <h2>
                          {hasProjectFilters
                            ? 'No matching projects'
                            : archived
                              ? 'No archived projects'
                              : !demo && (!can('create_project') || workspaceMode === 'review')
                                ? 'No assigned projects yet'
                                : 'Find your first site.'}
                        </h2>
                        <p>
                          {hasProjectFilters
                            ? 'Try another search or clear your filters to see the available projects.'
                            : archived
                              ? 'Projects you archive will appear here. You can restore them when you are ready.'
                              : !demo && workspaceMode === 'review'
                                ? 'Review assigned briefs and saved review notes. Create an owner brief or ask a project manager to assign a project.'
                                : !demo && !can('create_project')
                                  ? 'Ask a project manager to grant access to a project.'
                                  : 'Explore the map, select a site extent, then give your project a name and a purpose.'}
                        </p>
                        {hasProjectFilters && (
                          <button className="button secondary" onClick={clearProjectFilters}>
                            Show all projects
                          </button>
                        )}
                        {!hasProjectFilters && !archived && can('create_project') && (
                          <button
                            className="button primary"
                            onClick={() =>
                              navigate(workspaceMode === 'review' ? 'create' : 'explore')
                            }
                          >
                            {workspaceMode === 'review' && !demo
                              ? 'Create project brief'
                              : 'Explore Map'}
                            <ArrowRight size={17} />
                          </button>
                        )}
                      </div>
                    ) : tableView ? (
                      <ProjectTable projects={projects} onOpen={(item) => void openProject(item)} />
                    ) : (
                      <div className="project-grid">
                        {projects.map((item) =>
                          studioHome ? (
                            <ProjectDashboardCard
                              key={item.id}
                              project={item}
                              onOpen={(selected) => void openProject(selected)}
                            />
                          ) : (
                            <button
                              className="project-card"
                              key={item.id}
                              onClick={() => void openProject(item)}
                            >
                              <div className="project-thumbnail" aria-hidden="true">
                                <MapPin size={25} />
                                <span>{item.archived ? 'ARCHIVED' : 'GROUND SITE'}</span>
                              </div>
                              <div className="project-card-body">
                                <span className="eyebrow">
                                  {purposeLabel(item.purpose)}
                                  {item.example && <span className="example-badge">Example</span>}
                                </span>
                                <h2>{item.name}</h2>
                                <p>{item.stakeholder}</p>
                                <OpportunitySummary project={item} />
                                <div className="project-card-footer">
                                  <span>
                                    {item.stage.replaceAll('_', ' ')} / brief rev {item.revision}
                                  </span>
                                  <span>
                                    {new Date(item.updated_at).toLocaleDateString('en-MY', {
                                      timeZone: item.timezone,
                                      day: 'numeric',
                                      month: 'short',
                                    })}
                                    <ArrowRight size={15} />
                                  </span>
                                </div>
                              </div>
                            </button>
                          ),
                        )}
                      </div>
                    )}
                    {total > 100 && (
                      <div className="pagination">
                        <button
                          className="button secondary"
                          disabled={offset === 0 || loading}
                          onClick={() => setOffset(Math.max(0, offset - 100))}
                        >
                          Previous
                        </button>
                        <span>
                          {offset + 1}–{Math.min(offset + 100, total)} of {total}
                        </span>
                        <button
                          className="button secondary"
                          disabled={offset + 100 >= total || loading}
                          onClick={() => setOffset(offset + 100)}
                        >
                          Next
                        </button>
                      </div>
                    )}
                    {studioHome ? (
                      <div className="project-start-callout">
                        <span className="project-start-icon">
                          <CircleHelp size={20} />
                        </span>
                        <div>
                          <strong>
                            Define site evidence and project goals before comparing options.
                          </strong>
                          <p>
                            Start with a brief and site locator, then add design detail as you
                            learn. Real calculations depend on your configured local services.
                          </p>
                        </div>
                        {can('create_project') && (
                          <button className="button secondary" onClick={() => navigate('explore')}>
                            Get started <ArrowRight size={16} />
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="dashboard-note">
                        <CircleHelp size={18} />
                        <div>
                          <strong>Build understanding before comparing options.</strong>
                          <p>
                            Start with a brief and locator, then open the geometry workspace to
                            define targets and independent options. Real calculations require the
                            configured local services.
                          </p>
                        </div>
                      </div>
                    )}
                  </>
                )}
                {screen === 'explore' &&
                  organisation &&
                  hasWorkspace &&
                  workspaceMode === 'studio' && (
                    <ExploreWorkspace
                      key={treeOwner}
                      onClock={setExplorerClock}
                      bounds={bounds}
                      trees={siteTrees}
                      onTreeDirty={setDirty}
                      onTrees={(trees) => {
                        setSiteTrees(trees)
                        setUnsavedDraft((previous) =>
                          previous &&
                          previous.orgId === orgId &&
                          previous.userId === (session?.user.id ?? 'demo')
                            ? {
                                ...previous,
                                input: {
                                  ...previous.input,
                                  site: { ...previous.input.site, trees },
                                },
                              }
                            : previous,
                        )
                      }}
                      viewport={viewport}
                      outline={siteOutline}
                      onOutline={(next, shape) => selectSite(next, shape)}
                      onBounds={(next) => selectSite(next, null)}
                      onViewport={setViewport}
                      onContinue={() => navigate('create')}
                      onExit={() => navigate('projects')}
                    />
                  )}
                {screen === 'settings' && organisation && !demo && (
                  <SettingsPage
                    key={organisation.id}
                    email={session?.user.email ?? ''}
                    organisation={organisation}
                    token={token}
                    onDirty={setDirty}
                    onChanged={() => void loadSession()}
                  />
                )}
                {(screen === 'create' || screen === 'edit') &&
                  organisation &&
                  hasWorkspace &&
                  (screen === 'create' ? can('create_project') : projectCan('edit_project')) && (
                    <div className="brief-layout">
                      <section className="paper">
                        <BriefForm
                          showGuide={screen === 'create' && workspaceMode === 'studio'}
                          key={screen === 'edit' ? project?.id : 'new'}
                          initial={
                            unsavedDraft?.input ??
                            (screen === 'edit' && project
                              ? project
                              : {
                                  ...emptyBrief(bounds),
                                  site: {
                                    bounds,
                                    crs: 'EPSG:4326',
                                    outline: siteOutline,
                                    trees: siteTrees,
                                  },
                                  purpose:
                                    demo || workspaceMode === 'review'
                                      ? 'developer_decision'
                                      : 'contractor_proposal',
                                  use_periods: explorerClock
                                    ? `Explore time context: ${explorerClock.date} ${timeText(explorerClock.minutes)} UTC${Number(explorerClock.offset) >= 0 ? '+' : ''}${explorerClock.offset}. Confirm project analysis date/time separately.`
                                    : '',
                                  timezone: demo ? 'Asia/Kuala_Lumpur' : defaultTimezone,
                                })
                          }
                          saving={saving}
                          onSave={(input) => void saveBrief(input)}
                          onCancel={() => navigate(screen === 'edit' ? 'project' : 'explore')}
                          onDirty={setDirty}
                          onDraftChange={(input) =>
                            setUnsavedDraft({
                              input,
                              project: screen === 'edit' ? project : null,
                              screen,
                              orgId,
                              userId: session?.user.id ?? 'demo',
                            })
                          }
                          hub={
                            !demo && token && can('create_project')
                              ? { org: orgId, token }
                              : undefined
                          }
                          editing={screen === 'edit'}
                        />
                      </section>
                      <aside className="brief-side">
                        <div className="mini-site">
                          <MapPin size={25} />
                          <span>SELECTED SITE</span>
                        </div>
                        <h3>A grounded brief</h3>
                        <p>
                          A good project starts with an honest account of the place, the people and
                          the problem.
                        </p>
                        <div className="brief-tip">
                          <Check size={16} />
                          <span>Name, stakeholder and site extent are required.</span>
                        </div>
                        <div className="brief-tip">
                          <Check size={16} />
                          <span>Save an incomplete brief and return to it later.</span>
                        </div>
                        <div className="brief-tip">
                          <ShieldCheck size={16} />
                          <span>Purpose changes your workflow, never your permissions.</span>
                        </div>
                        <span className="save-badge">
                          {saving ? 'Saving…' : dirty ? 'Unsaved changes' : 'Ready to edit'}
                        </span>
                      </aside>
                    </div>
                  )}
                {reviewFocus && project && token && (
                  <Suspense fallback={<p role="status">Loading owner review…</p>}>
                    <OwnerEvaluation key={project.id} project={project} token={token} />
                  </Suspense>
                )}
                {reviewFocus && project && token && (
                  <Suspense fallback={<p role="status">Loading invitations…</p>}>
                    <OpportunityInvitations key={project.id} project={project} token={token} />
                  </Suspense>
                )}
                <ReviewProjectDetails collapse={Boolean(reviewFocus)}>
                  {screen === 'project' && project && (
                    <>
                      {project.example && workspaceMode === 'studio' && (
                        <ExampleBanner project={project} token={token} />
                      )}
                      <OpportunitySummary project={project} />
                      <ProjectClient project={project} />
                      {workspaceMode !== 'studio' && projectAgreement}
                      <div className="project-tabs">
                        <span className="selected">
                          <Map size={16} />
                          Site Plan
                        </span>
                        <span>Brief & site locator</span>
                        {project.archived && (
                          <span className="archive-badge">Archived project</span>
                        )}
                      </div>
                      <div className="map-workspace">
                        <Suspense fallback={<MapFallback />}>
                          <SiteMap
                            key={project.id}
                            bounds={project.site.bounds}
                            outline={project.site.outline}
                            readOnly
                          />
                        </Suspense>
                        <aside className="context-panel">
                          <div className="panel-section">
                            <span className="eyebrow">Project brief</span>
                            <h2>
                              {project.purpose === 'contractor_proposal'
                                ? 'Client proposal foundation'
                                : 'Decision foundation'}
                            </h2>
                            <dl className="brief-details">
                              <dt>Problem</dt>
                              <dd>{project.problem || 'Not recorded yet'}</dd>
                              <dt>Intended users</dt>
                              <dd>{project.intended_users || 'Not recorded yet'}</dd>
                              <dt>Desired outcome</dt>
                              <dd>{project.desired_outcome || 'Not recorded yet'}</dd>
                              <dt>Relevant use times</dt>
                              <dd>{project.use_periods || 'Not recorded yet'}</dd>
                              <dt>Timezone / currency</dt>
                              <dd>
                                {project.timezone} · {project.currency}
                              </dd>
                            </dl>
                            {(!project.problem ||
                              !project.intended_users ||
                              !project.desired_outcome) && (
                              <div className="notice small">
                                Brief incomplete. Add your observations before comparing options.
                              </div>
                            )}
                          </div>
                          <div className="panel-section border-top">
                            <h3>Site extent</h3>
                            <p className="coordinate-readout">
                              {project.site.bounds.map((n) => n.toFixed(6)).join(' / ')}
                            </p>
                            <p className="fine-print">
                              EPSG:4326 · west / south / east / north. A locator, not a surveyed
                              boundary. No metric quantities calculated.
                            </p>
                          </div>
                          <div className="panel-section border-top">
                            <button
                              className="button secondary full"
                              disabled={saving || loading}
                              onClick={() => void openProject(project)}
                            >
                              <RefreshCw size={15} />
                              Reload saved project
                            </button>
                            <button
                              className="button text full"
                              hidden={!projectCan('edit_project')}
                              disabled={saving}
                              onClick={() => void toggleArchive()}
                            >
                              {project.archived ? <RotateCcw size={15} /> : <Archive size={15} />}
                              {project.archived ? 'Restore project' : 'Archive project'}
                            </button>
                            {(demo || projectCan('edit_project')) && (
                              <DeleteProject
                                key={project.id}
                                project={project}
                                token={token}
                                demo={demo}
                                onDeleted={(pending) => {
                                  if (session?.user.id)
                                    clearWorkspaceDrafts(
                                      session.user.id,
                                      project.organisation_id,
                                      project.id,
                                    )
                                  setGeometryOpen(false)
                                  setDirty(false)
                                  setUnsavedDraft(null)
                                  setProject(null)
                                  setScreen('projects', null)
                                  setOffset(0)
                                  setNotice(
                                    pending
                                      ? 'Project deleted. Uploaded-file cleanup is pending; use Retry file cleanup below.'
                                      : 'Project permanently deleted.',
                                  )
                                  void loadProjects()
                                }}
                              />
                            )}
                          </div>
                        </aside>
                      </div>
                      <div className="dashboard-note">
                        <Leaf size={20} />
                        <div>
                          <strong>
                            {workspaceMode === 'studio'
                              ? 'Next: open the design map.'
                              : 'Continue with boundary, targets and work items.'}
                          </strong>
                          <p>
                            {workspaceMode === 'studio'
                              ? 'Four steps: check the site, place the work, price it, then review and issue the proposal.'
                              : 'Open the project review to compare the site and options.'}{' '}
                            {demo
                              ? 'Browser Demo keeps draft geometry only; it does not calculate or issue.'
                              : ''}
                          </p>
                        </div>
                      </div>
                    </>
                  )}
                  <ProjectRecords enabled={screen === 'project' && workspaceMode === 'studio'}>
                    {workspaceMode === 'studio' && projectAgreement}
                    {screen === 'project' && project && !demo && projectCan('edit_project') && (
                      <ProjectHistory
                        project={project}
                        token={token}
                        dirty={dirty}
                        onRestore={(value) => {
                          setProject(value)
                          setBounds(value.site.bounds)
                          setSiteOutline(value.site.outline ?? null)
                          setGeometryOpen(false)
                        }}
                      />
                    )}
                    {screen === 'project' &&
                      project &&
                      !demo &&
                      projectCan('manage_project_access') && (
                        <ProjectAccess
                          project={project}
                          token={token}
                          onChanged={() => void openProject(project)}
                        />
                      )}
                    {screen === 'project' && project && <BriefReadiness project={project} />}
                    {screen === 'project' &&
                      project &&
                      !demo &&
                      token &&
                      workspaceMode === 'studio' &&
                      project.purpose === 'contractor_proposal' && (
                        <Suspense fallback={<p role="status">Loading change register…</p>}>
                          <ChangeRegister key={project.id} project={project} token={token} />
                        </Suspense>
                      )}
                  </ProjectRecords>
                </ReviewProjectDetails>
                {screen === 'project' && project && geometryOpen && (
                  <div className="mt-6">
                    {geometryOpen && (
                      <Suspense fallback={<p role="status">Loading drawing tools…</p>}>
                        <GeometryWorkspace
                          key={`${demo}/${project.id}`}
                          project={project}
                          onProjectSaved={setProject}
                          token={token}
                          demo={demo}
                          initialTool={workspaceEntryTool}
                          audience={workspaceMode}
                          userId={session?.user.id}
                          onDirty={setDirty}
                          onClose={() => {
                            if (leaveAllowed()) {
                              setGeometryOpen(false)
                              setDirty(false)
                            }
                          }}
                        />
                      </Suspense>
                    )}
                  </div>
                )}
              </>
            )}
          </main>
          <footer className="app-footer">
            <span>
              InfraShader · {workspaceMode === 'review' ? 'Organisation Review' : 'Design Studio'}
            </span>
            <span>
              {import.meta.env.VITE_DEPLOYMENT_MODE === 'pilot'
                ? 'Hosted pilot · Validation in progress'
                : 'Local build · No deployment'}
            </span>
          </footer>
        </div>
      </div>
    </DisplayUnitsContext.Provider>
  )
}
