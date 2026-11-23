import { isPriced, openStudiesStep, type StudiesStatus } from '../domain/studies-guide'
import { openPricing, PRICE_ITEM_EVENT } from '../domain/pricing'
import PricingBoard, { SelectedPriceCard } from './PricingBoard'
import type { Map as GeographicMap } from 'mapbox-gl'
import StudioShell, {
  StudioCanvas,
  StudioSection,
  type Stage,
  type StageProgress,
  type Tool,
} from './StudioShell'
import { displayQuantity, useDisplayUnits } from '../services/display-units'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Feature } from 'geojson'
import type { Project } from '../domain/projects'
import ProjectTreeWorkbench from './ProjectTreeWorkbench'
import ExploreSun from './ExploreSun'
import type { Solar } from '../services/environment'
import {
  coordinateText,
  draftWorkspace,
  parseCoordinates,
  workspaceInput,
  workspaceSchema,
  type Geometry,
  type SavedWorkspace,
  type ScenarioKey,
  type WorkItem,
  type WorkspaceData,
} from '../domain/workspace'
import { ApiError, request } from '../services/api'
import { workspaceStatus, type SaveState } from '../domain/save-status'
import DrawingMap from './DrawingMap'
import SpatialEditor from './SpatialEditor'
import TownLayout from './TownLayout'
import ProposedTrees from './ProposedTrees'
import { Button } from './ui/button'
import { Sun } from 'lucide-react'
import CalculationsPanel from './CalculationsPanel'
import RectangleBuilder from './RectangleBuilder'
import EvidencePanel from './EvidencePanel'
import SiteConstraints from './SiteConstraints'
import PlanReferencePanel from './PlanReferencePanel'
import TerrainPanel from './TerrainPanel'
import TerrainBuilder from './TerrainBuilder'
import type { TerrainWaterPreview } from '../domain/terrain-study'
import PlantMaterialPanel from './PlantMaterialPanel'
import ObjectPalette from './ObjectPalette'
import { terrainChanged, defaultTerrainBrush } from '../domain/terrain'
import WorkspaceHistory from './WorkspaceHistory'
import SiteSummary from './SiteSummary'
import {
  readWorkspaceDraft,
  workspaceDraftKey,
  type WorkspaceDraft,
} from '../services/workspace-draft'

