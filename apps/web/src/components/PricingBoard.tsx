import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  Armchair,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  Clock3,
  Flower2,
  Footprints,
  Lock,
  MapPin,
  Package,
  ReceiptText,
  Route,
  Shovel,
  TreeDeciduous,
  Undo2,
} from 'lucide-react'
import { StudioContext } from './studio-context'
import { request } from '../services/api'
import type { Project } from '../domain/projects'
import {
  workspaceInput,
  type ScenarioKey,
  type WorkItem,
  type WorkspaceData,
} from '../domain/workspace'
import { rateListSchema, rateSchema, SOURCE_TYPE_LABEL, type Rate } from '../domain/calculations'
import {
  applyBulkRate,
  compatibleRates,
  GROUP_LABEL,
  GROUP_ORDER,
  itemState,
  layerMethodText,
  money,
  planBulkRate,
  plantMethodText,
  priceGroup,
  pricingPreviewSchema,
  PRICE_ITEM_EVENT,
  rateNoun,
  rateUsage,
  rateValidity,
  rowsFor,
  setItemPrice,
  STATE_LABEL,
  tidy,
  unitLabel,
  type ItemState,
  type PriceGroup,
  type PricingPreview,
} from '../domain/pricing'
import './pricing.css'

const groupIcon: Record<PriceGroup, typeof Package> = {
  trees: TreeDeciduous,
  planting: Flower2,
  objects: Armchair,
  paths: Footprints,
  roads: Route,
  site: Shovel,
  other: Package,
}
const stateIcon: Record<ItemState, typeof Package> = {
  existing: CircleDashed,
  priced: CircleCheck,
  needs_price: CircleAlert,
  needs_spec: CircleAlert,
  needs_review: CircleAlert,
  incomplete: CircleDashed,
  stale: Clock3,
  restricted: Lock,
}

type Props = {
  project: Project
  token: string | undefined
  data: WorkspaceData
  revision: number
  dirty: boolean
  scenario: ScenarioKey
  onScenarioChange: (scenario: ScenarioKey) => void
  onData: (next: WorkspaceData) => void
  onLocate: (itemId: string) => void
  onEstimate: () => void
  onMaterials: (itemId: string) => void
  canUndo: boolean
  onUndo: () => void
  disabledReason?: string
}

function usePreview(
  endpoint: string,
  token: string | undefined,
  data: WorkspaceData | null,
  revision: number,
  scenario: ScenarioKey,
  enabled: boolean,
) {
  const [preview, setPreview] = useState<PricingPreview | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (!enabled || !data || scenario === 'baseline') return
    let current = true
    const timer = window.setTimeout(() => {
      setLoading(true)
      request(`${endpoint}/pricing-preview?scenario=${scenario}`, pricingPreviewSchema, token, {
        method: 'POST',
        body: JSON.stringify(workspaceInput(data, revision)),
      })
        .then((result) => {
          if (!current) return
          setPreview(result)
          setError('')
        })
        .catch((reason) => {
          if (current)
            setError(reason instanceof Error ? reason.message : 'Pricing preview unavailable.')
        })
        .finally(() => {
          if (current) setLoading(false)
        })
    }, 300)
    return () => {
      current = false
      window.clearTimeout(timer)
    }
  }, [endpoint, token, data, revision, scenario, enabled])
  return { preview: enabled && data ? preview : null, error, loading }
}

function StatusChip({ state }: { state: ItemState }) {
  const Icon = stateIcon[state]
  return (
    <span className={`price-chip is-${state}`}>
      <Icon size={13} aria-hidden="true" /> {STATE_LABEL[state]}
    </span>
  )
}

