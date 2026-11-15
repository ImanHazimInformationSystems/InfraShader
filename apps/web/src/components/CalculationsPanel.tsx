import ShadeStudies from './ShadeStudies'
import type { Feature } from 'geojson'
import { useCallback, useContext, useEffect, useRef, useState, type FormEvent } from 'react'
import { StudioContext } from './studio-context'
import type { Tool } from './StudioShell'
import type { Project } from '../domain/projects'
import type { ScenarioKey, WorkspaceData } from '../domain/workspace'
import {
  artifactListSchema,
  artifactSchema,
  rateListSchema,
  rateSchema,
  SOURCE_TYPE_LABEL,
  snapshotSchema,
  type Snapshot,
  type Artifact,
  type Rate,
  maintenanceTaskSchema,
  type MaintenanceTask,
} from '../domain/calculations'
import MaintenanceChecklist from './MaintenanceChecklist'
import IssueChecklist from './IssueChecklist'
import BriefCheckpointPanel from './BriefCheckpointPanel'
import ProjectAccess from './ProjectAccess'
import {
  issueReadinessSchema,
  issueError,
  issueButtonDisabled,
  type IssueBlocker,
} from '../domain/issue-readiness'
import { api, ApiError } from '../services/api'
import { projectInputSchema } from '../domain/projects'
import { request } from '../services/api'
import { Button } from './ui/button'
import ReviewPanel from './ReviewPanel'
import { settingsSchema } from '../domain/settings'
import CatalogueBrowser from './CatalogueBrowser'
import OutputPreview from './OutputPreview'
import IssuedOutputFile from './IssuedOutputFile'
import PricingIssueReadiness from './PricingIssueReadiness'
import { displayQuantity, useDisplayUnits } from '../services/display-units'
import { z } from 'zod'
import EstimateComparison from './EstimateComparison'
import FormRecovery from './FormRecovery'
import SubmitToOwner from './SubmitToOwner'
import { StudiesOverview, StudiesStepBar } from './StudiesGuide'
import { openPricing } from '../domain/pricing'
import {
  attentionList,
  compareOptions,
  REVIEW_STEPS,
  STUDIES_STEP_EVENT,
  STUDY_STEPS,
  studiesStatus,
  takePendingStudiesStep,
  type Attention,
  type StudiesStatus,
  type StudyStep,
} from '../domain/studies-guide'

const chargeCategories = [
  'labour',
  'equipment',
  'transport',
  'overhead',
  'contingency',
  'fixed',
] as const
type ChargeDraft = {
  category: (typeof chargeCategories)[number]
  amount: string
  source_note: string
}

