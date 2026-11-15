import { Path, Polygon, Polyline, Circle, Line, Svg, Text, View, StyleSheet } from '@react-pdf/renderer'
import type { LocalGeometry, MaintenanceTask, PlanSheet } from '../domain/calculations'
import { RESPONSIBILITY_LABEL } from '../domain/calculations'
import { niceLength, printRatio, sheetScale, BOX_H, BOX_W, PAD } from '../services/plan-sheet'

// Template v3 (L23/L22). Geometry arrives from the API already projected into local
// metres, so one uniform scale is used and the scale bar is true for the plan as drawn.

const s = StyleSheet.create({
  heading: { fontSize: 13, marginTop: 16, marginBottom: 5 },
  note: { fontSize: 8, color: '#56655d', marginTop: 3 },
  frame: { position: 'relative', width: BOX_W, height: BOX_H, borderWidth: 0.6, borderColor: '#9aa8a0' },
  label: { position: 'absolute', fontSize: 7, color: '#18382f', backgroundColor: '#ffffff' },
  number: { position: 'absolute', fontSize: 7, color: '#ffffff', backgroundColor: '#214b60', paddingHorizontal: 2 },
  tableHead: { flexDirection: 'row', borderBottomWidth: 0.8, borderBottomColor: '#56655d', paddingVertical: 3, fontSize: 8 },
  tableRow: { flexDirection: 'row', borderBottomWidth: 0.4, borderBottomColor: '#ccd5cd', paddingVertical: 3, fontSize: 8 },
})

function project(sheet: PlanSheet, scale: number) {
  const height = sheet.extent_m?.height ?? 0
  return ([x, y]: number[]) => [PAD + x * scale, PAD + (height - y) * scale] as const
}

function shapeOf(
  geometry: LocalGeometry,
  at: (point: number[]) => readonly [number, number],
  style: { fill: string; stroke: string; opacity: number; width: number },
  key: string,
) {
  const ring = (points: number[][]) => points.map((p) => at(p).join(',')).join(' ')
  if (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon') {
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
    const d = polygons
      .flatMap((polygon) => polygon.map((points) => `M ${ring(points).replaceAll(' ', ' L ')} Z`))
      .join(' ')
    return (
      <Path key={key} d={d} fillRule="evenodd" fill={style.fill} fillOpacity={style.opacity} stroke={style.stroke} strokeWidth={style.width} />
    )
  }
  if (geometry.type === 'LineString')
    return <Polyline key={key} points={ring(geometry.coordinates)} stroke={style.stroke} strokeWidth={style.width * 2} fill="none" />
  const [cx, cy] = at(geometry.coordinates)
  return <Circle key={key} cx={cx} cy={cy} r={3} fill={style.stroke} />
}

function anchor(geometry: LocalGeometry): number[] {
  if (geometry.type === 'Point') return geometry.coordinates
  const points =
    geometry.type === 'LineString'
      ? geometry.coordinates
      : geometry.type === 'Polygon'
        ? geometry.coordinates[0]
        : geometry.coordinates[0][0]
  const xs = points.map((p) => p[0])
  const ys = points.map((p) => p[1])
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]
}

