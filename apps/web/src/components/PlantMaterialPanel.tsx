import './studies.css'
import { useEffect, useState } from 'react'
import { csvCell } from '../services/csv'
import { z } from 'zod'
import { request } from '../services/api'
import { rateListSchema, type Rate } from '../domain/calculations'
import {
  workspaceInput,
  workspaceDataSchema,
  plantSchema,
  assemblySchema,
  type WorkspaceData,
  type WorkItem,
  type ScenarioKey,
} from '../domain/workspace'

type Props = {
  initialItemId?: string
  data: WorkspaceData
  savedRevision: number
  dirty: boolean
  scenario: ScenarioKey
  endpoint: string
  token?: string
  disabled: boolean
  onChange: (data: WorkspaceData) => void
  onInspect: (id: string) => void
  onDirty: (dirty: boolean) => void
  onWorking: (busy: boolean) => void
}
const rowSchema = z.object({
  id: z.string(),
  parent_id: z.string(),
  name: z.string(),
  section: z.string(),
  quantity: z.string(),
  unit: z.string(),
  source: z.string(),
  specification: z.string(),
  rate: z.string(),
  method: z.string(),
  status: z.string(),
  total: z.string().nullable(),
})
const reportSchema = z.object({
  revision: z.number(),
  reference_revision: z.number().nullable(),
  reference: z.string().optional(),
  rows: z.array(rowSchema),
  changes: z.array(
    z.object({
      item_id: z.string(),
      name: z.string(),
      action: z.string(),
      fields: z.array(z.string()),
      before: z.array(rowSchema),
      after: z.array(rowSchema),
      cost_difference: z.string().nullable(),
      review: z.string(),
    }),
  ),
})
const BOQ_PREVIEW_ROWS = 15
/** Display-only rounding for long calculated quantities; the saved values are unchanged. */
const tidy = (value: string | number) => {
  const number = Number(value)
  return Number.isFinite(number) ? number.toFixed(2) : String(value)
}

