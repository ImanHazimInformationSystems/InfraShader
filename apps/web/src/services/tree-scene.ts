import { MercatorCoordinate, type Map, type CustomLayerInterface } from 'mapbox-gl'
import * as THREE from 'three'
import type { FeatureCollection, Polygon } from 'geojson'
import type { SiteTree } from '../domain/trees'
import type { Solar } from './environment'
import { createTreeResources } from './tree-models'

export type DisplayTree = SiteTree & { context: boolean }
export const hasTreeDimensions = (t: SiteTree) => t.height_m !== null && t.crown_diameter_m !== null

// Display-only ellipsoid silhouettes on a flat ground plane; never analytical quantities.
export function treeShadowPreview(
  trees: DisplayTree[],
  solar: Solar | null,
): FeatureCollection<Polygon> {
  const result: FeatureCollection<Polygon> = { type: 'FeatureCollection', features: [] }
  if (!solar || solar.elevation_deg < 5 || solar.elevation_deg > 90) return result
  const az = (solar.azimuth_deg * Math.PI) / 180,
    tan = Math.tan((solar.elevation_deg * Math.PI) / 180)
  for (const t of trees) {
    if (!hasTreeDimensions(t) || t.status === 'remove') continue
    const origin = MercatorCoordinate.fromLngLat([t.longitude, t.latitude]),
      scale = origin.meterInMercatorCoordinateUnits()
    const h = t.height_m!,
      radius = t.crown_diameter_m! / 2,
      distance = (h * 0.65) / tan
    const along = Math.hypot(radius, (h * 0.35) / tan)
    const ring = Array.from({ length: 33 }, (_, i) => {
      const a = (i * Math.PI) / 16,
        east =
          -Math.sin(az) * (distance + along * Math.cos(a)) + Math.cos(az) * radius * Math.sin(a)
      const north =
        -Math.cos(az) * (distance + along * Math.cos(a)) - Math.sin(az) * radius * Math.sin(a)
      const p = new MercatorCoordinate(origin.x + east * scale, origin.y - north * scale).toLngLat()
      return [p.lng, p.lat]
    })
    ring[32] = [...ring[0]]
    result.features.push({
      type: 'Feature',
      properties: { id: t.id },
      geometry: { type: 'Polygon', coordinates: [ring] },
    })
  }
  return result
}

export function treeScene(
  map: Map,
  trees: DisplayTree[],
  solar: Solar | null,
): CustomLayerInterface {
  const measured = trees.filter((t) => t.status !== 'remove' && hasTreeDimensions(t))
  const anchor = MercatorCoordinate.fromLngLat(
    measured.length ? [measured[0].longitude, measured[0].latitude] : map.getCenter(),
  )
  const scale = anchor.meterInMercatorCoordinateUnits()
  const transform = new THREE.Matrix4()
    .makeTranslation(anchor.x, anchor.y, 0)
    .scale(new THREE.Vector3(scale, -scale, scale))
  const scene = new THREE.Scene(),
    camera = new THREE.Camera()
  const resources = createTreeResources()
  for (const variant of ['canopy', 'evergreen', 'palm'] as const) {
    const subset = measured.filter(
      (tree) =>
        (tree.form === 'palm' ? 'palm' : tree.form === 'conifer' ? 'evergreen' : 'canopy') ===
        variant,
    )
    const batch = resources.batch(variant, subset.length)
    const dummy = new THREE.Object3D()
    subset.forEach((tree, index) => {
      const point = MercatorCoordinate.fromLngLat([tree.longitude, tree.latitude])
      const ratio = point.meterInMercatorCoordinateUnits() / scale
      dummy.position.set(
        (point.x - anchor.x) / scale,
        -(point.y - anchor.y) / scale,
        (map.queryTerrainElevation([tree.longitude, tree.latitude]) ?? 0) * ratio,
      )
      dummy.scale.set(
        tree.crown_diameter_m! * ratio,
        tree.crown_diameter_m! * ratio,
        tree.height_m! * ratio,
      )
      dummy.updateMatrix()
      batch.bark.setMatrixAt(index, dummy.matrix)
      batch.leaves.setMatrixAt(index, dummy.matrix)
      batch.leaves.setColorAt(index, new THREE.Color(tree.context ? '#a0ad95' : '#ffffff'))
    })
    batch.bark.instanceMatrix.needsUpdate = batch.leaves.instanceMatrix.needsUpdate = true
    scene.add(batch.bark, batch.leaves)
  }
  scene.add(new THREE.HemisphereLight(0xffffff, 0x61715b, 2.1))
  const sun = new THREE.DirectionalLight(0xffffff, solar && solar.elevation_deg > 0 ? 1.8 : 0.2)
  const az = ((solar?.azimuth_deg ?? 180) * Math.PI) / 180,
    el = ((solar?.elevation_deg ?? 30) * Math.PI) / 180
  sun.position.set(
    Math.sin(az) * Math.cos(el),
    Math.cos(az) * Math.cos(el),
    Math.max(0.05, Math.sin(el)),
  )
  scene.add(sun)
  let renderer: THREE.WebGLRenderer | undefined
  return {
    id: 'tree-models',
    type: 'custom',
    renderingMode: '3d',
    onAdd: (_map, gl) => {
      renderer = new THREE.WebGLRenderer({
        canvas: map.getCanvas(),
        context: gl as WebGL2RenderingContext,
      })
      renderer.autoClear = false
    },
    render: (_gl, args) => {
      if (!renderer) return
      camera.projectionMatrix.fromArray(args).multiply(transform)
      renderer.resetState()
      renderer.render(scene, camera)
      renderer.resetState()
      map.getCanvas().dataset.treeModels = String(measured.length)
    },
    onRemove: () => {
      scene.traverse((object) => {
        if (object instanceof THREE.InstancedMesh) object.dispose()
      })
      resources.dispose()
      renderer?.dispose()
      if (renderer) delete renderer.domElement.dataset.treeModels
    },
  }
}