export default function PricingBoard(props: Props) {
  const { project, token, data, revision, dirty, scenario } = props
  const studio = useContext(StudioContext)
  const visible = !studio.immersive || (studio.tool === 'pricing' && studio.panelOpen)
  const developer = project.purpose === 'developer_decision'
  const basis: Rate['basis'] = developer ? 'indicative_budget' : 'cost'
  const org = `/api/v1/organisations/${project.organisation_id}`
  const endpoint = `${org}/projects/${project.id}`
  const internal = Boolean(project.capabilities?.includes('internal_pricing'))
  const canEdit =
    Boolean(project.capabilities?.includes('edit_geometry')) &&
    !project.archived &&
    (developer || internal) &&
    !props.disabledReason
  const editBlocked = project.archived
    ? 'This project is archived. Restore it before changing prices.'
    : !project.capabilities?.includes('edit_geometry')
      ? 'Your role can view prices but not change the design.'
      : !developer && !internal
        ? 'Choosing internal cost rates needs internal pricing access.'
        : props.disabledReason
  const canAddRate =
    Boolean(project.organisation_capabilities?.includes('change_catalogue')) &&
    (developer || internal)

  const { preview, error, loading } = usePreview(endpoint, token, data, revision, scenario, visible)
  const [assigned, setAssigned] = useState<Record<string, Rate>>({})
  const [filter, setFilter] = useState<'all' | 'attention' | 'priced'>('all')
  const [selected, setSelected] = useState<string[]>([])
  const [pricing, setPricing] = useState<string | null>(null)
  const [bulk, setBulk] = useState(false)
  const [notice, setNotice] = useState('')

  const items = data.scenarios[scenario].items
  const proposed = items.filter((item) => item.status === 'proposed')
  const existing = items.length - proposed.length
  const rows = useMemo(() => preview?.rows ?? [], [preview])

  // Load the assigned rate records so each card can name its source.
  const assignedIds = useMemo(
    () =>
      [
        ...new Set(
          proposed.flatMap((item) => [
            ...(item.rate_id ? [item.rate_id] : []),
            ...(item.assembly?.components.flatMap((c) => (c.rate_id ? [c.rate_id] : [])) ?? []),
          ]),
        ),
      ].sort(),
    [proposed],
  )
  const idsKey = assignedIds.join(',')
  // Each id is requested once; an unavailable rate shows as such instead of being retried in a loop.
  const requested = useRef(new Set<string>())
  useEffect(() => {
    if (!visible) return
    const missing = idsKey ? idsKey.split(',').filter((id) => !requested.current.has(id)) : []
    if (!missing.length) return
    missing.forEach((id) => requested.current.add(id))
    Promise.all(
      missing.map((id) => request(`${org}/rates/${id}`, rateSchema, token).catch(() => null)),
    ).then((found) => {
      const loaded = found.filter((rate): rate is Rate => rate !== null)
      if (loaded.length)
        setAssigned((previous) => ({
          ...previous,
          ...Object.fromEntries(loaded.map((rate) => [rate.id, rate])),
        }))
    })
  }, [idsKey, org, token, visible])

  useEffect(() => {
    const open = (event: Event) => {
      const id = (event as CustomEvent<string | null>).detail
      if (id && data.scenarios[scenario].items.some((item) => item.id === id)) setPricing(id)
    }
    window.addEventListener(PRICE_ITEM_EVENT, open)
    return () => window.removeEventListener(PRICE_ITEM_EVENT, open)
  }, [data, scenario])

  const states = useMemo(
    () => Object.fromEntries(proposed.map((item) => [item.id, itemState(item, rows)])),
    [proposed, rows],
  )
  const attention = proposed.filter((item) => preview && states[item.id].state !== 'priced')
  const shown = proposed.filter((item) =>
    filter === 'all'
      ? true
      : filter === 'priced'
        ? states[item.id]?.state === 'priced'
        : states[item.id]?.state !== 'priced',
  )
  const groups = GROUP_ORDER.map((group) => ({
    group,
    items: shown.filter((item) => priceGroup(item) === group),
  })).filter((entry) => entry.items.length)

  const pricingItem = items.find((item) => item.id === pricing)
  const summary = preview?.summary

  function applied(text: string) {
    setNotice(text)
    setSelected([])
  }

  if (scenario === 'baseline')
    return (
      <section className="price-board" aria-label="Pricing">
        <OptionSwitch scenario={scenario} onChange={props.onScenarioChange} data={data} />
        <p className="price-empty">
          The baseline is the existing site. Nothing there is billable. Choose Option A or Option B
          to see and price the proposed work.
        </p>
      </section>
    )

  return (
    <section className="price-board" aria-label="Pricing">
      <header className="price-head">
        <div>
          <span className="eyebrow">{data.scenarios[scenario].name}</span>
          <h3>What this option costs so far</h3>
        </div>
      </header>
      <dl className="price-stats" aria-label="Pricing summary" aria-busy={loading}>
        <div>
          <dt>Items priced</dt>
          <dd>{summary ? `${summary.priced} of ${summary.lines}` : '…'}</dd>
          <small>Lines, counting each road or path layer</small>
        </div>
        <div className={summary && !summary.complete ? 'is-incomplete' : ''}>
          <dt>{developer ? 'Indicative budget so far' : 'Direct cost so far'}</dt>
          <dd>
            {!summary
              ? '…'
              : summary.priced_subtotal === null
                ? 'Hidden for your role'
                : money(summary.priced_subtotal)}
          </dd>
          <small>
            {!summary
              ? 'Calculating on the server'
              : summary.complete
                ? developer
                  ? 'Every line priced. Before review.'
                  : 'Every line priced. Before markup and charges.'
                : `Incomplete: ${summary.unpriced} line${summary.unpriced === 1 ? '' : 's'} not priced. This is not a total.`}
          </small>
        </div>
        <div>
          <dt>Needs review</dt>
          <dd>{summary ? summary.needs_review : '…'}</dd>
          <small>Expired, undated or archived rates</small>
        </div>
      </dl>
      <p className="price-draft" role="status">
        {error
          ? `Preview unavailable: ${error}`
          : dirty
            ? 'Includes unsaved changes (preview). Save the design to keep them.'
            : `Matches the saved design (version ${revision}).`}
      </p>
      <div className="price-actions">
        <button
          type="button"
          className="button"
          onClick={props.onEstimate}
          disabled={dirty}
          title={dirty ? 'Save first: totals use the saved design.' : undefined}
        >
          <ReceiptText size={16} aria-hidden="true" /> Next: review and total
        </button>
        {props.canUndo && (
          <button type="button" onClick={props.onUndo}>
            <Undo2 size={16} aria-hidden="true" /> Undo last change
          </button>
        )}
      </div>
      {editBlocked && <p className="price-note">{editBlocked}</p>}
      {notice && (
        <p className="price-notice" role="status">
          {notice}
        </p>
      )}

      <div className="price-filters" role="group" aria-label="Show items">
        {(
          [
            ['all', `All (${proposed.length})`],
            ['attention', `Needs attention (${attention.length})`],
            ['priced', `Priced (${proposed.length - attention.length})`],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)}>
            {label}
          </button>
        ))}
      </div>

      {selected.length > 0 && (
        <div className="price-batch" role="region" aria-label="Selected items">
          <strong>{selected.length} selected</strong>
          <button
            type="button"
            className="button"
            disabled={!canEdit}
            onClick={() => setBulk(true)}
          >
            Apply one rate…
          </button>
          <button type="button" onClick={() => setSelected([])}>
            Clear selection
          </button>
        </div>
      )}

      {!proposed.length && (
        <p className="price-empty">
          Nothing proposed in {data.scenarios[scenario].name} yet. Add trees, planting, objects,
          paths or roads in step 2, Design, and they will appear here.
        </p>
      )}
      {groups.map(({ group, items: entries }) => {
        const Icon = groupIcon[group]
        return (
          <section key={group} className="price-group" aria-label={GROUP_LABEL[group]}>
            <h4>
              <Icon size={17} aria-hidden="true" /> {GROUP_LABEL[group]}{' '}
              <small>({entries.length})</small>
            </h4>
            <ul>
              {entries.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  rows={rowsFor(item, rows)}
                  state={states[item.id]}
                  subtotal={preview?.subtotals[item.id] ?? null}
                  rates={assigned}
                  ready={Boolean(preview)}
                  selected={selected.includes(item.id)}
                  onSelect={(checked) =>
                    setSelected((previous) =>
                      checked ? [...previous, item.id] : previous.filter((id) => id !== item.id),
                    )
                  }
                  onPrice={() => setPricing(item.id)}
                  onLocate={() => props.onLocate(item.id)}
                />
              ))}
            </ul>
          </section>
        )
      })}
      {existing > 0 && (
        <p className="price-note">
          {existing} existing site item{existing === 1 ? ' is' : 's are'} shown on the map for
          context and never priced. Hidden map layers are still counted here.
        </p>
      )}

      {pricingItem && (
        <PriceDialog
          key={pricingItem.id}
          item={pricingItem}
          data={data}
          scenario={scenario}
          revision={revision}
          endpoint={endpoint}
          org={org}
          token={token}
          basis={basis}
          developer={developer}
          preview={preview}
          canEdit={canEdit && !pricingItem.editor_locked && pricingItem.status === 'proposed'}
          blocked={
            pricingItem.status !== 'proposed'
              ? 'Existing site item. It is context only and never priced.'
              : pricingItem.editor_locked
                ? 'This item is locked in Layout. Unlock it there before changing its price.'
                : editBlocked
          }
          canAddRate={canAddRate}
          onMaterials={() => {
            setPricing(null)
            props.onMaterials(pricingItem.id)
          }}
          onClose={() => setPricing(null)}
          onApply={(next, text) => {
            props.onData(next)
            setPricing(null)
            applied(text)
          }}
          onRate={(rate) => setAssigned((previous) => ({ ...previous, [rate.id]: rate }))}
        />
      )}
      {bulk && (
        <BulkDialog
          items={proposed}
          selected={selected}
          rows={rows}
          org={org}
          token={token}
          basis={basis}
          onClose={() => setBulk(false)}
          onApply={(plan, rate, confirmed) => {
            props.onData(applyBulkRate(data, scenario, plan, rate.id, confirmed))
            setBulk(false)
            const count = plan.apply.filter((item) => !item.tree_design || confirmed).length
            applied(
              `${rate.code} v${rate.version} applied to ${count} item${count === 1 ? '' : 's'} in your draft. Save the design to keep it.`,
            )
          }}
        />
      )}
    </section>
  )
}

