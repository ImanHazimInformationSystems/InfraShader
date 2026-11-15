import type { Map, MapOptions, StyleSpecification, RasterTileSource } from 'mapbox-gl'
import type { Feature, Geometry } from 'geojson'

export type BasemapMode = 'standard' | 'satellite'
export type BasemapResult = {
  style: StyleSpecification
  available: boolean
  message: string
  mode: BasemapMode
}
export const mapboxToken = (import.meta.env.VITE_MAPBOX_ACCESS_TOKEN ?? '').trim()
export const hasPublicMapboxToken = mapboxToken.startsWith('pk.') && mapboxToken.length > 30
// Search is separate from map rendering and persisted project data.
export const geocoderUrl = import.meta.env.VITE_GEOCODER_URL ?? 'https://photon.komoot.io/api/'
const preference = 'infrashader:mapbox:basemap'
export function preferredBasemap(): BasemapMode {
  try {
    return sessionStorage.getItem(preference) === 'satellite' ? 'satellite' : 'standard'
  } catch {
    return 'standard'
  }
}
export const standardStyleUrl = 'mapbox://styles/mapbox/standard'
const satelliteSource = { type: 'raster' as const, url: 'mapbox://mapbox.satellite', tileSize: 256 }
const satelliteLayer = {
  id: 'infra-satellite',
  type: 'raster' as const,
  source: 'infra-satellite',
  slot: 'middle',
  paint: { 'raster-fade-duration': 0, 'raster-emissive-strength': 0 },
}
export const blankStyle = (): StyleSpecification => ({
  version: 8,
  sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#e5ece0' } }],
})
export function mapboxStyle(mode: BasemapMode): StyleSpecification {
  return {
    version: 8,
    sources: mode === 'satellite' ? { 'infra-satellite': satelliteSource } : {},
    layers: mode === 'satellite' ? [satelliteLayer] : [],
    imports: [
      {
        id: 'basemap',
        url: standardStyleUrl,
        config: {
          show3dObjects: true,
          show3dBuildings: true,
          show3dTrees: true,
          show3dLandmarks: true,
          show3dFacades: true,
          lightPreset: 'day',
        },
      },
    ],
  }
}
const checks = new globalThis.Map<BasemapMode, Promise<StyleCheck>>()
export async function loadBasemap(
  refresh = false,
  mode = preferredBasemap(),
): Promise<BasemapResult> {
  if (
    import.meta.env.VITE_MAP_STYLE_URL === 'offline' ||
    import.meta.env.VITE_MAPBOX_OFFLINE === 'true'
  )
    return {
      style: blankStyle(),
      available: false,
      message: 'Offline coordinate canvas. Mapbox content is disabled.',
      mode,
    }
  if (!hasPublicMapboxToken)
    return {
      style: blankStyle(),
      available: false,
      message:
        'Mapbox needs a valid public token in local configuration. Coordinate editing remains available.',
      mode,
    }
  if (refresh) checks.delete(mode)
  const pending =
    checks.get(mode) ??
    (async (): Promise<StyleCheck> => {
      try {
        const response = await fetch(
          `https://api.mapbox.com/styles/v1/mapbox/standard?access_token=${encodeURIComponent(mapboxToken)}`,
          { signal: AbortSignal.timeout(8000), credentials: 'omit' },
        )
        if (response.status === 429) return 'limited'
        if (response.status === 401 || response.status === 403) return 'refused'
        if (!response.ok) return 'failed'
        const style: unknown = await response.json()
        return !!style && typeof style === 'object' && 'version' in style && style.version === 8
          ? 'ok'
          : 'failed'
      } catch {
        return 'failed'
      }
    })()
  checks.set(mode, pending)
  const check = await pending
  const available = check === 'ok'
  if (!available) checks.delete(mode)
  return {
    style: available ? mapboxStyle(mode) : blankStyle(),
    available,
    mode,
    message: BASEMAP_MESSAGE[check],
  }
}
type StyleCheck = 'ok' | 'limited' | 'refused' | 'failed'
// Each failure says what happened and that the project is unaffected; a rate limit is not
// presented as a token problem, and a refused token is not presented as a connection problem.
const BASEMAP_MESSAGE: Record<StyleCheck, string> = {
  ok: 'Mapbox context; coverage and heights may be incomplete.',
  limited:
    'Mapbox is busy right now (rate limit reached, HTTP 429). Coordinate editing remains available and your project is unaffected; retry the map in a minute.',
  refused:
    'Mapbox refused the public token (HTTP 401/403). Check the token and its allowed URLs; coordinate editing remains available.',
  failed:
    'Mapbox could not load. Check connection, public token and allowed URLs; coordinate editing remains available.',
}
export function mapOptions(available: boolean): Partial<MapOptions> {
  return {
    accessToken: hasPublicMapboxToken ? mapboxToken : '',
    projection: 'mercator',
    // Blank maps contain no Mapbox content. This only silences their token warnings.
    testMode: !available,
    respectPrefersReducedMotion: true,
  }
}
export function hasMapboxContext(map: Map) {
  return !!mapStyle(map)?.imports?.some((i) => i.id === 'basemap')
}
/** Imported styles can be between load phases, or a React cleanup can outlive a map. */
export function mapStyle(map: Map): StyleSpecification | undefined {
  try {
    return map.getStyle()
  } catch {
    return undefined
  }
}
export function safeMapError(error?: Error): string {
  const status = (error as (Error & { status?: number }) | undefined)?.status
  return `${status ? `HTTP ${status}: ` : ''}${error?.message || error?.name || 'Map content unavailable'}`
    .replace(/https?:\/\/\S+/g, '[provider URL]')
    .replace(/(?:pk|sk)\.[\w.-]+/g, '[token]')
    .slice(0, 300)
}
export function providerBuildings(map: Map, visible: boolean) {
  if (!hasMapboxContext(map)) return
  map.setConfigProperty('basemap', 'show3dBuildings', visible)
  map.setConfigProperty('basemap', 'show3dLandmarks', visible)
}
export function providerTrees(map: Map, visible: boolean) {
  if (hasMapboxContext(map)) map.setConfigProperty('basemap', 'show3dTrees', visible)
}
export async function switchBasemap(map: Map, mode: BasemapMode) {
  const result = await loadBasemap(false, mode)
  if (!result.available) throw new Error(result.message)
  // Standard Satellite's live schema lacks show3dTrees/buildings. Keep Standard's
  // 3D import and insert imagery above land polygons, below its roads and models.
  if (mode === 'satellite' && !map.getSource('infra-satellite')) {
    map.addSource('infra-satellite', satelliteSource)
    map.addLayer(satelliteLayer)
  }
  if (map.getLayer('infra-satellite'))
    map.setLayoutProperty(
      'infra-satellite',
      'visibility',
      mode === 'satellite' ? 'visible' : 'none',
    )
  try {
    sessionStorage.setItem(preference, mode)
  } catch {
    /* Per-map selection still works. */
  }
  map.getContainer().dataset.basemapMode = mode
}
export async function reloadMapbox(map: Map) {
  const mode = preferredBasemap(),
    result = await loadBasemap(true, mode)
  if (!result.available) throw new Error(result.message)
  const item = mapboxStyle(mode).imports![0]
  const terrain = map.getTerrain()
  map.once('style.import.load', () => {
    if (mapStyle(map)) map.setTerrain(terrain)
  })
  if (hasMapboxContext(map))
    map.updateImport('basemap', { ...item, config: map.getConfig('basemap') ?? undefined })
  else map.addImport(item)
  if (mode === 'satellite')
    (map.getSource('infra-satellite') as RasterTileSource | undefined)?.setUrl(satelliteSource.url)
}
/** Exposed rendered polygons only; provider style internals are never inspected. */
export function visibleProviderBuildings(
  map: Map,
): Pick<Feature<Geometry>, 'geometry' | 'properties'>[] {
  if (!hasMapboxContext(map) || map.getZoom() < 14) return []
  try {
    return map
      .queryRenderedFeatures({ target: { featuresetId: 'buildings', importId: 'basemap' } })
      .map((f) => ({ geometry: f.geometry, properties: f.properties }))
  } catch {
    return []
  }
}