const fmt = (value: number) =>
  value.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function PlanSheetView({
  sheet,
  layer,
  title,
  showTargets = true,
}: {
  sheet: PlanSheet
  layer: string
  title: string
  showTargets?: boolean
}) {
  if (sheet.status !== 'scaled' || !sheet.site || !sheet.extent_m) {
    return (
      <View wrap={false}>
        <Text style={s.heading}>{title} · SCHEMATIC, NOT TO SCALE</Text>
        <Text>{sheet.reason ?? 'A scaled plan could not be produced for this site geometry.'}</Text>
        <Text style={s.note}>
          Dated {sheet.date} ({sheet.timezone}). {sheet.sources.join(' ')} No dimensions are
          given; verify on site.
        </Text>
      </View>
    )
  }
  // A scope layer with nothing drawable adds no information; the scope list says so.
  if (layer !== 'none' && !(sheet.layers[layer] ?? []).length) return null
  const scale = sheetScale(sheet)
  const at = project(sheet, scale)
  const items = sheet.layers[layer] ?? []
  const barMetres = niceLength(sheet.extent_m.width / 4)
  const barPoints = barMetres * scale
  const barY = BOX_H - 14
  return (
    <View wrap={false}>
      <Text style={s.heading}>{title}</Text>
      <View style={s.frame}>
        <Svg width={BOX_W} height={BOX_H}>
          {shapeOf(sheet.site.geometry, at, { fill: '#e5ece0', stroke: '#174d3d', opacity: 1, width: 1 }, 'site')}
          {showTargets &&
            sheet.targets.map((target, index) =>
              shapeOf(target.geometry, at, { fill: '#dec990', stroke: '#9d7630', opacity: 0.45, width: 0.8 }, `t${index}`),
            )}
          {items.map((item) =>
            shapeOf(item.geometry, at, { fill: '#75a7bd', stroke: '#214b60', opacity: 0.65, width: 1 }, item.id),
          )}
          {/* North arrow (grid north of the declared CRS). */}
          <Polygon points={`${BOX_W - 22},10 ${BOX_W - 27},26 ${BOX_W - 22},22 ${BOX_W - 17},26`} fill="#18382f" />
          {/* Scale bar: two alternating halves. */}
          <Line x1={PAD} y1={barY} x2={PAD + barPoints} y2={barY} stroke="#18382f" strokeWidth={3} />
          <Line x1={PAD + barPoints / 2} y1={barY} x2={PAD + barPoints} y2={barY} stroke="#ffffff" strokeWidth={1.6} />
          <Line x1={PAD} y1={barY - 4} x2={PAD} y2={barY + 4} stroke="#18382f" strokeWidth={0.6} />
          <Line x1={PAD + barPoints} y1={barY - 4} x2={PAD + barPoints} y2={barY + 4} stroke="#18382f" strokeWidth={0.6} />
        </Svg>
        <Text style={[s.label, { left: BOX_W - 26, top: 27 }]}>N</Text>
        <Text style={[s.label, { left: PAD + barPoints + 5, top: barY - 5 }]}>
          {barMetres} m · approx. 1:{printRatio(scale).toLocaleString('en-MY')} at 100% A4
        </Text>
        {sheet.site.edges.map((edge) => {
          const [x1, y1] = at(edge.from)
          const [x2, y2] = at(edge.to)
          return (
            <Text key={edge.index} style={[s.label, { left: Math.min(Math.max((x1 + x2) / 2 - 16, 2), BOX_W - 48), top: Math.min(Math.max((y1 + y2) / 2 - 5, 2), BOX_H - 12) }]}>
              {fmt(edge.length_m)} m
            </Text>
          )
        })}
        {items.map((item) => {
          const [x, y] = at(anchor(item.geometry))
          return (
            <Text key={item.id} style={[s.number, { left: Math.min(Math.max(x + 5, 2), BOX_W - 14), top: Math.min(Math.max(y - 14, 2), BOX_H - 12) }]}>
              {item.number}
            </Text>
          )
        })}
      </View>
      <Text style={s.note}>
        Plan dated {sheet.date} ({sheet.timezone}) · {sheet.crs} · {sheet.north} ·
        extent {fmt(sheet.extent_m.width)} m × {fmt(sheet.extent_m.height)} m · site area{' '}
        {fmt(sheet.site.area_m2)} m² · perimeter {fmt(sheet.site.perimeter_m)} m
        {sheet.site.edges_omitted ? ' · boundary edge dimensions omitted (too many edges)' : ''}.
      </Text>
      {items.length > 0 && (
        <View>
          <View style={s.tableHead} minPresenceAhead={36}>
            <Text style={{ width: '8%' }}>No.</Text>
            <Text style={{ width: '47%' }}>Item</Text>
            <Text style={{ width: '20%' }}>Quantity</Text>
            <Text style={{ width: '25%' }}>Recorded source</Text>
          </View>
          {items.map((item) => (
            <View key={item.id} style={s.tableRow} wrap={false}>
              <Text style={{ width: '8%' }}>{item.number}</Text>
              <Text style={{ width: '47%', paddingRight: 6 }}>{item.name}</Text>
              <Text style={{ width: '20%' }}>
                {fmt(Number(item.quantity))} {item.unit === 'm2' ? 'm²' : item.unit}
              </Text>
              <Text style={{ width: '25%' }}>{item.provenance.replaceAll('_', ' ') || 'not recorded'}</Text>
            </View>
          ))}
        </View>
      )}
      <Text style={s.note}>Sources: {sheet.sources.join(' ')}</Text>
      {sheet.uncertainty.map((line, index) => (
        <Text key={index} style={s.note}>
          {line}
        </Text>
      ))}
    </View>
  )
}

export function MaintenanceChecklistView({
  plan,
  summary,
}: {
  plan: { basis: string; tasks: MaintenanceTask[] }
  summary?: string
}) {
  return (
    <View>
      <Text style={s.heading} minPresenceAhead={60}>
        Maintenance responsibilities and assumptions
      </Text>
      {summary && <Text>{summary}</Text>}
      {plan.tasks.length > 0 ? (
        <View>
          <View style={s.tableHead} minPresenceAhead={36}>
            <Text style={{ width: '30%' }}>Task</Text>
            <Text style={{ width: '15%' }}>Responsibility</Text>
            <Text style={{ width: '20%' }}>Frequency</Text>
            <Text style={{ width: '10%' }}>In price</Text>
            <Text style={{ width: '25%' }}>Assumptions</Text>
          </View>
          {plan.tasks.map((task, index) => (
            <View key={index} style={s.tableRow} wrap={false}>
              <Text style={{ width: '30%', paddingRight: 6 }}>{task.task}</Text>
              <Text style={{ width: '15%' }}>{RESPONSIBILITY_LABEL[task.responsibility]}</Text>
              <Text style={{ width: '20%', paddingRight: 6 }}>{task.frequency}</Text>
              <Text style={{ width: '10%' }}>{task.included_in_price ? 'Included' : 'Not included'}</Text>
              <Text style={{ width: '25%' }}>{task.assumptions || '—'}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text>No structured maintenance tasks were recorded for this issue.</Text>
      )}
      <Text style={s.note}>{plan.basis}</Text>
    </View>
  )
}