function OptionSwitch({
  scenario,
  onChange,
  data,
}: {
  scenario: ScenarioKey
  onChange: (scenario: ScenarioKey) => void
  data: WorkspaceData
}) {
  return (
    <div className="price-options" role="group" aria-label="Option to price">
      {(['option_a', 'option_b'] as const).map((key) => (
        <button
          key={key}
          type="button"
          aria-pressed={scenario === key}
          onClick={() => onChange(key)}
        >
          {data.scenarios[key].name}
        </button>
      ))}
    </div>
  )
}

function rateLine(rate: Rate | undefined, label: string) {
  if (!rate) return label === 'Unavailable' ? null : label
  const supplier = rate.supplier_name ? ` · ${rate.supplier_name}` : ''
  return `${rate.code} v${rate.version}${supplier} · ${SOURCE_TYPE_LABEL[rate.source_type]}`
}

function ItemCard(props: {
  item: WorkItem
  rows: ReturnType<typeof rowsFor>
  state: { state: ItemState; why: string } | undefined
  subtotal: string | null
  rates: Record<string, Rate>
  ready: boolean
  selected: boolean
  onSelect: (checked: boolean) => void
  onPrice: () => void
  onLocate: () => void
}) {
  const { item, rows, state } = props
  const group = priceGroup(item)
  const Icon = groupIcon[group]
  const quantity =
    item.assembly?.pricing === 'components' || rows.length !== 1
      ? item.quantity
        ? `${tidy(item.quantity.value)} ${unitLabel(item.quantity.calculated.unit)} · ${rows.length} layer${rows.length === 1 ? '' : 's'}`
        : `${rows.length} layers`
      : `${tidy(rows[0].quantity)} ${unitLabel(rows[0].unit)}`
  const layerRates = item.assembly?.components.map((c) => c.rate_id).filter(Boolean) ?? []
  const source = item.rate_id
    ? rateLine(props.rates[item.rate_id], rows[0]?.rate ?? '')
    : layerRates.length
      ? `${layerRates.length} of ${item.assembly?.components.length} layers have a rate`
      : null
  return (
    <li className="price-card" data-state={state?.state} data-selected={props.selected}>
      <input
        type="checkbox"
        checked={props.selected}
        aria-label={`Select ${item.name}`}
        onChange={(event) => props.onSelect(event.target.checked)}
      />
      <span className="price-card-icon" aria-hidden="true">
        <Icon size={20} />
      </span>
      <div className="price-card-body">
        <div className="price-card-top">
          <strong>{item.name}</strong>
          {state && props.ready ? (
            <StatusChip state={state.state} />
          ) : (
            <span className="price-chip">…</span>
          )}
        </div>
        <span className="price-card-qty">
          {props.ready ? quantity : 'Measuring…'}
          {props.subtotal !== null && <b>{money(props.subtotal)}</b>}
        </span>
        <small>{source ?? 'No rate selected'}</small>
        {state && state.state !== 'priced' && props.ready && (
          <small className="price-why">{state.why}</small>
        )}
        <div className="price-card-actions">
          <button
            type="button"
            className="button"
            onClick={props.onPrice}
            aria-label={`Price ${item.name}`}
          >
            Price this item
          </button>
          {item.geometry && (
            <button
              type="button"
              onClick={props.onLocate}
              aria-label={`Show ${item.name} on the map`}
            >
              <MapPin size={15} aria-hidden="true" /> Map
            </button>
          )}
        </div>
      </div>
    </li>
  )
}

