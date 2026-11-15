import type { DesignPreview, PreviewItem } from '../domain/design-preview'
import './design-plan.css'

type Pt = [number, number]
const PAD = 3

const PAINT: Record<string, string> = {
  lawn: '#9fcb7f',
  meadow: '#c2d68a',
  fine: '#a8d48e',
  dry: '#d9cf9a',
  deep: '#6fa65a',
  wild: '#b7c77a',
}
const TREE_FILL: Record<string, string> = {
  canopy: '#4b8f3f',
  evergreen: '#2f6b3a',
  columnar: '#63a352',
  palm: '#7aa83b',
}

function areaStyle(item: PreviewItem) {
  const name = item.name.toLowerCase()
  if (item.category === 'Access') return 'plan-road'
  if (item.category === 'Play') return 'plan-play'
  if (item.kind === 'canopy') return 'plan-structure'
  if (item.category === 'Hardscape') return 'plan-paving'
  if (name.includes('lawn') || name.includes('turf')) return 'plan-lawn'
  if (name.includes('bed') || name.includes('planting')) return 'plan-bed'
  return 'plan-lawn'
}

function centroid(geometry: PreviewItem['geometry']): Pt {
  if (geometry.type === 'Point') return geometry.coordinates as Pt
  const ring: Pt[] =
    geometry.type === 'Polygon'
      ? (geometry.coordinates as Pt[][])[0]
      : geometry.type === 'LineString'
        ? (geometry.coordinates as Pt[])
        : (geometry.coordinates as Pt[][][])[0][0]
  const points = ring.length > 1 ? ring.slice(0, -1) : ring
  return [
    points.reduce((s, p) => s + p[0], 0) / points.length,
    points.reduce((s, p) => s + p[1], 0) / points.length,
  ]
}

