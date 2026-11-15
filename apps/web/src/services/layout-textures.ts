import type { Map } from 'mapbox-gl'

export const roadSurfaces = [
  { id: 'dirt', name: 'Dirt', color: '#ad8255', detail: 'Natural earth look' },
  { id: 'pavement', name: 'Pavement', color: '#8b9198', detail: 'Paved surface look' },
  { id: 'stone', name: 'Stone', color: '#b0a491', detail: 'Stone block look' },
  { id: 'gravel', name: 'Gravel', color: '#aaa293', detail: 'Loose gravel look' },
] as const
export type RoadSurface = (typeof roadSurfaces)[number]['id']

export function roadImage(surfaceId: RoadSurface) {
  const surface = roadSurfaces.find(entry => entry.id === surfaceId)!
  const data = new Uint8Array(32 * 32 * 4)
  const rgb = surface.color.match(/\w\w/g)!.map(value => parseInt(value, 16))
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const index = (y * 32 + x) * 4
    const noise = ((x * 73 + y * 151 + x * y * 13) % 31) - 15
    const seam = surface.id === 'stone'
      ? y % 12 === 0 || (x + (Math.floor(y / 12) % 2) * 8) % 16 === 0
      : surface.id === 'pavement' && (x % 16 === 0 || y % 16 === 0)
    for (let c = 0; c < 3; c++) data[index + c] = Math.max(0, Math.min(255, rgb[c] + (seam ? -35 : noise)))
    data[index + 3] = 255
  }
  return { width: 32, height: 32, data }
}

/** Original procedural visual swatches. These do not specify a construction assembly. */
export function addLayoutImages(map: Map) {
  for (const surface of roadSurfaces) {
    const id = `layout-${surface.id}`
    if (map.hasImage(id)) continue
    map.addImage(id, roadImage(surface.id))
  }
  for (const kind of ['tree', 'shrub', 'flowers']) {
    const id = `layout-${kind}`
    if (map.hasImage(id)) continue
    const data = new Uint8Array(48 * 48 * 4)
    for (let y = 0; y < 48; y++)
      for (let x = 0; x < 48; x++) {
        const dx = x - 24,
          dy = y - 23
        const distance = Math.hypot(dx, dy)
        const flower =
          kind === 'flowers' &&
          [
            [-9, -6],
            [8, -7],
            [0, 8],
          ].some(([a, b]) => Math.hypot(dx - a, dy - b) < 7)
        if (distance > (kind === 'tree' ? 21 : 17)) continue
        const index = (y * 48 + x) * 4
        const color = flower
          ? [220, 139, 167]
          : distance > (kind === 'tree' ? 18 : 14)
            ? [34, 77, 50]
            : (dx + dy) % 9 > 2
              ? [80, 142, 76]
              : [109, 163, 83]
        data.set([...color, 255], index)
      }
    map.addImage(id, { width: 48, height: 48, data }, { pixelRatio: 2 })
  }
}