function useRates(org: string, token: string | undefined, basis: Rate['basis'], query: string) {
  const [rates, setRates] = useState<Rate[]>([])
  const [total, setTotal] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)
  useEffect(() => {
    let current = true
    const timer = window.setTimeout(() => {
      request(
        `${org}/rates?limit=100&basis=${basis}&query=${encodeURIComponent(query.trim())}`,
        rateListSchema,
        token,
      )
        .then((result) => {
          if (!current) return
          setRates(result.items)
          setTotal(result.total)
          setLoaded(true)
          setError('')
        })
        .catch((reason) => {
          if (current) setError(reason instanceof Error ? reason.message : 'Rates unavailable.')
        })
    }, 200)
    return () => {
      current = false
      window.clearTimeout(timer)
    }
  }, [org, token, basis, query, version])
  const add = useCallback((rate: Rate) => {
    setRates((previous) => [rate, ...previous.filter((entry) => entry.id !== rate.id)])
    setVersion((value) => value + 1)
  }, [])
  return { rates, total, error, add, loaded }
}

function Modal({
  label,
  onClose,
  children,
}: {
  label: string
  onClose: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
    return () => dialog?.close()
  }, [])
  return (
    <dialog
      ref={ref}
      className="price-dialog"
      aria-label={label}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
    >
      {children}
    </dialog>
  )
}

function RateOption({
  rate,
  checked,
  name,
  usedBy,
  onChange,
}: {
  rate: Rate
  checked: boolean
  name: string
  usedBy: string[]
  onChange: () => void
}) {
  const validity = rateValidity(rate)
  return (
    <label className="price-rate" data-checked={checked}>
      <input type="radio" name={name} checked={checked} onChange={onChange} />
      <span>
        <strong>
          {rate.code} v{rate.version} · {rate.description}
        </strong>
        <span className="price-rate-amount">
          {rate.amount
            ? `${money(rate.amount)} per ${unitLabel(rate.unit)}`
            : 'Price hidden for your role'}
        </span>
        <small>
          {SOURCE_TYPE_LABEL[rate.source_type]}
          {rate.supplier_name && ` · ${rate.supplier_name}`}
          {rate.quote_reference && ` · Ref. ${rate.quote_reference}`} · effective{' '}
          {rate.effective_date}
        </small>
        <span className="price-rate-tags">
          <span className={`price-tag is-${validity.tone}`}>{validity.text}</span>
          {rate.includes.length > 0 && (
            <span className="price-tag">Includes {rate.includes.join(', ')}</span>
          )}
          {usedBy.length > 0 && (
            <span className="price-tag is-reuse">
              Already used for {usedBy.slice(0, 3).join(', ')}
              {usedBy.length > 3 ? ` +${usedBy.length - 3}` : ''}
            </span>
          )}
        </span>
        <details className="price-rate-more">
          <summary>Source and exclusions</summary>
          <p>Source note: {rate.source_note}</p>
          <p>Excludes: {rate.exclusions || 'Not recorded'}</p>
          <p>
            Recorded by your organisation. InfraShader has not checked this price with the supplier.
          </p>
        </details>
      </span>
    </label>
  )
}