export default function PlantMaterialPanel(props: Props) {
  const {
    data,
    scenario,
    endpoint,
    token,
    disabled,
    onChange,
    onInspect,
    dirty,
    savedRevision,
    onDirty,
  } = props
  const [selected, setSelected] = useState(props.initialItemId ?? ''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  const [rates, setRates] = useState<Rate[]>([]),
    [report, setReport] = useState<z.infer<typeof reportSchema> | null>(null)
  const [rateQuery, setRateQuery] = useState('')
  const [rateSearch, setRateSearch] = useState('')
  const [rateTotal, setRateTotal] = useState(0)
  const [retry, setRetry] = useState(0)
  const [allRows, setAllRows] = useState(false)
  const [pending, setPending] = useState(false)
  useEffect(() => {
    onDirty(pending || busy)
    return () => onDirty(false)
  }, [pending, busy, onDirty])
  const items = data.scenarios[scenario].items,
    item = items.find((i) => i.id === selected)
  const inherited =
    scenario !== 'baseline' && data.scenarios.baseline.items.some((i) => i.id === selected)
  useEffect(() => {
    let active = true
    request(
      `${endpoint.replace(/\/projects\/.*$/, '')}/rates?limit=100&query=${encodeURIComponent(rateSearch)}`,
      rateListSchema,
      token,
    )
      .then((r) => {
        if (active) {
          setRates(r.items)
          setRateTotal(r.total)
        }
      })
      .catch((e) => {
        if (active) setError(e.message)
      })
    request(
      `${endpoint.replace(/\/workspace$/, '')}/schedule?scenario=${scenario}`,
      reportSchema,
      token,
    )
      .then((r) => {
        if (active) setReport(r)
      })
      .catch((e) => {
        if (active) setError(e.message)
      })
    return () => {
      active = false
    }
  }, [endpoint, token, scenario, savedRevision, retry, rateSearch])
  async function apply(plant: WorkItem['plant'], assembly: WorkItem['assembly']) {
    if (!item || disabled || inherited) return
    setBusy(true)
    props.onWorking(true)
    setError('')
    const next = structuredClone(data),
      target = next.scenarios[scenario].items.find((i) => i.id === item.id)!
    target.plant = plant
    target.assembly = assembly
    if (assembly?.pricing === 'components') target.rate_id = null
    try {
      onChange(
        await request(
          `${endpoint.replace(/\/workspace$/, '')}/object-preview`,
          workspaceDataSchema,
          token,
          { method: 'POST', body: JSON.stringify(workspaceInput(next, 0)) },
        ),
      )
      setPending(false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
      props.onWorking(false)
    }
  }
  function download() {
    if (!report || dirty) return
    const cell = csvCell
    const columns = [
      'id',
      'parent_id',
      'name',
      'section',
      'quantity',
      'unit',
      'method',
      'source',
      'status',
      'specification',
      'rate',
      'total',
    ] as const
    const csv = [
      ['Workspace revision', report.revision, 'Preliminary BOQ; professional verification pending']
        .map(cell)
        .join(','),
      columns.join(','),
      ...report.rows.map((r) => columns.map((c) => cell(r[c])).join(',')),
    ].join('\r\n')
    const url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })),
      a = document.createElement('a')
    a.href = url
    a.download = `schedule-${scenario}-r${report.revision}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }
  return (
    <details open className="rounded border p-4" aria-label="Planting and materials">
      <summary>Planting and materials</summary>
      <p className="materials-lede">
        Describe what each drawn item is made of. The app turns your description into quantities
        (how many plants, how much concrete) that the estimate then prices. Nothing is assumed:
        plant suitability, road design and tree shade are not judged for you.
      </p>
      <ol className="materials-help">
        <li>
          <span className="materials-num">1</span>
          <span>
            <strong>Pick an item</strong>Choose a drawn area, path or tree from the list below.
          </span>
        </li>
        <li>
          <span className="materials-num">2</span>
          <span>
            <strong>Say what it is</strong>A <em>plant</em> (species, size, spacing) or a{' '}
            <em>material recipe</em> (layers and thickness for a path, deck, fence or road).
          </span>
        </li>
        <li>
          <span className="materials-num">3</span>
          <span>
            <strong>Apply, save, then price</strong>Apply the record, save the design, then give the
            layers a price in step 3, Pricing.
          </span>
        </li>
      </ol>
      {error && <p role="alert">{error}</p>}
      <label>
        Schedule item
        <select
          value={selected}
          onChange={(e) => {
            if (!pending || window.confirm('Discard unapplied source record changes?')) {
              setSelected(e.target.value)
              setPending(false)
            }
          }}
        >
          <option value="">Choose a drawn item</option>
          {items
            .filter((i) => i.kind !== 'object')
            .map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
        </select>
      </label>
      <details className="materials-block">
        <summary>
          Find other component rates
          <small>Only needed when a layer needs a rate that is not listed in its menu.</small>
        </summary>
        <button type="button" onClick={() => setRetry((v) => v + 1)}>
          Refresh schedule and rates
        </button>
        <label>
          Find component rates
          <input value={rateQuery} onChange={(e) => setRateQuery(e.target.value)} />
        </label>
        <button type="button" onClick={() => setRateSearch(rateQuery)}>
          Search component rates
        </button>
        <p>
          {rates.length} of {rateTotal} matching active rates shown; narrow the search for other
          versions.
        </p>
      </details>
      {item && (
        <RecordEditor
          key={`${scenario}-${item.id}-${item.plant?.version}-${item.assembly?.version}`}
          item={item}
          library={items}
          rates={rates}
          disabled={disabled || busy || inherited}
          onApply={apply}
          onDirty={() => setPending(true)}
        />
      )}
      {inherited && <p>Edit this shared item in Baseline.</p>}
      {item?.schedule && (
        <table className="materials-table">
          <caption>Validated draft schedule for {item.name}</caption>
          <thead>
            <tr>
              <th>Component</th>
              <th>Quantity</th>
              <th>Method / source</th>
              <th>Pricing</th>
            </tr>
          </thead>
          <tbody>
            {item.schedule.map((r) => (
              <tr key={r.code}>
                <td>
                  {r.code} — {r.description}
                </td>
                <td>
                  {r.value} {r.unit}
                </td>
                <td>
                  {r.method}; source {Number(r.source_quantity).toFixed(4)} {r.source_unit}; surface{' '}
                  {r.surface_m2 ? Number(r.surface_m2).toFixed(4) : 'n/a'} m²
                </td>
                <td>
                  {r.priced
                    ? r.rate_id
                      ? 'Rate selected'
                      : 'Unpriced'
                    : 'Included in parent rate'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <details className="materials-block" open>
        <summary>
          Quantity list (BOQ) and what changed
          <small>
            The saved list of quantities, readiness of each line and changes since the last save.
          </small>
        </summary>
        <h4>Saved preliminary BOQ — revision {report?.revision ?? 'unavailable'}</h4>
        {dirty && (
          <p role="status">
            Draft changed: save and recalculate. The saved schedule below is stale for your draft.
          </p>
        )}
        <button type="button" disabled={!report || dirty} onClick={download}>
          Export saved BOQ CSV
        </button>
        <div className="table-scroll">
          <table className="materials-table">
            <thead>
              <tr>
                <th>Item / section</th>
                <th>Quantity</th>
                <th>Method</th>
                <th>Readiness</th>
                <th>Base line amount (MYR)</th>
                <th>Map</th>
              </tr>
            </thead>
            <tbody>
              {(allRows ? report?.rows : report?.rows.slice(0, BOQ_PREVIEW_ROWS))?.map((r) => (
                <tr key={r.id}>
                  <td>
                    {r.name} / {r.section}
                  </td>
                  <td>
                    {tidy(r.quantity)} {r.unit}
                  </td>
                  <td className="materials-method">{r.method}</td>
                  <td>
                    <span>{r.status}</span>
                    <br />
                    {r.rate}
                  </td>
                  <td>{r.total ?? 'Unavailable'}</td>
                  <td>
                    <button type="button" onClick={() => onInspect(r.parent_id)}>
                      Locate {r.name}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {(report?.rows.length ?? 0) > BOQ_PREVIEW_ROWS && (
          <button type="button" className="materials-more" onClick={() => setAllRows(!allRows)}>
            {allRows
              ? `Show only the first ${BOQ_PREVIEW_ROWS} lines`
              : `Show all ${report?.rows.length} lines`}
          </button>
        )}
        <p>
          Base line amounts exclude selling adjustments and additional estimate charges. Existing
          items are context, not proposed billable scope. Complete estimates remain in the pricing
          panel.
        </p>
        <h4>
          Change impact since {report?.reference ?? 'previous save'} (revision{' '}
          {report?.reference_revision ?? 'none'})
        </h4>
        {report?.changes.map((c) => (
          <article key={c.item_id}>
            <strong>
              {c.name}: {c.action}
            </strong>
            <p>
              Inputs: {c.fields.join(', ')}. Before:{' '}
              {c.before.map((r) => `${r.quantity} ${r.unit}`).join('; ') || 'none'} → After:{' '}
              {c.after.map((r) => `${r.quantity} ${r.unit}`).join('; ') || 'none'}. Base cost
              difference: {c.cost_difference ?? 'unpriced/restricted'} MYR.
            </p>
            <p>{c.review}</p>
          </article>
        ))}
      </details>
    </details>
  )
}

function RecordEditor({
  item,
  library,
  rates,
  disabled,
  onApply,
  onDirty,
}: {
  item: WorkItem
  library: WorkItem[]
  rates: Rate[]
  disabled: boolean
  onDirty: () => void
  onApply: (p: WorkItem['plant'], a: WorkItem['assembly']) => void
}) {
  const [mode, setMode] = useState(item.assembly || item.road ? 'material' : 'plant')
  const [plant, setPlantData] = useState<z.infer<typeof plantSchema>>(
    item.plant ?? {
      code: '',
      version: 1,
      scientific_name: '',
      common_name: '',
      source: '',
      nursery_size: '',
      current_crown_m: 0,
      mature_crown_m: 0,
      spacing_m: 1,
      method: 'explicit_count',
      sun_water: 'Unverified — supply source',
      suitability: 'Unverified — local review pending',
      maintenance: 'Unspecified',
      availability_date: null,
      substitution: '',
    },
  )
  const [assembly, setAssemblyData] = useState<z.infer<typeof assemblySchema>>(
    item.assembly ?? {
      code: '',
      version: 1,
      use: item.road ? 'road' : 'paving',
      material: '',
      finish: '',
      source: '',
      width_m: 1,
      height_m: 1,
      approved: false,
      pricing: item.road ? 'components' : 'inclusive',
      components: [
        {
          code: 'surface',
          name: 'Finish layer',
          category: 'material',
          basis: item.road ? 'volume' : 'surface',
          unit: item.road ? 'm3' : 'm2',
          factor: 1,
          thickness_mm: 0,
          wastage_percent: 0,
          rate_id: null,
        },
      ],
    },
  )
  const setPlant = (next: z.infer<typeof plantSchema>) => {
    setPlantData(next)
    onDirty()
  }
  const setAssembly = (next: z.infer<typeof assemblySchema>) => {
    setAssemblyData(next)
    onDirty()
  }
  const roadComponentOptions: Record<string, readonly string[]> = {
    basis: ['volume'],
    unit: ['m3'],
    category: ['material'],
  }
  return (
    <fieldset disabled={disabled} onChange={onDirty}>
      <legend>Source record / recipe for {item.name}</legend>
      <label>
        Record type
        <select value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="plant">Planting</option>
          <option value="material">Hardscape</option>
        </select>
      </label>
      <label>
        Reuse project library record
        <select
          value=""
          onChange={(e) => {
            const source = library.find((i) => i.id === e.target.value)
            if (source?.plant) {
              setPlant(structuredClone(source.plant))
              setMode('plant')
            }
            if (source?.assembly) {
              setAssembly(structuredClone(source.assembly))
              setMode('material')
            }
          }}
        >
          <option value="">Choose an existing sourced record</option>
          {library
            .filter((i) => i.plant || i.assembly)
            .map((i) => (
              <option key={i.id} value={i.id}>
                {i.name} — {i.plant?.code ?? i.assembly?.code}
              </option>
            ))}
        </select>
      </label>
      {mode === 'plant' ? (
        <>
          {(
            [
              'code',
              'scientific_name',
              'common_name',
              'source',
              'nursery_size',
              'sun_water',
              'suitability',
              'maintenance',
              'substitution',
            ] as const
          ).map((k) => (
            <label key={k}>
              {`Plant ${k.replaceAll('_', ' ')}`}
              <input
                value={plant[k]}
                onChange={(e) => setPlant({ ...plant, [k]: e.target.value })}
              />
            </label>
          ))}
          {(['current_crown_m', 'mature_crown_m', 'spacing_m'] as const).map((k) => (
            <label key={k}>
              {`Plant ${k.replaceAll('_', ' ')}`}
              <input
                type="number"
                min="0"
                step="any"
                value={plant[k]}
                onChange={(e) => setPlant({ ...plant, [k]: Number(e.target.value) })}
              />
            </label>
          ))}
          <label>
            Plant count method
            <select
              value={plant.method}
              onChange={(e) =>
                setPlant({ ...plant, method: e.target.value as typeof plant.method })
              }
            >
              <option value="explicit_count">Explicit count on count item</option>
              <option value="square_spacing">
                Ceiling(area / spacing²), nominal square layout
              </option>
              <option value="line_spacing">Ceiling(length / spacing) + 1, both endpoints</option>
            </select>
          </label>
          <label>
            Plant availability date
            <input
              type="date"
              value={plant.availability_date ?? ''}
              onChange={(e) => setPlant({ ...plant, availability_date: e.target.value || null })}
            />
          </label>
          <p>
            Spacing counts are nominal procurement counts, not a collision-free planting layout.
            Verify boundaries, obstacles and horticulture.
          </p>
        </>
      ) : (
        <>
          {(['code', 'material', 'finish', 'source'] as const).map((k) => (
            <label key={k}>
              {`Assembly ${k}`}
              <input
                value={assembly[k]}
                onChange={(e) => setAssembly({ ...assembly, [k]: e.target.value, approved: false })}
              />
            </label>
          ))}
          <label>
            Assembly use
            <select
              value={assembly.use}
              onChange={(e) => {
                const use = e.target.value as typeof assembly.use
                setAssembly({
                  ...assembly,
                  use,
                  pricing: use === 'road' ? 'components' : assembly.pricing,
                  approved: false,
                  components:
                    use === 'road'
                      ? assembly.components.map((component) => ({
                          ...component,
                          category: 'material',
                          basis: 'volume',
                          unit: 'm3',
                          thickness_mm: component.thickness_mm,
                          rate_id: null,
                        }))
                      : assembly.components,
                })
              }}
            >
              <option value="paving">Paving</option>
              <option value="edging">Edging</option>
              <option value="deck">Deck</option>
              <option value="fence">Fence</option>
              <option value="road" disabled={item.kind !== 'area'}>
                Road / driveway layered pavement (drawn area only)
              </option>
            </select>
          </label>
          {assembly.use === 'road' ? (
            <p>
              Draw a polygon for the proposed road surface. Define every material layer and its
              thickness; quantity is plan area × thickness / 1,000 in m³. Use an m³ rate or leave
              the layer unpriced. No default road standard, compaction/density conversion,
              earthworks, drainage design, authority check, or engineering certification is
              supplied.
            </p>
          ) : (
            (['width_m', 'height_m'] as const).map((k) => (
              <label key={k}>
                {`Assembly ${k}`}
                <input
                  type="number"
                  step="any"
                  value={assembly[k]}
                  onChange={(e) =>
                    setAssembly({ ...assembly, [k]: Number(e.target.value), approved: false })
                  }
                />
              </label>
            ))
          )}
          {assembly.use === 'road' ? (
            <p>Road layers use separate component rates so each included layer stays visible.</p>
          ) : (
            <label>
              Assembly pricing
              <select
                value={assembly.pricing}
                onChange={(e) =>
                  setAssembly({
                    ...assembly,
                    pricing: e.target.value as typeof assembly.pricing,
                    approved: false,
                    components: assembly.components.map((c) => ({ ...c, rate_id: null })),
                  })
                }
              >
                <option value="inclusive">Parent inclusive rate only</option>
                <option value="components">Component rates only</option>
              </select>
            </label>
          )}
          {assembly.components.map((c, index) => (
            <fieldset key={index}>
              <legend>Recipe component {index + 1}</legend>
              {Object.entries(c)
                .filter(([k]) => !['rate_id', 'basis', 'unit', 'category'].includes(k))
                .map(([k, v]) => (
                  <label key={k}>
                    {`Component ${index + 1} ${k}`}
                    <input
                      type={typeof v === 'number' ? 'number' : 'text'}
                      step="any"
                      value={v ?? ''}
                      onChange={(e) =>
                        setAssembly({
                          ...assembly,
                          approved: false,
                          components: assembly.components.map((old, i) =>
                            i === index
                              ? {
                                  ...old,
                                  [k]:
                                    typeof v === 'number' ? Number(e.target.value) : e.target.value,
                                }
                              : old,
                          ),
                        })
                      }
                    />
                  </label>
                ))}
              {(
                [
                  ['basis', ['surface', 'volume', 'length', 'per_surface', 'fixed']],
                  ['unit', ['m2', 'm3', 'm', 'item', 'h']],
                  ['category', ['material', 'labour', 'equipment', 'transport', 'overhead']],
                ] as const
              ).map(([key, options]) => (
                <label key={key}>
                  {`Component ${index + 1} ${key}`}
                  <select
                    value={c[key]}
                    onChange={(e) =>
                      setAssembly({
                        ...assembly,
                        approved: false,
                        components: assembly.components.map((old, i) =>
                          i === index ? { ...old, [key]: e.target.value } : old,
                        ),
                      })
                    }
                  >
                    {(assembly.use === 'road' ? roadComponentOptions[key] : options).map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
              ))}
              <label>
                Component {index + 1} rate
                <select
                  disabled={assembly.pricing === 'inclusive'}
                  value={c.rate_id ?? ''}
                  onChange={(e) =>
                    setAssembly({
                      ...assembly,
                      components: assembly.components.map((old, i) =>
                        i === index ? { ...old, rate_id: e.target.value || null } : old,
                      ),
                    })
                  }
                >
                  <option value="">Unpriced</option>
                  {c.rate_id && !rates.some((r) => r.id === c.rate_id) && (
                    <option value={c.rate_id}>
                      Assigned version outside current search; retained
                    </option>
                  )}
                  {rates
                    .filter((r) => r.unit === c.unit)
                    .map((r) => (
                      <option value={r.id} key={r.id}>
                        {r.code} v{r.version} / {r.currency} {r.unit} / {r.basis} / source{' '}
                        {r.source_note} / effective {r.effective_date}
                        {r.valid_until ? ` / valid to ${r.valid_until}` : ' / validity not stated'}
                      </option>
                    ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() =>
                  setAssembly({
                    ...assembly,
                    approved: false,
                    components: assembly.components.filter((_, i) => i !== index),
                  })
                }
              >
                Remove component {index + 1}
              </button>
            </fieldset>
          ))}
          <button
            type="button"
            disabled={assembly.components.length >= 20}
            onClick={() =>
              setAssembly({
                ...assembly,
                approved: false,
                components: [
                  ...assembly.components,
                  {
                    code: `C${assembly.components.length + 1}`,
                    name: 'New component',
                    category: 'material',
                    basis: 'surface',
                    unit: 'm2',
                    factor: 1,
                    thickness_mm: 0,
                    wastage_percent: 0,
                    rate_id: null,
                  },
                ],
              })
            }
          >
            Add recipe component
          </button>
          <label>
            <input
              type="checkbox"
              checked={assembly.approved}
              onChange={(e) => setAssembly({ ...assembly, approved: e.target.checked })}
            />
            I reviewed and approve this quantity recipe
          </label>
          <p>
            Volume = surface × thickness_mm / 1000. per_surface factor declares unit/m²; fixed
            factor declares units per item. Wastage is applied once per material component.
          </p>
        </>
      )}
      <button
        type="button"
        onClick={() =>
          onApply(mode === 'plant' ? plant : null, mode === 'material' ? assembly : null)
        }
      >
        Validate and apply source record
      </button>
      <button type="button" onClick={() => onApply(null, null)}>
        Remove source record
      </button>
    </fieldset>
  )
}
