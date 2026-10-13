import type { WorkspaceData, Geometry } from '../domain/workspace'

export default function ScenarioComparison({ data }: { data: WorkspaceData }) {
  if (data.boundary.type !== 'Polygon') return null
  const ring = data.boundary.coordinates[0]
  const west = Math.min(...ring.map((point) => point[0])),
    east = Math.max(...ring.map((point) => point[0]))
  const south = Math.min(...ring.map((point) => point[1])),
    north = Math.max(...ring.map((point) => point[1]))
  const cosine = Math.cos((((south + north) / 2) * Math.PI) / 180)
  const scale = Math.min(260 / ((east - west) * cosine), 180 / (north - south))
  const point = ([x, y]: number[]) => [20 + (x - west) * cosine * scale, 20 + (north - y) * scale]
  const path = (geometry: Geometry) =>
    geometry.type === 'Polygon'
      ? geometry.coordinates
          .map(
            (coords) =>
              coords
                .map((value, index) => `${index ? 'L' : 'M'}${point(value).join(',')}`)
                .join(' ') + ' Z',
          )
          .join(' ')
      : ''
  function shape(geometry: Geometry, fill: string, key: string) {
    if (geometry.type === 'Point') {
      const [x, y] = point(geometry.coordinates)
      return <circle key={key} cx={x} cy={y} r={4} fill={fill} />
    }
    if (geometry.type === 'LineString')
      return (
        <polyline
          key={key}
          points={geometry.coordinates.map((value) => point(value).join(',')).join(' ')}
          fill="none"
          stroke={fill}
          strokeWidth={2}
        />
      )
    return (
      <path
        key={key}
        d={path(geometry)}
        fill={fill}
        fillOpacity={0.5}
        fillRule="evenodd"
        stroke={fill}
        strokeWidth={1}
      />
    )
  }
  return (
    <div className="grid gap-3 md:grid-cols-3" aria-label="Matched option geometry comparison">
      {(['baseline', 'option_a', 'option_b'] as const).map((key) => (
        <figure key={key} className="m-0 rounded border border-stone-300 p-2">
          <figcaption>{data.scenarios[key].name} - north up, shared extent</figcaption>
          <svg
            viewBox="0 0 300 220"
            role="img"
            aria-label={`${data.scenarios[key].name} geometry schematic`}
          >
            {shape(data.boundary, '#d9e3d7', 'boundary')}
            {data.targets.map((target) => shape(target.geometry, '#b89845', target.id))}
            {data.scenarios[key].items.flatMap((item) =>
              item.geometry
                ? [
                    shape(
                      item.geometry,
                      item.status === 'existing'
                        ? '#596c65'
                        : item.kind === 'canopy'
                          ? '#326e98'
                          : '#246545',
                      item.id,
                    ),
                  ]
                : [],
            )}
            <text x="278" y="18" fontSize="12">
              N
            </text>
            <path d="M282 40 L282 22 L278 28 M282 22 L286 28" fill="none" stroke="#174d3d" />
          </svg>
          <p className="text-sm">
            {data.scenarios[key].items.length} recorded items. Manual quantities have no footprint.
          </p>
        </figure>
      ))}
      <p className="text-sm md:col-span-3">
        Matched geometry schematics: grey existing, blue proposed canopy, green other proposed
        scope, gold target zones. This view shows scope, not a shade simulation or surveyed map.
      </p>
    </div>
  )
}
