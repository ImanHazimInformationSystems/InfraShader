import { useRef } from 'react'
import {
  ArrowUpRight,
  Bell,
  Building2,
  ChevronDown,
  CircleHelp,
  Compass,
  FileStack,
  FolderOpen,
  House,
  Layers3,
  Leaf,
  ListChecks,
  Menu,
  MessagesSquare,
  PanelLeftClose,
  PenTool,
  Settings2,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Wallet,
  Waypoints,
  type LucideIcon,
} from 'lucide-react'
import { areas, productPath, type WorkspaceMode } from './model'
import type { Screen } from '../services/routes'

const icons: Record<string, LucideIcon> = {
  site: Compass,
  design: PenTool,
  studies: Sun,
  pricing: Wallet,
  delivery: FileStack,
  business: Waypoints,
  portfolio: Layers3,
  briefs: FolderOpen,
  evaluation: ListChecks,
  decisions: FileStack,
  assistant: Sparkles,
  inbox: Bell,
  records: FileStack,
  organisation: Building2,
  preferences: SlidersHorizontal,
  system: Settings2,
  privacy: Shield,
  help: CircleHelp,
}

type Props = {
  workspace: WorkspaceMode
  available: WorkspaceMode[]
  loggedIn: boolean
  demo: boolean
  screen: Screen
  area?: string
  onWorkspace: (workspace: WorkspaceMode) => void
  onPage: (page: 'home' | 'projects' | 'explore' | 'settings') => void
  onArea: (area: string) => void
}