function sortForReuse(rates: Rate[], items: WorkItem[], exceptId: string) {
  return [...rates].sort(
    (a, b) =>
      rateUsage(b.id, items, exceptId).length - rateUsage(a.id, items, exceptId).length ||
      a.code.localeCompare(b.code) ||
      b.version - a.version,
  )
}

function PriceDialog(props: {
  item: WorkItem
  data: WorkspaceData
  scenario: ScenarioKey
  revision: number
  endpoint: string
  org: string
  token: string | undefined
  basis: Rate['basis']
  developer: boolean
  preview: PricingPreview | null
  canEdit: boolean
  blocked?: string
  canAddRate: boolean
  onMaterials: () => void
  onClose: () => void
  onApply: (next: WorkspaceData, notice: string) => void
  onRate: (rate: Rate) => void
}) {
  const { item, data, scenario, basis } = props
  const [query, setQuery] = useState('')
  const { rates, total, error, add, loaded } = useRates(props.org, props.token, basis, query)
  const [rateId, setRateId] = useState<string | null>(item.rate_id)
  const [stock, setStock] = useState(item.tree_design?.stock_spec ?? '')
  const [reviewed, setReviewed] = useState(Boolean(item.tree_design?.rate_reviewed))
  const [layers, setLayers] = useState<Record<string, string | null>>(
    Object.fromEntries(item.assembly?.components.map((c) => [c.code, c.rate_id]) ?? []),
  )
  const [adding, setAdding] = useState<{ unit: string; layer?: string; from?: Rate } | null>(null)
  const layered = item.assembly?.pricing === 'components'
  const measure = props.preview?.measures[item.id]
  const unit =
    props.preview?.rows.find((row) => row.id === item.id)?.unit ??
    measure?.quantity?.calculated.unit
  const quantity = measure?.quantity?.value
  const tree = Boolean(item.tree_design)
  const treeIncomplete = tree && Boolean(rateId) && (!stock.trim() || !reviewed)
  const layerKey = JSON.stringify(layers)
  const candidate = useMemo(
    () =>
      setItemPrice(data, scenario, item.id, {
        rateId,
        stockSpec: stock,
        reviewed,
        layers: JSON.parse(layerKey) as Record<string, string | null>,
      }),
    [data, scenario, item.id, rateId, stock, reviewed, layerKey],
  )
  const changed = JSON.stringify(candidate) !== JSON.stringify(data)
  const live = usePreview(
    props.endpoint,
    props.token,
    treeIncomplete ? null : candidate,
    props.revision,
    scenario,
    true,
  )
  const candidateItem = candidate.scenarios[scenario].items.find((entry) => entry.id === item.id)!
  const candidateRows = live.preview ? rowsFor(candidateItem, live.preview.rows) : []
  const state = live.preview ? itemState(candidateItem, live.preview.rows) : null
  const subtotal = live.preview?.subtotals[item.id] ?? null
  const items = data.scenarios[scenario].items
  const options = sortForReuse(compatibleRates(rates, unit, basis), items, item.id)
  const otherUnits = rates.filter((rate) => rate.unit !== unit && !rate.archived).length
  const group = priceGroup(item)
  const Icon = groupIcon[group]
  const plantText = plantMethodText(item, measure)

  return (
    <Modal label={`Price ${item.name}`} onClose={props.onClose}>
      <header className="price-dialog-head">
        <span className="price-card-icon" aria-hidden="true">
          <Icon size={22} />
        </span>
        <div>
          <h3>Price {item.name}</h3>
          <p>
            {GROUP_LABEL[group]} · {data.scenarios[scenario].name}
            {quantity !== undefined && unit && ` · ${tidy(quantity)} ${unitLabel(unit)}`}
          </p>
        </div>
        <button type="button" onClick={props.onClose} aria-label="Close pricing">
          ×
        </button>
      </header>
      {props.blocked && <p className="price-note">{props.blocked}</p>}

      {tree && (
        <fieldset className="price-section" disabled={!props.canEdit}>
          <legend>1. What stock is being bought?</legend>
          <label>
            Purchased stock specification
            <textarea
              maxLength={500}
              value={stock}
              placeholder="Species, height or girth, pot or root-ball size, supplier grade"
              onChange={(event) => {
                setStock(event.target.value)
                setReviewed(false)
              }}
            />
          </label>
          <small>
            The 3D model is only a look. The price must match the stock you will actually buy, so
            each tree keeps its own specification.
          </small>
        </fieldset>
      )}
      {plantText && (
        <div className="price-section">
          <h4>How the quantity is worked out</h4>
          <p className="price-formula">{plantText}</p>
          <small>
            Spacing gives an estimated count for pricing. It is not a planting layout or
            horticultural advice.
          </small>
        </div>
      )}

      {layered && item.assembly ? (
        <div className="price-section">
          <h4>{tree ? '2. ' : ''}Price each layer</h4>
          {!item.assembly.approved && (
            <p className="price-note">
              This recipe is not approved yet, so its layers are not priced.{' '}
              <button type="button" onClick={props.onMaterials}>
                Review it in Materials
              </button>
            </p>
          )}
          <table className="price-layers">
            <thead>
              <tr>
                <th scope="col">Layer</th>
                <th scope="col">Quantity</th>
                <th scope="col">Rate</th>
                <th scope="col">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {item.assembly.components.map((component) => {
                const row = candidateRows.find(
                  (entry) => entry.id === `${item.id}:${component.code}`,
                )
                const fits = sortForReuse(
                  compatibleRates(rates, component.unit, basis),
                  items,
                  item.id,
                )
                const value = layers[component.code] ?? ''
                return (
                  <tr key={component.code}>
                    <th scope="row">
                      {component.name}
                      <small>{component.category}</small>
                    </th>
                    <td>
                      <span className="price-formula">
                        {layerMethodText(
                          component,
                          measure?.schedule.find((entry) => entry.code === component.code),
                        )}
                      </span>
                    </td>
                    <td>
                      <select
                        aria-label={`Rate for layer ${component.name}`}
                        disabled={!props.canEdit}
                        value={value}
                        onChange={(event) =>
                          setLayers({ ...layers, [component.code]: event.target.value || null })
                        }
                      >
                        <option value="">No price yet</option>
                        {value && !fits.some((rate) => rate.id === value) && (
                          <option value={value}>
                            {loaded ? 'Current rate (not in this list)' : 'Loading rates…'}
                          </option>
                        )}
                        {fits.map((rate) => (
                          <option key={rate.id} value={rate.id}>
                            {rate.code} v{rate.version} ·{' '}
                            {rate.amount ? money(rate.amount) : 'hidden'}/{unitLabel(rate.unit)}
                            {rate.supplier_name ? ` · ${rate.supplier_name}` : ''}
                          </option>
                        ))}
                      </select>
                      {props.canAddRate && (
                        <button
                          type="button"
                          className="price-link"
                          onClick={() => setAdding({ unit: component.unit, layer: component.code })}
                        >
                          New {rateNoun(component.unit)} rate
                        </button>
                      )}
                    </td>
                    <td>
                      {row?.total
                        ? money(row.total)
                        : row?.state === 'restricted'
                          ? 'Hidden'
                          : 'Not priced'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <small>Volume = area × thickness. Thickness and waste come from the saved recipe.</small>
        </div>
      ) : item.road ? (
        <div className="price-section">
          <h4>This road has no material layers yet</h4>
          <p className="price-note">
            A road is priced layer by layer (for example wearing course and base), never with one
            rate. Define its layers and thicknesses first, then come back to price each layer.{' '}
            <button type="button" className="price-link" onClick={props.onMaterials}>
              Define layers in Materials
            </button>
          </p>
        </div>
      ) : (
        <fieldset className="price-section" disabled={!props.canEdit}>
          <legend>{tree ? '2. ' : ''}Choose a saved rate</legend>
          {!unit ? (
            <p className="price-note">
              This item has no measured quantity yet. Save the design or check its drawing.
            </p>
          ) : (
            <>
              <label className="price-search">
                Search your rates
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Code or description"
                />
              </label>
              <p className="price-hint">
                Showing {rateNoun(unit)} rates
                {otherUnits
                  ? ` (${otherUnits} in other units are hidden because they do not fit)`
                  : ''}
                {total > rates.length
                  ? `. ${total - rates.length} more match: search to narrow.`
                  : '.'}
              </p>
              {error && <p role="alert">{error}</p>}
              <div className="price-rates" role="radiogroup" aria-label="Saved rates">
                <label className="price-rate" data-checked={!rateId}>
                  <input
                    type="radio"
                    name={`rate-${item.id}`}
                    checked={!rateId}
                    onChange={() => setRateId(null)}
                  />
                  <span>
                    <strong>No price yet</strong>
                    <small>The item stays visible as unpriced. The total stays incomplete.</small>
                  </span>
                </label>
                {loaded && rateId && !options.some((rate) => rate.id === rateId) && (
                  <p className="price-hint">
                    The current rate is not in this list (archived, another unit, or outside the
                    search).
                  </p>
                )}
                {options.map((rate) => (
                  <RateOption
                    key={rate.id}
                    rate={rate}
                    name={`rate-${item.id}`}
                    checked={rateId === rate.id}
                    usedBy={rateUsage(rate.id, items, item.id)}
                    onChange={() => {
                      setRateId(rate.id)
                      setReviewed(false)
                    }}
                  />
                ))}
                {!options.length && (
                  <p className="price-hint">No saved {rateNoun(unit)} rate yet.</p>
                )}
              </div>
              {props.canAddRate ? (
                <button type="button" className="price-link" onClick={() => setAdding({ unit })}>
                  Add a new {rateNoun(unit)} rate
                </button>
              ) : (
                <small>Your role cannot add rates. Ask someone with catalogue access.</small>
              )}
            </>
          )}
          {tree && rateId && (
            <label className="price-confirm">
              <input
                type="checkbox"
                checked={reviewed}
                onChange={(event) => setReviewed(event.target.checked)}
              />
              I checked that this rate is for the stock described above.
            </label>
          )}
        </fieldset>
      )}

      {adding && (
        <RateForm
          org={props.org}
          token={props.token}
          basis={basis}
          developer={props.developer}
          unit={adding.unit}
          from={adding.from}
          category={GROUP_LABEL[group]}
          onCancel={() => setAdding(null)}
          onCreated={(rate) => {
            add(rate)
            props.onRate(rate)
            if (adding.layer) setLayers({ ...layers, [adding.layer]: rate.id })
            else {
              setRateId(rate.id)
              setReviewed(false)
            }
            setAdding(null)
          }}
        />
      )}

      <div className="price-result" role="status" aria-live="polite">
        {treeIncomplete ? (
          'Describe the stock and confirm the rate matches it to see the subtotal.'
        ) : live.error ? (
          `Preview unavailable: ${live.error}`
        ) : !live.preview ? (
          'Calculating on the server…'
        ) : (
          <>
            {state && <StatusChip state={state.state} />}{' '}
            {subtotal !== null ? (
              <>
                Subtotal <b>{money(subtotal)}</b>
                {candidateRows.length === 1 && candidateRows[0].unit_price && (
                  <>
                    {' '}
                    = {tidy(candidateRows[0].quantity)} {unitLabel(candidateRows[0].unit)} ×{' '}
                    {money(candidateRows[0].unit_price)}
                  </>
                )}
              </>
            ) : (
              state?.why
            )}
            <small>
              Calculated by the server from your{' '}
              {changed || props.preview?.saved_revision !== props.revision ? 'unsaved ' : ''}
              draft with saved rate versions. Direct cost only; the estimate adds markup and
              charges.
            </small>
          </>
        )}
      </div>
      <footer className="price-dialog-foot">
        <button type="button" onClick={props.onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="button"
          disabled={!props.canEdit || !changed || treeIncomplete}
          onClick={() =>
            props.onApply(
              candidate,
              `${item.name} updated in your draft. Save the design to keep it.`,
            )
          }
        >
          Apply to draft
        </button>
      </footer>
    </Modal>
  )
}

function RateForm(props: {
  org: string
  token: string | undefined
  basis: Rate['basis']
  developer: boolean
  unit: string
  category: string
  from?: Rate
  onCancel: () => void
  onCreated: (rate: Rate) => void
}) {
  const [sourceType, setSourceType] = useState<Rate['source_type']>('user_entered')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const supplierNeeded = sourceType === 'supplier_quote' || sourceType === 'price_list'
  async function submit(form: HTMLFormElement) {
    const values = new FormData(form)
    setBusy(true)
    setError('')
    try {
      const rate = await request(`${props.org}/rates`, rateSchema, props.token, {
        method: 'POST',
        body: JSON.stringify({
          code: values.get('code'),
          category: values.get('category'),
          description: values.get('description'),
          unit: props.unit,
          currency: 'MYR',
          basis: props.basis,
          amount: values.get('amount'),
          effective_date: values.get('effective_date'),
          valid_until: values.get('valid_until') || null,
          source_note: values.get('source_note'),
          includes: values.getAll('includes'),
          source_type: sourceType,
          supplier_name: String(values.get('supplier_name') ?? '').trim(),
          quote_reference: String(values.get('quote_reference') ?? '').trim(),
          exclusions: String(values.get('exclusions') ?? '').trim(),
        }),
      })
      props.onCreated(rate)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The rate was not saved.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <form
      className="price-section price-rate-form"
      aria-label="New rate"
      onSubmit={(event) => {
        event.preventDefault()
        void submit(event.currentTarget)
      }}
    >
      <h4>New {rateNoun(props.unit)} rate</h4>
      <p className="price-hint">
        Saved to your organisation’s rate list as a dated version. You still choose it and apply it
        yourself. InfraShader does not check supplier prices.
      </p>
      <div className="price-form-grid">
        <label>
          Rate code
          <input name="code" required maxLength={80} defaultValue={props.from?.code} />
        </label>
        <label>
          Category
          <input
            name="category"
            required
            maxLength={80}
            defaultValue={props.from?.category ?? props.category}
          />
        </label>
        <label className="wide">
          Product or service
          <input
            name="description"
            required
            maxLength={500}
            defaultValue={props.from?.description}
          />
        </label>
        <label>
          {props.developer ? 'Indicative budget' : 'Internal cost'} (MYR per {unitLabel(props.unit)}
          )
          <input name="amount" type="number" min="0" step="0.0001" required />
        </label>
        <label>
          Effective from
          <input name="effective_date" type="date" required />
        </label>
        <label>
          Valid until (if known)
          <input name="valid_until" type="date" />
        </label>
        <label>
          Where the price came from
          <select
            value={sourceType}
            onChange={(event) => setSourceType(event.target.value as Rate['source_type'])}
          >
            {Object.entries(SOURCE_TYPE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Supplier or vendor{supplierNeeded ? '' : ' (optional)'}
          <input name="supplier_name" maxLength={200} required={supplierNeeded} />
        </label>
        <label>
          Quotation reference{sourceType === 'supplier_quote' ? '' : ' (optional)'}
          <input
            name="quote_reference"
            maxLength={120}
            required={sourceType === 'supplier_quote'}
          />
        </label>
        <fieldset className="wide">
          <legend>Already included in this price</legend>
          {['labour', 'equipment', 'transport', 'overhead'].map((category) => (
            <label key={category} className="inline">
              <input type="checkbox" name="includes" value={category} /> {category}
            </label>
          ))}
        </fieldset>
        <label className="wide">
          Not included (exclusions)
          <input
            name="exclusions"
            maxLength={2000}
            placeholder="For example: delivery beyond 20 km, VAT"
          />
        </label>
        <label className="wide">
          Source note
          <input
            name="source_note"
            required
            maxLength={2000}
            placeholder="Who gave the price, when, and how"
          />
        </label>
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="price-dialog-foot">
        <button type="button" onClick={props.onCancel}>
          Cancel
        </button>
        <button type="submit" className="button" disabled={busy}>
          Save rate
        </button>
      </div>
    </form>
  )
}

function BulkDialog(props: {
  items: WorkItem[]
  selected: string[]
  rows: ReturnType<typeof rowsFor>
  org: string
  token: string | undefined
  basis: Rate['basis']
  onClose: () => void
  onApply: (plan: ReturnType<typeof planBulkRate>, rate: Rate, treesConfirmed: boolean) => void
}) {
  const { rates } = useRates(props.org, props.token, props.basis, '')
  const [rateId, setRateId] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const units = Object.fromEntries(
    props.selected.map((id) => [id, props.rows.find((row) => row.id === id)?.unit]),
  )
  const selectedUnits = new Set(Object.values(units).filter(Boolean))
  const rate = rates.find((entry) => entry.id === rateId)
  const plan = rate ? planBulkRate(props.items, props.selected, rate, units) : null
  const stock = plan?.apply.find((item) => item.tree_design)?.tree_design?.stock_spec
  const count = plan ? plan.apply.filter((item) => !item.tree_design || confirmed).length : 0
  const listed = sortForReuse(
    rates.filter((entry) => !entry.archived && selectedUnits.has(entry.unit)),
    props.items,
    '',
  )
  return (
    <Modal label="Apply one rate to selected items" onClose={props.onClose}>
      <header className="price-dialog-head">
        <div>
          <h3>Apply one rate to {props.selected.length} selected items</h3>
          <p>Check the list before applying. Only matching items change.</p>
        </div>
        <button type="button" onClick={props.onClose} aria-label="Close">
          ×
        </button>
      </header>
      <label className="price-section">
        Rate to apply
        <select
          value={rateId}
          onChange={(event) => {
            setRateId(event.target.value)
            setConfirmed(false)
          }}
        >
          <option value="">Choose a rate</option>
          {listed.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.code} v{entry.version} · {entry.description} ·{' '}
              {entry.amount ? money(entry.amount) : 'hidden'}/{unitLabel(entry.unit)}
              {entry.supplier_name ? ` · ${entry.supplier_name}` : ''}
            </option>
          ))}
        </select>
      </label>
      {rate && (
        <p className="price-hint">
          {SOURCE_TYPE_LABEL[rate.source_type]}
          {rate.supplier_name && ` · ${rate.supplier_name}`} · {rateValidity(rate).text}
        </p>
      )}
      {plan && (
        <div className="price-plan">
          <section aria-label="Will change">
            <h4>Will change ({plan.apply.length})</h4>
            <ul>
              {plan.apply.map((item) => (
                <li key={item.id}>
                  <CircleCheck size={14} aria-hidden="true" /> {item.name}
                  {item.rate_id && item.rate_id !== rate?.id && (
                    <small> (replaces its current rate)</small>
                  )}
                </li>
              ))}
            </ul>
          </section>
          {plan.skip.length > 0 && (
            <section aria-label="Skipped">
              <h4>Skipped ({plan.skip.length})</h4>
              <ul>
                {plan.skip.map(({ item, reason }) => (
                  <li key={item.id}>
                    <CircleAlert size={14} aria-hidden="true" /> {item.name}: {reason}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {plan.trees > 0 && (
            <label className="price-confirm">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              I checked that this rate is for the purchased stock “{stock}” for these {plan.trees}{' '}
              tree{plan.trees === 1 ? '' : 's'}.
            </label>
          )}
        </div>
      )}
      <footer className="price-dialog-foot">
        <button type="button" onClick={props.onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="button"
          disabled={!plan || !rate || count === 0}
          onClick={() => plan && rate && props.onApply(plan, rate, confirmed)}
        >
          Apply to {count} item{count === 1 ? '' : 's'}
        </button>
      </footer>
    </Modal>
  )
}

/** Floating card for one selected map item: the game-style "what is this, and price it" action. */
export function SelectedPriceCard({ item, onPrice }: { item: WorkItem; onPrice: () => void }) {
  const Icon = groupIcon[priceGroup(item)]
  const layers = item.assembly?.pricing === 'components' ? item.assembly.components : null
  const status = layers
    ? `${layers.filter((c) => c.rate_id).length} of ${layers.length} layers have a rate`
    : item.rate_id
      ? 'Rate selected'
      : 'No price yet'
  return (
    <div className="price-selected" role="region" aria-label="Selected item">
      <span className="price-card-icon" aria-hidden="true">
        <Icon size={18} />
      </span>
      <span>
        <strong>{item.name}</strong>
        <small>
          {item.quantity
            ? `${tidy(item.quantity.value)} ${unitLabel(item.quantity.calculated.unit)} · `
            : ''}
          {status}
        </small>
      </span>
      <button type="button" className="button" onClick={onPrice}>
        Price this item
      </button>
    </div>
  )
}
