import type { Feature, FeatureCollection, Polygon } from 'geojson'
import type { Bounds } from '../domain/projects'

/** Local visual context only. No work items or analysis inputs are produced. */
export function readBuildingContext(
  text: string,
  bounds: Bounds,
  attribution: string,
): FeatureCollection<Polygon> {
  if (text.length > 8_000_000) throw new Error('Use a site-sized GeoJSON under 8 MB.')
  if (attribution.trim().length < 3)
    throw new Error('Enter the dataset source and licence attribution.')
  const raw = JSON.parse(text)
  if (
    raw?.type !== 'FeatureCollection' ||
    !Array.isArray(raw.features) ||
    raw.features.length > 2000
  )
    throw new Error('Use a GeoJSON FeatureCollection with at most 2,000 buildings.')
  const features: Feature<Polygon>[] = []
  let vertices = 0
  for (const feature of raw.features) {
    const geometry = feature?.geometry
    if (!['Polygon', 'MultiPolygon'].includes(geometry?.type))
      throw new Error('Building context accepts only Polygon or MultiPolygon footprints.')
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
    if (!Array.isArray(polygons)) throw new Error('Invalid building coordinates.')
    for (const rings of polygons) {
      if (!Array.isArray(rings) || !rings.length || rings.length > 32)
        throw new Error('Invalid footprint rings.')
      for (const ring of rings) {
        if (!Array.isArray(ring) || ring.length < 4 || ring.length > 2000)
          throw new Error('Footprint ring must contain 4–2,000 positions.')
        vertices += ring.length
        if (vertices > 100000)
          throw new Error('Use a smaller context extract (100,000 vertices maximum).')
        for (const p of ring)
          if (
            !Array.isArray(p) ||
            p.length < 2 ||
            !Number.isFinite(p[0]) ||
            !Number.isFinite(p[1]) ||
            Math.abs(p[0]) > 180 ||
            Math.abs(p[1]) > 85
          )
            throw new Error('Footprints must use finite WGS84 longitude/latitude.')
        if (ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1])
          throw new Error('Footprint rings must be closed.')
      }
      const points = rings[0] as number[][]
      const xs = points.map((p) => p[0]),
        ys = points.map((p) => p[1])
      if (
        Math.max(...xs) < bounds[0] - 0.01 ||
        Math.min(...xs) > bounds[2] + 0.01 ||
        Math.max(...ys) < bounds[1] - 0.01 ||
        Math.min(...ys) > bounds[3] + 0.01
      )
        continue
      const value = feature.properties?.height
      const height =
        typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 1000
          ? value
          : 0
      features.push({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: rings },
        properties: {
          height,
          source: attribution.trim(),
          source_id: String(feature.id ?? feature.properties?.id ?? '').slice(0, 200),
        },
      })
      if (features.length > 2000) throw new Error('Use at most 2,000 polygon parts.')
    }
  }
  if (!features.length)
    throw new Error(
      'No footprints found near the selected site. Check the extract and coordinate system.',
    )
  return { type: 'FeatureCollection', features }
}
