import type { Feature, Geometry } from 'geojson'

export type BuildingCoverage = {
  loaded: number
  unknownHeight: number
  unsupported: number
  limited: number
  used: number
}

/** Loaded tile parts only. Provider heights are estimates, never surveyed evidence. */
export function collectBuildings(
  features: Pick<Feature<Geometry>, 'geometry' | 'properties'>[],
  center: { lng: number; lat: number },
) {
  const coverage: BuildingCoverage = {
    loaded: 0,
    unknownHeight: 0,
    unsupported: 0,
    limited: 0,
    used: 0,
  }
  const seen = new Set<string>()
  const candidates: { ring: number[][]; height: number; distance: number }[] = []
  for (const feature of features) {
    const height = Number(feature.properties?.render_height ?? feature.properties?.height)
    const polygons =
      feature.geometry.type === 'Polygon'
        ? [feature.geometry.coordinates]
        : feature.geometry.type === 'MultiPolygon'
          ? feature.geometry.coordinates
          : []
    for (const polygon of polygons) {
      const ring = polygon[0] ?? []
      const key = JSON.stringify([height, ring])
      if (seen.has(key)) continue
      seen.add(key)
      coverage.loaded++
      if (!Number.isFinite(height) || height <= 0) {
        coverage.unknownHeight++
        continue
      }
      if (
        height > 1000 ||
        polygon.length !== 1 ||
        ring.length < 4 ||
        ring.length > 128 ||
        ring.some(
          (point) =>
            point.length !== 2 ||
            !point.every(Number.isFinite) ||
            Math.abs(point[0]) > 180 ||
            Math.abs(point[1]) > 80 ||
            Math.abs(point[0] - center.lng) > 0.15 ||
            Math.abs(point[1] - center.lat) > 0.15,
        )
      ) {
        coverage.unsupported++
        continue
      }
      candidates.push({
        ring,
        height,
        distance: (ring[0][0] - center.lng) ** 2 + (ring[0][1] - center.lat) ** 2,
      })
    }
  }
  candidates.sort((a, b) => a.distance - b.distance)
  const buildings: { ring: number[][]; height: number }[] = []
  let vertices = 0
  for (const { ring, height } of candidates) {
    if (buildings.length >= 500 || vertices + ring.length > 10000) {
      coverage.limited++
      continue
    }
    buildings.push({ ring, height })
    vertices += ring.length
  }
  coverage.used = buildings.length
  return { buildings, coverage }
}