/** North-up schematic plan of one design, drawn in metres from the saved design data. */
export default function DesignPlan({
  preview,
  title,
  compact = false,
  showLegend = !compact,
}: {
  preview: DesignPreview
  title: string
  compact?: boolean
  showLegend?: boolean
}) {
  const width = preview.extent_m.width
  const height = preview.extent_m.height
  const fy = (y: number) => height - y
  const xy = ([x, y]: Pt) => `${x.toFixed(2)},${fy(y).toFixed(2)}`
  const ringPath = (ring: Pt[]) => `M${ring.map(xy).join(' L')} Z`
  const polygonPath = (geometry: PreviewItem['geometry']) => {
    if (geometry.type === 'Polygon') return (geometry.coordinates as Pt[][]).map(ringPath).join(' ')
    if (geometry.type === 'MultiPolygon')
      return (geometry.coordinates as Pt[][][]).flatMap((poly) => poly.map(ringPath)).join(' ')
    return ''
  }
  const linePath = (points: Pt[]) => `M${points.map(xy).join(' L')}`
  const items = preview.items
  const areas = items.filter((i) => i.geometry.type === 'Polygon' && i.kind !== 'object')
  const order = ['plan-lawn', 'plan-bed', 'plan-paving', 'plan-play', 'plan-road', 'plan-structure']
  areas.sort((a, b) => order.indexOf(areaStyle(a)) - order.indexOf(areaStyle(b)))
  const lines = items.filter((i) => i.geometry.type === 'LineString')
  const objects = items.filter((i) => i.kind === 'object')
  const benches = items.filter((i) => i.kind === 'bench')
  const existingTrees = items.filter((i) => i.kind === 'tree' && i.status === 'existing')
  const newTrees = items.filter((i) => i.kind === 'tree' && i.status !== 'existing')
  const label = (item: PreviewItem) =>
    `${item.name}${item.status === 'existing' ? ' (existing)' : ''}${
      item.unit && item.unit !== 'item'
        ? ` — ${item.quantity.toLocaleString('en-MY')} ${item.unit === 'm2' ? 'm²' : item.unit}`
        : ''
    }`
  const bar = width > 100 ? 20 : 10
  const present = new Set([
    ...areas.map(areaStyle),
    ...(lines.some((l) => l.category === 'Hardscape') ? ['plan-path'] : []),
    ...(lines.some((l) => l.category === 'Softscape') ? ['plan-hedge'] : []),
    ...(newTrees.length ? ['plan-tree'] : []),
    ...(existingTrees.length ? ['plan-existing'] : []),
    ...(benches.length ? ['plan-bench'] : []),
    ...(objects.some((o) => o.asset === 'light') ? ['plan-light'] : []),
    ...(objects.some((o) => o.asset === 'play') ? ['plan-play-kit'] : []),
    ...(objects.some((o) => ['gazebo', 'pergola'].includes(o.asset ?? ''))
      ? ['plan-structure']
      : []),
  ])
  const legend: [string, string][] = [
    ['plan-lawn', 'Lawn'],
    ['plan-bed', 'Planting bed'],
    ['plan-paving', 'Paving / plaza'],
    ['plan-path', 'Path or walkway'],
    ['plan-road', 'Access road'],
    ['plan-play', 'Play surfacing'],
    ['plan-play-kit', 'Play equipment'],
    ['plan-structure', 'Shelter, gazebo, pergola'],
    ['plan-hedge', 'Hedge'],
    ['plan-tree', 'New tree (dashed: mature canopy)'],
    ['plan-existing', 'Existing tree kept'],
    ['plan-bench', 'Bench'],
    ['plan-light', 'Light'],
  ]
  return (
    <figure className={`design-plan${compact ? ' is-compact' : ''}`}>
      <svg
        viewBox={`${-PAD} ${-PAD} ${width + 2 * PAD} ${height + 2 * PAD + (compact ? 0 : 6)}`}
        role="img"
        aria-label={`${title}: plan of ${newTrees.length} new trees, ${benches.length} benches and ${areas.length + lines.length} paved, planted or surfaced areas on the site`}
      >
        <title>{title}</title>
        <path className="plan-site" d={polygonPath(preview.site.geometry)} />
        <g className="plan-paint">
          {preview.paint.map((stroke, index) =>
            stroke.points.length === 1 ? (
              <circle
                key={index}
                cx={stroke.points[0][0]}
                cy={fy(stroke.points[0][1])}
                r={stroke.radius_m}
                fill={PAINT[stroke.texture] ?? PAINT.lawn}
              />
            ) : (
              <path
                key={index}
                d={linePath(stroke.points as Pt[])}
                stroke={PAINT[stroke.texture] ?? PAINT.lawn}
                strokeWidth={stroke.radius_m * 2}
              />
            ),
          )}
        </g>
        {areas.map((item) => (
          <path
            key={item.id}
            className={areaStyle(item)}
            d={polygonPath(item.geometry)}
            fillRule="evenodd"
          >
            <title>{label(item)}</title>
          </path>
        ))}
        {lines.map((item) => (
          <path
            key={item.id}
            className={
              item.status === 'existing'
                ? 'plan-drain'
                : item.category === 'Softscape'
                  ? 'plan-hedge'
                  : 'plan-path'
            }
            d={linePath(item.geometry.coordinates as Pt[])}
            strokeWidth={item.category === 'Hardscape' ? (item.width_m ?? 1.5) : 1.1}
          >
            <title>{label(item)}</title>
          </path>
        ))}
        {existingTrees.map((item) => {
          const [x, y] = item.geometry.coordinates as Pt
          return (
            <circle
              key={item.id}
              className="plan-existing"
              cx={x}
              cy={fy(y)}
              r={(item.crown_m ?? 10) / 2}
            >
              <title>{label(item)}</title>
            </circle>
          )
        })}
        {objects.map((item) => {
          const asset = item.asset ?? ''
          if (asset === 'light' || asset === 'bin' || asset === 'bike') {
            const [x, y] = centroid(item.geometry)
            return (
              <circle
                key={item.id}
                className={`plan-${asset}`}
                cx={x}
                cy={fy(y)}
                r={asset === 'light' ? 0.9 : 0.6}
              >
                <title>{label(item)}</title>
              </circle>
            )
          }
          return (
            <path
              key={item.id}
              className={asset === 'play' ? 'plan-play-kit' : 'plan-structure'}
              d={polygonPath(item.geometry)}
            >
              <title>{label(item)}</title>
            </path>
          )
        })}
        {benches.map((item) => {
          const [x, y] = item.geometry.coordinates as Pt
          return (
            <rect
              key={item.id}
              className="plan-bench"
              x={x - 0.9}
              y={fy(y) - 0.3}
              width={1.8}
              height={0.6}
            >
              <title>{label(item)}</title>
            </rect>
          )
        })}
        {newTrees.map((item) => {
          const [x, y] = item.geometry.coordinates as Pt
          return (
            <g key={item.id}>
              <circle
                className="plan-tree-mature"
                cx={x}
                cy={fy(y)}
                r={(item.mature_crown_m ?? 6) / 2}
              />
              <circle
                className="plan-tree"
                cx={x}
                cy={fy(y)}
                r={Math.max((item.crown_m ?? 2) / 2, 1.2)}
                fill={TREE_FILL[item.variant ?? 'canopy'] ?? TREE_FILL.canopy}
              >
                <title>{label(item)}</title>
              </circle>
            </g>
          )
        })}
        {!compact && (
          <g className="plan-scale" transform={`translate(0 ${height + 3})`}>
            <rect x={0} y={0} width={bar} height={1.2} />
            <text x={bar + 1.5} y={1.3}>
              {bar} m
            </text>
            <text x={width} y={1.3} textAnchor="end">
              N ↑
            </text>
          </g>
        )}
      </svg>
      {showLegend && (
        <figcaption>
          <ul className="plan-legend">
            {legend
              .filter(([key]) => present.has(key))
              .map(([key, text]) => (
                <li key={key}>
                  <span className={`plan-swatch ${key}`} aria-hidden="true" />
                  {text}
                </li>
              ))}
          </ul>
          <p className="fine-print">{preview.notice}</p>
        </figcaption>
      )}
    </figure>
  )
}
