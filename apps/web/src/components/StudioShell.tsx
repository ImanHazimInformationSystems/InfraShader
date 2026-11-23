import {
  useContext,
  useEffect,
  useState,
  useRef,
  useImperativeHandle,
  type Ref,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { StudioContext } from './studio-context'
import './journey.css'
import {
  ArrowLeft,
  Check,
  CircleAlert,
  Compass,
  Ellipsis,
  Files,
  Layers3,
  List,
  Map as MapIcon,
  Mountain,
  ReceiptText,
  Save,
  Spline,
  Sun,
  TreeDeciduous,
  Armchair,
  BookOpenCheck,
  FileCheck2,
  X,
} from 'lucide-react'

/**
 * Design Studio is organised around one journey: 1 Site → 2 Design → 3 Prices → 4 Proposal.
 * Each step shows only its own tools. Optional tools (terrain, shade) sit in "More tools".
 * Tool ids are stable because routes, tests and other panels open tools by id.
 */
const STAGES = ['site', 'design', 'price', 'proposal'] as const
export type Stage = (typeof STAGES)[number]

const TOOL_INFO = {
  sources: { label: 'Site records', hint: 'What is known about the site, and what still needs checking', stage: 'site', icon: Files },
  layout: { label: 'Layout', hint: 'Draw roads, paths, planting beds and ground finishes', stage: 'design', icon: Spline },
  trees: { label: 'Trees', hint: 'Plant new trees or record the trees already on site', stage: 'design', icon: TreeDeciduous },
  objects: { label: 'Objects', hint: 'Place benches, lights, fences and other items', stage: 'design', icon: Armchair },
  materials: { label: 'Materials', hint: 'What each area, path or road is made of', stage: 'design', icon: Layers3 },
  pricing: { label: 'Pricing', hint: 'Give every item a price and see what is still missing', stage: 'price', icon: ReceiptText },
  rates: { label: 'Saved rates', hint: "Your organisation's dated price list, with sources", stage: 'price', icon: BookOpenCheck },
  analysis: { label: 'Review & issue', hint: 'Check what needs attention, total it and issue the proposal', stage: 'proposal', icon: FileCheck2 },
  terrain: { label: 'Terrain', hint: 'Optional. Shape concept ground and water', stage: 'more', icon: Mountain },
  shade: { label: 'Shade study', hint: 'Optional. Modelled shade on a chosen area and time', stage: 'more', icon: Sun },
} as const
export type Tool = keyof typeof TOOL_INFO

/** The Organisation Review audience keeps its original flat tool list. */
const REVIEW_TOOLS: Tool[] = ['layout', 'trees', 'objects', 'terrain', 'materials', 'pricing', 'analysis', 'sources']
const REVIEW_LABEL: Partial<Record<Tool, string>> = { analysis: 'Studies' }

const STAGE_LABEL: Record<Stage, string> = {
  site: 'Site',
  design: 'Design',
  price: 'Prices',
  proposal: 'Proposal',
}
const stageOf = (tool: Tool): Stage | 'more' => TOOL_INFO[tool].stage
const toolsIn = (stage: Stage | 'more') =>
  (Object.keys(TOOL_INFO) as Tool[]).filter((tool) => TOOL_INFO[tool].stage === stage)

export type StageProgress = { text: string; state: 'done' | 'attention' | 'todo' }

export function StudioCanvas({ children }: { children: ReactNode }) {
  const { canvas, immersive } = useContext(StudioContext)
  return immersive && canvas ? createPortal(children, canvas) : children
}

/** Content for one or more tools. Outside the immersive studio every section is shown. */
export function StudioSection({
  tool,
  children,
  advanced = false,
}: {
  tool: Tool | Tool[]
  children: ReactNode
  advanced?: boolean
}) {
  const state = useContext(StudioContext)
  const tools = Array.isArray(tool) ? tool : [tool]
  return (
    <div hidden={state.immersive && (!tools.includes(state.tool) || (advanced && !state.precision))}>
      {children}
    </div>
  )
}

export default function StudioShell({
  title,
  status,
  children,
  onClose,
  onSave,
  saveDisabled,
  toolChangeBlocked = false,
  blockedBy,
  controller,
  message,
  onTool,
  onExplore,
  onPanelClosed,
  initialTool,
  simpleLayout = true,
  audience = 'studio',
  progress,
  stageLabels,
}: {
  initialTool?: Tool
  simpleLayout?: boolean
  audience?: 'studio' | 'review'
  controller?: Ref<{ reveal: (tool: Tool, precision?: boolean) => void }>
  message?: string
  onTool?: (tool: Tool) => void
  onExplore?: () => void
  onPanelClosed?: () => void
  title: string
  status: string
  children: ReactNode
  onSave: () => void
  saveDisabled: boolean
  toolChangeBlocked?: boolean
  /** The tool holding the open, unapplied edit; it stays reachable while others are blocked. */
  blockedBy?: Tool
  onClose?: () => void
  progress?: Partial<Record<Stage, StageProgress>>
  stageLabels?: Partial<Record<Stage, string>>
}) {
  const journey = audience === 'studio'
  const [immersive, setImmersive] = useState(audience !== 'review')
  const [canvas, setCanvas] = useState<HTMLDivElement | null>(null)
  const [tool, setTool] = useState<Tool>(initialTool ?? 'layout')
  const [open, setOpen] = useState(Boolean(initialTool))
  const [precision, setPrecision] = useState(!simpleLayout)
  const [moreOpen, setMoreOpen] = useState(false)
  // The last tool used in each step, so returning to a step reopens where the user was.
  const lastTool = useRef<Partial<Record<Stage, Tool>>>({})
  const panel = useRef<HTMLElement>(null)
  const moreButton = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (panel.current) panel.current.scrollTop = 0
  }, [tool])
  const stage = stageOf(tool)
  const currentStage: Stage = stage === 'more' ? 'design' : stage
  function choose(next: Tool) {
    const nextStage = stageOf(next)
    if (nextStage !== 'more') lastTool.current[nextStage] = next
    setTool(next)
    setOpen(true)
    setMoreOpen(false)
    onTool?.(next)
  }
  useImperativeHandle(
    controller,
    () => ({
      reveal: (next: Tool, precise = false) => {
        if (precise) setPrecision(true)
        const nextStage = stageOf(next)
        if (nextStage !== 'more') lastTool.current[nextStage] = next
        setTool(next)
        setOpen(true)
      },
    }),
    [],
  )
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!immersive) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // The immersive studio covers the page like a modal: content behind it must not
    // receive keyboard focus or be announced (S08). Restore exactly what we changed.
    const changed: Element[] = []
    for (let node: HTMLElement | null = root.current; node && node !== document.body; node = node.parentElement) {
      for (const sibling of Array.from(node.parentElement?.children ?? [])) {
        if (sibling === node || sibling.hasAttribute('inert')) continue
        if (sibling.tagName === 'SCRIPT' || sibling.tagName === 'STYLE') continue
        sibling.setAttribute('inert', '')
        changed.push(sibling)
      }
    }
    return () => {
      document.body.style.overflow = previous
      changed.forEach((element) => element.removeAttribute('inert'))
    }
  }, [immersive])
  useEffect(() => {
    if (!moreOpen) return
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMoreOpen(false)
        moreButton.current?.focus()
      }
    }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [moreOpen])
  const label = (id: Tool) => (journey ? TOOL_INFO[id].label : (REVIEW_LABEL[id] ?? TOOL_INFO[id].label))
  const dockTools = journey ? toolsIn(currentStage) : REVIEW_TOOLS
  const stageName = (id: Stage) => stageLabels?.[id] ?? STAGE_LABEL[id]
  const toolButton = (id: Tool, inMenu = false) => {
    const Icon = TOOL_INFO[id].icon
    return (
      <button
        key={id}
        type="button"
        disabled={toolChangeBlocked && id !== tool && id !== blockedBy}
        title={TOOL_INFO[id].hint}
        aria-pressed={open && tool === id}
        aria-controls="studio-inspector"
        aria-expanded={open && tool === id}
        onClick={() => {
          if (id === 'terrain' && panel.current) panel.current.scrollTop = 0
          choose(id)
        }}
      >
        <Icon size={inMenu ? 18 : 20} aria-hidden="true" />
        <span>{label(id)}</span>
        {inMenu && <small>{TOOL_INFO[id].hint}</small>}
      </button>
    )
  }
  return (
    <StudioContext.Provider value={{ canvas, tool, immersive, precision, panelOpen: open, journey }}>
      <div
        ref={root}
        data-panel-open={open}
        data-precision={precision}
        data-tool={tool}
        data-journey={journey}
        className={immersive ? 'ground-studio' : 'ground-studio-detail'}
      >
        <header className="studio-header">
          {onClose && (
            <button type="button" className="studio-back" onClick={onClose}>
              <ArrowLeft size={16} aria-hidden="true" /> Project details
            </button>
          )}
          <div className="studio-identity">
            <span className="studio-brand">
              {audience === 'review' ? 'ORGANISATION REVIEW' : 'DESIGN STUDIO'}
            </span>
            <h2 title={title}>{title}</h2>
          </div>
          {journey && (
            <nav className="studio-journey" aria-label="Proposal steps">
              <ol>
                {STAGES.map((id, index) => {
                  const state = progress?.[id]
                  const current = immersive && open && stageOf(tool) === id
                  return (
                    <li key={id}>
                      <button
                        type="button"
                        className="studio-step"
                        data-state={state?.state ?? 'todo'}
                        aria-current={current ? 'step' : undefined}
                        disabled={
                          toolChangeBlocked &&
                          stageOf(tool) !== id &&
                          !(blockedBy && stageOf(blockedBy) === id)
                        }
                        onClick={() => {
                          if (!immersive) setImmersive(true)
                          choose(
                            toolChangeBlocked && blockedBy && stageOf(blockedBy) === id
                              ? blockedBy
                              : (lastTool.current[id] ?? toolsIn(id)[0]),
                          )
                        }}
                      >
                        <span className="studio-step-number" aria-hidden="true">
                          {state?.state === 'done' ? (
                            <Check size={13} />
                          ) : state?.state === 'attention' ? (
                            <CircleAlert size={13} />
                          ) : (
                            index + 1
                          )}
                        </span>
                        <span className="studio-step-text">
                          <strong>
                            <span className="sr-only">Step {index + 1}: </span>
                            {stageName(id)}
                          </strong>
                          {state && <small>{state.text}</small>}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ol>
            </nav>
          )}
          <span
            className="studio-save-state"
            role="status"
            data-tone={/^(Save failed|Not saved:)/.test(status) ? 'warning' : undefined}
          >
            {status}
          </span>
          <button
            className="studio-save-button"
            type="button"
            disabled={saveDisabled}
            onClick={onSave}
          >
            <Save size={16} aria-hidden="true" /> {journey ? 'Save design' : 'Save workspace'}
          </button>
          {!journey && (
            <button type="button" onClick={() => setImmersive(!immersive)}>
              {immersive ? 'Review details' : 'Map comparison view'}
            </button>
          )}
        </header>
        {message && immersive && !open && (
          <div className="studio-feedback" role="status">
            {message}
          </div>
        )}
        {immersive && (
          <>
            <div className="studio-map-host" ref={setCanvas} />
            <nav className="studio-dock" aria-label="Studio tools">
              <button
                type="button"
                disabled={toolChangeBlocked}
                aria-pressed={!open}
                title="Hide the panel and look around the map"
                onClick={() => {
                  setOpen(false)
                  setMoreOpen(false)
                  onExplore?.()
                }}
              >
                <Compass size={20} aria-hidden="true" />
                <span>Explore</span>
              </button>
              {journey && <span className="studio-dock-stage" aria-hidden="true">{stageName(currentStage)}</span>}
              {dockTools.map((id) => toolButton(id))}
              {journey && (
                <div className="studio-more">
                  <button
                    ref={moreButton}
                    type="button"
                    aria-expanded={moreOpen}
                    aria-controls="studio-more-menu"
                    aria-pressed={open && stage === 'more'}
                    onClick={() => setMoreOpen(!moreOpen)}
                  >
                    <Ellipsis size={20} aria-hidden="true" />
                    <span>More tools</span>
                  </button>
                </div>
              )}
            </nav>
                  {moreOpen && (
                    <div id="studio-more-menu" className="studio-more-menu" role="group" aria-label="More tools">
                      <p>Optional tools</p>
                      {toolsIn('more').map((id) => toolButton(id, true))}
                      <p>View</p>
                      <button
                        type="button"
                        onClick={() => {
                          setMoreOpen(false)
                          setImmersive(false)
                        }}
                      >
                        <List size={18} aria-hidden="true" />
                        <span>List view</span>
                        <small>Every tool on one scrolling page, with numeric controls</small>
                      </button>
                    </div>
                  )}
          </>
        )}
        {!immersive && journey && (
          <div className="studio-detail-bar">
            <button type="button" onClick={() => setImmersive(true)}>
              <MapIcon size={16} aria-hidden="true" /> Map view
            </button>
          </div>
        )}
        <aside
          ref={panel}
          id="studio-inspector"
          className="studio-inspector"
          hidden={immersive && !open}
          aria-label="Studio working panel"
        >
          {immersive && (
            <div className="studio-panel-heading" key={tool}>
              <div>
                {journey && (
                  <span className="studio-panel-step">
                    {stage === 'more'
                      ? 'Optional tool'
                      : `Step ${STAGES.indexOf(stage) + 1} · ${stageName(stage)}`}
                  </span>
                )}
                <h3>{label(tool)}</h3>
                <p>{TOOL_INFO[tool].hint}</p>
              </div>
              {simpleLayout && tool === 'layout' && (
                <button
                  type="button"
                  className="studio-precision-toggle"
                  aria-pressed={precision}
                  onClick={() => setPrecision(!precision)}
                >
                  {precision ? 'Simple tools' : 'Precision tools'}
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  onPanelClosed?.()
                }}
                aria-label="Collapse working panel"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>
          )}
          {children}
        </aside>
      </div>
    </StudioContext.Provider>
  )
}
