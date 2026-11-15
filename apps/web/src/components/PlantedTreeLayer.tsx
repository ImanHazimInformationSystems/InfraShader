import { useEffect, useRef } from 'react'
import {
  MercatorCoordinate,
  type Map,
  type CustomLayerInterface,
  type MapMouseEvent,
} from 'mapbox-gl'
import * as THREE from 'three'
import { mapRay } from '../services/map-frame'
import {
  createTreeResources,
  designForTree,
  treeChoices,
  type TreeVariant,
} from '../services/tree-models'
import type { WorkItem } from '../domain/workspace'
import type { Solar } from '../services/environment'
import { createTreeShadowResources, updateTreeShadow } from '../services/tree-shadow'
import { createPlantResources, plantLook, plantChoices, type PlantVariant } from '../services/plant-models'

export type TreeGhost = {
  longitude: number
  latitude: number
  variant: TreeVariant
  scale: number
  rotation_deg: number
}
export default function PlantedTreeLayer({
  map,
  items,
  ghost,
  visible,
  picking,
  onSelect,
  solar,
  flatGround,
}: {
  map: Map | null
  items: WorkItem[]
  ghost: TreeGhost | null
  visible: boolean
  picking: boolean
  onSelect: (id: string) => void
  solar: Solar | null
  flatGround: boolean
}) {
  const latest = useRef({ items, ghost, visible, picking, onSelect, solar, flatGround })
  useEffect(() => {
    latest.current = { items, ghost, visible, picking, onSelect, solar, flatGround }
    map?.triggerRepaint()
  }, [map, items, ghost, visible, picking, onSelect, solar, flatGround])
  useEffect(() => {
    if (!map) return
    const id = 'proposed-planted-tree-models'
    let renderer: THREE.WebGLRenderer | null = null
    let resources: ReturnType<typeof createTreeResources> | null = null
    let plants: ReturnType<typeof createPlantResources> | null = null
    const shadowResources = createTreeShadowResources()
    const shadows = new globalThis.Map<string, THREE.Group>()
    let alive = true
    const scene = new THREE.Scene(),
      camera = new THREE.Camera()
    scene.add(new THREE.HemisphereLight(0xffffff, 0x556e43, 2.5))
    const sun = new THREE.DirectionalLight(0xfff6dc, 2.8)
    sun.position.set(-30, 20, 70)
    scene.add(sun)
    const origin = MercatorCoordinate.fromLngLat(map.getCenter()),
      unit = origin.meterInMercatorCoordinateUnits()
    const transform = new THREE.Matrix4()
      .makeTranslation(origin.x, origin.y, 0)
      .scale(new THREE.Vector3(unit, -unit, unit))
    const groups = new globalThis.Map<string, { variant: TreeVariant | PlantVariant; object: THREE.Group }>()
    const remove = (key: string) => {
      const current = groups.get(key)
      if (!current) return
      scene.remove(current.object)
      const shadow = shadows.get(key)
      if (shadow) scene.remove(shadow)
      shadows.delete(key)
      if (key === 'ghost')
        current.object.traverse((object) => {
          if (object instanceof THREE.Mesh) (object.material as THREE.Material).dispose()
        })
      groups.delete(key)
    }
    const layer: CustomLayerInterface = {
      id,
      type: 'custom',
      renderingMode: '3d',
      onAdd: (_view, gl) => {
        resources = createTreeResources()
        plants = createPlantResources()
        renderer = new THREE.WebGLRenderer({
          canvas: map.getCanvas(),
          context: gl as WebGL2RenderingContext,
          antialias: true,
        })
        renderer.autoClear = false
      },
      render: (_gl, matrix) => {
        if (!renderer || !resources || !plants) return
        const value = latest.current
        if (value.solar) {
          const az = value.solar.azimuth_deg * Math.PI / 180
          const elevation = value.solar.elevation_deg * Math.PI / 180
          sun.position.set(Math.sin(az) * Math.cos(elevation), Math.cos(az) * Math.cos(elevation), Math.sin(elevation))
          sun.intensity = value.solar.elevation_deg > 0 ? 2.8 : 0
        } else sun.intensity = 0.3
        const trees = value.visible
          ? value.items.filter((item) => item.visible && item.geometry?.type === 'Point')
          : []
        const records = trees.map((item) => ({
          id: item.id,
          longitude: (item.geometry as { type: 'Point'; coordinates: [number, number] })
            .coordinates[0],
          latitude: (item.geometry as { type: 'Point'; coordinates: [number, number] })
            .coordinates[1],
          ...designForTree(item),
          variant: item.layout_plant === 'shrub' || item.layout_plant === 'flowers' ? plantLook(item).id : designForTree(item).variant,
        }))
        if (value.visible && value.ghost)
          records.push({ id: 'ghost', ...value.ghost, stock_spec: '', rate_reviewed: false })
        const ids = new Set(records.map((record) => record.id))
        for (const key of groups.keys()) if (!ids.has(key)) remove(key)
        for (const record of records) {
          let current = groups.get(record.id)
          if (current?.variant !== record.variant) {
            remove(record.id)
            current = undefined
          }
          if (!current) {
            const look = plantChoices.find((choice) => choice.id === record.variant)
            const object = look ? plants.make(look.id) : resources.make(record.variant as TreeVariant, record.id === 'ghost')
            object.traverse((child) => {
              child.userData.itemId = record.id
            })
            current = { variant: record.variant, object }
            groups.set(record.id, current)
            scene.add(object)
            const shadow = new THREE.Group()
            shadow.add(shadowResources.make())
            shadows.set(record.id, shadow)
            scene.add(shadow)
          }
          const point = MercatorCoordinate.fromLngLat([record.longitude, record.latitude]),
            ratio = point.meterInMercatorCoordinateUnits() / unit
          const plant = plantChoices.find((choice) => choice.id === record.variant)
          const dimensions = plant ?? treeChoices.find((choice) => choice.id === record.variant)!
          current.object.position.set(
            (point.x - origin.x) / unit,
            -(point.y - origin.y) / unit,
            (map.queryTerrainElevation([record.longitude, record.latitude]) ?? 0) * ratio,
          )
          current.object.scale.set(
            (plant ? 1 : dimensions.width) * record.scale * ratio,
            (plant ? 1 : dimensions.width) * record.scale * ratio,
            (plant ? 1 : dimensions.height) * record.scale * ratio,
          )
          current.object.rotation.z = (-record.rotation_deg * Math.PI) / 180
          current.object.updateMatrixWorld(true)
          const shadow = shadows.get(record.id)!
          shadow.position.copy(current.object.position)
          shadow.scale.setScalar(ratio)
          updateTreeShadow(shadow.children[0] as THREE.Mesh, dimensions.height * record.scale,
            dimensions.width * record.scale, map.getTerrain() || !value.flatGround ? null : value.solar)
        }
        camera.projectionMatrix.fromArray(matrix).multiply(transform)
        renderer.resetState()
        renderer.render(scene, camera)
        renderer.resetState()
        const plantIds = new Set(plantChoices.map((choice) => choice.id as string))
        map.getCanvas().dataset.plantedTreeModels = String(records.filter((r) => r.id !== 'ghost' && !plantIds.has(r.variant)).length)
        map.getCanvas().dataset.plantedPlantModels = String(records.filter((r) => plantIds.has(r.variant)).length)
        map.getCanvas().dataset.plantedTreeShadows = String([...shadows.entries()].filter(
          ([key, group]) => key !== 'ghost' && !plantIds.has(groups.get(key)!.variant) && group.children[0].visible).length)
        map.getCanvas().dataset.plantedTreeStyles = [
          ...new Set(
            records.filter((record) => record.id !== 'ghost' && !plantIds.has(record.variant)).map((record) => record.variant),
          ),
        ].join(',')
      },
      onRemove: () => {
        for (const key of groups.keys()) remove(key)
        resources?.dispose()
        plants?.dispose()
        plants = null
        shadowResources.dispose()
        resources = null
        renderer?.dispose()
        renderer = null
        delete map.getCanvas().dataset.plantedTreeModels
        delete map.getCanvas().dataset.plantedPlantModels
        delete map.getCanvas().dataset.plantedTreeShadows
        delete map.getCanvas().dataset.plantedTreeStyles
      },
    }
    const install = () => {
      if (alive && map.getStyle() && !map.getLayer(id)) map.addLayer(layer)
    }
    const pick = (event: MapMouseEvent) => {
      if (!latest.current.picking || !latest.current.visible || !groups.size || !renderer) return
      const ray = new THREE.Raycaster()
      const ndc = new THREE.Vector2(
        (event.point.x / map.getCanvas().clientWidth) * 2 - 1,
        1 - (event.point.y / map.getCanvas().clientHeight) * 2,
      )
      ray.ray.copy(mapRay(ndc, camera.projectionMatrix).ray)
      const hit = ray.intersectObjects(
        [...groups.entries()].filter(([key]) => key !== 'ghost').map(([, entry]) => entry.object),
        true,
      )[0]
      if (hit?.object.userData.itemId) latest.current.onSelect(String(hit.object.userData.itemId))
    }
    install()
    map.on('style.load', install)
    map.on('click', pick)
    return () => {
      alive = false
      map.off('style.load', install)
      map.off('click', pick)
      if (map.getStyle() && map.getLayer(id)) map.removeLayer(id)
    }
  }, [map])
  return null
}
