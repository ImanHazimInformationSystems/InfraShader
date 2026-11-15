import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import type { Feature, Geometry } from 'geojson'
import type { Project } from '../domain/projects'
import type { ScenarioKey, WorkspaceData } from '../domain/workspace'
import { request } from '../services/api'
import { Button } from './ui/button'

const feature = z.object({
  type: z.literal('Feature'),
  geometry: z.object({
    type: z.enum(['Polygon', 'MultiPolygon']),
    coordinates: z.array(z.unknown()),
  }),
  properties: z.object({
    kind: z.literal('shadow'),
    coverage_percent: z.number(),
    color: z.string(),
  }),
})
const contribution = z.object({
  existing: z.number(),
  additional_buildings: z.number(),
  additional_canopies: z.number(),
})
const studySchema = z.object({
  id: z.string(),
  workspace_revision: z.number(),
  project_revision: z.number(),
  stale: z.boolean(),
  created_at: z.string(),
  payload: z.object({
    method: z.string(),
    metric_crs: z.string(),
    engine_versions: z.record(z.string(), z.string()),
    target: z.object({
      id: z.string(),
      name: z.string(),
      area_m2: z.number(),
      source_note: z.string(),
    }),
    supported_minutes: z.number(),
    night_minutes: z.number(),
    low_sun_minutes: z.number(),
    complete: z.boolean(),
    request: z.object({
      bands: z.array(z.object({ name: z.string(), start: z.string(), end: z.string() })),
      step_minutes: z.number(),
    }),
    samples: z.array(
      z.object({
        band: z.string(),
        timestamp: z.string(),
        minutes: z.number(),
        status: z.string(),
        solar: z.object({ elevation_deg: z.number(), azimuth_deg: z.number() }),
        scenarios: z.record(
          z.string(),
          z.object({
            area_m2: z.number(),
            coverage_percent: z.number(),
            contributions_m2: contribution,
          }),
        ),
      }),
    ),
    scenarios: z.record(
      z.string(),
      z.object({
        name: z.string(),
        mean_coverage_percent: z.number().nullable(),
        shaded_area_hours: z.number(),
        contributions_area_hours: contribution,
        heatmap: z.array(feature),
      }),
    ),
    sources: z.array(
      z.object({
        id: z.string(),
        scenario: z.string(),
        name: z.string(),
        kind: z.string(),
        standalone_area_hours: z.number(),
        height_m: z.number(),
        height_source: z.string(),
        source_note: z.string(),
        provenance: z.string(),
      }),
    ),
    excluded: z.array(z.string()),
    limitations: z.array(z.string()),
  }),
})
type Study = z.infer<typeof studySchema>
function Heatmap({ features }: { features: z.infer<typeof feature>[] }) {
  const polygons = features.flatMap((f) =>
    (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates).map(
      (rings) => ({
        rings: rings as number[][][],
        color: f.properties.color,
        value: f.properties.coverage_percent,
      }),
    ),
  )
  const points = polygons.flatMap((p) => p.rings.flat())
  if (!points.length) return <p>No supported daylight heatmap.</p>
  const xs = points.map((p) => p[0]),
    ys = points.map((p) => p[1])
  const west = Math.min(...xs),
    south = Math.min(...ys),
    width = Math.max(...xs) - west,
    height = Math.max(...ys) - south
  return (
    <svg
      viewBox="0 0 400 250"
      role="img"
      aria-label="Target shade heatmap schematic"
      className="w-full max-w-lg rounded border"
    >
      {polygons.map((p, i) => (
        <path
          key={i}
          fill={p.color}
          stroke="#ffffff"
          strokeWidth="0.4"
          fillRule="evenodd"
          d={p.rings
            .map(
              (r) =>
                r
                  .map(
                    (v, j) =>
                      `${j ? 'L' : 'M'}${10 + ((v[0] - west) / width) * 380},${240 - ((v[1] - south) / height) * 230}`,
                  )
                  .join(' ') + 'Z',
            )
            .join(' ')}
        >
          <title>{p.value.toFixed(1)}% mean area coverage in this cell</title>
        </path>
      ))}
    </svg>
  )
}