type Props = {
  recoveryKey?: string
  project: Project
  token: string | undefined
  data: WorkspaceData
  revision: number
  dirty: boolean
  scenario: ScenarioKey
  onScenarioChange: (scenario: ScenarioKey) => void
  onInspect: (scenario: ScenarioKey, itemId: string) => void
  onReviewDirty: (dirty: boolean) => void
  onData: (data: WorkspaceData) => void
  onShowShadows: (features: Feature[], revision: number) => void
  /** Design Studio: open another tool (for example Materials) from the Review list. */
  onOpenTool?: (tool: Tool) => void
  /** Design Studio: report progress so the step bar can show the proposal state. */
  onStatus?: (status: StudiesStatus) => void
  onProjectSaved?: (project: Project) => void
  onSaveDesign?: () => void
}
export default function CalculationsPanel({
  recoveryKey,
  project,
  token,
  data,
  revision,
  dirty,
  scenario,
  onScenarioChange,
  onData,
  onShowShadows,
  onReviewDirty,
  onInspect,
  onOpenTool,
  onStatus,
  onProjectSaved,
  onSaveDesign,
}: Props) {
  const studio = useContext(StudioContext)
  const can = (cap: string) =>
    Boolean(
      (cap === 'change_catalogue'
        ? project.organisation_capabilities
        : project.capabilities
      )?.includes(cap),
    )
  const [error, setError] = useState('')
  const [studyChanged, setStudyChanged] = useState(false)
  const [reviewChanged, setReviewChanged] = useState(false)
  const [outputChanged, setOutputChanged] = useState(false)
  const [rateChanged, setRateChanged] = useState(false)
  const [rateDraft, setRateDraft] = useState<Record<string, string | string[]>>({})
  function captureRate(form: HTMLFormElement) {
    const values = new FormData(form)
    setRateDraft({
      ...Object.fromEntries([...values].map(([key, value]) => [key, String(value)])),
      includes: values.getAll('includes').map(String),
    })
    setRateChanged(true)
  }
  useEffect(
    () => onReviewDirty(reviewChanged || outputChanged || rateChanged || studyChanged),
    [reviewChanged, outputChanged, rateChanged, studyChanged, onReviewDirty],
  )
  const displayUnits = useDisplayUnits()
  const [preview, setPreview] = useState<Snapshot | null>(null)
  const [rates, setRates] = useState<Rate[]>([])
  const [catalogueRevision, setCatalogueRevision] = useState(0)
  const rateForm = useRef<HTMLFormElement>(null)
  const mergeRates = useCallback((incoming: Rate[]) => {
    setRates((previous) => [
      ...new Map([...previous, ...incoming].map((rate) => [rate.id, rate])).values(),
    ])
  }, [])
  useEffect(() => {
    let active = true
    const ids = [
      ...new Set(
        Object.values(data.scenarios).flatMap((value) =>
          value.items.flatMap((item) => (item.rate_id ? [item.rate_id] : [])),
        ),
      ),
    ]
    Promise.all(
      ids.map((id) =>
        request(`/api/v1/organisations/${project.organisation_id}/rates/${id}`, rateSchema, token),
      ),
    )
      .then((result) => {
        if (active) mergeRates(result)
      })
      .catch((reason) => {
        if (active)
          setError(reason instanceof Error ? reason.message : 'Assigned rate unavailable.')
      })
    return () => {
      active = false
    }
  }, [data, project.organisation_id, token, mergeRates])
  function reviseRate(rate: Rate) {
    const form = rateForm.current
    if (!form) return
    for (const key of [
      'code',
      'category',
      'description',
      'unit',
      'amount',
      'effective_date',
      'valid_until',
      'source_note',
      'source_type',
      'supplier_name',
      'quote_reference',
      'exclusions',
    ] as const) {
      const input = form.elements.namedItem(key) as HTMLInputElement | HTMLSelectElement
      input.value = String(rate[key] ?? '')
    }
    form.querySelectorAll<HTMLInputElement>('input[name="includes"]').forEach((input) => {
      input.checked = rate.includes.includes(input.value)
    })
    const details = form.closest('details')
    if (details) details.open = true
    form.scrollIntoView({ block: 'center' })
    ;(form.elements.namedItem('amount') as HTMLInputElement).focus()
    captureRate(form)
  }
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const [busy, setBusy] = useState(false)
  const [timestamp, setTimestamp] = useState(new Date().toISOString())
  const [timeMode, setTimeMode] = useState('offset')
  const [localTime, setLocalTime] = useState('')
  const [target, setTarget] = useState('')
  const [method, setMethod] = useState('markup')
  const [percent, setPercent] = useState('0')
  const percentEdited = useRef(false)
  useEffect(() => {
    let active = true
    request(`/api/v1/organisations/${project.organisation_id}/settings`, settingsSchema, token)
      .then((value) => {
        if (active && !percentEdited.current) setPercent(value.settings.default_markup)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [project.organisation_id, token])
  const [wastage, setWastage] = useState('0')
  const [fixedPrice, setFixedPrice] = useState('')
  const [charges, setCharges] = useState<ChargeDraft[]>([])
  const [estimateId, setEstimateId] = useState('')
  const [criteria, setCriteria] = useState('')
  const [notes, setNotes] = useState('')
  const [assumptions, setAssumptions] = useState('')
  const [exclusions, setExclusions] = useState('')
  const [narrative, setNarrative] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [programme, setProgramme] = useState('')
  const [maintenance, setMaintenance] = useState('')
  const [maintenanceTasks, setMaintenanceTasks] = useState<MaintenanceTask[]>([])
  const [changeSummary, setChangeSummary] = useState('')
  const [overrideReason, setOverrideReason] = useState('')
  const [evidenceChoices, setEvidenceChoices] = useState<{ id: string; description: string }[]>([])
  const [evidenceIds, setEvidenceIds] = useState<string[]>([])
  const [includePhotos, setIncludePhotos] = useState(false)
  const pendingIssue = useRef<{ fingerprint: string; key: string } | null>(null)
  // Issue feedback shown beside the Issue button (the panel-level error is far above it).
  const [issueStatus, setIssueStatus] = useState<{
    tone: 'working' | 'done' | 'error'
    text: string
    blocker?: IssueBlocker
  } | null>(null)
  const issueStatusRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (issueStatus && issueStatus.tone !== 'working') issueStatusRef.current?.focus()
  }, [issueStatus])
  const orgEndpoint = `/api/v1/organisations/${project.organisation_id}`
  const endpoint = `${orgEndpoint}/projects/${project.id}`
  const developer = project.purpose === 'developer_decision'
  const load = useCallback(async () => {
    const [catalogue, records] = await Promise.all([
      request(`${orgEndpoint}/rates`, rateListSchema, token),
      request(`${endpoint}/artifacts`, artifactListSchema, token),
    ])
    mergeRates(catalogue.items)
    setArtifacts(records.items)
  }, [orgEndpoint, endpoint, token, mergeRates])
  useEffect(() => {
    let active = true
    Promise.all([
      request(`${orgEndpoint}/rates`, rateListSchema, token),
      request(`${endpoint}/artifacts`, artifactListSchema, token),
    ])
      .then(([catalogue, records]) => {
        if (active) {
          mergeRates(catalogue.items)
          setArtifacts(records.items)
        }
      })
      .catch((reason) => {
        if (active)
          setError(reason instanceof Error ? reason.message : 'Could not load calculations.')
      })
    return () => {
      active = false
    }
  }, [orgEndpoint, endpoint, token, revision, project.revision, mergeRates])
  async function perform(action: () => Promise<unknown>) {
    setBusy(true)
    setError('')
    try {
      await action()
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Action failed. Review and retry.')
    } finally {
      setBusy(false)
    }
  }
  async function createRate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const values = new FormData(form)
    await perform(async () => {
      const created = await request(`${orgEndpoint}/rates`, rateSchema, token, {
        method: 'POST',
        body: JSON.stringify({
          code: values.get('code'),
          category: values.get('category'),
          description: values.get('description'),
          unit: values.get('unit'),
          currency: 'MYR',
          basis: developer ? 'indicative_budget' : 'cost',
          amount: values.get('amount'),
          effective_date: values.get('effective_date'),
          valid_until: values.get('valid_until') || null,
          source_note: values.get('source_note'),
          includes: values.getAll('includes'),
          source_type: values.get('source_type') ?? 'user_entered',
          supplier_name: String(values.get('supplier_name') ?? '').trim(),
          quote_reference: String(values.get('quote_reference') ?? '').trim(),
          exclusions: String(values.get('exclusions') ?? '').trim(),
        }),
      })
      mergeRates([created])
      setCatalogueRevision((value) => value + 1)
      form.reset()
      setRateChanged(false)
      if (recoveryKey) sessionStorage.removeItem(`${recoveryKey}:rate`)
    })
  }
  function calculate(kind: 'analyses' | 'estimates') {
    const body =
      kind === 'analyses'
        ? {
            expected_revision: revision,
            request_key: crypto.randomUUID(),
            ...(timeMode === 'local' ? { local_timestamp: localTime } : { timestamp }),
            target_id: target || data.targets[0]?.id,
          }
        : {
            expected_revision: revision,
            request_key: crypto.randomUUID(),
            scenario,
            method: developer ? 'indicative' : method,
            percent: developer || method === 'fixed_selling' ? '0' : percent,
            wastage_percent: wastage,
            fixed_selling: !developer && method === 'fixed_selling' ? fixedPrice : null,
            charges,
          }
    void perform(async () => {
      const result = await request(`${endpoint}/${kind}`, artifactSchema, token, {
        method: 'POST',
        body: JSON.stringify(body),
      })
      if (kind === 'estimates') setEstimateId(result.id)
      refreshReadiness((v) => v + 1)
    })
  }
  function issue(draft = false) {
    if (scenario === 'baseline') {
      setError('Select Option A or B before issuing.')
      if (!draft)
        setIssueStatus({ tone: 'error', text: 'Choose Option A or B on the map before issuing.' })
      return
    }
    if (
      !draft &&
      (issueDisabled ||
        !window.confirm(
          `Issue an immutable ${developer ? 'developer decision brief' : 'contractor client proposal'} from the saved inputs?`,
        ))
    )
      return
    const body = {
      valid_until: validUntil || null,
      programme,
      maintenance,
      ...(developer ? {} : { maintenance_plan: maintenanceTasks }),
      change_summary: changeSummary,
      pricing_override_reason: overrideReason,
      estimate_id: estimateId,
      expected_project_revision: project.revision,
      preferred_option: scenario,
      criteria: criteria
        .split('\n')
        .map((text) => text.trim())
        .filter(Boolean),
      review_notes: notes,
      customer_narrative: narrative,
      evidence_ids: evidenceIds,
      include_evidence_images: includePhotos,
      assumptions,
      exclusions,
      confirmed: true,
    }
    const fingerprint = JSON.stringify(body)
    if (draft) {
      void perform(async () => {
        const snapshot = await request(
          `${endpoint}/output-preview?kind=${developer ? 'developer_brief' : 'proposal'}`,
          snapshotSchema,
          token,
          {
            method: 'POST',
            body: JSON.stringify({ ...body, request_key: crypto.randomUUID() }),
          },
        )
        setPreview(snapshot)
      })
      return
    }
    if (!pendingIssue.current || pendingIssue.current.fingerprint !== fingerprint)
      pendingIssue.current = { fingerprint, key: crypto.randomUUID() }
    const requestKey = pendingIssue.current.key
    const label = developer ? 'decision brief' : 'proposal'
    setIssueStatus({
      tone: 'working',
      text: `Issuing the ${label}: saving a locked version and its PDF…`,
    })
    void perform(async () => {
      try {
        const issued = await request(
          `${endpoint}/${developer ? 'developer-briefs' : 'proposals'}`,
          artifactSchema,
          token,
          { method: 'POST', body: JSON.stringify({ ...body, request_key: requestKey }) },
        )
        if (issued.kind === 'proposal' || issued.kind === 'developer_brief') {
          const { retainIssuedPdf } = await import('../services/retained-output')
          try {
            await retainIssuedPdf(endpoint, token, issued)
          } catch (reason) {
            await load()
            throw new Error(
              'Snapshot saved, but PDF retention is pending. Retry in Issued outputs.',
              { cause: reason },
            )
          }
        }
        pendingIssue.current = null
        setOutputChanged(false)
        if (recoveryKey) sessionStorage.removeItem(`${recoveryKey}:output`)
        const version =
          issued.kind === 'proposal' || issued.kind === 'developer_brief'
            ? issued.payload.version
            : null
        setIssueStatus({
          tone: 'done',
          text: `${developer ? 'Decision brief' : 'Proposal'}${version ? ` version ${version}` : ''} issued and its PDF saved. It is locked: later changes need a new version.`,
        })
      } catch (reason) {
        let failure = issueError(reason instanceof ApiError ? reason.code : 'request_failed')
        // A legacy error such as issue_not_ready covers several rules. Re-read the shared
        // checklist to show the precise current message and fix, rather than guessing.
        if (reason instanceof ApiError) {
          try {
            const latest = await request(
              `${endpoint}/issue-readiness?kind=${developer ? 'developer_brief' : 'proposal'}`,
              issueReadinessSchema,
              token,
              { method: 'POST', body: JSON.stringify({ ...body, request_key: requestKey }) },
            )
            failure =
              latest.issues.find((i) => i.code === reason.code) ?? latest.issues[0] ?? failure
          } catch {
            /* Keep the safe, mapped retry instruction if readiness is unavailable. */
          }
        }
        refreshReadiness((v) => v + 1)
        setIssueStatus({
          tone: 'error',
          text:
            reason instanceof Error && reason.message.startsWith('Snapshot saved')
              ? `Issued, but the PDF is not stored yet. ${reason.message}`
              : `Not issued. ${failure.message}`,
          blocker:
            reason instanceof Error && reason.message.startsWith('Snapshot saved')
              ? undefined
              : failure,
        })
        // Never expose raw server errors in the panel-level alert.
      }
    })
  }
  const blocked = busy || dirty || !revision || project.archived
  // A draft preview needs a saved design and any saved total for this option; issuing needs a
  // complete, current total and every field. The server rechecks both.
  const previewMissing = [
    ...(scenario === 'baseline' ? ['Choose Option A or B.'] : []),
    ...(dirty ? ['Save the design.'] : []),
    ...(project.archived ? ['Restore the archived project.'] : []),
    ...(!estimateId ? ['Calculate a total in the Total step, then select it above.'] : []),
  ]
  const [readiness, setReadiness] = useState<{ key: string; issues: IssueBlocker[] } | null>(null)
  const [readinessTick, refreshReadiness] = useState(0)
  const [briefFix, setBriefFix] = useState(false)
  const [briefDraft, setBriefDraft] = useState(projectInputSchema.parse(project))
  const [briefField, setBriefField] = useState('problem')
  const [agreementOpen, setAgreementOpen] = useState(false)
  const [accessOpen, setAccessOpen] = useState(false)
  const accessDialog = useRef<HTMLDialogElement>(null)
  const briefDialog = useRef<HTMLDialogElement>(null)
  const agreementDialog = useRef<HTMLDialogElement>(null)
  const briefLabels = {
    problem: 'Problem to solve',
    intended_users: 'Who will use the site',
    desired_outcome: 'Intended outcome',
    use_periods: 'When the site will be used',
  } as const
  useEffect(() => {
    if (briefFix) {
      briefDialog.current?.showModal()
      document.getElementById(`brief-fix-${briefField}`)?.focus()
    } else briefDialog.current?.close()
  }, [briefFix, briefField])
  useEffect(() => {
    if (agreementOpen) agreementDialog.current?.showModal()
    else agreementDialog.current?.close()
  }, [agreementOpen])
  useEffect(() => {
    if (accessOpen) accessDialog.current?.showModal()
    else accessDialog.current?.close()
  }, [accessOpen])
  const readinessBody = JSON.stringify({
    request_key: '00000000-0000-4000-8000-000000000001',
    estimate_id: estimateId || null,
    expected_project_revision: project.revision,
    preferred_option: scenario,
    criteria: criteria
      .split('\n')
      .map((t) => t.trim())
      .filter(Boolean),
    review_notes: notes,
    assumptions,
    exclusions,
    customer_narrative: narrative,
    programme,
    maintenance,
    maintenance_plan: developer ? [] : maintenanceTasks,
    valid_until: validUntil || null,
    change_summary: changeSummary,
    pricing_override_reason: overrideReason,
    evidence_ids: evidenceIds,
    confirmed: true,
  })
  const readinessKey = `${readinessBody}:${revision}:${readinessTick}:${artifacts.length}`
  useEffect(() => {
    let active = true
    const timer = window.setTimeout(() => {
      request(
        `${endpoint}/issue-readiness?kind=${developer ? 'developer_brief' : 'proposal'}`,
        issueReadinessSchema,
        token,
        { method: 'POST', body: readinessBody },
      )
        .then((result) => {
          if (active) setReadiness({ key: readinessKey, issues: result.issues })
        })
        .catch((reason) => {
          if (active)
            setReadiness({
              key: readinessKey,
              issues: [
                issueError(reason instanceof ApiError ? reason.code : 'readiness_unavailable'),
              ],
            })
        })
    }, 250)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [endpoint, token, developer, readinessBody, readinessKey])
  useEffect(() => {
    const refresh = () => refreshReadiness((v) => v + 1)
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [])
  const readinessPending = readiness?.key !== readinessKey
  const issueMissing: IssueBlocker[] = [
    ...(readiness?.issues ?? []),
    ...(dirty
      ? [
          {
            code: 'unsaved_design',
            message: 'Save the design before issuing.',
            why: 'The proposal uses saved shapes and quantities.',
            group: 'Site' as const,
            severity: 'blocks_issue' as const,
            fix: 'save',
            field: null,
            item_id: null,
          },
        ]
      : []),
  ]
  const issueDisabled = issueButtonDisabled(issueMissing, readinessPending, blocked)
  function fixIssue(entry: IssueBlocker) {
    if (entry.fix === 'target' || entry.fix === 'site') onOpenTool?.('sources')
    else if (entry.fix === 'reference') {
      const owner = (['baseline', 'option_a', 'option_b'] as const).find((key) =>
        data.scenarios[key].items.some((i) => i.id === entry.item_id),
      )
      if (owner && entry.item_id) onInspect(owner, entry.item_id)
      onOpenTool?.('layout')
      window.setTimeout(
        () => document.getElementById(`reference-review-${entry.item_id}`)?.focus(),
        0,
      )
    } else if (entry.fix === 'save') onSaveDesign?.()
    else if (entry.fix === 'pricing') {
      onOpenTool?.('pricing')
      openPricing(entry.item_id ?? undefined)
    } else if (entry.fix === 'option') onScenarioChange('option_a')
    else if (entry.fix === 'estimate') setStep('estimate')
    else if (entry.fix === 'brief' || entry.fix === 'reload') {
      void perform(async () => {
        const fresh = await api.project(project.organisation_id, project.id, token!)
        onProjectSaved?.(fresh)
        setBriefDraft(projectInputSchema.parse(fresh))
        setBriefField(entry.field ?? 'problem')
        setBriefFix(true)
      })
    } else if (entry.fix === 'checkpoint') setAgreementOpen(true)
    else if (entry.fix === 'refresh') refreshReadiness((v) => v + 1)
    else if (entry.fix === 'access' || (entry.fix === 'pricing_review' && !can('internal_pricing')))
      setAccessOpen(true)
    else if (entry.fix === 'project') {
      if (!can('edit_project')) {
        setAccessOpen(true)
        return
      }
      if (window.confirm('Restore this project so you can review and issue it?'))
        void perform(async () => {
          const restored = await api.update(
            project.organisation_id,
            project.id,
            { expected_revision: project.revision, archived: false },
            token!,
          )
          onProjectSaved?.(restored)
          refreshReadiness((v) => v + 1)
        })
    } else {
      setStep('proposal')
      const fields: Record<string, string> = {
        criteria: 'issue-criteria',
        review_notes: 'issue-notes',
        assumptions: 'issue-assumptions',
        exclusions: 'issue-exclusions',
        customer_narrative: 'customer-narrative',
        valid_until: 'issue-validity',
        programme: 'issue-programme',
        maintenance: 'issue-maintenance',
        change_summary: 'issue-changes',
        pricing_override_reason: 'issue-override',
        estimate_id: 'issue-estimate',
        evidence_ids: 'issue-evidence',
      }
      window.setTimeout(() => {
        document.getElementById('issue-form')?.setAttribute('open', '')
        const row = entry.field?.match(/^maintenance_plan\.(\d+)\.(task|frequency)$/)
        const rows = document.querySelectorAll('.maintenance-row')
        const target = row
          ? rows.item(Number(row[1]))?.querySelectorAll('input')[row[2] === 'task' ? 0 : 1]
          : document.getElementById(
              fields[entry.field ?? ''] ??
                (entry.fix === 'pricing_review' ? 'issue-override' : 'issue-criteria'),
            )
        target?.scrollIntoView({ block: 'center' })
        ;(target as HTMLElement | null)?.focus()
      }, 0)
    }
  }
  const [step, setStep] = useState<StudyStep>(() => takePendingStudiesStep() ?? 'overview')
  useEffect(() => {
    // Other tools (for example "Review preliminary estimate") open a specific step.
    const open = (event: Event) => {
      const wanted = (event as CustomEvent<StudyStep>).detail
      if (STUDY_STEPS.includes(wanted)) setStep(wanted)
    }
    window.addEventListener(STUDIES_STEP_EVENT, open)
    return () => window.removeEventListener(STUDIES_STEP_EVENT, open)
  }, [])
  const status = {
    ...studiesStatus(data, scenario, artifacts, dirty, developer),
    issueReadiness: readinessPending
      ? null
      : issueMissing.filter((i) => i.severity === 'blocks_issue').length,
  }
  const statusKey = JSON.stringify(status)
  useEffect(() => {
    onStatus?.(JSON.parse(statusKey) as StudiesStatus)
  }, [statusKey, onStatus])
  const canEstimate = can('estimate') && (developer || can('internal_pricing'))
  // In Design Studio the steps are reached from different places: Saved rates (step 3),
  // Review, Total and Proposal (step 4) and the optional Shade study (More tools).
  const journey = studio.journey && studio.immersive
  const visibleSteps: StudyStep[] = !journey
    ? [...STUDY_STEPS]
    : studio.tool === 'rates'
      ? ['rates']
      : studio.tool === 'shade'
        ? ['shade']
        : REVIEW_STEPS
  const currentStep = visibleSteps.includes(step) ? step : visibleSteps[0]
  const showStep = (name: StudyStep) => currentStep === name
  const attention = developer ? attentionList(data, scenario, status, dirty, developer) : []
  const comparison = compareOptions(data, artifacts, dirty)
  function fix(entry: Attention) {
    if (entry.fix === 'price') {
      onOpenTool?.('pricing')
      openPricing(entry.itemId)
    } else if (entry.fix === 'materials') onOpenTool?.('materials')
    else if (entry.fix === 'site') onOpenTool?.('sources')
    else if (entry.fix === 'terrain') onOpenTool?.('terrain')
    else if (entry.fix === 'estimate' || entry.fix === 'proposal') setStep(entry.fix)
  }
  const orderedSteps = visibleSteps
  const stepIndex = orderedSteps.indexOf(currentStep)
  const previousStep = stepIndex > 0 ? orderedSteps[stepIndex - 1] : null
  const nextStep =
    stepIndex >= 0 && stepIndex < orderedSteps.length - 1 ? orderedSteps[stepIndex + 1] : null
  const renderSaved = (kinds: string[]) =>
    artifacts
      .filter((item) => kinds.includes(item.kind))
      .map((item) => (
        <article key={item.id} className="my-3 rounded-lg border border-stone-300 p-4">
          <strong>
            {item.kind === 'analysis' ? 'Modeled shade' : 'Estimate'} · workspace{' '}
            {item.workspace_revision} ·{' '}
            {item.stale || dirty ? 'STALE — recalculate' : 'Current saved inputs'}
          </strong>
          {item.kind === 'analysis' ? (
            <>
              <p>
                {item.payload.timestamp} · {item.payload.status} · sun elevation{' '}
                {item.payload.solar.elevation_deg.toFixed(2)}°
              </p>
              {Object.entries(item.payload.scenarios).map(([key, result]) => (
                <p key={key}>
                  {result.name}: {result.area_m2.toFixed(2)} / {result.target_area_m2.toFixed(2)} m²
                  · {result.coverage_percent.toFixed(1)}% modeled coverage
                </p>
              ))}
              <Button
                variant="outline"
                disabled={blocked || item.stale || item.payload.status !== 'modeled'}
                onClick={() => {
                  if (item.kind !== 'analysis') return
                  const result = item.payload.scenarios[scenario]
                  if (result)
                    onShowShadows(
                      [
                        {
                          type: 'Feature',
                          geometry: result.shadow_geometry,
                          properties: { kind: 'shadow', name: `${scenario} modeled shade` },
                        },
                      ],
                      item.workspace_revision,
                    )
                }}
              >
                Show {scenario} shade on map
              </Button>
              <p className="text-sm">{item.payload.limitations.join(' ')}</p>
              {item.payload.reason && <p>{item.payload.reason}</p>}
              <details>
                <summary>Analysis sources and engine versions</summary>
                <p>
                  {item.payload.method};{' '}
                  {Object.entries(item.payload.engine_versions ?? {})
                    .map(([name, version]) => `${name} ${version}`)
                    .join(', ') || 'Version information unavailable in this older result.'}
                </p>
                {item.payload.inputs.map((source, index) => (
                  <p key={index}>
                    {source.scenario}: {source.name} / {source.height_m ?? 'Unknown'} m /{' '}
                    {source.provenance}: {source.height_source}; {source.source_note}
                  </p>
                ))}
              </details>
            </>
          ) : item.kind === 'estimate' ? (
            <>
              <p>
                {item.payload.scenario} ·{' '}
                {item.payload.complete
                  ? (item.payload.label ?? 'Checked selling total')
                  : 'INCOMPLETE — priced scope only'}
                : {item.payload.currency} {item.payload.selling_total}
              </p>
              <details>
                <summary>Itemised takeoff for {item.payload.scenario}</summary>
                <div className="overflow-x-auto">
                  <table>
                    <thead>
                      <tr>
                        <th>Scope</th>
                        <th>Quantity</th>
                        <th>Rate version</th>
                        <th>Wastage</th>
                        <th>Line amount</th>
                        <th>Geometry</th>
                      </tr>
                    </thead>
                    <tbody>
                      {item.payload.takeoff.map((line) => (
                        <tr key={line.item_id}>
                          <td>
                            {line.description}
                            <br />
                            {line.quantity_source}
                          </td>
                          <td>{displayQuantity(Number(line.quantity), line.unit, displayUnits)}</td>
                          <td>
                            {line.rate_code} v{line.rate_version}
                            <br />
                            {line.effective_date}
                            <br />
                            {line.unit_price
                              ? `MYR ${line.unit_price}/${line.unit}`
                              : 'Price restricted'}
                          </td>
                          <td>{line.wastage_percent}%</td>
                          <td>
                            {line.line_total
                              ? `MYR ${line.line_total} (${line.price_basis})`
                              : 'Price restricted'}
                          </td>
                          <td>
                            <Button
                              variant="outline"
                              disabled={dirty || item.stale}
                              onClick={() =>
                                onInspect(item.payload.scenario, line.item_id.split(':')[0])
                              }
                            >
                              Inspect {line.description}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p>
                  Backend quantities and prices from this saved estimate. Inspect opens the current
                  source item; edits require saving and recalculation. Existing items and unpriced
                  scope are excluded from priced rows.
                </p>
              </details>
              {item.payload.readiness && (
                <section aria-label="Pricing readiness" className="notice">
                  <h4>Pricing readiness</h4>
                  <p>
                    {item.payload.readiness.priced_count} of {item.payload.readiness.scope_count}{' '}
                    billable lines priced; {item.payload.readiness.unpriced_count} unpriced. Checked{' '}
                    {item.payload.readiness.checked_on}.
                  </p>
                  <p>
                    {item.payload.readiness.ready
                      ? 'No pricing warnings found; commercial review remains required.'
                      : 'Review outstanding pricing warnings before issue.'}
                  </p>
                  <p>{item.payload.readiness.coverage_note}</p>
                  {item.payload.readiness.warnings.map((warning, index) => (
                    <p key={index}>{warning.message}</p>
                  ))}
                </section>
              )}
              {item.payload.explanation && (
                <details>
                  <summary>Saved pricing explanation</summary>
                  <p>
                    {item.payload.explanation.formula}; percentage {item.payload.percent}%.
                  </p>
                  <p>{item.payload.explanation.rounding}</p>
                  <p>{item.payload.explanation.charges}</p>
                  <p>
                    For MYR 1,000 cost: 20% markup gives MYR 1,200; 20% margin gives MYR 1,250.
                    Margin is a share of selling price, not cost.
                  </p>
                </details>
              )}
              {item.payload.cost_base && (
                <p>
                  Internal cost base {item.payload.cost_base} ·{' '}
                  {item.payload.profit === null
                    ? 'Profit unavailable for incomplete scope'
                    : `Internal profit ${item.payload.profit}`}{' '}
                  · {item.payload.profit_basis}
                </p>
              )}
              {item.payload.charges?.map((charge) => (
                <p key={charge.category}>
                  Saved {charge.category} charge: {item.payload.currency} {charge.amount} ?{' '}
                  {charge.source_note}
                </p>
              ))}
              {item.payload.missing_rates.map((missing) => (
                <p key={missing.item_id}>
                  {missing.name}: {missing.reason}
                </p>
              ))}
            </>
          ) : null}
        </article>
      ))
  return (
    <section
      className={journey ? 'studies-journey' : 'mt-8 border-t border-stone-300 pt-6'}
      aria-label="Saved calculations and outputs"
    >
      <dialog ref={accessDialog} className="readiness-dialog" onCancel={() => setAccessOpen(false)}>
        <h2>Project permissions</h2>
        <p>
          An authorised project issuer must complete this action. Pricing exceptions also need
          internal pricing access. Ask your project manager to review your project permissions; this
          checklist does not grant access.
        </p>
        {accessOpen && can('manage_project_access') && (
          <ProjectAccess
            project={project}
            token={token}
            onChanged={() =>
              void perform(async () => {
                const fresh = await api.project(project.organisation_id, project.id, token!)
                onProjectSaved?.(fresh)
                refreshReadiness((v) => v + 1)
              })
            }
          />
        )}
        <Button onClick={() => setAccessOpen(false)}>Return to checklist</Button>
      </dialog>
      <dialog ref={briefDialog} className="readiness-dialog" onCancel={() => setBriefFix(false)}>
        <h2>Edit brief</h2>
        <p>
          Complete the highlighted fields. Saving changes the brief version; recalculate your total
          afterwards.
        </p>
        {Object.entries(briefLabels).map(([key, label]) => (
          <label className="field" key={key}>
            {label}
            {!briefDraft[key as keyof typeof briefLabels] && <span> ? required before issue</span>}
            <textarea
              id={`brief-fix-${key}`}
              maxLength={key === 'intended_users' || key === 'use_periods' ? 2000 : 4000}
              aria-invalid={!briefDraft[key as keyof typeof briefLabels]}
              value={briefDraft[key as keyof typeof briefLabels]}
              onChange={(e) => setBriefDraft((prev) => ({ ...prev, [key]: e.target.value }))}
            />
          </label>
        ))}
        <Button
          disabled={busy || !can('edit_project')}
          onClick={() =>
            void perform(async () => {
              const updated = await api.update(
                project.organisation_id,
                project.id,
                { ...briefDraft, expected_revision: project.revision },
                token!,
              )
              onProjectSaved?.(updated)
              setBriefFix(false)
              refreshReadiness((v) => v + 1)
            })
          }
        >
          Save brief
        </Button>
        <Button variant="outline" onClick={() => setBriefFix(false)}>
          Cancel
        </Button>
        {error && <p role="alert">{error}</p>}
      </dialog>
      <dialog
        ref={agreementDialog}
        className="readiness-dialog"
        onCancel={() => {
          setAgreementOpen(false)
          refreshReadiness((v) => v + 1)
        }}
      >
        <BriefCheckpointPanel project={project} token={token!} />
        <Button
          onClick={() => {
            setAgreementOpen(false)
            refreshReadiness((v) => v + 1)
          }}
        >
          Return to checklist
        </Button>
      </dialog>
      {data.constraints.length > 0 && (
        <p className="notice">
          Site register:{' '}
          {data.constraints.filter((r) => !['verified', 'resolved'].includes(r.status)).length}{' '}
          unverified facts, including{' '}
          {
            data.constraints.filter(
              (r) => r.critical && !['verified', 'resolved'].includes(r.status),
            ).length
          }{' '}
          critical. Review the survey evidence and constraints register before using quantities or
          issuing. No utility or setback compliance is inferred.
        </p>
      )}
      {!journey && <h2>Analyze, price and review saved scope</h2>}
      <p
        className={journey ? 'studies-saved-note' : undefined}
        hidden={journey && studio.tool === 'rates'}
      >
        {dirty
          ? 'Save the design before calculating or issuing. Existing results may be out of date.'
          : journey
            ? 'Totals and proposals use the last saved design.'
            : 'Calculations use saved backend revisions. Numerical shade claims remain excluded from issued PDFs until field validation.'}
      </p>
      <StudiesStepBar
        step={currentStep}
        status={status}
        onStep={setStep}
        developer={developer}
        steps={visibleSteps}
      />
      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
      <div hidden={!showStep('overview')}>
        <IssueChecklist issues={issueMissing} pending={readinessPending} onFix={fixIssue} />
        {issueMissing.length > 0 &&
          issueMissing.every((i) => ['estimate_stale', 'estimate_missing'].includes(i.code)) && (
            <Button
              disabled={blocked || !canEstimate || scenario === 'baseline'}
              onClick={() => calculate('estimates')}
            >
              Recalculate total
            </Button>
          )}
        <StudiesOverview
          status={status}
          optionName={data.scenarios[scenario].name}
          developer={developer}
          onStep={setStep}
          attention={attention}
          comparison={comparison}
          onFix={fix}
        />
        <Button variant="outline" disabled={busy} onClick={() => void perform(async () => {})}>
          Refresh saved calculations
        </Button>
      </div>
      <div hidden={!showStep('rates')}>
        <div className="studies-section-head">
          <h3>Saved rates</h3>
          <p>
            Your organisation&apos;s price list. Each rate has a unit, a source, a start date and
            how long it is valid. Changing a rate makes a new version; estimates and issued
            proposals keep the version they used. Rates you type in are your own records, not prices
            checked with a supplier.
          </p>
          <p className="studies-pricing-link">
            To give an item a price, use <strong>Pricing</strong>: it only offers rates whose unit
            fits the item.{' '}
            <button
              type="button"
              className="price-link"
              onClick={() => {
                onOpenTool?.('pricing')
                openPricing()
              }}
            >
              Open Pricing
            </button>
          </p>
        </div>
        <CatalogueBrowser
          endpoint={orgEndpoint}
          token={token}
          basis={developer ? 'indicative_budget' : 'cost'}
          refresh={catalogueRevision}
          onRates={mergeRates}
          onEdit={reviseRate}
          canEdit={can('change_catalogue')}
        />
        <details
          hidden={!can('change_catalogue')}
          className="my-5 rounded-lg border border-stone-300 p-4"
        >
          <summary>Catalogue: add an explicit dated rate</summary>
          <FormRecovery
            storageKey={recoveryKey ? `${recoveryKey}:rate` : undefined}
            revision="new-rate-version"
            dirty={rateChanged}
            values={rateDraft}
            onRestore={(values) => {
              const form = rateForm.current
              if (!form) return
              for (const key of [
                'code',
                'category',
                'description',
                'unit',
                'amount',
                'effective_date',
                'valid_until',
                'source_note',
                'source_type',
                'supplier_name',
                'quote_reference',
                'exclusions',
              ]) {
                const input = form.elements.namedItem(key) as HTMLInputElement | null
                if (input) input.value = String(values[key] ?? '')
              }
              form.querySelectorAll<HTMLInputElement>('input[name="includes"]').forEach((input) => {
                input.checked =
                  Array.isArray(values.includes) && values.includes.includes(input.value)
              })
              captureRate(form)
            }}
          />
          <form
            ref={rateForm}
            onChange={(event) => captureRate(event.currentTarget)}
            onSubmit={(event) => void createRate(event)}
            className="grid gap-3 py-4 md:grid-cols-2"
          >
            <label>
              Rate code
              <input name="code" required maxLength={80} />
            </label>
            <label>
              Rate category
              <input name="category" required maxLength={80} defaultValue="General" />
            </label>
            <label>
              Description
              <input name="description" required maxLength={500} />
            </label>
            <label>
              Unit
              <select name="unit">
                <option value="m2">m²</option>
                <option value="m">m</option>
                <option value="m3">Cubic metres</option>
                <option value="h">Hours</option>
                <option value="item">item</option>
              </select>
            </label>
            <label>
              {developer ? 'Indicative budget' : 'Internal cost'} rate (MYR)
              <input name="amount" type="number" min="0" step="0.0001" required />
            </label>
            <label>
              Effective date
              <input name="effective_date" type="date" required />
            </label>
            <label>
              Rate valid until (optional; unknown validity requires review)
              <input name="valid_until" type="date" />
            </label>
            <label>
              Rate source and exclusions
              <input name="source_note" required maxLength={2000} />
            </label>
            <label>
              Where the price came from
              <select name="source_type" defaultValue="user_entered">
                {Object.entries(SOURCE_TYPE_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Supplier or vendor (required for a quotation or price list)
              <input name="supplier_name" maxLength={200} />
            </label>
            <label>
              Quotation reference (required for a quotation)
              <input name="quote_reference" maxLength={120} />
            </label>
            <label>
              Not included (exclusions)
              <input name="exclusions" maxLength={2000} />
            </label>
            <fieldset>
              <legend>Included components</legend>
              {['labour', 'equipment', 'transport', 'overhead'].map((category) => (
                <label className="mr-3" key={category}>
                  <input type="checkbox" name="includes" value={category} /> {category}
                </label>
              ))}
            </fieldset>
            <Button type="submit" disabled={busy}>
              Save new rate version
            </Button>
          </form>
          <p className="text-sm">
            A repeated code creates a new immutable reference version. Existing estimates keep their
            original rate copy. Catalogue and internal-pricing permissions are enforced by the API.
          </p>
        </details>
        <details className="my-3">
          <summary>Assign rates in a table (advanced) · {data.scenarios[scenario].name}</summary>
          <p className="text-sm">
            The same choices as Pricing, without unit filtering or a subtotal preview. Layered paths
            and roads, and trees, are priced in Pricing.
          </p>
          {data.scenarios[scenario].items
            .filter((item) => item.status === 'proposed' && item.assembly?.pricing !== 'components')
            .map((item) => (
              <label className="field" key={item.id}>
                Rate for {item.name}
                <select
                  disabled={
                    !can('edit_geometry') || busy || project.archived || Boolean(item.tree_design)
                  }
                  value={item.rate_id ?? ''}
                  onChange={(event) => {
                    const next = structuredClone(data)
                    next.scenarios[scenario].items = next.scenarios[scenario].items.map((entry) =>
                      entry.id === item.id
                        ? { ...entry, rate_id: event.target.value || null }
                        : entry,
                    )
                    onData(next)
                  }}
                >
                  {item.rate_id && !rates.some((rate) => rate.id === item.rate_id) && (
                    <option value={item.rate_id}>
                      Assigned version unavailable - retry loading catalogue
                    </option>
                  )}
                  <option value="">Unpriced — select a rate</option>
                  {rates
                    .filter(
                      (rate) =>
                        rate.basis === (developer ? 'indicative_budget' : 'cost') &&
                        (!rate.archived || rate.id === item.rate_id),
                    )
                    .map((rate) => (
                      <option key={rate.id} value={rate.id}>
                        {rate.code} v{rate.version} · {rate.description} ·{' '}
                        {rate.amount ?? 'restricted'} MYR/{rate.unit} · {rate.effective_date}
                      </option>
                    ))}
                </select>
                {item.tree_design && (
                  <small>
                    Price trees in Pricing or Trees → Tree specification &amp; cost, so the stock
                    and rate are reviewed together.
                  </small>
                )}
              </label>
            ))}
        </details>
        <details className="my-3">
          <summary>Firm, optional and provisional scope</summary>
          <p>
            All proposed lines contribute to the calculated total. Optional and provisional lines
            require an issue review; exclusions must be stated explicitly.
          </p>
          {data.scenarios[scenario].items
            .filter((item) => item.status === 'proposed')
            .map((item) => (
              <label key={item.id} className="field">
                Pricing status for {item.name}
                <select
                  disabled={blocked || !can('edit_geometry')}
                  value={item.pricing_status ?? 'firm'}
                  onChange={(event) => {
                    const next = structuredClone(data)
                    const row = next.scenarios[scenario].items.find((row) => row.id === item.id)!
                    row.pricing_status = event.target.value as 'firm' | 'optional' | 'provisional'
                    onData(next)
                  }}
                >
                  <option value="firm">Firm scope</option>
                  <option value="optional">Optional, included in total</option>
                  <option value="provisional">Provisional allowance</option>
                </select>
              </label>
            ))}
        </details>
      </div>
      <div hidden={!showStep('shade')}>
        <div className="studies-section-head">
          <h3>Shade study (optional)</h3>
          <p>
            Shade does not change the price. Use it to see how much of a chosen area is shaded at a
            chosen time. Results are modelled, not field-verified, and trees are not counted.
          </p>
        </div>
        <ShadeStudies
          project={project}
          token={token}
          data={data}
          revision={revision}
          dirty={dirty}
          scenario={scenario}
          onShowShadows={onShowShadows}
          onDirty={setStudyChanged}
        />
        <div className="grid gap-6 py-5 lg:grid-cols-2">
          <div>
            <h3>Modeled ground shade</h3>
            <div className="field">
              <label htmlFor="analysis-target">Saved target zone</label>
              <select
                id="analysis-target"
                value={target || data.targets[0]?.id || ''}
                onChange={(event) => setTarget(event.target.value)}
              >
                {data.targets.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="analysis-time-mode">Time entry</label>
              <select
                id="analysis-time-mode"
                value={timeMode}
                onChange={(event) => setTimeMode(event.target.value)}
              >
                <option value="offset">Explicit timezone offset</option>
                <option value="local">Project local time ({project.timezone})</option>
              </select>
            </div>
            {timeMode === 'local' ? (
              <div className="field">
                <label htmlFor="analysis-local-time">
                  Local date and time ({project.timezone})
                </label>
                <input
                  id="analysis-local-time"
                  type="datetime-local"
                  value={localTime}
                  onChange={(event) => setLocalTime(event.target.value)}
                />
                <p>
                  The backend uses the saved project timezone. Clock-change ambiguities require an
                  explicit offset.
                </p>
              </div>
            ) : (
              <div className="field">
                <label htmlFor="analysis-time">Date/time with explicit timezone offset</label>
                <input
                  id="analysis-time"
                  value={timestamp}
                  onChange={(event) => setTimestamp(event.target.value)}
                  placeholder="2026-10-11T12:00:00+08:00"
                />
              </div>
            )}
            <Button
              disabled={!can('analyse') || blocked || !data.targets.length}
              onClick={() => calculate('analyses')}
            >
              Calculate all three scenarios
            </Button>
            <p className="text-sm">
              Flat ground, opaque solids and elevated roofs. Trees excluded. Night and low sun
              return unavailable metrics.
            </p>
          </div>
        </div>
        <h3>Saved shade results</h3>
        {renderSaved(['analysis'])}
      </div>
      <div hidden={!showStep('estimate')}>
        <div className="studies-section-head">
          <h3>Total</h3>
          <p>
            {developer
              ? 'Add the priced items into an indicative budget for the option you are looking at.'
              : 'Add the priced items into a total for the option you are looking at, then choose how your markup or margin is applied.'}
            {status.unpriced > 0
              ? ` ${status.unpriced} item${status.unpriced === 1 ? ' has' : 's have'} no price yet, so the total will be marked incomplete.`
              : ''}
          </p>
        </div>
        <div className="grid gap-6 py-5">
          <form
            hidden={!canEstimate}
            onSubmit={(event) => {
              event.preventDefault()
              calculate('estimates')
            }}
          >
            <h3>{developer ? 'Indicative budget' : 'Internal contractor pricing'}</h3>
            {!developer && (
              <>
                <div className="field">
                  <label htmlFor="price-method">Pricing method</label>
                  <select
                    id="price-method"
                    value={method}
                    onChange={(event) => setMethod(event.target.value)}
                  >
                    <option value="markup">Markup on cost</option>
                    <option value="margin">Target margin</option>
                    <option value="fixed_selling">Fixed selling total</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="price-percent">
                    {method === 'fixed_selling'
                      ? 'Fixed selling total (MYR)'
                      : `${method === 'margin' ? 'Target margin' : 'Markup'} (%)`}
                  </label>
                  <input
                    id="price-percent"
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    max={
                      method === 'margin'
                        ? '99.9999'
                        : method === 'markup'
                          ? '1000'
                          : '9999999999.9999'
                    }
                    value={method === 'fixed_selling' ? fixedPrice : percent}
                    onChange={(event) => {
                      if (method === 'fixed_selling') setFixedPrice(event.target.value)
                      else {
                        setPercent(event.target.value)
                        percentEdited.current = true
                      }
                    }}
                  />
                </div>
              </>
            )}
            <div className="field">
              <label htmlFor="wastage">Explicit area/length wastage (%)</label>
              <input
                id="wastage"
                type="number"
                min="0"
                max="100"
                step="0.01"
                required
                value={wastage}
                onChange={(event) => setWastage(event.target.value)}
              />
            </div>
            <fieldset disabled={blocked} className="my-4">
              <legend>Explicit additional charges</legend>
              <p className="text-sm">
                Add each component once. The API rejects a charge already included in any selected
                rate. These inputs are saved with the next estimate.
              </p>
              {charges.map((charge) => (
                <div key={charge.category} className="my-3 rounded border border-stone-300 p-3">
                  <label>
                    {charge.category} charge (MYR)
                    <input
                      type="number"
                      min="0"
                      max="9999999999.9999"
                      step="0.0001"
                      required
                      value={charge.amount}
                      onChange={(event) =>
                        setCharges((current) =>
                          current.map((entry) =>
                            entry.category === charge.category
                              ? { ...entry, amount: event.target.value }
                              : entry,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    {charge.category} charge source and scope
                    <input
                      required
                      maxLength={2000}
                      value={charge.source_note}
                      onChange={(event) =>
                        setCharges((current) =>
                          current.map((entry) =>
                            entry.category === charge.category
                              ? { ...entry, source_note: event.target.value }
                              : entry,
                          ),
                        )
                      }
                    />
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      setCharges((current) =>
                        current.filter((entry) => entry.category !== charge.category),
                      )
                    }
                  >
                    Remove {charge.category} charge
                  </Button>
                </div>
              ))}
              {chargeCategories
                .filter((category) => !charges.some((charge) => charge.category === category))
                .map((category) => (
                  <Button
                    type="button"
                    key={category}
                    variant="outline"
                    className="mr-2 mb-2"
                    onClick={() =>
                      setCharges((current) => [
                        ...current,
                        { category, amount: '', source_note: '' },
                      ])
                    }
                  >
                    Add {category} charge
                  </Button>
                ))}
            </fieldset>
            <Button type="submit" disabled={blocked || scenario === 'baseline'}>
              Calculate selected option estimate
            </Button>
            <p className="text-sm">
              MYR · line totals rounded half up to two decimals. No implicit tax or charges. Missing
              rates produce a clearly incomplete subtotal.
            </p>
          </form>
        </div>
        <h3>Saved estimates</h3>
        <EstimateComparison artifacts={artifacts} dirty={dirty} />
        {renderSaved(['estimate'])}
      </div>
      <div hidden={!showStep('proposal')}>
        <div className="studies-section-head">
          <h3>{developer ? 'Decision brief' : 'Proposal'}</h3>
          <p>
            {developer
              ? 'Write up the decision brief for the owner, preview the PDF and issue it as a locked version.'
              : 'Write up the scope, programme and terms for your client, preview the PDF and issue it. An issued version is locked; later changes become a new version.'}
          </p>
        </div>
        {can('review_project') && (
          <ReviewPanel
            analysisSelection={{
              target: target || data.targets[0]?.id || '',
              time: timeMode === 'local' ? localTime : timestamp,
              mode: timeMode,
            }}
            data={data}
            project={project}
            token={token}
            revision={revision}
            dirty={dirty}
            artifacts={artifacts}
            onDirty={setReviewChanged}
            recoveryKey={recoveryKey ? `${recoveryKey}:review` : undefined}
          />
        )}
        <details
          id="issue-form"
          hidden={!can(developer ? 'issue_developer_brief' : 'issue_proposal')}
          className="my-5 rounded-lg border border-stone-300 p-4"
          onChange={() => setOutputChanged(true)}
        >
          <summary>
            Review and issue {developer ? 'developer decision brief' : 'contractor client proposal'}
          </summary>
          <FormRecovery
            storageKey={recoveryKey ? `${recoveryKey}:output` : undefined}
            revision={`${project.revision}/${revision}`}
            dirty={outputChanged}
            values={{
              validUntil,
              programme,
              maintenance,
              maintenanceTasks: JSON.stringify(maintenanceTasks),
              changeSummary,
              overrideReason,
              criteria,
              notes,
              narrative,
              assumptions,
              exclusions,
              estimateId,
              evidenceIds,
              includePhotos: String(includePhotos),
              scenario,
            }}
            onRestore={(value) => {
              if (value.scenario === 'option_a' || value.scenario === 'option_b')
                onScenarioChange(value.scenario)
              setValidUntil(String(value.validUntil ?? ''))
              setProgramme(String(value.programme ?? ''))
              setMaintenance(String(value.maintenance ?? ''))
              try {
                const restored = z
                  .array(maintenanceTaskSchema)
                  .safeParse(JSON.parse(String(value.maintenanceTasks ?? '[]')))
                setMaintenanceTasks(restored.success ? restored.data : [])
              } catch {
                setMaintenanceTasks([])
              }
              setChangeSummary(String(value.changeSummary ?? ''))
              setOverrideReason(String(value.overrideReason ?? ''))
              setCriteria(String(value.criteria ?? ''))
              setNotes(String(value.notes ?? ''))
              setNarrative(String(value.narrative ?? ''))
              setAssumptions(String(value.assumptions ?? ''))
              setExclusions(String(value.exclusions ?? ''))
              setEstimateId(String(value.estimateId ?? ''))
              setEvidenceIds(Array.isArray(value.evidenceIds) ? value.evidenceIds : [])
              setIncludePhotos(value.includePhotos === 'true')
              setOutputChanged(true)
            }}
          />
          <div className="field">
            <label htmlFor="issue-estimate">Total to use</label>
            <select
              id="issue-estimate"
              value={estimateId}
              onChange={(event) => setEstimateId(event.target.value)}
            >
              <option value="">Select a saved total</option>
              {artifacts
                .filter((item) => item.kind === 'estimate' && item.payload.scenario === scenario)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.created_at} ·{' '}
                    {item.kind === 'estimate' && item.payload.complete && !item.stale
                      ? 'complete and current'
                      : item.stale
                        ? 'out of date (draft preview only)'
                        : 'incomplete (draft preview only)'}
                  </option>
                ))}
            </select>
          </div>
          <PricingIssueReadiness
            endpoint={endpoint}
            estimateId={estimateId}
            validUntil={validUntil}
            token={token}
          />
          <div className="field">
            <label htmlFor="issue-criteria">Review criteria (one per line)</label>
            <textarea
              id="issue-criteria"
              value={criteria}
              onChange={(event) => setCriteria(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="customer-narrative">Customer-facing scope narrative</label>
            <textarea
              id="customer-narrative"
              maxLength={8000}
              value={narrative}
              onChange={(event) => setNarrative(event.target.value)}
            />
            <p>
              Included in the preview and issued document. Review this text for its intended
              audience.
            </p>
          </div>
          {!developer && (
            <>
              <label className="field">
                Proposal valid until
                <input
                  type="date"
                  id="issue-validity"
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                />
              </label>
              <label className="field">
                Programme and delivery assumptions
                <textarea
                  maxLength={8000}
                  id="issue-programme"
                  value={programme}
                  onChange={(e) => setProgramme(e.target.value)}
                />
              </label>
              <label className="field">
                Maintenance scope or exclusions
                <textarea
                  maxLength={8000}
                  id="issue-maintenance"
                  value={maintenance}
                  onChange={(e) => setMaintenance(e.target.value)}
                />
              </label>
              <MaintenanceChecklist
                tasks={maintenanceTasks}
                onChange={(next) => {
                  setMaintenanceTasks(next)
                  setOutputChanged(true)
                }}
              />
              <label className="field">
                Changes since previous proposal
                <textarea
                  maxLength={8000}
                  id="issue-changes"
                  value={changeSummary}
                  onChange={(e) => setChangeSummary(e.target.value)}
                />
              </label>
              {can('internal_pricing') && (
                <label className="field">
                  Internal pricing exception review reason
                  <textarea
                    maxLength={2000}
                    aria-label="Internal pricing exception review reason"
                    id="issue-override"
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                  />
                  <span>
                    Required when warnings exist, including rates expiring before proposal validity.
                    Recorded privately with your identity; no missing-price override.
                  </span>
                </label>
              )}
            </>
          )}
          <fieldset id="issue-evidence" tabIndex={-1}>
            <legend>Site evidence references to include</legend>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                void perform(async () => {
                  const result = await request(
                    `${endpoint}/evidence`,
                    z.object({
                      items: z.array(z.object({ id: z.uuid(), description: z.string() })),
                    }),
                    token,
                  )
                  setEvidenceChoices(result.items)
                })
              }
            >
              Load available evidence
            </Button>
            <p>
              Selected descriptions, observations and source references are frozen at issue. Photo
              copies are included only with the explicit choice below.
            </p>
            <label className="flex flex-row items-center gap-2">
              <input
                type="checkbox"
                checked={includePhotos}
                onChange={(e) => setIncludePhotos(e.target.checked)}
              />
              Include selected photos in the audience-facing output
            </label>
            <p>
              Check sharing rights and sensitive details in the draft preview. Included photo copies
              remain in the issued record even if the gallery entry later changes.
            </p>
            {evidenceChoices.map((item) => (
              <label key={item.id} className="flex flex-row items-center gap-2">
                <input
                  type="checkbox"
                  checked={evidenceIds.includes(item.id)}
                  disabled={!evidenceIds.includes(item.id) && evidenceIds.length >= 20}
                  onChange={(event) =>
                    setEvidenceIds((current) =>
                      event.target.checked
                        ? [...current, item.id]
                        : current.filter((id) => id !== item.id),
                    )
                  }
                />
                Include {item.description}
              </label>
            ))}
          </fieldset>
          <div className="field">
            <label htmlFor="issue-notes">Reviewer notes</label>
            <textarea
              id="issue-notes"
              maxLength={8000}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="issue-assumptions">Assumptions</label>
            <textarea
              id="issue-assumptions"
              maxLength={8000}
              value={assumptions}
              onChange={(event) => setAssumptions(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="issue-exclusions">Exclusions</label>
            <textarea
              id="issue-exclusions"
              maxLength={8000}
              value={exclusions}
              onChange={(event) => setExclusions(event.target.value)}
            />
          </div>
          <IssueChecklist issues={issueMissing} pending={readinessPending} onFix={fixIssue} />
          <p role="status">
            {issueDisabled
              ? 'Issue is unavailable until the checklist is clear and the latest check finishes.'
              : 'All required checks passed. You can issue this version.'}
          </p>
          <p>
            <strong>What happens when I issue?</strong> A locked version is created and its PDF is
            stored. Nothing is sent automatically. Later changes need a new version. If PDF storage
            fails, the saved version remains locked and you can retry storage.
          </p>
          <Button disabled={issueDisabled} onClick={() => issue(false)}>
            {issueStatus?.tone === 'working' && busy ? 'Issuing…' : 'Confirm and issue new version'}
          </Button>
          {issueStatus && (
            <div
              ref={issueStatusRef}
              tabIndex={-1}
              role={issueStatus.tone === 'error' ? 'alert' : 'status'}
              className={`issue-status is-${issueStatus.tone}`}
            >
              <p>{issueStatus.text}</p>
              {issueStatus.blocker && (
                <button type="button" onClick={() => fixIssue(issueStatus.blocker!)}>
                  Fix it
                </button>
              )}
              {issueStatus.tone === 'done' && (
                <button
                  type="button"
                  className="price-link"
                  onClick={() =>
                    document.getElementById('issued-outputs')?.scrollIntoView({ block: 'start' })
                  }
                >
                  Download it under Issued outputs
                </button>
              )}
            </div>
          )}
          <Button
            variant="outline"
            disabled={previewMissing.length > 0}
            title={previewMissing.join(' ') || undefined}
            onClick={() => issue(true)}
          >
            Preview draft PDF
          </Button>
          {previewMissing.length > 0 && (
            <p className="text-sm" role="status">
              To preview a draft: {previewMissing.join(' ')}
            </p>
          )}
          {preview && (
            <OutputPreview
              snapshot={preview}
              kind={developer ? 'developer_brief' : 'proposal'}
              onClose={() => setPreview(null)}
            />
          )}
        </details>
        <h3 id="issued-outputs">Issued outputs</h3>
        {!developer && (
          <SubmitToOwner
            project={project}
            token={token}
            refresh={artifacts.filter((item) => item.kind === 'proposal').length}
          />
        )}
        {artifacts
          .filter((item) => item.kind === 'developer_brief' || item.kind === 'proposal')
          .map((item) =>
            item.kind === 'developer_brief' || item.kind === 'proposal' ? (
              <article className="my-3 rounded-lg border border-stone-300 p-4" key={item.id}>
                <h4>
                  {item.payload.title} · version {item.payload.version}
                </h4>
                <p>
                  {item.stale
                    ? 'Historical snapshot — live inputs have since changed.'
                    : 'Immutable issued snapshot.'}{' '}
                  {item.id}
                </p>
                <IssuedOutputFile
                  endpoint={endpoint}
                  token={token}
                  artifact={item}
                  canRetain={can(
                    item.kind === 'proposal' ? 'issue_proposal' : 'issue_developer_brief',
                  )}
                />
              </article>
            ) : null,
          )}
      </div>
      {(previousStep || nextStep) && currentStep !== 'overview' && (
        <div className="studies-footnav">
          {previousStep ? (
            <Button variant="outline" onClick={() => setStep(previousStep)}>
              Back
            </Button>
          ) : (
            <span />
          )}
          {nextStep && (
            <Button variant="outline" onClick={() => setStep(nextStep)}>
              Next step
            </Button>
          )}
        </div>
      )}
    </section>
  )
}
