import { useState } from 'react'
import { z } from 'zod'
import { request } from '../services/api'
import { workspaceInput, type WorkspaceData, type ScenarioKey } from '../domain/workspace'
import {
  groundHeight,
  contours,
  sculpt,
  slope,
  terrainChanged,
  pondOutline,
  pondCovers,
  type Terrain,
  type Brush,
} from '../domain/terrain'

type Props = {
  data: WorkspaceData
  scenario: ScenarioKey
  endpoint: string
  token?: string
  disabled: boolean
  onChange: (data: WorkspaceData) => void
}
export default function TerrainPanel({
  data,
  scenario,
  endpoint,
  token,
  disabled,
  onChange,
}: Props) {
  const t = data.scenarios[scenario].terrain
  const [datum, setDatum] = useState(''),
    [source, setSource] = useState(''),
    [base, setBase] = useState(0),
    [size, setSize] = useState(17)
  const [mode, setMode] = useState<Brush>('raise'),
    [radius, setRadius] = useState(30),
    [strength, setStrength] = useState(1),
    [level, setLevel] = useState(0),
    [falloff, setFalloff] = useState(true)
  const [region, setRegion] = useState([2, 2, 6, 6]),
    [point, setPoint] = useState([4, 4]),
    [water, setWater] = useState(0),
    [pondName, setPondName] = useState('Concept pond')
  const [before, setBefore] = useState(false),
    [colour, setColour] = useState('height'),
    [interval, setInterval] = useState(1),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  function update(value: Terrain | null) {
    setError('')
    const next = structuredClone(data)
    next.scenarios[scenario].terrain = value
    onChange(next)
  }
  async function create() {
    setBusy(true)
    setError('')
    try {
      if (!Number.isFinite(base) || base < -500 || base > 9000)
        throw new Error('Starting elevation must be -500 to 9000 m.')
      if (datum.trim().length < 3 || source.trim().length < 3)
        throw new Error('Declare the vertical datum and source/assumption before creating terrain.')
      const frame = await request(
        `${endpoint.replace(/\/workspace$/, '')}/terrain-frame`,
        z.object({
          metric_crs: z.string(),
          bounds: z.tuple([z.number(), z.number(), z.number(), z.number()]),
        }),
        token,
        { method: 'POST', body: JSON.stringify(workspaceInput(data, 0)) },
      )
      if (frame.bounds[2] - frame.bounds[0] > 2000 || frame.bounds[3] - frame.bounds[1] > 2000)
        throw new Error(
          'Concept terrain supports a frame up to 2 km per side. Use a smaller site boundary.',
        )
      update({
        ...frame,
        datum,
        source,
        size,
        base_elevation: base,
        heights: Array(size * size).fill(base),
        ponds: [],
      })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  function apply(x: number, y: number, selected = false) {
    if (!t || disabled || before) return
    if (
      !Number.isFinite(radius) ||
      radius <= 0 ||
      !Number.isFinite(strength) ||
      strength < 0 ||
      !Number.isFinite(level)
    ) {
      setError('Enter finite brush values and a positive radius.')
      return
    }
    update(sculpt(t, x, y, mode, radius, strength, level, falloff, selected ? region : undefined))
  }
  function pond() {
    if (!t) return
    const [a, b, c, d] = region
    if (!(a < c && b < d && a >= 0 && b >= 0 && c < t.size && d < t.size)) {
      setError('Select a non-empty rectangular region within the grid.')
      return
    }
    if (!pondName.trim() || !Number.isFinite(water) || water <= level || t.ponds.length >= 8) {
      setError('Name the pond, set water above bed elevation, and keep at most eight ponds.')
      return
    }
    const next = sculpt(t, 0, 0, 'flatten', 1, 1, level, false, region)
    next.ponds.push({ name: pondName.trim(), region: [a, b, c, d], water_level: water })
    update(next)
  }
  const visible = t
    ? { ...t, heights: before ? t.reference_heights ?? t.heights.map(() => t.base_elevation) : t.heights }
    : null
  const min = visible ? Math.min(...visible.heights) : 0,
    max = visible ? Math.max(...visible.heights) : 0
  const fill = (x: number, y: number) => {
    if (!visible) return '#dbe7bf'
    const ratio =
      colour === 'slope'
        ? Math.min(1, slope(visible, x, y) / 45)
        : (visible.heights[y * visible.size + x] - min) / Math.max(1, max - min)
    return `hsl(${110 - ratio * 75} 35% ${75 - ratio * 30}%)`
  }
  const contour = visible ? contours(visible, interval) : null
  const verticalScale = Math.min(
    4,
    100 /
      Math.max(
        1,
        Math.abs(max - (t?.base_elevation ?? 0)),
        Math.abs(min - (t?.base_elevation ?? 0)),
      ),
  )
  const iso = (x: number, y: number, h: number) =>
    `${320 + ((x - y) * 240) / ((t?.size ?? 17) - 1)},${55 + ((x + y) * 135) / ((t?.size ?? 17) - 1) - (h - (t?.base_elevation ?? 0)) * verticalScale}`
  const number = (
    label: string,
    value: number,
    set: (v: number) => void,
    minValue?: number,
    maxValue?: number,
  ) => (
    <label key={label}>
      {label}
      <input
        type="number"
        value={value}
        min={minValue}
        max={maxValue}
        step="any"
        onChange={(e) => set(Number(e.target.value))}
      />
    </label>
  )
  return (
    <details open className="rounded border p-4" aria-label="Terrain sculpting and concept ponds">
      <summary>Terrain sculpting and concept ponds · L06</summary>
      <p>
        Heights use your declared datum. Ordinary work quantities remain planimetric. Use Ground
        quantities & rain test for model-relative cut/fill, pond storage and surface-water routing.
        These controls do not provide flood certification or stability analysis.
      </p>
      <p>
        Editing: <strong>{data.scenarios[scenario].name}</strong>. Each scenario has an independent
        terrain grid. Use workspace Undo/Redo, then save to retain a revision.
      </p>
      {error && <p role="alert">{error}</p>}
      {!t ? (
        <fieldset disabled={disabled || busy}>
          <legend>Create an explicit flat starting surface</legend>
          <label>
            Vertical datum
            <input
              value={datum}
              onChange={(e) => setDatum(e.target.value)}
              placeholder="e.g. assumed local site datum; not surveyed"
            />
          </label>
          <label>
            Terrain source or assumption
            <input value={source} onChange={(e) => setSource(e.target.value)} />
          </label>
          {number('Starting elevation (m)', base, setBase, -500, 9000)}
          <label>
            Grid nodes per side
            <select value={size} onChange={(e) => setSize(Number(e.target.value))}>
              {[9, 17, 33].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
          <button type="button" onClick={create}>
            Create concept terrain
          </button>
        </fieldset>
      ) : (
        <>
          <p>
            {t.datum} · {t.metric_crs} · {t.size} × {t.size} nodes · resolution{' '}
            {((t.bounds[2] - t.bounds[0]) / (t.size - 1)).toFixed(2)} ×{' '}
            {((t.bounds[3] - t.bounds[1]) / (t.size - 1)).toFixed(2)} m. Source: {t.source}
          </p>
          {terrainChanged(t) && (
            <p role="status">Edited terrain: flat-ground shade analysis is blocked.</p>
          )}
          <label>
            <input type="checkbox" checked={before} onChange={(e) => setBefore(e.target.checked)} />
            {t.reference_heights ? 'Show supplied starting ground (before)' : 'Show original flat surface (before)'}
          </label>
          <label>
            Terrain colours
            <select value={colour} onChange={(e) => setColour(e.target.value)}>
              <option value="height">Elevation</option>
              <option value="slope">Slope</option>
            </select>
          </label>
          <p>
            Elevation {min.toFixed(2)}–{max.toFixed(2)} m. Slope colours: green 0°, amber 45° or
            steeper. Contours every {contour?.step.toFixed(2)} m (maximum 20 levels). North is up.
            Rectangular frame encloses the site boundary.
          </p>
          {number('Contour interval (m)', interval, (v) => setInterval(Math.max(0.1, v)), 0.1)}
          <svg
            viewBox={`0 0 ${t.size * 20} ${t.size * 20}`}
            style={{ maxHeight: 400, width: '100%' }}
            role="img"
            aria-label="Interactive terrain height grid"
          >
            {visible!.heights.map((h, i) => {
              const x = i % t.size,
                y = Math.floor(i / t.size)
              return (
                <g key={i}>
                  <rect
                    x={x * 20}
                    y={y * 20}
                    width="20"
                    height="20"
                    fill={fill(x, y)}
                    stroke="#ffffff55"
                    onClick={() => {
                      setPoint([x, y])
                      apply(x, y)
                    }}
                  >
                    <title>
                      Column {x}, row {y}: {h.toFixed(2)} m; slope{' '}
                      {slope(visible!, x, y).toFixed(1)} degrees
                    </title>
                  </rect>
                </g>
              )
            })}
            <path
              d={contour?.path}
              fill="none"
              stroke="#3b5140"
              strokeWidth="1"
              pointerEvents="none"
            />
            <rect
              x={region[0] * 20}
              y={region[1] * 20}
              width={(region[2] - region[0] + 1) * 20}
              height={(region[3] - region[1] + 1) * 20}
              fill="none"
              stroke="#9333ea"
              strokeWidth="2"
              pointerEvents="none"
            />
            {!before &&
              t.ponds.map((p, i) => (
                <polygon
                  key={i}
                  points={pondOutline(p).map(([x, y]) => `${10 + x * 20},${10 + y * 20}`).join(' ')}
                  fill="#269ac977"
                  stroke="#0369a1"
                  pointerEvents="none"
                />
              ))}
          </svg>
          <p>
            Contours interpolate the concept grid triangles; they are not surveyed lines. Click a
            node to brush; numeric controls provide the same operation without a pointer.
          </p>
          <svg
            viewBox="0 -80 640 500"
            style={{ maxHeight: 400, width: '100%', background: '#f2f6f0' }}
            role="img"
            aria-label="Isometric concept terrain preview"
          >
            {visible!.heights.map((h, i) => {
              const x = i % t.size,
                y = Math.floor(i / t.size)
              if (x === t.size - 1 || y === t.size - 1) return null
              return (
                <polygon
                  key={i}
                  points={[
                    iso(x, y, h),
                    iso(x + 1, y, visible!.heights[i + 1]),
                    iso(x + 1, y + 1, visible!.heights[i + t.size + 1]),
                    iso(x, y + 1, visible!.heights[i + t.size]),
                  ].join(' ')}
                  fill={fill(x, y)}
                  stroke="#42644755"
                  strokeWidth=".5"
                />
              )
            })}
            {!before &&
              t.ponds.map((p, i) => (
                <polygon
                  key={i}
                  points={pondOutline(p).map(([x, y]) => iso(x, y, p.water_level)).join(' ')}
                  fill="#38bdf899"
                  stroke="#0284c7"
                />
              ))}
            {(data.scenarios[scenario].terrain_anchors ?? []).map((a) => {
              const x = ((a.x - t.bounds[0]) / (t.bounds[2] - t.bounds[0])) * (t.size - 1),
                y = ((t.bounds[3] - a.y) / (t.bounds[3] - t.bounds[1])) * (t.size - 1)
              const h = groundHeight(visible!, x, y)
              const [cx, cy] = iso(x, y, h).split(',')
              return (
                <g key={a.id}>
                  <circle cx={cx} cy={cy} r="4" fill="#713f12" />
                  <text x={cx} y={Number(cy) - 8} fontSize="11">
                    {a.name}
                  </text>
                </g>
              )
            })}
          </svg>
          <p>
            Isometric diagram; height display is exaggerated ({verticalScale.toFixed(2)} pixels per
            metre). Dots mark object ground contact, not foundation engineering. Save to calculate
            anchors for newly added objects.
          </p>
          <fieldset disabled={disabled || busy || before}>
            <legend>Sculpt terrain</legend>
            <label>
              Terrain brush
              <select value={mode} onChange={(e) => setMode(e.target.value as Brush)}>
                {['raise', 'lower', 'smooth', 'flatten'].map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </label>
            {number('Brush radius (m)', radius, setRadius, 0.1, 2000)}
            {number('Brush strength (m per click)', strength, setStrength, 0, 100)}
            {number('Numeric elevation / pond bed (m)', level, setLevel, -500, 9000)}
            <label>
              <input
                type="checkbox"
                checked={falloff}
                onChange={(e) => setFalloff(e.target.checked)}
              />
              Linear brush falloff
            </label>
            {point.map((v, i) =>
              number(
                i ? 'Brush row' : 'Brush column',
                v,
                (n) =>
                  setPoint(
                    point.map((p, j) =>
                      i === j ? Math.max(0, Math.min(t.size - 1, Math.round(n))) : p,
                    ),
                  ),
                0,
                t.size - 1,
              ),
            )}
            <button type="button" onClick={() => apply(...(point as [number, number]))}>
              Apply brush at node
            </button>
            {region.map((v, i) => (
              <div key={i}>
                {number(
                  [
                    'Region first column',
                    'Region first row',
                    'Region last column',
                    'Region last row',
                  ][i],
                  v,
                  (n) =>
                    setRegion(
                      region.map((p, j) =>
                        i === j ? Math.max(0, Math.min(t.size - 1, Math.round(n))) : p,
                      ),
                    ),
                  0,
                  t.size - 1,
                )}
              </div>
            ))}
            <button type="button" onClick={() => apply(0, 0, true)}>
              Apply brush to selected region
            </button>
            <label>
              Pond name
              <input value={pondName} onChange={(e) => setPondName(e.target.value)} />
            </label>
            {number('Pond water elevation (m)', water, setWater, -500, 9000)}
            <button type="button" onClick={pond}>
              Lower selected region and add concept pond
            </button>
            <button
              type="button"
              onClick={() =>
                update({ ...t, heights: t.reference_heights ? [...t.reference_heights] : t.heights.map(() => t.base_elevation), ponds: [] })
              }
            >
              {t.reference_heights ? 'Reset terrain to supplied starting ground' : 'Reset terrain to original flat surface'}
            </button>
            <button type="button" onClick={() => update(null)}>
              Remove scenario terrain
            </button>
          </fieldset>
          {t.ponds.map((p, i) => {
            const bed = t.heights.filter(
              (_, j) => pondCovers(p, j % t.size, Math.floor(j / t.size)),
            )
            return (
              <p key={i}>
                {p.name}: water {p.water_level} m; nominal node depth{' '}
                {(p.water_level - Math.max(...bed)).toFixed(2)}–
                {(p.water_level - Math.min(...bed)).toFixed(2)} m.{' '}
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => update({ ...t, ponds: t.ponds.filter((_, j) => j !== i) })}
                >
                  Remove pond {i + 1}
                </button>
              </p>
            )
          })}
        </>
      )}
    </details>
  )
}