export default function WorkspaceNavigation(props: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const { workspace, loggedIn, available, screen, area, onWorkspace, onArea, onPage } = props
  const close = () => dialog.current?.close()
  function content(mobile: boolean) {
    return (
      <>
        <button
          className="brand product-brand"
          onClick={() => {
            if (loggedIn) onPage('home')
            close()
          }}
          aria-label="InfraShader Outdoor Intelligence home"
        >
          <span className="brand-symbol">
            <Leaf size={23} />
          </span>
          <span>
            InfraShader{' '}<small>OUTDOOR INTELLIGENCE</small>
          </span>
        </button>
        {screen !== 'home' && (
          <label className="product-workspace-switch">
            <span>WORKSPACE</span>
            <select
              aria-label={mobile ? 'Switch workspace on mobile' : 'Switch workspace'}
              value={workspace}
              disabled={!loggedIn}
              onChange={(event) => {
                onWorkspace(event.target.value as WorkspaceMode)
                close()
              }}
            >
              {(!available.length ? [workspace] : available).map((mode) => (
                <option key={mode} value={mode}>
                  {mode === 'studio' ? 'Design Studio' : 'Organisation Review'}
                </option>
              ))}
            </select>
            <ChevronDown size={14} aria-hidden="true" />
          </label>
        )}
        <nav
          hidden={!loggedIn}
          aria-label={mobile ? 'Mobile workspace navigation' : 'Main navigation'}
        >
          {screen === 'home' ? (
            <>
              <p className="product-nav-label">YOUR ACCOUNT</p>
              <button className="product-nav-item active" aria-current="page" onClick={() => { onPage('home'); close() }}>
                <House size={18} /><span>Home</span>
              </button>
              <p className="product-nav-label">WORKSPACES</p>
              {available.map((mode) => (
                <button key={mode} className="product-nav-item" aria-pressed={workspace === mode} onClick={() => { onWorkspace(mode); close() }}>
                  {mode === 'studio' ? <PenTool size={18} /> : <Building2 size={18} />}
                  <span>{mode === 'studio' ? 'Design Studio' : 'Organisation Review'}</span>
                </button>
              ))}
              {available.length > 0 && (
                <button className="product-nav-item" onClick={() => { onPage('projects'); close() }}>
                  <FolderOpen size={18} /><span>Projects</span>
                </button>
              )}
              <div className="product-home-nav-divider" />
              <button disabled={props.demo} className="product-nav-item" onClick={() => { onPage('settings'); close() }}>
                <Settings2 size={18} /><span>Settings and members</span>
              </button>
            </>
          ) : (
            <>
          <p className="product-nav-label">
            {workspace === 'studio' ? 'PLAN & PROPOSE' : 'REVIEW & DECIDE'}
          </p>
          <button
            disabled={!loggedIn}
            className="product-nav-item"
            onClick={() => {
              onPage('home')
              close()
            }}
          >
            <House size={18} />
            <span>Home</span>
          </button>
          <button
            disabled={!loggedIn}
            className={`product-nav-item ${screen === 'projects' ? 'active' : ''}`}
            aria-current={screen === 'projects' ? 'page' : undefined}
            onClick={() => {
              onPage('projects')
              close()
            }}
          >
            <FolderOpen size={18} />
            <span>Projects</span>
          </button>
          {workspace === 'studio' && (
            <button
              disabled={!loggedIn}
              className={`product-nav-item ${screen === 'explore' || screen === 'create' ? 'active' : ''}`}
              aria-current={screen === 'explore' ? 'page' : undefined}
              onClick={() => {
                onPage('explore')
                close()
              }}
            >
              <Compass size={18} />
              <span>Explore Map</span>
              <ArrowUpRight size={13} />
            </button>
          )}
          {(() => {
            const workspaceAreas = areas.filter(
              (a) => a.workspace === workspace || a.workspace === 'both',
            )
            const buttons = workspaceAreas.map((a) => {
              const Icon = icons[a.id]
              return (
                <button
                  key={a.id}
                  disabled={!loggedIn}
                  className={`product-nav-item ${screen === 'product' && area === a.id ? 'active' : ''}`}
                  aria-current={screen === 'product' && area === a.id ? 'page' : undefined}
                  onClick={() => {
                    onArea(a.id)
                    close()
                  }}
                >
                  <Icon size={18} />
                  <span>{a.name}</span>
                  {a.id === 'assistant' && <small>Preview</small>}
                </button>
              )
            })
            // Design Studio work happens inside a project (Site, Design, Prices, Proposal).
            // The feature-catalogue pages are mostly planned previews, so they stay reachable
            // but out of the main path. Organisation Review keeps its task areas visible.
            if (workspace !== 'studio') return buttons
            return (
              <details
                className="product-shared-nav"
                open={
                  (screen === 'product' && workspaceAreas.some((a) => a.id === area)) || undefined
                }
              >
                <summary>
                  FEATURE PREVIEWS <ChevronDown size={13} />
                </summary>
                <p className="product-nav-hint">
                  Planned and partly connected features. Your projects are in Projects.
                </p>
                {buttons}
              </details>
            )
          })()}
          <details
            className="product-shared-nav"
            open={
              (screen === 'product' &&
                areas.some((a) => a.id === area && a.workspace === 'shared')) ||
              screen === 'settings' ||
              undefined
            }
          >
            <summary>
              SHARED WORKSPACE <ChevronDown size={13} />
            </summary>
            {areas
              .filter((a) => a.workspace === 'shared')
              .map((a) => {
                const Icon = icons[a.id]
                return (
                  <button
                    key={a.id}
                    disabled={!loggedIn}
                    className={`product-nav-item ${screen === 'product' && area === a.id ? 'active' : ''}`}
                    aria-current={screen === 'product' && area === a.id ? 'page' : undefined}
                    onClick={() => {
                      onArea(a.id)
                      close()
                    }}
                  >
                    <Icon size={17} />
                    <span>{a.name}</span>
                  </button>
                )
              })}
          </details>
          <button
            disabled={!loggedIn || props.demo}
            className={`product-nav-item ${screen === 'settings' ? 'active' : ''}`}
            onClick={() => {
              onPage('settings')
              close()
            }}
          >
            <Settings2 size={17} />
            <span>Settings and members</span>
          </button>
            </>
          )}
        </nav>
        <div className="product-nav-bottom">
          <span className="product-local-dot" /> {props.demo ? 'Browser Demo' : 'Local workspace'}
          <small>Sources before decisions.</small>
          <a
            href={productPath(workspace, 'help')}
            onClick={(e) => {
              if (!e.ctrlKey && !e.metaKey) {
                e.preventDefault()
                if (loggedIn) onArea('help')
                close()
              }
            }}
          >
            <MessagesSquare size={15} /> Help & feedback
          </a>
        </div>
      </>
    )
  }
  return (
    <>
      <aside className="sidebar product-sidebar">{content(false)}</aside>
      <button
        type="button"
        className="product-nav-toggle"
        aria-label="Open workspace navigation"
        aria-haspopup="dialog"
        onClick={() => dialog.current?.showModal()}
      >
        <Menu size={20} />
      </button>
      <dialog ref={dialog} className="product-mobile-nav" aria-label="Workspace navigation">
        <button
          className="product-mobile-close"
          aria-label="Close workspace navigation"
          onClick={close}
        >
          <PanelLeftClose size={21} />
        </button>
        {content(true)}
      </dialog>
    </>
  )
}