type Props = {
  initialTool?: Tool
  audience?: 'studio' | 'review'
  project: Project
  onProjectSaved: (project: Project) => void
  token: string | undefined
  demo: boolean
  onDirty: (dirty: boolean) => void
  onClose?: () => void
  userId?: string
}
type Kind = 'boundary' | 'target' | WorkItem['kind']
export default function GeometryWorkspace({
  project,
  onProjectSaved,
  token,
  demo,
  onDirty,
  userId,
  onClose,
  initialTool,
  audience,
}: Props) {
  const studioController = useRef<{ reveal: (tool: Tool, precision?: boolean) => void }>(null)
  const canEdit = demo || Boolean(project.capabilities?.includes('edit_geometry'))
  const displayUnits = useDisplayUnits()
  const [saved, setSaved] = useState<SavedWorkspace>({ revision: 0, data: null })
  const [data, setData] = useState<WorkspaceData | null>(null)
  const [sceneMode, setSceneMode] = useState(
    !demo && (initialTool === 'terrain' || initialTool === 'objects'),
  )
  const [treeToolActive, setTreeToolActive] = useState(initialTool === 'trees')
  const [sunOpen, setSunOpen] = useState(false)
  const [geographicMap, setGeographicMap] = useState<GeographicMap | null>(null)
  const [treeDirty, setTreeDirty] = useState(false)
  const [solar, setSolar] = useState<Solar | null>(null)
  const [embeddedDesign, setEmbeddedDesign] = useState(true)
  const [sceneHost, setSceneHost] = useState<HTMLDivElement | null>(null)
  const [scenario, setScenario] = useState<ScenarioKey>(demo || audience === 'review' ? 'baseline' : 'option_a')
  const [layers, setLayers] = useState({
    boundary: true,
    target: true,
    building: true,
    canopy: true,
    work: true,
    shadow: true,
    constraint: true,
  })
  const [kind, setKind] = useState<Kind>('boundary')
  const [name, setName] = useState('Site boundary')
  const [source, setSource] = useState('')
  const [provenance, setProvenance] = useState<WorkItem['provenance']>('estimated')
  const [coordinates, setCoordinates] = useState('')
  const [height, setHeight] = useState('')
  const [heightSource, setHeightSource] = useState('')
  const [count, setCount] = useState('1')
  const [manualBasis, setManualBasis] = useState<'count' | 'fixed'>('count')
  const [category, setCategory] = useState('General')
  const [crown, setCrown] = useState('')
  const [undo, setUndo] = useState<WorkspaceData[]>([])
  const [redo, setRedo] = useState<WorkspaceData[]>([])
  const [override, setOverride] = useState('')
  const [shadow, setShadow] = useState<{ revision: number; features: Feature[] } | null>(null)
  const [itemSearch, setItemSearch] = useState('')
  const [spatialSelection, setSpatialSelection] = useState<string[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [evidenceDirty, setEvidenceDirty] = useState(false)
  const [constraintDirty, setConstraintDirty] = useState(false)
  const [reviewDirty, setReviewDirty] = useState(false)
  const [objectCategoryLayers, setObjectCategoryLayers] = useState<Record<string, boolean>>({})
  const [objectDirty, setObjectDirty] = useState(false)
  const [scheduleDirty, setScheduleDirty] = useState(false)
  const [roadSketchDirty, setRoadDirty] = useState(false)
  const [paintDirty, setPaintDirty] = useState(false)
  const [paintActive, setPaintActive] = useState(false)
  const [treeDesignDirty, setTreeDesignDirty] = useState(false)
  const [treeDesignActive, setTreeDesignActive] = useState(false)
  const [terrainBrush, setTerrainBrush] = useState(defaultTerrainBrush)
  const [terrainFormDirty, setTerrainFormDirty] = useState(false)
  const [terrainMessage, setTerrainMessage] = useState('')
  const [terrainWater, setTerrainWater] = useState<TerrainWaterPreview | null>(null)
  const [treeMode, setTreeMode] = useState<'plant' | 'existing'>('plant')
  const [treeFocusId, setTreeFocusId] = useState('')
  const layoutDraftDirty = roadSketchDirty || paintDirty || treeDesignDirty
  const [roadActive, setRoadActive] = useState(false)
  const [plantActive, setPlantActive] = useState(false)
  const [roadMaterialId, setRoadMaterialId] = useState('')
  const [referenceDirty, setReferenceDirty] = useState(false)
  // Bumped when Pricing edits items, so tools holding a local copy reload from the draft.
  const [pricingVersion, setPricingVersion] = useState(0)
  // Proposal progress reported by the Review panel, for the step bar.
  const [studies, setStudies] = useState<StudiesStatus | null>(null)
  useEffect(() => {
    const reveal = () => studioController.current?.reveal('pricing')
    window.addEventListener(PRICE_ITEM_EVENT, reveal)
    return () => window.removeEventListener(PRICE_ITEM_EVENT, reveal)
  }, [])
  const [referenceImage, setReferenceImage] = useState<{ id: string; url: string } | null>(null)
  const [traceReference, setTraceReference] = useState(false)
  useEffect(() => {
    onDirty(
      dirty ||
        layoutDraftDirty ||
        treeDirty ||
        reviewDirty ||
        evidenceDirty ||
        referenceDirty ||
        objectDirty ||
        scheduleDirty ||
        terrainFormDirty ||
        constraintDirty,
    )
  }, [
    dirty,
    layoutDraftDirty,
    treeDirty,
    reviewDirty,
    evidenceDirty,
    referenceDirty,
    objectDirty,
    scheduleDirty,
    terrainFormDirty,
    constraintDirty,
    onDirty,
  ])
  const [pendingForm, setPendingForm] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [recoverable, setRecoverable] = useState<WorkspaceDraft | null>(null)
  const [inspectedData, setInspectedData] = useState(data)
  if (inspectedData !== data) {
    setInspectedData(data)
    if (data && editingId && !pendingForm) {
      const selected =
        kind === 'target'
          ? data.targets.find((i) => i.id === editingId)
          : data.scenarios[scenario].items.find((i) => i.id === editingId)
      if (!selected) {
        setEditingId(null)
        setCoordinates('')
        setName('')
        setSpatialSelection((ids) =>
          ids.filter((id) => data.scenarios[scenario].items.some((i) => i.id === id)),
        )
      } else if (
        selected.geometry &&
        !('object_instance' in selected && selected.object_instance)
      ) {
        setCoordinates(coordinateText(selected.geometry))
        setName(selected.name)
      }
    }
  }

  const recoveryKey =
    !demo && userId ? workspaceDraftKey(userId, project.organisation_id, project.id) : null
  useEffect(() => {
    if (!recoveryKey || !dirty || !data || busy) return
    try {
      sessionStorage.setItem(
        recoveryKey,
        JSON.stringify({
          savedAt: Date.now(),
          revision: saved.revision,
          data,
          form: {
            manualBasis,
            scenario,
            category,
            crown,
            kind,
            name,
            source,
            coordinates,
            height,
            heightSource,
            count,
            override,
            provenance,
            editingId,
            pendingForm,
          },
        }),
      )
    } catch {
      // Surface failure of an external storage write; editing and API save remain available.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError(
        'Tab recovery storage is unavailable. Keep this tab open and save your workspace to the API.',
      )
    }
  }, [
    recoveryKey,
    dirty,
    data,
    busy,
    saved.revision,
    scenario,
    kind,
    name,
    source,
    coordinates,
    height,
    heightSource,
    count,
    manualBasis,
    override,
    provenance,
    editingId,
    pendingForm,
    category,
    crown,
  ])
  const identity = `${demo ? 'demo' : project.organisation_id}/${project.id}`
  const current = useRef({ token, identity })
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  useEffect(() => {
    current.current = { token, identity }
  }, [token, identity])
  const endpoint = `/api/v1/organisations/${project.organisation_id}/projects/${project.id}/workspace`
  const storageKey = `infrashader.demo.workspace.v1.${project.id}`
  const geometryType: Geometry['type'] =
    kind === 'path' ? 'LineString' : kind === 'tree' || kind === 'bench' ? 'Point' : 'Polygon'

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const result = demo
          ? workspaceSchema.parse(
              JSON.parse(localStorage.getItem(storageKey) ?? '{"revision":0,"data":null}'),
            )
          : await request(endpoint, workspaceSchema, current.current.token)
        if (active) {
          setSaved(result)
          setData(result.data)
          setDirty(false)
          if (recoveryKey) setRecoverable(readWorkspaceDraft(recoveryKey))
        }
      } catch (reason) {
        if (active)
          setError(reason instanceof Error ? reason.message : 'Workspace could not be loaded.')
      } finally {
        if (active) setBusy(false)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [demo, endpoint, storageKey, onDirty, recoveryKey])

  function recoverDraft() {
    if (!recoverable || recoverable.revision !== saved.revision) return
    const form = recoverable.form
    setData(recoverable.data)
    setScenario(form.scenario)
    setKind(form.kind)
    setName(form.name)
    setSource(form.source)
    setCoordinates(form.coordinates)
    setHeight(form.height)
    setHeightSource(form.heightSource)
    setCount(form.count)
    setManualBasis(form.manualBasis)
    setCategory(form.category)
    setCrown(form.crown)
    setOverride(form.override)
    setProvenance(form.provenance)
    setEditingId(form.editingId)
    setPendingForm(form.pendingForm)
    setDirty(true)
    setRecoverable(null)
    setNotice('Recovered this tab draft. Apply pending form edits, then validate and save.')
  }

  function markFormChanged() {
    setPendingForm(true)
    markChanged()
  }
  function markChanged() {
    setDirty(true)
    setNotice('')
  }
  function change(next: WorkspaceData) {
    if (!canEdit) return
    const sharedIds = new Set(next.scenarios.baseline.items.map((item) => item.id))
    const previousIds = new Set(data?.scenarios.baseline.items.map((item) => item.id) ?? [])
    for (const key of ['option_a', 'option_b'] as const) {
      next.scenarios[key].items = [
        ...structuredClone(next.scenarios.baseline.items),
        ...next.scenarios[key].items.filter(
          (item) => !sharedIds.has(item.id) && !previousIds.has(item.id),
        ),
      ]
    }
    const calibration = next.plan_reference?.calibration_id
    for (const row of [...next.targets, ...Object.values(next.scenarios).flatMap((s) => s.items)]) {
      row.reference_review_required = Boolean(
        row.reference_calibration && row.reference_calibration !== calibration,
      )
    }
    if (data) setUndo((previous) => [...previous.slice(-49), structuredClone(data)])
    setRedo([])
    setData(next)
    markChanged()
  }
  function undoLast() {
    if (!data || !undo.length || busy || layoutDraftDirty) return
    setRedo((previous) => [...previous, structuredClone(data)])
    setData(undo[undo.length - 1])
    setUndo((previous) => previous.slice(0, -1))
    setEditingId(null)
    setPricingVersion((value) => value + 1)
    markChanged()
  }
  /** Select an item and frame it on the map without leaving the current tool. */
  function locate(id: string) {
    const geometry = data?.scenarios[scenario].items.find((item) => item.id === id)?.geometry
    if (!geometry) return
    setSpatialSelection([id])
    const points =
      geometry.type === 'Point'
        ? [geometry.coordinates]
        : geometry.type === 'LineString'
          ? geometry.coordinates
          : geometry.coordinates.flat()
    const xs = points.map((point) => point[0])
    const ys = points.map((point) => point[1])
    geographicMap?.fitBounds(
      [
        [Math.min(...xs), Math.min(...ys)],
        [Math.max(...xs), Math.max(...ys)],
      ],
      {
        padding: 120,
        maxZoom: 20,
        duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 400,
      },
    )
  }
  function start() {
    const next = draftWorkspace(project.site.bounds)
    if (project.site.outline) next.boundary = structuredClone(project.site.outline)
    change(next)
    setCoordinates(coordinateText(next.boundary))
    setSource(next.boundary_source)
  }
  function selectKind(next: Kind) {
    if (pendingForm && !window.confirm('Discard unapplied form changes?')) return
    setPendingForm(false)
    setHeight(next === 'canopy' ? '3' : '')
    setHeightSource('')
    setKind(next)
    setManualBasis('count')
    setCategory(
      next === 'tree'
        ? 'Vegetation'
        : next === 'bench'
          ? 'Furniture'
          : ['building', 'canopy'].includes(next)
            ? 'Structures'
            : next === 'path'
              ? 'Circulation'
              : 'General',
    )
    setCrown('')
    setName(next === 'boundary' ? 'Site boundary' : '')
    setCoordinates(next === 'boundary' && data ? coordinateText(data.boundary) : '')
    setSource(next === 'boundary' && data ? data.boundary_source : '')
    setEditingId(null)
    setOverride('')
    setError('')
  }
  function apply() {
    if (!data) return
    if (data.scenarios[scenario].items.some((i) => i.id === editingId && i.editor_locked)) {
      setError('Unlock this item in Spatial editing tools before changing it.')
      return
    }
    try {
      if (!source.trim() || !name.trim())
        throw new Error('Enter a name and source note before applying this geometry.')
      const geometry = kind === 'manual' ? null : parseCoordinates(coordinates, geometryType)
      const next = structuredClone(data)
      if (kind === 'boundary') {
        next.boundary = geometry!
        next.boundary_source = source
        next.boundary_provenance = provenance
      } else if (kind === 'target') {
        const target = {
          reference_calibration: traceReference
            ? next.plan_reference?.calibration_id
            : next.targets.find((row) => row.id === editingId)?.reference_calibration,
          id: editingId ?? crypto.randomUUID(),
          name,
          geometry: geometry!,
          source_note: source,
          provenance,
        }
        next.targets = [...next.targets.filter((item) => item.id !== target.id), target]
      } else {
        if (
          (kind === 'canopy' || (kind === 'building' && height !== '')) &&
          (!(Number(height) > 0) || Number(height) > 100 || !heightSource.trim())
        )
          throw new Error('Enter a height greater than 0 and no more than 100 m, with its source.')
        if (!Number.isInteger(Number(count)) || Number(count) < 0)
          throw new Error('Count must be a nonnegative whole number.')
        if (
          override &&
          (!Number.isFinite(Number(override)) ||
            Number(override) < 0 ||
            (Number(override) === 0 && !['tree', 'bench', 'manual'].includes(kind)) ||
            provenance === 'calculated')
        )
          throw new Error('An override needs a positive value and its own non-calculated source.')
        const previous = next.scenarios[scenario].items.find((item) => item.id === editingId)
        const item: WorkItem = {
          road: previous?.road,
          layout_plant: previous?.layout_plant,
          plant_variant: previous?.plant_variant,
          tree_design: previous?.tree_design,
          editor_dimensions: previous?.editor_dimensions,
          editor_locked: previous?.editor_locked,
          editor_group: previous?.editor_group,
          plant: previous?.plant,
          assembly: previous?.assembly,
          manual_basis: kind === 'manual' ? manualBasis : 'count',
          category: category.trim() || 'General',
          visible: previous?.visible ?? true,
          crown_diameter_m: kind === 'tree' && crown ? Number(crown) : null,
          id: editingId ?? crypto.randomUUID(),
          name,
          kind,
          status: previous?.status ?? (scenario === 'baseline' ? 'existing' : 'proposed'),
          geometry,
          count: Number(count),
          height_m:
            (kind === 'building' || kind === 'canopy') && height !== '' ? Number(height) : null,
          height_source: heightSource,
          quantity_override: override || null,
          provenance,
          source_note: source,
          rate_id: previous?.rate_id ?? null,
          reference_calibration: traceReference
            ? next.plan_reference?.calibration_id
            : previous?.reference_calibration,
        }
        next.scenarios[scenario].items = [
          ...next.scenarios[scenario].items.filter((entry) => entry.id !== item.id),
          item,
        ]
      }
      change(next)
      setPendingForm(false)
      setError('')
      setEditingId(null)
      setNotice('Applied to your draft. Save to validate and persist the workspace.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Check the coordinates.')
    }
  }
  function edit(item: WorkItem) {
    if (item.kind === 'tree' && item.layout_plant !== 'shrub' && item.layout_plant !== 'flowers' && item.status === 'proposed') {
      setTreeFocusId(item.id); setTreeMode('plant'); setTreeToolActive(true)
      studioController.current?.reveal('trees')
      return
    }
    if (item.road) {
      studioController.current?.reveal('layout')
      setNotice('Use Edit road shape in Roads and driveways to change this road’s route or width.')
      return
    }
    if (item.kind === 'object') {
      if (pendingForm && !window.confirm('Discard unapplied form changes?')) return false
      setPendingForm(false)
      setEditingId(item.id)
      return true
    }
    if (pendingForm && !window.confirm('Discard unapplied form changes?')) return false
    setPendingForm(false)
    if (data?.scenarios.baseline.items.some((value) => value.id === item.id))
      setScenario('baseline')
    setKind(item.kind)
    setName(item.name)
    setSource(item.source_note)
    setProvenance(item.provenance)
    setCoordinates(item.geometry ? coordinateText(item.geometry) : '')
    setHeight(String(item.height_m ?? ''))
    setHeightSource(item.height_source)
    setCount(String(item.count))
    setManualBasis(item.manual_basis)
    setCategory(item.category)
    setCrown(item.crown_diameter_m === null ? '' : String(item.crown_diameter_m))
    setOverride(item.quantity_override ?? '')
    setEditingId(item.id)
  }
  function editTarget(target: WorkspaceData['targets'][number]) {
    if (pendingForm && !window.confirm('Discard unapplied form changes?')) return
    setPendingForm(false)
    setKind('target')
    setName(target.name)
    setSource(target.source_note)
    setProvenance(target.provenance)
    setCoordinates(coordinateText(target.geometry))
    setEditingId(target.id)
  }
  async function save() {
    if (!canEdit || project.archived || !data || pendingForm || constraintDirty || layoutDraftDirty) return
    setBusy(true)
    setError('')
    setSaveState('saving')
    try {
      let result: SavedWorkspace
      if (demo) {
        const before = workspaceSchema.parse(
          JSON.parse(localStorage.getItem(storageKey) ?? '{"revision":0,"data":null}'),
        )
        if (before.revision !== saved.revision)
          throw new Error('Demo workspace changed in another tab. Reload before saving.')
        result = workspaceSchema.parse({
          revision: saved.revision + 1,
          data: workspaceInput(data, saved.revision),
        })
        localStorage.setItem(storageKey, JSON.stringify(result))
      } else
        result = await request(endpoint, workspaceSchema, current.current.token, {
          method: 'POST',
          body: JSON.stringify(workspaceInput(data, saved.revision)),
        })
      if (!mounted.current || current.current.identity !== identity) return
      setSaved(result)
      setData(result.data)
      setUndo([])
      setRedo([])
      if (recoveryKey) sessionStorage.removeItem(recoveryKey)
      setRecoverable(null)
      setDirty(false)
      setSaveState('idle')
      setNotice(
        demo
          ? 'Draft saved only in Browser Demo. Metric validation and calculations require the real API.'
          : `Workspace revision ${result.revision} saved. Quantities were calculated by the API.`,
      )
    } catch (reason) {
      if (mounted.current)
        setSaveState(
          reason instanceof ApiError && reason.code === 'revision_conflict' ? 'conflict' : 'failed',
        )
      setError(
        `${reason instanceof Error ? reason.message : 'Save failed.'} Your unsaved changes are still in this tab.`,
      )
    } finally {
      setBusy(false)
    }
  }
  const features = useMemo<Feature[]>(
    () =>
      !data
        ? []
        : [
            {
              type: 'Feature' as const,
              geometry: data.boundary,
              properties: { color: '#b4c5ae', kind: 'boundary' },
            },
            ...data.targets.map((target) => ({
              type: 'Feature' as const,
              geometry: target.geometry,
              id: target.id,
              properties: {
                color: '#d8a638',
                item_id: target.id,
                kind: 'target',
                name: target.name,
              },
            })),
            ...data.scenarios[scenario].items
              .filter(
                (item) =>
                  item.geometry && item.visible && objectCategoryLayers[item.category] !== false,
              )
              .map((item) => ({
                type: 'Feature' as const,
                geometry: item.object_pose?.footprint ?? item.geometry!,
                id: item.id,
                properties: {
                  item_id: item.id,
                  name: item.name,
                  kind: item.kind,
                  height: item.height_m ?? 0,
                  height_source: item.height_source,
                  provenance: item.provenance,
                  ...(item.road ? { road_surface: item.road.surface } : {}),
                  ...(item.layout_plant ? { layout_plant: item.layout_plant } : {}),
                  color: item.kind === 'building' && item.height_m === null ? '#ba6236' : '#2d7258',
                },
              })),
            ...data.constraints
              .filter((record) => record.geometry)
              .map((record) => ({
                type: 'Feature' as const,
                id: record.id,
                geometry: record.geometry!,
                properties: {
                  kind: 'constraint',
                  name: record.title,
                  color:
                    record.status === 'verified' || record.status === 'resolved'
                      ? '#6e4e87'
                      : '#bf562c',
                },
              })),
            ...(!dirty &&
            !Object.values(data.scenarios).some((s) => terrainChanged(s.terrain)) &&
            shadow?.revision === saved.revision
              ? shadow.features
              : []),
          ].filter((feature) => {
            const kind = feature.properties?.kind
            return layers[kind && kind in layers ? (kind as keyof typeof layers) : 'work']
          }),
    [data, scenario, dirty, shadow, saved.revision, layers, objectCategoryLayers],
  )
  const selectedFeature = useMemo<Feature | undefined>(() => {
    const target =
      kind === 'target' ? data?.targets.find((target) => target.id === editingId) : undefined
    if (target)
      return {
        type: 'Feature',
        id: target.id,
        geometry: target.geometry,
        properties: { name: target.name, provenance: target.provenance },
      }
    const item = data?.scenarios[scenario].items.find((item) => item.id === editingId)
    return item?.geometry
      ? {
          type: 'Feature',
          id: item.id,
          geometry: item.geometry,
          properties: {
            name: item.name,
            provenance: item.provenance,
            height: item.height_m,
            height_source: item.height_source,
            preset: Boolean(item.object_instance || item.layout_plant),
            locked: item.editor_locked,
          },
        }
      : undefined
  }, [data, scenario, editingId, kind])
  const developer = project.purpose === 'developer_decision'
  const progress: Partial<Record<Stage, StageProgress>> = (() => {
    if (!data) return { site: { text: 'Not started', state: 'todo' } }
    const unchecked = data.constraints.filter(
      (record) => !['verified', 'resolved'].includes(record.status),
    ).length
    const critical = data.constraints.filter(
      (record) => record.critical && !['verified', 'resolved'].includes(record.status),
    ).length
    const area =
      saved.site_area_m2 == null
        ? 'Area unknown'
        : `${Math.round(saved.site_area_m2).toLocaleString()} m² est.`
    const option = scenario === 'baseline' ? 'option_a' : scenario
    const proposed = data.scenarios[option].items.filter(
      (item) => item.status === 'proposed',
    )
    const unpriced = proposed.filter((item) => !isPriced(item)).length
    const optionName = data.scenarios[option].name
    const result: Partial<Record<Stage, StageProgress>> = {
      site: {
        text: unchecked ? `${area} · ${unchecked} to check` : area,
        state: critical ? 'attention' : 'done',
      },
      design: {
        text: `${proposed.length} item${proposed.length === 1 ? '' : 's'} in ${optionName}`,
        state: proposed.length ? 'done' : 'todo',
      },
      price: !proposed.length
        ? { text: 'Nothing to price yet', state: 'todo' }
        : unpriced
          ? { text: `${unpriced} need${unpriced === 1 ? 's' : ''} a price`, state: 'attention' }
          : { text: 'All have a rate', state: 'done' },
    }
    if (demo) return result
    result.proposal = dirty
      ? { text: 'Save to review', state: 'todo' }
      : studies?.issueReadiness == null
        ? { text: 'Checking issue readiness', state: 'todo' }
        : studies.issueReadiness > 0
          ? { text: `${studies.issueReadiness} things to fix`, state: 'attention' }
          : { text: 'Ready to issue', state: 'done' }
    return result
  })()
  const chooseScenario = (key: ScenarioKey) => {
    if (key === scenario) return
    if (
      (pendingForm || objectDirty || scheduleDirty) &&
      !window.confirm('Discard unapplied form changes?')
    )
      return
    setPendingForm(false)
    setScenario(key)
    setShadow(null)
    setEditingId(null)
  }
  return (
    <StudioShell
      progress={audience === 'review' ? undefined : progress}
      stageLabels={developer ? { proposal: 'Decision brief' } : undefined}
      simpleLayout={!demo && audience === 'studio'}
      toolChangeBlocked={layoutDraftDirty || objectDirty || terrainFormDirty}
      blockedBy={
        treeDesignDirty
          ? 'trees'
          : roadSketchDirty || paintDirty
            ? 'layout'
            : objectDirty
              ? 'objects'
              : terrainFormDirty
                ? 'terrain'
                : undefined
      }
      initialTool={initialTool}
      audience={audience}
      title={project.name}
      controller={studioController}
      onExplore={() => {
        setSceneMode(false)
        setTreeToolActive(false)
      }}
      onPanelClosed={() => setTreeToolActive(false)}
      message={
        error ||
        (!data && !busy
          ? 'Your site is ready. Choose step 1, Site, to start building on it.'
          : undefined)
      }
      onTool={(tool) => {
        if (layoutDraftDirty || objectDirty || terrainFormDirty) return
        setTreeToolActive(tool === 'trees')
        if (tool === 'trees') setSceneMode(false)
        if (!demo && data && (tool === 'terrain' || tool === 'objects')) setSceneMode(true)
      }}
      status={workspaceStatus({ saveState, treeDirty, dirty, revision: saved.revision })}
      onClose={onClose}
      onSave={() => void save()}
      saveDisabled={
        !canEdit ||
        !data ||
        busy ||
        !dirty ||
        pendingForm ||
        objectDirty ||
        scheduleDirty ||
        terrainFormDirty ||
        layoutDraftDirty ||
        constraintDirty ||
        referenceDirty ||
        project.archived
      }
    >
      <StudioSection tool="trees">
        <div className="tree-section-tabs" aria-label="Tree workspace"><button type="button" aria-pressed={treeMode === 'plant'} disabled={treeDirty || treeDesignDirty} onClick={() => setTreeMode('plant')}>Plant trees</button><button type="button" aria-pressed={treeMode === 'existing'} disabled={treeDesignDirty} onClick={() => setTreeMode('existing')}>Existing site</button></div>
        <div hidden={treeMode !== 'plant'}>
        {!demo && data && <ProposedTrees
          solar={solar}
          key={`trees-${scenario}-${treeFocusId}-${pricingVersion}`}
          map={geographicMap} data={data} scenario={scenario} revision={saved.revision} endpoint={endpoint} token={token}
          active={treeMode === 'plant'} disabled={!canEdit || busy || pendingForm || scheduleDirty || objectDirty || treeDirty || project.archived || sceneMode}
          dirty={dirty} canPrice={Boolean(project.capabilities?.includes(project.purpose === 'developer_decision' ? 'estimate' : 'internal_pricing'))}
          rateBasis={project.purpose === 'developer_decision' ? 'indicative_budget' : 'cost'}
          focusId={treeFocusId} showModels={!sceneMode && layers.work} categoryLayers={objectCategoryLayers}
          onChange={change} onDirty={setTreeDesignDirty} onWorking={setBusy} onActive={setTreeDesignActive}
          onScenario={(key) => { if (!layoutDraftDirty) { setScenario(key); setTreeFocusId(''); setEditingId(null) } }}
          onEstimate={() => { setTreeToolActive(false); openStudiesStep('estimate'); studioController.current?.reveal('analysis') }}
          onSpecifications={(id) => { setRoadMaterialId(id); setTreeToolActive(false); studioController.current?.reveal('materials') }}
          canUndo={undo.length > 0} canRedo={redo.length > 0}
          onUndo={() => { if (!undo.length || layoutDraftDirty || busy) return; setRedo((previous) => [...previous, structuredClone(data)]); setData(undo[undo.length - 1]); setUndo((previous) => previous.slice(0, -1)); markChanged() }}
          onRedo={() => { if (!redo.length || layoutDraftDirty || busy) return; setUndo((previous) => [...previous, structuredClone(data)]); setData(redo[redo.length - 1]); setRedo((previous) => previous.slice(0, -1)); markChanged() }}
        />}
        </div>
        {treeMode === 'plant' && !data && !busy && <div className="town-note"><p>Prepare your selected site to start planting proposed trees.</p><Button disabled={!canEdit || project.archived} onClick={start}>Prepare planting workspace</Button></div>}
        {demo && treeMode === 'plant' && <p className="town-note">Proposed tree models and estimates require a signed-in project. Existing-site Demo inventory remains available.</p>}
        <div hidden={treeMode !== 'existing'}>
        <ProjectTreeWorkbench
          project={project}
          token={token}
          demo={demo}
          map={geographicMap}
          solar={solar}
          active={treeToolActive && treeMode === 'existing'}
          onDirty={setTreeDirty}
          onSaved={onProjectSaved}
        />
        </div>
      </StudioSection>
      {geographicMap && (
        <StudioCanvas>
          <div className="studio-sun-context">
            {(!sceneMode || embeddedDesign) && (
              <button
                type="button"
                className="studio-sun-toggle"
                aria-expanded={sunOpen}
                onClick={() => setSunOpen(!sunOpen)}
              >
                <Sun aria-hidden="true" size={16} />
                <span>Sun context</span>
              </button>
            )}
            <ExploreSun
              map={geographicMap}
              onSolar={setSolar}
              controlsHidden={(sceneMode && !embeddedDesign) || !sunOpen}
            />
          </div>
        </StudioCanvas>
      )}
      <section className="paper mt-6 p-5" aria-label="Ground geometry workspace">
        <div className="studio-legacy-heading flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="eyebrow">Ground geometry & options</span>
            <h2>Define the work on your site</h2>
            <p>
              {demo
                ? 'Browser Demo drafts do not calculate or certify quantities.'
                : 'The API validates geometry and calculates quantities in a local projected CRS.'}
            </p>
          </div>
          <span role="status">
            {dirty ? 'Unsaved workspace' : `Workspace revision ${saved.revision}`}
          </span>
        </div>
        {recoverable && (
          <div className="notice" role="status">
            <div>
              <strong>An unsaved workspace draft is available in this tab.</strong>
              <p>
                {recoverable.revision === saved.revision
                  ? 'Recover the geometry and pending item form, or discard the local draft.'
                  : 'The server revision changed. Automatic recovery is blocked to prevent overwriting newer work. Download the draft for manual reconciliation.'}
              </p>
              <Button
                disabled={busy || recoverable.revision !== saved.revision}
                onClick={recoverDraft}
              >
                Recover workspace draft
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  const url = URL.createObjectURL(
                    new Blob([JSON.stringify(recoverable, null, 2)], { type: 'application/json' }),
                  )
                  const link = document.createElement('a')
                  link.href = url
                  link.download = 'infrashader-unsaved-workspace.json'
                  link.click()
                  setTimeout(() => URL.revokeObjectURL(url), 1000)
                }}
              >
                Download unsaved draft
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  if (recoveryKey) sessionStorage.removeItem(recoveryKey)
                  setRecoverable(null)
                }}
              >
                Discard recovered draft
              </Button>
            </div>
          </div>
        )}
        {!demo && (
          <p className="text-sm studio-technical-note">
            Unsaved geometry and item forms are kept in this tab for up to eight hours, scoped to
            your account. Explicit sign-out or discarding changes clears them. Review, pricing and
            evidence forms require separate saves.
          </p>
        )}
        {error && (
          <div className="notice error" role="alert">
            {error}
          </div>
        )}
        {notice && (
          <div className="notice" role="status">
            {notice}
          </div>
        )}
        {busy && !data ? (
          <p role="status">Loading workspace…</p>
        ) : !data ? (
          <>
            <StudioCanvas>
              <section aria-label="Studio canvas">
                <DrawingMap
                  onMapReady={setGeographicMap}
                  bounds={project.site.bounds}
                  features={
                    project.site.outline
                      ? [
                          {
                            type: 'Feature',
                            properties: { kind: 'locator', color: '#701f36' },
                            geometry: project.site.outline,
                          },
                        ]
                      : []
                  }
                  type="Polygon"
                  onGeometry={() => {}}
                  disabled
                />
              </section>
            </StudioCanvas>
            <div className="town-site-card"><div><span className="town-eyebrow">SELECTED SITE · ESTIMATED</span><strong>{saved.site_area_m2 == null ? 'Area unavailable' : `${Math.round(saved.site_area_m2).toLocaleString()} m²`}</strong><small>Map selection estimate · verify before construction</small></div></div>
            <Button disabled={!canEdit || !!error || project.archived} onClick={start}>
              Start building on this site
            </Button>
          </>
        ) : (
          <>
            <div className="workspace-editor border-0 min-w-0 p-0">
              {!canEdit && (
                <p className="notice small">
                  Read-only: you can view this design but not change it. Editing needs a designer
                  role on this project.
                </p>
              )}
              <StudioSection tool="layout" advanced>
                <p className="text-sm">
                  Draft boundary: {data.boundary_source} ·{' '}
                  {data.metric_crs ?? 'Metric validation pending'} · {data.source_crs} transfer
                </p>
              </StudioSection>
              <StudioSection tool="layout" advanced>
              <div className="flex flex-wrap gap-2 py-3" role="group" aria-label="Scenario selection">
                {(['baseline', 'option_a', 'option_b'] as const).map((key) => (
                  <Button
                    key={key}
                    disabled={busy || layoutDraftDirty || terrainFormDirty}
                    aria-pressed={scenario === key}
                    variant={scenario === key ? 'default' : 'outline'}
                    onClick={() => {
                      if (
                        (pendingForm || objectDirty || scheduleDirty) &&
                        !window.confirm('Discard unapplied form changes?')
                      )
                        return
                      setPendingForm(false)
                      setScenario(key)
                      setShadow(null)
                      setEditingId(null)
                    }}
                  >
                    {data.scenarios[key].name}
                  </Button>
                ))}
                {scenario !== 'baseline' && (
                  <Button
                    variant="outline"
                    disabled={!canEdit || busy || project.archived || layoutDraftDirty}
                    onClick={() => {
                      if (
                        window.confirm('Remove this option own items and keep the shared Baseline?')
                      ) {
                        const next = structuredClone(data)
                        next.scenarios[scenario].items = structuredClone(
                          next.scenarios.baseline.items,
                        )
                        change(next)
                      }
                    }}
                  >
                    Reset option to Baseline
                  </Button>
                )}
              </div>
              <p className="studio-technical-note">
                Baseline objects are shared by both options. Edit or remove them in Baseline; saving
                updates both options and makes earlier calculations stale. Proposed items stay
                independent.
              </p>
              </StudioSection>
              <StudioCanvas>
                <section aria-label="Studio canvas" className="rounded border p-2">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <Button
                      variant={!sceneMode ? 'default' : 'outline'}
                      aria-pressed={!sceneMode}
                      onClick={() => setSceneMode(false)}
                    >
                      Site map
                    </Button>
                    {!demo && (
                      <Button
                        variant={sceneMode ? 'default' : 'outline'}
                        aria-pressed={sceneMode}
                        onClick={() => setSceneMode(true)}
                      >
                        3D design scene
                      </Button>
                    )}
                    <label className="studio-technical-note">
                      <input
                        type="checkbox"
                        checked={embeddedDesign}
                        onChange={(event) => setEmbeddedDesign(event.target.checked)}
                      />{' '}
                      Embed design on map
                    </label>
                    <div
                      className="studio-option-picker"
                      role="group"
                      aria-label="Option being edited"
                    >
                      {(['baseline', 'option_a', 'option_b'] as const).map((key) => (
                        <button
                          key={key}
                          type="button"
                          aria-pressed={scenario === key}
                          aria-label={`Edit ${key === 'baseline' ? 'existing site' : data.scenarios[key].name}`}
                          disabled={busy || layoutDraftDirty || terrainFormDirty}
                          title={
                            key === 'baseline'
                              ? 'What is already on site. Shared by both options and never priced.'
                              : 'Proposed work that is priced and can be issued.'
                          }
                          onClick={() => chooseScenario(key)}
                        >
                          {key === 'baseline' ? 'Existing site' : data.scenarios[key].name}
                        </button>
                      ))}
                    </div>
                    <span role="status" className="studio-selected-status">
                      Selected:{' '}
                      {data.scenarios[scenario].items.find((i) => i.id === editingId)?.name ??
                        data.targets.find((i) => i.id === editingId)?.name ??
                        'None'}
                    </span>
                  </div>
                  <div hidden={sceneMode && !embeddedDesign}>
                    <DrawingMap
                      selectionBlocked={roadActive || plantActive || paintActive || treeDesignActive}
                      onMapReady={setGeographicMap}
                      designActive={sceneMode && embeddedDesign}
                      terrainEdited={Object.values(data.scenarios).some((s) =>
                        terrainChanged(s.terrain),
                      )}
                      reference={data.plan_reference}
                      referenceImage={
                        referenceImage?.id === data.plan_reference?.evidence_id
                          ? referenceImage?.url
                          : undefined
                      }
                      selectedIds={spatialSelection}
                      onToggleSelection={(id) =>
                        setSpatialSelection((previous) =>
                          previous.includes(id)
                            ? previous.filter((value) => value !== id)
                            : [...previous, id],
                        )
                      }
                      bounds={project.site.bounds}
                      features={features}
                      type={geometryType}
                      selected={selectedFeature}
                      disabled={!canEdit || busy || project.archived || sceneMode || treeToolActive || roadActive || plantActive || paintActive || treeDesignActive}
                      onSelect={(id) => {
                        studioController.current?.reveal('layout')
                        setSpatialSelection([id])
                        const target = data.targets.find((target) => target.id === id)
                        if (target) {
                          editTarget(target)
                          return
                        }
                        const item = data.scenarios[scenario].items.find((item) => item.id === id)
                        if (item) edit(item)
                      }}
                      onGeometry={(geometry) => {
                        studioController.current?.reveal('layout')
                        setCoordinates(coordinateText(geometry))
                        markFormChanged()
                      }}
                    />
                  </div>
                  <div
                    className={
                      embeddedDesign ? 'studio-scene-host studio-map-tools' : 'studio-scene-host'
                    }
                    ref={setSceneHost}
                    hidden={!sceneMode}
                  />
                  {!demo &&
                    (() => {
                      const picked =
                        spatialSelection.length === 1
                          ? data.scenarios[scenario].items.find(
                              (item) => item.id === spatialSelection[0] && item.status === 'proposed',
                            )
                          : undefined
                      return picked ? (
                        <aside className="price-selected-host">
                          <SelectedPriceCard item={picked} onPrice={() => openPricing(picked.id)} />
                        </aside>
                      ) : null
                    })()}
                </section>
              </StudioCanvas>
              <StudioSection tool="sources">
                <SiteSummary
                  data={data}
                  areaM2={saved.site_area_m2}
                  disabled={!canEdit || busy || project.archived || pendingForm || layoutDraftDirty}
                  onPreviewArea={() => setLayers(current => ({ ...current, boundary: true, target: true }))}
                  onMarkArea={() => change({ ...data, targets: [...data.targets, {
                    id: crypto.randomUUID(), name: 'Proposal area', geometry: structuredClone(data.boundary),
                    provenance: 'estimated', source_note: `User-confirmed copy of site boundary; estimated, not a survey. Original source: ${data.boundary_source}`.slice(0, 2000),
                  }] })}
                  onDrawArea={() => { selectKind('target'); studioController.current?.reveal('layout', true) }}
                  onShowExisting={() => chooseScenario('baseline')}
                  onExistingTrees={() => {
                    setTreeMode('existing')
                    setTreeToolActive(true)
                    setSceneMode(false)
                    studioController.current?.reveal('trees')
                  }}
                  onDesign={() => {
                    if (scenario === 'baseline') chooseScenario('option_a')
                    studioController.current?.reveal('layout')
                  }}
                />
              </StudioSection>
              <StudioSection tool="layout">
                {!demo && (
                  <TownLayout
                    key={`road-${scenario}`}
                    siteArea={saved.site_area_m2}
                    selectedIds={spatialSelection}
                    onSelect={setSpatialSelection}
                    map={geographicMap}
                    data={data}
                    scenario={scenario}
                    revision={saved.revision}
                    endpoint={endpoint}
                    token={token}
                    disabled={!canEdit || busy || pendingForm || objectDirty || scheduleDirty || project.archived || sceneMode || treeToolActive}
                    onChange={change}
                    onRoadDirty={setRoadDirty}
                    onPaintDirty={setPaintDirty}
                    onPaintActive={setPaintActive}
                    onRoadActive={setRoadActive}
                    onPlantActive={setPlantActive}
                    onWorking={setBusy}
                    canUndo={undo.length > 0}
                    canRedo={redo.length > 0}
                    onUndo={() => {
                      if (!undo.length || busy || layoutDraftDirty) return
                      setRedo((previous) => [...previous, structuredClone(data)])
                      setData(undo[undo.length - 1]); setUndo((previous) => previous.slice(0, -1)); setEditingId(null); markChanged()
                    }}
                    onRedo={() => {
                      if (!redo.length || busy || layoutDraftDirty) return
                      setUndo((previous) => [...previous, structuredClone(data)])
                      setData(redo[redo.length - 1]); setRedo((previous) => previous.slice(0, -1)); setEditingId(null); markChanged()
                    }}
                    onEstimate={() => { openStudiesStep('estimate'); studioController.current?.reveal('analysis') }}
                    onMaterials={(id) => {
                      setRoadMaterialId(id)
                      studioController.current?.reveal('materials')
                    }}
                  />
                )}
              </StudioSection>
              <StudioSection tool="layout" advanced>
                <fieldset className="my-3">
                  <legend>Map layers</legend>
                  {Object.entries(layers).map(([key, visible]) => (
                    <label key={key} className="inline-flex flex-row items-center gap-2 mr-4">
                      <input
                        type="checkbox"
                        checked={visible}
                        onChange={(event) =>
                          setLayers((current) => ({ ...current, [key]: event.target.checked }))
                        }
                      />{' '}
                      Show {key} layer
                    </label>
                  ))}
                  <p>
                    Layer visibility changes this view only. Quantities, analysis and saved scope
                    include hidden objects.
                  </p>
                </fieldset>
                {!demo && (
                  <SpatialEditor
                    key={`${project.id}-${scenario}`}
                    data={data}
                    selection={spatialSelection}
                    setSelection={setSpatialSelection}
                    scenario={scenario}
                    endpoint={endpoint.replace(/\/workspace$/, '/spatial-edit')}
                    token={token}
                    revision={saved.revision}
                    storageKey={`infrashader.selection.${userId}.${project.id}.${scenario}`}
                    disabled={
                      !canEdit ||
                      busy ||
                      pendingForm ||
                      objectDirty ||
                      scheduleDirty ||
                      layoutDraftDirty ||
                      terrainFormDirty ||
                      project.archived
                    }
                    onChange={change}
                    onWorking={setBusy}
                    onSelect={(id) => {
                      const item = data.scenarios[scenario].items.find((i) => i.id === id)
                      if (item) edit(item)
                    }}
                  />
                )}
              </StudioSection>
              <fieldset
                disabled={!canEdit || busy || project.archived || layoutDraftDirty}
                className="border-0 p-0 min-w-0"
              >
                <StudioSection tool="layout" advanced>
                  <div className="field">
                    <label htmlFor="geometry-kind">Geometry to add or replace</label>
                    <select
                      id="geometry-kind"
                      value={kind}
                      onChange={(event) => selectKind(event.target.value as Kind)}
                    >
                      {Object.entries({
                        'Site definition': ['boundary', 'target'],
                        Structures: ['building', 'canopy'],
                        'Surfaces and circulation': ['area', 'path'],
                        'Vegetation and furniture': ['tree', 'bench'],
                        'Other quantities': ['manual'],
                      }).map(([group, kinds]) => (
                        <optgroup key={group} label={group}>
                          {kinds.map((entry) => (
                            <option key={entry} value={entry}>
                              {entry === 'canopy'
                                ? 'Elevated canopy roof'
                                : entry === 'manual'
                                  ? 'Manual count item'
                                  : entry}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                  {kind === 'canopy' && !demo && (
                    <RectangleBuilder
                      project={project}
                      token={token}
                      onGeometry={(geometry) => {
                        studioController.current?.reveal('layout')
                        setCoordinates(coordinateText(geometry))
                        markFormChanged()
                      }}
                    />
                  )}
                </StudioSection>

                {!demo && (
                  <StudioSection tool="objects">
                    <ObjectPalette
                      terrainBrush={terrainBrush}
                      terrainWater={terrainWater}
                      onTerrainMessage={setTerrainMessage}
                      placementMap={geographicMap}
                      revision={saved.revision}
                      solar={solar}
                      geographicMap={embeddedDesign ? geographicMap : undefined}
                      sceneHost={sceneHost}
                      sceneMode={sceneMode}
                      onSceneMode={setSceneMode}
                      siteLayers={layers}
                      selection={editingId}
                      onSelection={(id) => {
                        const item = data.scenarios[scenario].items.find((i) => i.id === id)
                        if (item) {
                          edit(item)
                          setSpatialSelection([id])
                        } else {
                          const target = data.targets.find((target) => target.id === id)
                          if (target) editTarget(target)
                          else setEditingId(null)
                        }
                      }}
                      onWorking={setBusy}
                      categoryLayers={objectCategoryLayers}
                      onCategoryLayers={setObjectCategoryLayers}
                      key={`objects-${scenario}`}
                      data={data}
                      scenario={scenario}
                      endpoint={endpoint}
                      token={token}
                      disabled={!canEdit || busy || pendingForm || scheduleDirty || terrainFormDirty || project.archived}
                      onChange={change}
                      onDirty={setObjectDirty}
                    />
                  </StudioSection>
                )}
                {!demo && (
                  <StudioSection tool="materials">
                    <PlantMaterialPanel
                      key={`schedule-${scenario}-${roadMaterialId}-${pricingVersion}`}
                      initialItemId={roadMaterialId}
                      data={data}
                      onDirty={setScheduleDirty}
                      onWorking={setBusy}
                      savedRevision={saved.revision}
                      dirty={dirty || constraintDirty}
                      scenario={scenario}
                      endpoint={endpoint}
                      token={token}
                      disabled={!canEdit || busy || terrainFormDirty || project.archived}
                      onChange={change}
                      onInspect={(id) => {
                        const item = data.scenarios[scenario].items.find((i) => i.id === id)
                        if (item) edit(item)
                      }}
                    />
                  </StudioSection>
                )}
                {!demo && (
                  <StudioSection tool="terrain">
                    <TerrainBuilder
                      sceneMode={sceneMode}
                      disabledReason={!canEdit ? 'This project is read-only for your account. Terrain editing requires geometry-edit access.' : project.archived ? 'Restore this archived project before editing terrain.' : busy ? 'Updating the workspace. Terrain controls will activate when it finishes.' : pendingForm || scheduleDirty || objectDirty ? 'Apply or cancel pending item changes before editing terrain.' : undefined}
                      revision={saved.revision} canAnalyse={Boolean(project.capabilities?.includes('analyse'))} onWater={setTerrainWater}
                      key={`terrain-builder-${scenario}`}
                      data={data} scenario={scenario} endpoint={endpoint} token={token}
                      disabled={!canEdit || busy || pendingForm || scheduleDirty || objectDirty || project.archived}
                      dirty={dirty} brush={terrainBrush} onBrush={setTerrainBrush} onChange={change}
                      onDirty={setTerrainFormDirty} onWorking={setBusy} message={terrainMessage}
                      canPrice={Boolean(project.capabilities?.includes(project.purpose === 'developer_decision' ? 'estimate' : 'internal_pricing'))}
                      rateBasis={project.purpose === 'developer_decision' ? 'indicative_budget' : 'cost'}
                      onScene={() => { setSceneMode(true); setTerrainMessage(''); geographicMap?.easeTo({ pitch: 55, duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 400 }) }}
                      onEstimate={() => { openStudiesStep('estimate'); studioController.current?.reveal('analysis') }}
                      canUndo={undo.length > 0} canRedo={redo.length > 0}
                      onUndo={() => { if (!undo.length || busy) return; setRedo(previous => [...previous, structuredClone(data)]); setData(undo[undo.length - 1]); setUndo(previous => previous.slice(0, -1)); markChanged() }}
                      onRedo={() => { if (!redo.length || busy) return; setUndo(previous => [...previous, structuredClone(data)]); setData(redo[redo.length - 1]); setRedo(previous => previous.slice(0, -1)); markChanged() }}
                    />
                    <details className="terrain-precision"><summary>Precision terrain controls</summary>
                    <TerrainPanel
                      key={scenario}
                      data={data}
                      scenario={scenario}
                      endpoint={endpoint}
                      token={token}
                      disabled={!canEdit || busy || terrainFormDirty || project.archived}
                      onChange={change}
                    />
                    </details>
                  </StudioSection>
                )}
                {!demo && (
                  <StudioSection tool="sources">
                    <PlanReferencePanel
                      project={project}
                      token={token}
                      value={data.plan_reference}
                      disabled={
                        !canEdit ||
                        busy ||
                        project.archived ||
                        !project.capabilities?.includes('edit_evidence')
                      }
                      onImage={setReferenceImage}
                      onDirty={setReferenceDirty}
                      onChange={(reference) => change({ ...data, plan_reference: reference })}
                    />
                  </StudioSection>
                )}
                <StudioSection tool="layout" advanced>
                  {data.plan_reference?.calibration_id && (
                    <label>
                      <input
                        type="checkbox"
                        checked={traceReference}
                        disabled={!canEdit}
                        onChange={(e) => setTraceReference(e.target.checked)}
                      />
                      Link applied work geometry to this calibrated reference
                    </label>
                  )}
                  {[...data.targets, ...data.scenarios[scenario].items]
                    .filter((row) => row.reference_review_required)
                    .map((row) => (
                      <div key={row.id} id={`reference-review-${row.id}`} tabIndex={-1} role="status">
                        {row.name}: reference replaced or recalibrated — review geometry and
                        quantities.
                        <Button
                          type="button"
                          disabled={!canEdit || !data.plan_reference?.calibration_id}
                          onClick={() => {
                            const next = structuredClone(data)
                            for (const item of [
                              ...next.targets,
                              ...Object.values(next.scenarios).flatMap((s) => s.items),
                            ])
                              if (item.id === row.id)
                                item.reference_calibration = next.plan_reference?.calibration_id
                            change(next)
                          }}
                        >
                          Confirm {row.name} reviewed against current plan
                        </Button>
                      </div>
                    ))}
                  <div className="grid gap-5 py-4 lg:grid-cols-2">
                    <div>
                      <div className="field">
                        <label htmlFor="geometry-name">Geometry name</label>
                        <input
                          id="geometry-name"
                          maxLength={160}
                          value={name}
                          onChange={(event) => {
                            setName(event.target.value)
                            markFormChanged()
                          }}
                        />
                      </div>
                      {!['boundary', 'target'].includes(kind) && (
                        <div className="field">
                          <label htmlFor="object-category">Object category</label>
                          <input
                            id="object-category"
                            maxLength={80}
                            value={category}
                            onChange={(event) => {
                              setCategory(event.target.value)
                              markFormChanged()
                            }}
                          />
                        </div>
                      )}
                      {kind === 'tree' && (
                        <div className="field">
                          <label htmlFor="tree-crown">Tree crown diameter (m, optional)</label>
                          <input
                            id="tree-crown"
                            type="number"
                            min="0.01"
                            max="100"
                            step="0.01"
                            value={crown}
                            onChange={(event) => {
                              setCrown(event.target.value)
                              markFormChanged()
                            }}
                          />
                          <p>
                            Record the source and uncertainty below. This does not enable tree
                            shade.
                          </p>
                        </div>
                      )}
                      {kind === 'manual' && (
                        <label>
                          Manual quantity basis
                          <select
                            value={manualBasis}
                            onChange={(event) => {
                              const basis = event.target.value as 'count' | 'fixed'
                              setManualBasis(basis)
                              if (basis === 'fixed') {
                                setCount('1')
                                setOverride('')
                              }
                              markFormChanged()
                            }}
                          >
                            <option value="count">Count</option>
                            <option value="fixed">Fixed-price scope (one item)</option>
                          </select>
                        </label>
                      )}
                      {kind !== 'manual' && (
                        <div className="field">
                          <label htmlFor="geometry-coordinates">
                            Longitude, latitude coordinates — one pair per line
                          </label>
                          <textarea
                            id="geometry-coordinates"
                            rows={7}
                            value={coordinates}
                            onChange={(event) => {
                              setCoordinates(event.target.value)
                              markFormChanged()
                            }}
                          />
                          <small>
                            {geometryType === 'Polygon'
                              ? 'Repeat the first pair at the end to close the polygon. No holes; up to 128 vertices.'
                              : geometryType === 'Point'
                                ? 'Enter one pair only.'
                                : 'Enter at least two pairs.'}{' '}
                            Saving verifies the 5 km site limit and boundary containment.
                          </small>
                        </div>
                      )}
                      {(kind === 'building' || kind === 'canopy') && (
                        <>
                          <div className="field">
                            <label htmlFor="geometry-height">Height above ground (m)</label>
                            {kind === 'building' && (
                              <small>
                                Leave blank if unknown. Unknown buildings remain 2D and block shade
                                comparison.
                              </small>
                            )}
                            <input
                              id="geometry-height"
                              type="number"
                              min="0.01"
                              max="100"
                              step="0.01"
                              value={height}
                              onChange={(event) => {
                                setHeight(event.target.value)
                                markFormChanged()
                              }}
                            />
                          </div>
                          <div className="field">
                            <label htmlFor="height-source">Height source and uncertainty</label>
                            <input
                              id="height-source"
                              maxLength={2000}
                              value={heightSource}
                              onChange={(event) => {
                                setHeightSource(event.target.value)
                                markFormChanged()
                              }}
                            />
                          </div>
                        </>
                      )}
                      {['tree', 'bench', 'manual'].includes(kind) && (
                        <div className="field">
                          <label htmlFor="geometry-count">Count (items)</label>
                          <input
                            id="geometry-count"
                            disabled={kind === 'manual' && manualBasis === 'fixed'}
                            type="number"
                            min="0"
                            step="1"
                            value={count}
                            onChange={(event) => {
                              setCount(event.target.value)
                              markFormChanged()
                            }}
                          />
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="field">
                        <label htmlFor="geometry-provenance">Provenance</label>
                        <select
                          id="geometry-provenance"
                          value={provenance}
                          onChange={(event) => {
                            setProvenance(event.target.value as WorkItem['provenance'])
                            markFormChanged()
                          }}
                        >
                          {[
                            'measured',
                            'sourced',
                            'estimated',
                            'manually_entered',
                            'imported',
                            'calculated',
                          ].map((entry) => (
                            <option key={entry}>{entry}</option>
                          ))}
                        </select>
                      </div>
                      <div className="field">
                        <label htmlFor="geometry-source">Source note and uncertainty</label>
                        <textarea
                          id="geometry-source"
                          maxLength={2000}
                          rows={4}
                          value={source}
                          onChange={(event) => {
                            setSource(event.target.value)
                            markFormChanged()
                          }}
                        />
                      </div>
                      {!['boundary', 'target'].includes(kind) && (
                        <div className="field">
                          <label htmlFor="quantity-override">
                            Verified quantity override (optional)
                          </label>
                          <input
                            id="quantity-override"
                            disabled={kind === 'manual' && manualBasis === 'fixed'}
                            type="number"
                            min={['tree', 'bench', 'manual'].includes(kind) ? '0' : '0.0001'}
                            step="0.0001"
                            value={override}
                            onChange={(event) => {
                              setOverride(event.target.value)
                              markFormChanged()
                            }}
                          />
                          <small>
                            m² for areas/roofs/buildings; m for paths; items for counts. The
                            calculated quantity is retained.
                          </small>
                        </div>
                      )}
                      <Button type="button" onClick={apply}>
                        {editingId
                          ? 'Apply item changes'
                          : kind === 'boundary'
                            ? 'Apply boundary'
                            : 'Add to draft'}
                      </Button>
                    </div>
                  </div>
                </StudioSection>
              </fieldset>
              <StudioSection tool="layout" advanced>
                <h3>Shared target zones</h3>
                <ul>
                  {data.targets.map((target) => (
                    <li key={target.id} className="flex flex-wrap items-center gap-3 py-2">
                      <span>
                        {target.name} ·{' '}
                        {dirty
                          ? 'Recalculation pending'
                          : target.area_m2
                            ? displayQuantity(target.area_m2, 'm2', displayUnits)
                            : 'Quantity unavailable in Demo'}
                      </span>
                      <Button variant="outline" disabled={busy} onClick={() => editTarget(target)}>
                        Edit target
                      </Button>
                      <Button
                        variant="outline"
                        disabled={!canEdit || busy || project.archived}
                        onClick={() =>
                          change({
                            ...data,
                            targets: data.targets.filter((entry) => entry.id !== target.id),
                          })
                        }
                      >
                        Remove target
                      </Button>
                    </li>
                  ))}
                </ul>
                <h3>{data.scenarios[scenario].name} work items</h3>
                <label>
                  Search work items
                  <input value={itemSearch} onChange={(e) => setItemSearch(e.target.value)} />
                </label>
                <fieldset>
                  <legend>Named category layers (view only)</legend>
                  {[...new Set(data.scenarios[scenario].items.map((i) => i.category))].map(
                    (category) => (
                      <label key={category}>
                        <input
                          type="checkbox"
                          checked={objectCategoryLayers[category] !== false}
                          onChange={(e) =>
                            setObjectCategoryLayers({
                              ...objectCategoryLayers,
                              [category]: e.target.checked,
                            })
                          }
                        />
                        Show category {category}
                      </label>
                    ),
                  )}
                  <p>
                    Assign a category in item properties to organise a named layer. Hidden
                    categories remain in quantities.
                  </p>
                </fieldset>
                <p className="text-sm">
                  Visibility affects the editor map only. Hidden items remain in quantities,
                  pricing, comparisons and shade calculations. Tree crowns are descriptive metadata;
                  tree shade is excluded.
                </p>
                {data.scenarios[scenario].items.length === 0 ? (
                  <p>No work items in this scenario yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    {(() => {
                      // K05: anything not recorded as field-measured stays on the verification list.
                      const unverified = data.scenarios[scenario].items.filter(
                        (item) => item.provenance !== 'measured',
                      )
                      return unverified.length ? (
                        <details className="verify-list">
                          <summary>
                            {unverified.length} of {data.scenarios[scenario].items.length} quantities
                            are not field-measured — verify on site before ordering
                          </summary>
                          <ul>
                            {unverified.map((item) => (
                              <li key={item.id}>
                                {item.name}: {item.provenance.replaceAll('_', ' ')} — {item.source_note}
                              </li>
                            ))}
                          </ul>
                          <p className="text-sm">
                            A calculated quantity is not a survey. Record a measured override with
                            its source when the site is checked.
                          </p>
                        </details>
                      ) : (
                        <p className="text-sm">All quantities in this scenario are recorded as measured.</p>
                      )
                    })()}
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr>
                          <th>Item</th>
                          <th>Active quantity</th>
                          <th>Source</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.scenarios[scenario].items
                          .filter((item) =>
                            `${item.name} ${item.kind} ${item.category}`
                              .toLowerCase()
                              .includes(itemSearch.toLowerCase()),
                          )
                          .map((item) => (
                            <tr key={item.id}>
                              <td className="p-2">
                                {item.name}
                                <br />
                                {item.kind} · {item.status}
                                {item.manual_basis === 'fixed' && ' / Fixed-price scope (one item)'}
                                <br />
                                {item.category}
                                {item.plant && (
                                  <span>
                                    {' '}
                                    / {item.plant.code}: {item.plant.common_name} (
                                    {item.plant.scientific_name}) / nursery{' '}
                                    {item.plant.nursery_size}
                                  </span>
                                )}
                                {item.crown_diameter_m
                                  ? ` / Crown diameter ${item.crown_diameter_m} m`
                                  : ''}
                              </td>
                              <td className="p-2">
                                {dirty
                                  ? 'Stale / draft'
                                  : item.quantity
                                    ? `${displayQuantity(item.quantity.value, item.quantity.calculated.unit, displayUnits)}${item.quantity.is_override ? ' (override)' : ''}`
                                    : 'Unavailable in Demo'}
                                {!dirty && item.quantity && (
                                  <span className="quantity-method">
                                    {item.quantity.calculated.method.replaceAll('_', ' ')}
                                    {item.quantity.calculated.metric_crs
                                      ? ` · ${item.quantity.calculated.metric_crs}`
                                      : ''}
                                    {item.quantity.is_override
                                      ? ` · calculated ${displayQuantity(item.quantity.calculated.value, item.quantity.calculated.unit, displayUnits)}`
                                      : ''}
                                  </span>
                                )}
                                {item.provenance !== 'measured' && (
                                  <span className="verify-badge">Verify on site</span>
                                )}
                              </td>
                              <td className="p-2">
                                {item.provenance}: {item.source_note}
                              </td>
                              <td className="flex flex-wrap gap-2 p-2">
                                <Button
                                  variant="outline"
                                  disabled={!canEdit || busy || project.archived}
                                  onClick={() => {
                                    const next = structuredClone(data)
                                    const owner = data.scenarios.baseline.items.some(
                                      (value) => value.id === item.id,
                                    )
                                      ? 'baseline'
                                      : scenario
                                    next.scenarios[owner].items = next.scenarios[owner].items.map(
                                      (value) =>
                                        value.id === item.id
                                          ? { ...value, visible: !value.visible }
                                          : value,
                                    )
                                    change(next)
                                  }}
                                >
                                  {item.visible ? 'Hide' : 'Show'} {item.name}
                                </Button>
                                <Button
                                  variant="outline"
                                  disabled={busy}
                                  onClick={() => edit(item)}
                                >
                                  Edit {item.name}
                                </Button>
                                <Button
                                  variant="outline"
                                  disabled={
                                    !canEdit ||
                                    busy ||
                                    project.archived ||
                                    item.editor_locked ||
                                    item.kind === 'object'
                                  }
                                  onClick={() => {
                                    const next = structuredClone(data),
                                      copy = structuredClone(item)
                                    copy.id = crypto.randomUUID()
                                    copy.name += ' copy'
                                    copy.status = scenario === 'baseline' ? 'existing' : 'proposed'
                                    next.scenarios[scenario].items.push(copy)
                                    change(next)
                                  }}
                                >
                                  Duplicate {item.name}
                                </Button>
                                <Button
                                  variant="outline"
                                  disabled={
                                    !canEdit ||
                                    busy ||
                                    Boolean(item.editor_locked) ||
                                    Boolean(item.object_instance?.locked) ||
                                    project.archived ||
                                    (scenario !== 'baseline' &&
                                      data.scenarios.baseline.items.some(
                                        (value) => value.id === item.id,
                                      ))
                                  }
                                  onClick={() => {
                                    const next = structuredClone(data)
                                    next.scenarios[scenario].items = next.scenarios[
                                      scenario
                                    ].items.filter((entry) => entry.id !== item.id)
                                    change(next)
                                  }}
                                >
                                  Remove {item.name}
                                </Button>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </StudioSection>
              <div className="studio-technical-note flex flex-wrap gap-3 border-t border-stone-200 pt-4">
                <Button
                  variant="outline"
                  disabled={!canEdit || busy || scheduleDirty || layoutDraftDirty || project.archived || !undo.length}
                  onClick={() => {
                    if (
                      pendingForm &&
                      !window.confirm(
                        'Discard unapplied form changes and undo the last workspace edit?',
                      )
                    )
                      return
                    if (data) setRedo((previous) => [...previous, structuredClone(data)])
                    setData(undo[undo.length - 1])
                    setUndo((previous) => previous.slice(0, -1))
                    setPendingForm(false)
                    setEditingId(null)
                    setShadow(null)
                    markChanged()
                  }}
                >
                  Undo workspace edit
                </Button>
                <Button
                  variant="outline"
                  disabled={!canEdit || busy || scheduleDirty || layoutDraftDirty || project.archived || !redo.length}
                  onClick={() => {
                    if (
                      pendingForm &&
                      !window.confirm('Discard unapplied form changes and redo the workspace edit?')
                    )
                      return
                    if (data) setUndo((previous) => [...previous, structuredClone(data)])
                    setData(redo[redo.length - 1])
                    setRedo((previous) => previous.slice(0, -1))
                    setPendingForm(false)
                    setEditingId(null)
                    setShadow(null)
                    markChanged()
                  }}
                >
                  Redo workspace edit
                </Button>
                <Button
                  disabled={
                    !canEdit ||
                    busy ||
                    !dirty ||
                    pendingForm ||
                    scheduleDirty ||
                    layoutDraftDirty ||
                    constraintDirty ||
                    project.archived
                  }
                  onClick={() => void save()}
                >
                  {busy
                    ? 'Saving workspace…'
                    : demo
                      ? 'Save Demo geometry draft'
                      : 'Validate & save workspace'}
                </Button>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    if ((!dirty && !layoutDraftDirty) || window.confirm('Discard unsaved workspace changes and reload?')) {
                      if (recoveryKey) sessionStorage.removeItem(recoveryKey)
                      window.location.reload()
                    }
                  }}
                >
                  Reload saved workspace
                </Button>
              </div>
              <p className="text-sm">
                {pendingForm && (
                  <strong>Apply the current form to the draft before saving. </strong>
                )}
                Trees are count items; tree shade is excluded. Building and roof heights require a
                source. Geometry edits make dependent analyses and estimates stale.
              </p>
            </div>
            {!demo && (
              <StudioSection tool="pricing">
                <PricingBoard
                  project={project}
                  token={token}
                  data={data}
                  revision={saved.revision}
                  dirty={dirty || constraintDirty}
                  scenario={scenario}
                  onScenarioChange={(option) => {
                    if (layoutDraftDirty || busy) return
                    setScenario(option)
                    setShadow(null)
                    setEditingId(null)
                  }}
                  onData={(next) => {
                    change(next)
                    setPricingVersion((value) => value + 1)
                  }}
                  onLocate={locate}
                  onEstimate={() => {
                    openStudiesStep('estimate')
                    studioController.current?.reveal('analysis')
                  }}
                  onMaterials={(id) => {
                    setRoadMaterialId(id)
                    studioController.current?.reveal('materials')
                  }}
                  canUndo={undo.length > 0 && !layoutDraftDirty && !busy}
                  onUndo={undoLast}
                  disabledReason={
                    busy
                      ? 'Updating the workspace. Pricing will unlock when it finishes.'
                      : pendingForm || objectDirty || scheduleDirty || layoutDraftDirty || terrainFormDirty
                        ? 'Apply or cancel the open edit in another tool before changing prices.'
                        : undefined
                  }
                />
              </StudioSection>
            )}
            {!demo && (
              <StudioSection tool={['analysis', 'rates', 'shade']}>
                <CalculationsPanel
                  onOpenTool={(tool) => studioController.current?.reveal(tool, tool === 'layout')}
                  onStatus={setStudies}
                  onProjectSaved={onProjectSaved}
                  onSaveDesign={() => void save()}
                  project={project}
                  token={token}
                  data={data}
                  revision={saved.revision}
                  dirty={dirty || constraintDirty}
                  scenario={scenario}
                  onScenarioChange={(option) => {
                    setScenario(option)
                    setShadow(null)
                  }}
                  onInspect={(option, itemId) => {
                    const item = data.scenarios[option].items.find((value) => value.id === itemId)
                    if (item && edit(item) !== false) {
                      setScenario(
                        data.scenarios.baseline.items.some((value) => value.id === item.id)
                          ? 'baseline'
                          : option,
                      )
                      setShadow(null)
                      document
                        .querySelector('[aria-label="Geometry drawing canvas"]')
                        ?.scrollIntoView({ block: 'center' })
                    }
                  }}
                  onReviewDirty={setReviewDirty}
                  recoveryKey={recoveryKey ?? undefined}
                  onData={change}
                  onShowShadows={(features, revision) => setShadow({ features, revision })}
                />
              </StudioSection>
            )}
            {!demo && (
              <StudioSection tool="analysis">
              <WorkspaceHistory
                endpoint={endpoint}
                token={token}
                revision={saved.revision}
                blocked={
                  !canEdit ||
                  busy ||
                  dirty ||
                  layoutDraftDirty ||
                  reviewDirty ||
                  evidenceDirty ||
                  constraintDirty ||
                  project.archived
                }
                onRestore={(result) => {
                  setSaved(result)
                  setData(result.data)
                  setUndo([])
                  setRedo([])
                  setDirty(false)
                  setPendingForm(false)
                  setEditingId(null)
                  setShadow(null)
                  setNotice(
                    `Workspace revision ${result.revision} restored. Recalculate and review before issuing.`,
                  )
                }}
              />
              </StudioSection>
            )}
            {!demo && (
              <StudioSection tool="sources">
                <SiteConstraints
                  data={data}
                  project={project}
                  token={token}
                  revision={saved.revision}
                  disabled={!canEdit || busy || project.archived}
                  onChange={change}
                  onDirty={setConstraintDirty}
                  onWorking={setBusy}
                />
              </StudioSection>
            )}
            {!demo && (
              <StudioSection tool="sources">
                <EvidencePanel
                  project={project}
                  token={token}
                  targets={data.targets}
                  onDirty={setEvidenceDirty}
                />
              </StudioSection>
            )}
          </>
        )}
      </section>
    </StudioShell>
  )
}