export default function ShadeStudies({
  project,
  token,
  data,
  revision,
  dirty,
  scenario,
  onShowShadows,
  onDirty,
}: {
  project: Project
  token?: string
  data: WorkspaceData
  revision: number
  dirty: boolean
  scenario: ScenarioKey
  onShowShadows: (features: Feature[], revision: number) => void
  onDirty: (value: boolean) => void
}) {
  const today = new Date().toISOString().slice(0, 10)
  const [bands, setBands] = useState([
    { name: 'Morning use', start: `${today}T09:00:00+08:00`, end: `${today}T12:00:00+08:00` },
  ])
  const [step, setStep] = useState(60),
    [target, setTarget] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  const [studies, setStudies] = useState<Study[]>([]),
    [selected, setSelected] = useState(''),
    [changed, setChanged] = useState(false)
  const endpoint = `/api/v1/organisations/${project.organisation_id}/projects/${project.id}/shade-studies`
  useEffect(() => {
    onDirty(changed)
    return () => onDirty(false)
  }, [changed, onDirty])
  useEffect(() => {
    const controller = new AbortController()
    void request(endpoint, z.object({ items: z.array(studySchema) }), token, {
      signal: controller.signal,
    })
      .then((value) => {
        if (!controller.signal.aborted) setStudies(value.items)
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message)
      })
    return () => controller.abort()
  }, [endpoint, token, revision, project.revision])
  const study = studies.find((s) => s.id === selected) ?? studies[0]
  const stale = Boolean(
    study &&
    (dirty ||
      study.stale ||
      study.workspace_revision !== revision ||
      study.project_revision !== project.revision),
  )
  const result = study?.payload.scenarios[scenario]
  const overlay = useRef(onShowShadows)
  useEffect(() => {
    overlay.current = onShowShadows
  }, [onShowShadows])
  useEffect(() => {
    overlay.current([], revision)
  }, [dirty, revision, project.revision, scenario, selected])
  async function run() {
    setBusy(true)
    setError('')
    try {
      const saved = await request(endpoint, studySchema, token, {
        method: 'POST',
        body: JSON.stringify({
          expected_revision: revision,
          request_key: crypto.randomUUID(),
          target_id: target || data.targets[0]?.id,
          bands,
          step_minutes: step,
        }),
      })
      setStudies((previous) => [saved, ...previous].slice(0, 30))
      setSelected(saved.id)
      setChanged(false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <section
      aria-label="Shade and use-time studies"
      className="paper p-4 my-5 [overflow-wrap:anywhere]"
    >
      <h3>Shade and use-time studies</h3>
      <p>
        Saved target, shared Baseline and both options. Flat-ground geometric shade only—not
        temperature or thermal comfort.
      </p>
      <fieldset disabled={busy || !project.capabilities?.includes('analyse') || project.archived}>
        <label>
          Study target
          <select
            value={target || data.targets[0]?.id || ''}
            onChange={(e) => {
              setTarget(e.target.value)
              setChanged(true)
            }}
          >
            {data.targets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <p>
          Enter ISO date/time with an explicit UTC offset, for example +08:00. This avoids ambiguous
          daylight-saving times. Maximum four non-overlapping bands and 32 midpoint samples.
        </p>
        {bands.map((band, index) => (
          <div key={index} className="grid gap-2 my-3 md:grid-cols-3">
            {(['name', 'start', 'end'] as const).map((field) => (
              <label key={field}>
                Band {index + 1} {field}
                <input
                  value={band[field]}
                  onChange={(e) => {
                    setBands(
                      bands.map((b, i) => (i === index ? { ...b, [field]: e.target.value } : b)),
                    )
                    setChanged(true)
                  }}
                />
              </label>
            ))}
            <Button
              variant="outline"
              disabled={bands.length === 1}
              onClick={() => {
                setBands(bands.filter((_, i) => i !== index))
                setChanged(true)
              }}
            >
              Remove band {index + 1}
            </Button>
          </div>
        ))}
        <Button
          variant="outline"
          disabled={bands.length === 4}
          onClick={() => {
            setBands([...bands, { name: 'Additional use', start: '', end: '' }])
            setChanged(true)
          }}
        >
          Add use-time band
        </Button>
        <label>
          Sampling step (minutes)
          <input
            type="number"
            min="15"
            max="120"
            value={step}
            onChange={(e) => {
              setStep(Number(e.target.value))
              setChanged(true)
            }}
          />
        </label>
        <Button disabled={dirty || !revision || !data.targets.length} onClick={() => void run()}>
          {busy ? 'Calculating study...' : 'Calculate & save study'}
        </Button>
        {dirty && <p>Save workspace changes before running a study.</p>}
      </fieldset>
      {error && <p role="alert">{error}</p>}
      {studies.length > 0 && (
        <label>
          Saved shade study
          <select value={study?.id ?? ''} onChange={(e) => setSelected(e.target.value)}>
            {studies.map((s) => (
              <option key={s.id} value={s.id}>
                {s.payload.target.name} · {s.created_at} · workspace {s.workspace_revision}
              </option>
            ))}
          </select>
        </label>
      )}
      {study && result && (
        <>
          <p role="status">
            {stale
              ? 'Stale study — saved history only. Recalculate for current geometry.'
              : study.payload.complete
                ? 'Study saved — supported daylight summary.'
                : 'Partial/unavailable study — unsupported periods are not zero shade.'}
          </p>
          <p>
            Supported daylight: {study.payload.supported_minutes} min; night:{' '}
            {study.payload.night_minutes} min; low sun: {study.payload.low_sun_minutes} min. Step:{' '}
            {study.payload.request.step_minutes} min. Historical input bands:{' '}
            {study.payload.request.bands.map((b) => `${b.name}: ${b.start} to ${b.end}`).join('; ')}
            .
          </p>
          <div className="grid gap-3 md:grid-cols-3">
            {Object.entries(study.payload.scenarios).map(([key, r]) => (
              <article key={key} className="border rounded p-3">
                <h4>{r.name}</h4>
                <p>
                  {r.mean_coverage_percent === null
                    ? 'Unavailable'
                    : `${r.mean_coverage_percent.toFixed(1)}% mean target shade`}
                </p>
                <p>{r.shaded_area_hours.toFixed(2)} m²·h shaded area-time</p>
                <p>
                  Baseline {r.contributions_area_hours.existing.toFixed(2)}; additional buildings{' '}
                  {r.contributions_area_hours.additional_buildings.toFixed(2)}; additional canopies{' '}
                  {r.contributions_area_hours.additional_canopies.toFixed(2)} m²·h.
                </p>
              </article>
            ))}
          </div>
          <h4>{result.name}: target heatmap</h4>
          <Heatmap features={result.heatmap} />
          <p>
            Light to dark: 0–25%, 25–50%, 50–75%, 75–100% mean cell-area coverage. Schematic, not to
            scale. Night and low sun excluded from the denominator.
          </p>
          <Button
            variant="outline"
            disabled={stale || !result.heatmap.length}
            onClick={() =>
              onShowShadows(
                result.heatmap.map((f) => ({ ...f, geometry: f.geometry as Geometry })),
                study.workspace_revision,
              )
            }
          >
            Show study heatmap on site plan
          </Button>
          <details open>
            <summary>Time chart and numerical samples</summary>
            <div className="overflow-x-auto">
              <table className="min-w-[720px] [overflow-wrap:normal]">
                <thead>
                  <tr>
                    <th>Band / midpoint (UTC)</th>
                    <th>Weight</th>
                    <th>Sun elevation</th>
                    <th>Status</th>
                    {Object.values(study.payload.scenarios).map((r) => (
                      <th key={r.name}>{r.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {study.payload.samples.map((s, i) => (
                    <tr key={i}>
                      <td>
                        {s.band}
                        <br />
                        {s.timestamp}
                      </td>
                      <td>{s.minutes} min</td>
                      <td>{s.solar.elevation_deg.toFixed(1)}°</td>
                      <td>{s.status}</td>
                      {Object.keys(study.payload.scenarios).map((key) => (
                        <td key={key}>
                          {s.scenarios[key] ? (
                            <>
                              <meter
                                aria-label={`${s.band} sample ${i + 1} ${key} shade`}
                                min="0"
                                max="100"
                                value={s.scenarios[key].coverage_percent}
                              />
                              {s.scenarios[key].coverage_percent.toFixed(1)}%<br />
                              {s.scenarios[key].area_m2.toFixed(2)} m²
                            </>
                          ) : (
                            'Unavailable'
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <details>
            <summary>Sources, method and exclusions</summary>
            <p>
              Target: {study.payload.target.name}, {study.payload.target.area_m2.toFixed(2)} m²;
              source: {study.payload.target.source_note}. CRS: {study.payload.metric_crs}. Method:{' '}
              {study.payload.method}. Engines: {JSON.stringify(study.payload.engine_versions)}.
            </p>
            {study.payload.sources.map((s, i) => (
              <p key={i}>
                {s.scenario}: {s.name} ({s.kind}, {s.id}) — {s.height_m} m; standalone supported
                area-time: {s.standalone_area_hours.toFixed(2)} m2 h (overlaps, do not sum); height
                source: {s.height_source}; geometry source: {s.source_note}; {s.provenance}.
              </p>
            ))}
            <p>
              Excluded vegetation/decorative presets:{' '}
              {study.payload.excluded.join(', ') || 'None listed'}.
            </p>
            <ul>
              {study.payload.limitations.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </details>
        </>
      )}
    </section>
  )
}
