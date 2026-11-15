import { z } from 'zod'
import { treeSchema, type SiteTree } from '../domain/trees'
import type { Bounds } from '../domain/projects'

const MAX_BYTES = 2_000_000
const featureSchema = z.object({
  type: z.literal('Feature'),
  id: z.union([z.string().max(200), z.number().finite()]).optional(),
  geometry: z.object({
    type: z.literal('Point'),
    coordinates: z.tuple([z.number().finite(), z.number().finite()]),
  }),
  properties: z.record(z.string(), z.unknown()).nullable(),
})
const collectionSchema = z.object({
  type: z.literal('FeatureCollection'),
  features: z.array(featureSchema).max(500),
})
const metric = (v: unknown, max: number) => {
  if (v === null || v === undefined || v === '') return null
  const value =
    typeof v === 'number'
      ? v
      : typeof v === 'string' && /^\d+(?:\.\d+)?\s*m?$/.test(v.trim())
        ? parseFloat(v)
        : NaN
  return Number.isFinite(value) && value > 0 && value <= max ? value : null
}
const label = (v: unknown, max = 160) => (typeof v === 'string' ? v.slice(0, max).trim() : '')
async function digest(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(bytes))
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')
}

export async function readTreeGeoJSON(
  text: string,
  source: string,
  attribution: string,
): Promise<SiteTree[]> {
  if (new TextEncoder().encode(text).byteLength > MAX_BYTES)
    throw new Error('Use a tree GeoJSON file under 2 MB.')
  if (!source.trim() || !attribution.trim())
    throw new Error('Enter the dataset source and licence/permission attribution first.')
  const collection = collectionSchema.parse(JSON.parse(text))
  const trees = await Promise.all(
    collection.features.map(async (feature, i) => {
      const p = feature.properties ?? {}
      const height = metric(p.height_m ?? p.height, 120),
        crown = metric(p.crown_diameter_m ?? p.diameter_crown, 80)
      // A named dataset + feature ID stays stable when that feature is reimported.
      const sourceId = String(feature.id ?? p.id ?? feature.geometry.coordinates.join(','))
      return treeSchema.parse({
        id: `geojson:${await digest(`${source.trim()}|${sourceId}`)}`,
        name: label(p.name) || `Imported tree ${i + 1}`,
        longitude: feature.geometry.coordinates[0],
        latitude: feature.geometry.coordinates[1],
        origin: 'geojson',
        source: source.trim(),
        attribution: attribution.trim(),
        source_id: sourceId,
        species: label(p.species),
        form: ['broadleaf', 'conifer', 'palm'].includes(String(p.form)) ? p.form : 'unknown',
        height_m: height,
        crown_diameter_m: crown,
        dimensions_source:
          height !== null || crown !== null
            ? label(p.dimensions_source, 500) ||
              `${source.trim()}: imported dimensions (unverified)`
            : '',
        uncertainty:
          label(p.uncertainty, 1000) ||
          'Imported inventory; location and dimensions require site review. Unreadable dimensions remain unknown.',
      })
    }),
  )
  if (new Set(trees.map((t) => t.id)).size !== trees.length)
    throw new Error(
      'Duplicate feature IDs or unlabelled duplicate locations. Give each tree a unique GeoJSON feature ID.',
    )
  return trees
}

const overpass = z.object({
  remark: z.string().optional(),
  elements: z
    .array(
      z.object({
        type: z.literal('node'),
        id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
        lon: z.number().finite(),
        lat: z.number().finite(),
        tags: z.record(z.string(), z.string()),
      }),
    )
    .max(501),
})
export type TreeContextResult = { trees: SiteTree[]; limited: boolean }
export function readOSMTrees(input: unknown): TreeContextResult {
  const data = overpass.parse(input)
  if (data.remark)
    throw new Error(
      'The tree provider returned an incomplete response. Retry later or import a local inventory.',
    )
  return {
    limited: data.elements.length > 500,
    trees: data.elements
      .slice(0, 500)
      .filter((n) => n.tags.natural === 'tree')
      .map((n) => {
        const height = metric(n.tags.height, 120),
          crown = metric(n.tags.diameter_crown, 80)
        return treeSchema.parse({
          id: `osm:node:${n.id}`,
          name: n.tags.name?.slice(0, 160) || `OSM tree ${n.id}`,
          longitude: n.lon,
          latitude: n.lat,
          origin: 'osm',
          source: 'OpenStreetMap mapped tree nodes via Overpass',
          attribution: '© OpenStreetMap contributors · ODbL 1.0',
          source_id: String(n.id),
          species: label(n.tags.species || n.tags.genus),
          form:
            n.tags.leaf_type === 'needleleaved'
              ? 'conifer'
              : n.tags.leaf_type === 'broadleaved'
                ? 'broadleaf'
                : 'unknown',
          height_m: height,
          crown_diameter_m: crown,
          dimensions_source:
            height !== null || crown !== null
              ? 'OpenStreetMap height/diameter_crown tags; unverified'
              : '',
          uncertainty:
            'Community mapped. Coverage, positions, species and dimensions are unverified; absent tags remain unknown.',
        })
      }),
  }
}
const cache = new Map<string, { at: number; data: TreeContextResult }>()
let lastRequest = 0
export async function loadMappedTrees(
  bounds: Bounds,
  signal: AbortSignal,
): Promise<TreeContextResult> {
  const [w, s, e, n] = bounds
  if (
    ![w, s, e, n].every(Number.isFinite) ||
    w >= e ||
    s >= n ||
    e - w > 0.020001 ||
    n - s > 0.020001
  )
    throw new Error(
      'Choose a site under 0.02 degrees wide and high for a bounded tree lookup, or import a local inventory.',
    )
  const key = bounds.join(',')
  const found = cache.get(key)
  if (found && Date.now() - found.at < 300_000) return structuredClone(found.data)
  if (Date.now() - lastRequest < 30_000)
    throw new Error(
      'Wait 30 seconds between tree provider requests. Imported and manual trees remain available.',
    )
  const endpoint =
    import.meta.env.VITE_TREE_OVERPASS_URL ?? 'https://overpass-api.de/api/interpreter'
  if (endpoint === 'offline')
    throw new Error(
      'Mapped tree lookup is disabled. Import a tree inventory or add trees manually.',
    )
  const url = new URL(endpoint)
  url.searchParams.set(
    'data',
    `[out:json][timeout:15];node["natural"="tree"](${s},${w},${n},${e});out body 501;`,
  )
  lastRequest = Date.now()
  const response = await fetch(url, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
  })
  if (!response.ok)
    throw new Error(
      `Tree lookup unavailable (${response.status}). Retry later or import an inventory.`,
    )
  const reader = response.body?.getReader()
  if (!reader) throw new Error('Tree provider returned no data.')
  let length = 0,
    text = ''
  const decoder = new TextDecoder()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > MAX_BYTES) throw new Error('Tree response is too large. Choose a smaller site.')
      text += decoder.decode(value, { stream: true })
    }
    text += decoder.decode()
  } finally {
    await reader.cancel().catch(() => {})
  }
  const result = readOSMTrees(JSON.parse(text))
  if (signal.aborted) throw new Error('Tree lookup cancelled.')
  if (cache.size >= 8) cache.delete(cache.keys().next().value!)
  cache.set(key, { at: Date.now(), data: result })
  return structuredClone(result)
}
