import type { StyleSpecification } from 'maplibre-gl'

export const basemapUrl =
  import.meta.env.VITE_MAP_STYLE_URL ?? 'https://tiles.openfreemap.org/styles/bright'
export const geocoderUrl = import.meta.env.VITE_GEOCODER_URL ?? 'https://photon.komoot.io/api/'
export const blankStyle = (): StyleSpecification => ({
  version: 8,
  sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#e5ece0' } }],
})
let cached: Promise<{ style: StyleSpecification; available: boolean }> | undefined
export function loadBasemap() {
  cached ??= (async () => {
    if (basemapUrl === 'offline') return { style: blankStyle(), available: false }
    try {
      const response = await fetch(basemapUrl, { signal: AbortSignal.timeout(8000) })
      if (!response.ok) throw new Error('Basemap unavailable')
      const style = (await response.json()) as StyleSpecification
      if (style.version !== 8 || !Array.isArray(style.layers) || !style.sources)
        throw new Error('Invalid map style')
      // Explore adds its labelled provider extrusion separately; project geometry remains sourced.
      style.layers = style.layers.filter((layer) => layer.type !== 'fill-extrusion')
      return { style, available: true }
    } catch {
      return { style: blankStyle(), available: false }
    }
  })()
  return cached
}
