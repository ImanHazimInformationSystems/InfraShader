import { mapStyle } from '../services/map'
import type { Map as GeographicMap, CustomLayerInterface } from 'mapbox-gl'
import { mapModelMatrix, mapRay, type MapFrame } from '../services/map-frame'
import { useEffect, useRef, useState, type RefObject } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { ObjectPreset } from '../domain/objects'
import type { Geometry, WorkItem, GroundStroke } from '../domain/workspace'
import type { Terrain } from '../domain/terrain'
import { groundHeight, terrainStroke, terrainDab, pondAt, type TerrainBrush, type Brush } from '../domain/terrain'
import { terrainGeometry, updateTerrainGeometry, pondMeshes, runoffMeshes } from '../services/terrain-mesh'
import type { TerrainWaterPreview } from '../domain/terrain-study'
import type { Solar } from '../services/environment'
import { createTreeResources, designForTree, treeChoices } from '../services/tree-models'
import { createTreeShadowResources, updateTreeShadow } from '../services/tree-shadow'
import { createPlantResources, plantLook } from '../services/plant-models'
import { createObjectEffects, objectRoot } from '../services/object-effects'
import { roadTexture, roadUvs, groundTexture, groundUvs, groundSurface } from '../services/scene-surfaces'
import type { RoadSurface } from '../services/layout-textures'
import { drapedSurface, updateDrapedSurface } from '../services/draped-surface'

function illuminate(
  sun: THREE.DirectionalLight,
  ambient: THREE.HemisphereLight,
  solar: Solar | null,
) {
  if (!solar) {
    sun.intensity = 0.3
    ambient.intensity = 1.8
    return
  }
  const az = (solar.azimuth_deg * Math.PI) / 180,
    elevation = (solar.elevation_deg * Math.PI) / 180
  sun.position.set(
    Math.sin(az) * Math.cos(elevation),
    Math.max(0, Math.sin(elevation)),
    -Math.cos(az) * Math.cos(elevation),
  )
  sun.intensity = solar.elevation_deg > 0 ? 2 : 0
  ambient.intensity = solar.elevation_deg > 0 ? 2.4 : 0.5
}

export type SceneView = { position: THREE.Vector3; target: THREE.Vector3 }
export type SceneOutline = { id?: string; geometry: Geometry; color: string }

type Props = {
  solar?: Solar | null
  geographicMap?: GeographicMap | null
  mapFrame?: MapFrame

  viewState?: RefObject<SceneView | null>
  geometry?: Record<string, Geometry>
  outlines?: SceneOutline[]
  presets: ObjectPreset[]
  items: WorkItem[]
  terrain?: Terrain | null
  terrainBoundary?: Geometry
  terrainWater?: TerrainWaterPreview | null
  groundPaint?: { boundary: Geometry; strokes: GroundStroke[] }
  onSelect?: (id: string) => void
  selectedId?: string
  onTerrain?: (terrain: Terrain) => void
  terrainBrush?: TerrainBrush
  onTerrainGesture?: (active: boolean) => void
  onTerrainMessage?: (message: string) => void
  onMove?: (east: number, north: number) => void
  disabled?: boolean
}
export default function ObjectScene({
  solar = null,
  geographicMap,
  mapFrame,
  geometry,
  outlines,
  viewState,
  presets,
  items,
  terrain,
  terrainBoundary,
  terrainWater,
  groundPaint,
  onSelect,
  selectedId,
  onTerrain,
  terrainBrush,
  onTerrainGesture,
  onTerrainMessage,
  onMove,
  disabled = false,
}: Props) {
  const currentSolar = useRef(solar)
  const redraw = useRef<(() => void) | null>(null)
  const lights = useRef<{ sun: THREE.DirectionalLight; ambient: THREE.HemisphereLight } | null>(
    null,
  )
  useEffect(() => {
    currentSolar.current = solar
    if (lights.current) illuminate(lights.current.sun, lights.current.ambient, solar)
    redraw.current?.()
    geographicMap?.triggerRepaint()
  }, [solar, geographicMap])
  const [viewVersion, setViewVersion] = useState(0)
  const [localTool, setTool] = useState<'navigate' | Brush | 'move'>('navigate')
  const [localRadius, setRadius] = useState(30),
    [localStrength, setStrength] = useState(1),
    [localLevel, setLevel] = useState(0)
  const tool = !onTerrain ? 'navigate' : terrainBrush?.mode ?? localTool
  const radius = terrainBrush?.radius ?? localRadius, strength = localStrength, level = localLevel
  const fitRequested = useRef(false)
  const ownView = useRef<SceneView | null>(null)
  const cameraState = viewState ?? ownView
  const callbacks = useRef({ onTerrain, onMove, onSelect, onTerrainGesture, onTerrainMessage })
  useEffect(() => {
    callbacks.current = { onTerrain, onMove, onSelect, onTerrainGesture, onTerrainMessage }
  }, [onTerrain, onMove, onSelect, onTerrainGesture, onTerrainMessage])
  const host = useRef<HTMLDivElement>(null),
    [status, setStatus] = useState('Loading 3D preview…')
  useEffect(() => {
    const container = host.current
    if (!container) return
    if (geographicMap === null) {
      queueMicrotask(() =>
        setStatus('Waiting for the geographic map. Numeric editing remains available.'),
      )
      return
    }
    const embedded = Boolean(geographicMap && mapFrame?.supported)
    if (geographicMap && !mapFrame?.supported) {
      queueMicrotask(() =>
        setStatus(
          'Geographic alignment unavailable or exceeds the 5 cm display tolerance. Use the local design view or numeric tools.',
        ),
      )
      return
    }
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer(
        embedded
          ? {
              canvas: geographicMap!.getCanvas(),
              context: geographicMap!.getCanvas().getContext('webgl2')!,
              antialias: true,
            }
          : { antialias: true, alpha: false },
      )
      renderer.autoClear = !embedded
    } catch {
      queueMicrotask(() =>
        setStatus('3D unavailable. Use the map footprints and numeric object controls.'),
      )
      return
    }
    let alive = true
    const scene = new THREE.Scene()
    scene.background = embedded ? null : new THREE.Color('#edf2ed')
    const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 10000)
    const controls = embedded ? null : new OrbitControls(camera, renderer.domElement)
    if (controls) controls.enableDamping = false
    if (!embedded) {
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
      container.appendChild(renderer.domElement)
    }
    if (!embedded) {
      renderer.domElement.setAttribute('aria-label', 'Interactive 3D object scene')
      renderer.domElement.setAttribute('role', 'img')
    }
    const ambient = new THREE.HemisphereLight(0xffffff, 0x647565, 2.4)
    scene.add(ambient)
    const sun = new THREE.DirectionalLight(0xffffff, 2)
    sun.position.set(10, 20, 8)
    scene.add(sun)
    lights.current = { sun, ambient }
    illuminate(sun, ambient, currentSolar.current)
    const shown = items.filter((i) => i.visible && i.object_instance && i.object_pose).slice(0, 150)
    const ordinary = items.filter((i) => i.visible && !i.object_instance && geometry?.[i.id])
    const positions = ordinary.flatMap((i) => {
      const g = geometry![i.id]
      return g.type === 'Point'
        ? [g.coordinates]
        : g.type === 'LineString'
          ? g.coordinates
          : g.coordinates[0]
    })
    for (const outline of outlines ?? []) {
      if (outline.geometry.type === 'Polygon') positions.push(...outline.geometry.coordinates[0])
    }
    if (groundPaint?.strokes.length && terrainBoundary?.type === 'Polygon') positions.push(...terrainBoundary.coordinates[0])
    const ox = terrain
      ? (terrain.bounds[0] + terrain.bounds[2]) / 2
      : shown.length
        ? shown.reduce((v, i) => v + i.object_pose!.x, 0) / shown.length
        : positions.length
          ? positions.reduce((sum, p) => sum + p[0], 0) / positions.length
          : 0
    const oy = terrain
      ? (terrain.bounds[1] + terrain.bounds[3]) / 2
      : shown.length
        ? shown.reduce((v, i) => v + i.object_pose!.y, 0) / shown.length
        : positions.length
          ? positions.reduce((sum, p) => sum + p[1], 0) / positions.length
          : 0
    const base = terrain?.base_elevation ?? 0
    const siteBoundary = terrainBoundary ?? outlines?.find(outline => !outline.id)?.geometry
    const siteTerrainGeometry = terrain ? terrainGeometry(terrain, siteBoundary, ox, oy, base) : null
    const sceneTextures: THREE.Texture[] = []
    const roadMaps = new Map<RoadSurface, THREE.DataTexture>()
    const terrainSurfaces: THREE.Mesh<THREE.BufferGeometry>[] = []
    const meshes: THREE.InstancedMesh[] = []
    for (const preset of presets) {
      const objects = shown.filter((i) => i.object_instance!.asset_id === preset.id)
      if (!objects.length) continue
      for (const p of preset.parts) {
        const geo =
          p.shape === 'box'
            ? new THREE.BoxGeometry(1, 1, 1)
            : p.shape === 'cylinder'
              ? new THREE.CylinderGeometry(0.5, 0.5, 1, 8, 1)
              : new THREE.SphereGeometry(0.5, 8, 6)
        const material = new THREE.MeshStandardMaterial({ color: p.color, roughness: 0.85 })
        const mesh = new THREE.InstancedMesh(geo, material, objects.length)
        mesh.userData.ids = objects.map((i) => i.id)
        objects.forEach((item, index) => {
          const pose = item.object_pose!,
            root = objectRoot(item, ox, oy, base),
            part = new THREE.Object3D()
          let ground = pose.ground_elevation_m
          if (terrain) {
            const gx =
                ((pose.x - terrain.bounds[0]) / (terrain.bounds[2] - terrain.bounds[0])) *
                (terrain.size - 1),
              gy =
                ((terrain.bounds[3] - pose.y) / (terrain.bounds[3] - terrain.bounds[1])) *
                (terrain.size - 1)
            ground = groundHeight(terrain, gx, gy)
          }
          root.position.y += ground - pose.ground_elevation_m
          part.position.set(...p.position)
          part.scale.set(...p.size)
          root.add(part)
          root.updateMatrixWorld(true)
          mesh.setMatrixAt(index, part.matrixWorld)
          mesh.setColorAt(index, new THREE.Color(item.id === selectedId ? '#ffd27a' : '#ffffff'))
        })
        mesh.instanceMatrix.needsUpdate = true
        scene.add(mesh)
        meshes.push(mesh)
      }
    }
    const generalMeshes: THREE.Object3D[] = []
    const objectEffects = createObjectEffects(shown, presets, ox, oy, base)
    scene.add(objectEffects.group)
    const treeResources = createTreeResources()
    const plantResources = createPlantResources()
    const shadowResources = createTreeShadowResources()
    const treeShadows: { mesh: THREE.Mesh; height: number; width: number }[] = []
    const updateShadows = () => {
      const lit = objectEffects.update(currentSolar.current, !terrain && !geographicMap?.getTerrain())
      renderer.domElement.dataset.objectLights = String(lit)
      renderer.domElement.dataset.objectShadows = String(!terrain && !geographicMap?.getTerrain() && (currentSolar.current?.elevation_deg ?? -1) >= 5 ? shown.length : 0)
      for (const { mesh, height, width } of treeShadows)
        updateTreeShadow(mesh, height, width, terrain || geographicMap?.getTerrain() ? null : currentSolar.current)
    }
    const groundAt = (x: number, y: number) =>
      terrain
        ? groundHeight(
            terrain,
            ((x - terrain.bounds[0]) / (terrain.bounds[2] - terrain.bounds[0])) *
              (terrain.size - 1),
            ((terrain.bounds[3] - y) / (terrain.bounds[3] - terrain.bounds[1])) *
              (terrain.size - 1),
          ) - base
        : 0
    for (const item of ordinary) {
      const g = geometry![item.id]
      const color = item.id === selectedId ? '#e9ad3c' : '#39765c'
      let mesh: THREE.Object3D
      if (g.type === 'Polygon') {
        const ring = (points: number[][]) =>
          points.map(([x, y]) => new THREE.Vector2(x - ox, y - oy))
        const shape = new THREE.Shape(ring(g.coordinates[0]))
        shape.holes = g.coordinates.slice(1).map((points) => new THREE.Path(ring(points)))
        const height = ['building', 'canopy'].includes(item.kind) ? (item.height_m ?? 0) : 0
        const draped = Boolean(item.road && terrain)
        const geo = draped
          ? drapedSurface(g, siteTerrainGeometry!, ox, oy)
          : height > 0
            ? new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false })
            : new THREE.ShapeGeometry(shape)
        if (!draped) geo.rotateX(-Math.PI / 2)
        const material = new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide })
        if (item.road) {
          const surface = item.road.surface
          if (!roadMaps.has(surface)) {
            const texture = roadTexture(surface)
            texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())
            roadMaps.set(surface, texture); sceneTextures.push(texture)
          }
          roadUvs(geo, ox, oy, mapFrame?.origin ?? [ox, oy])
          material.map = roadMaps.get(surface)!
          material.color.set(item.id === selectedId ? '#fff0ca' : '#ffffff')
          material.roughness = .95
          material.polygonOffset = true
          material.polygonOffsetFactor = -2
          material.polygonOffsetUnits = -2
        }
        const polygonMesh = new THREE.Mesh(geo, material)
        if (draped) terrainSurfaces.push(polygonMesh)
        mesh = polygonMesh
        const center = new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3())
        mesh.position.y = (draped ? 0 : groundAt(center.x + ox, oy - center.z)) + 0.08
      } else if (g.type === 'LineString') {
        mesh = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(
            g.coordinates.map(([x, y]) => new THREE.Vector3(x - ox, groundAt(x, y) + 0.15, oy - y)),
          ),
          new THREE.LineBasicMaterial({ color }),
        )
      } else {
        const [x, y] = g.coordinates
        if (item.kind === 'tree' && item.layout_plant !== 'shrub' && item.layout_plant !== 'flowers') {
          const design = designForTree(item), dimensions = treeChoices.find((choice) => choice.id === design.variant)!
          const tree = treeResources.make(design.variant)
          tree.rotation.x = -Math.PI / 2
          const group = new THREE.Group(); group.add(tree)
          group.scale.set(dimensions.width * design.scale, dimensions.height * design.scale, dimensions.width * design.scale)
          group.rotation.y = -design.rotation_deg * Math.PI / 180
          group.position.set(x - ox, groundAt(x, y), oy - y)
          const shadow = new THREE.Group(), silhouette = shadowResources.make()
          shadow.position.copy(group.position)
          shadow.rotation.x = -Math.PI / 2
          shadow.add(silhouette)
          treeShadows.push({ mesh: silhouette, height: dimensions.height * design.scale, width: dimensions.width * design.scale })
          scene.add(shadow)
          group.traverse((child) => { child.userData.itemId = item.id })
          mesh = group
        } else if (item.layout_plant === 'shrub' || item.layout_plant === 'flowers') {
          const look = plantLook(item), group = plantResources.make(look.id)
          group.rotation.x = -Math.PI / 2
          group.position.set(x - ox, groundAt(x, y), oy - y)
          group.traverse((child) => { child.userData.itemId = item.id })
          mesh = group
        } else {
        mesh = new THREE.Mesh(
          new THREE.SphereGeometry(0.8, 10, 8),
          new THREE.MeshStandardMaterial({ color }),
        )
        mesh.position.set(x - ox, groundAt(x, y) + 0.8, oy - y)
        }
      }
      mesh.userData.itemId = item.id
      scene.add(mesh)
      generalMeshes.push(mesh)
    }
    renderer.domElement.dataset.roadTextures = [...roadMaps.keys()].sort().join(',')
    const contextMeshes: THREE.Line[] = []
    for (const outline of outlines ?? []) {
      if (outline.geometry.type !== 'Polygon') continue
      for (const ring of outline.geometry.coordinates) {
        const points: THREE.Vector3[] = []
        const spacing = terrain
          ? Math.max(
              0.5,
              Math.min(
                terrain.bounds[2] - terrain.bounds[0],
                terrain.bounds[3] - terrain.bounds[1],
              ) /
                (terrain.size - 1) /
                2,
            )
          : 10
        for (let i = 1; i < ring.length; i++) {
          const [ax, ay] = ring[i - 1],
            [bx, by] = ring[i]
          const steps = Math.min(
            1000,
            Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / spacing)),
          )
          for (let j = 0; j <= steps; j++) {
            const x = ax + ((bx - ax) * j) / steps,
              y = ay + ((by - ay) * j) / steps
            points.push(new THREE.Vector3(x - ox, groundAt(x, y) + 0.2, oy - y))
          }
        }
        const line = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(points),
          new THREE.LineBasicMaterial({
            color: outline.id === selectedId ? '#e9ad3c' : outline.color,
          }),
        )
        if (outline.id) line.userData.itemId = outline.id
        scene.add(line)
        contextMeshes.push(line)
      }
    }
    let groundMesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> | undefined
    if (terrain) {
      const geo = siteTerrainGeometry!
      groundMesh = new THREE.Mesh(
        geo,
        new THREE.MeshStandardMaterial({ color: '#b4c8a4', side: THREE.DoubleSide }),
      )
      scene.add(groundMesh)
      if (terrainWater) runoffMeshes(terrain, terrainWater, ox, oy, base).forEach(mesh => scene.add(mesh))
      else pondMeshes(terrain, ox, oy, base).forEach(mesh => scene.add(mesh))
      renderer.domElement.dataset.runoffCells = String(terrainWater?.cells.length ?? 0)
    }
    renderer.domElement.dataset.groundTexture = 'false'
    const paintBoundary = terrainBoundary ?? outlines?.find(outline => !outline.id)?.geometry
    if (groundPaint?.strokes.length && mapFrame && paintBoundary) {
      const paint = groundTexture(groundPaint.boundary, groundPaint.strokes)
      paint.texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())
      sceneTextures.push(paint.texture)
      const geo = siteTerrainGeometry?.clone() ?? groundSurface(paintBoundary, null, ox, oy, base)
      groundUvs(geo, ox, oy, mapFrame, paint.frame)
      const painted = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: paint.texture, transparent: true, alphaTest: .01, depthWrite: false, side: THREE.DoubleSide, roughness: .95, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }))
      painted.position.y = .01
      scene.add(painted)
      terrainSurfaces.push(painted)
      renderer.domElement.dataset.groundTexture = 'true'
    }
    const bounds = new THREE.Box3()
    generalMeshes.forEach((m) => bounds.union(new THREE.Box3().setFromObject(m)))
    contextMeshes.forEach((m) => bounds.union(new THREE.Box3().setFromObject(m)))
    meshes.forEach((m) => bounds.union(new THREE.Box3().setFromObject(m)))
    if (groundMesh) bounds.union(new THREE.Box3().setFromObject(groundMesh))
    terrainSurfaces.forEach(surface => bounds.union(new THREE.Box3().setFromObject(surface)))
    const extent = bounds.isEmpty()
      ? 8
      : Math.max(5, ...bounds.getSize(new THREE.Vector3()).toArray())
    const center = bounds.isEmpty() ? new THREE.Vector3() : bounds.getCenter(new THREE.Vector3())
    const grid = new THREE.GridHelper(Math.max(20, extent * 2), 20, 0x7b927c, 0xc6d2c3)
    grid.position.y = -0.01
    if (!embedded) scene.add(grid)
    camera.position.copy(center).add(new THREE.Vector3(extent * 0.9, extent * 0.7, -extent * 0.9))
    controls?.target.copy(center)
    if (!embedded && cameraState.current && !fitRequested.current) {
      camera.position.copy(cameraState.current.position)
      controls?.target.copy(cameraState.current.target)
    }
    fitRequested.current = false
    if (controls) {
      controls.enabled = tool === 'navigate'
      controls.update()
    }
    const layerId = 'ground-studio-design'
    const layer: CustomLayerInterface = {
      id: layerId,
      type: 'custom',
      renderingMode: '3d',
      render: (_gl, args) => {
        if (!alive || !mapFrame) return
        updateShadows()
        camera.matrixWorld.identity()
        camera.matrixWorldInverse.identity()
        camera.matrixAutoUpdate = false
        camera.projectionMatrix.fromArray(args).multiply(mapModelMatrix(mapFrame, ox, oy))
        camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert()
        renderer.resetState()
        renderer.render(scene, camera)
        renderer.resetState()
        container.dataset.drawCalls = String(renderer.info.render.calls)
        container.dataset.triangles = String(renderer.info.render.triangles)
        renderer.domElement.dataset.designTriangles = String(renderer.info.render.triangles)
      },
    }
    const navigation = embedded
      ? [
          geographicMap!.dragPan,
          geographicMap!.dragRotate,
          geographicMap!.touchZoomRotate,
          geographicMap!.doubleClickZoom,
        ]
      : []
    const enabled = navigation.map((handler) => handler.isEnabled())
    if (embedded) {
      if (tool !== 'navigate') navigation.forEach((handler) => handler.disable())
      geographicMap!.addLayer(layer)
    }
    const render = () => {
      if (alive) {
        updateShadows()
        if (embedded) {
          geographicMap!.triggerRepaint()
          return
        }
        renderer.render(scene, camera)
        container.dataset.drawCalls = String(renderer.info.render.calls)
        container.dataset.triangles = String(renderer.info.render.triangles)
      }
    }
    redraw.current = render
    const resize = () => {
      if (embedded) {
        render()
        return
      }
      const width = Math.max(1, container.clientWidth)
      const height = Math.max(1, container.clientHeight)
      renderer.setSize(width, height)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      render()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(container)
    controls?.addEventListener('change', render)
    const pick = (event: MouseEvent) => {
      if (tool !== 'navigate') return
      const rect = renderer.domElement.getBoundingClientRect(),
        ray = new THREE.Raycaster()
      const ndc = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        (-(event.clientY - rect.top) / rect.height) * 2 + 1,
      )
      if (embedded) ray.ray.copy(mapRay(ndc, camera.projectionMatrix).ray)
      else ray.setFromCamera(ndc, camera)
      ray.params.Line.threshold = Math.max(0.5, extent / 200)
      const hit = ray.intersectObjects([
        ...meshes,
        ...generalMeshes,
        ...contextMeshes.filter((m) => m.userData.itemId),
      ])[0]
      if (hit?.object.userData.itemId) callbacks.current.onSelect?.(hit.object.userData.itemId)
      if (hit?.instanceId !== undefined)
        callbacks.current.onSelect?.(hit.object.userData.ids[hit.instanceId])
    }
    const cursor = new THREE.LineLoop(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: '#b45309' }),
    )
    scene.add(cursor)
    let points: [number, number][] = [],
      draft: Terrain | null = null,
      pointer: number | null = null
    let animation = 0, previousTime = 0
    let brushPoint: [number, number] | null = null, previousPoint: [number, number] | null = null
    const hitGround = (event: PointerEvent) => {
      if (!terrain || !groundMesh) return null
      const rect = renderer.domElement.getBoundingClientRect(),
        ray = new THREE.Raycaster()
      const ndc = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        1 - ((event.clientY - rect.top) / rect.height) * 2,
      )
      if (embedded) ray.ray.copy(mapRay(ndc, camera.projectionMatrix).ray)
      else ray.setFromCamera(ndc, camera)
      const hit = ray.intersectObject(groundMesh)[0]
      if (!hit) return null
      return [
        ((hit.point.x + ox - terrain.bounds[0]) / (terrain.bounds[2] - terrain.bounds[0])) *
          (terrain.size - 1),
        ((terrain.bounds[3] - (oy - hit.point.z)) / (terrain.bounds[3] - terrain.bounds[1])) *
          (terrain.size - 1),
      ] as [number, number]
    }
    const displayTerrain = (t: Terrain) => {
      if (!groundMesh || !terrain) return
      updateTerrainGeometry(groundMesh.geometry, t, ox, oy, base)
      for (const surface of terrainSurfaces) {
        if (surface.geometry.userData.groundIndices) updateDrapedSurface(surface.geometry, groundMesh.geometry)
        else updateTerrainGeometry(surface.geometry, t, ox, oy, base)
      }
      const matrix = new THREE.Matrix4()
      meshes.forEach((mesh) => {
        ;(mesh.userData.ids as string[]).forEach((id, i) => {
          const item = shown.find((v) => v.id === id)!,
            pose = item.object_pose!
          const x = ((pose.x - t.bounds[0]) / (t.bounds[2] - t.bounds[0])) * (t.size - 1)
          const y = ((t.bounds[3] - pose.y) / (t.bounds[3] - t.bounds[1])) * (t.size - 1)
          mesh.getMatrixAt(i, matrix)
          const previous = mesh.userData.ground?.[i] ?? groundHeight(terrain, x, y)
          const height = groundHeight(t, x, y)
          matrix.elements[13] += height - previous
          mesh.setMatrixAt(i, matrix)
          mesh.userData.ground ??= {}
          mesh.userData.ground[i] = height
        })
        mesh.instanceMatrix.needsUpdate = true
        mesh.computeBoundingSphere()
      })
      render()
    }
    const tick = (time: number) => {
      if (pointer === null || !terrainBrush || !terrain) return
      if (brushPoint && tool !== 'water') {
        draft = terrainDab(draft ?? terrain, [previousPoint ?? brushPoint, brushPoint], terrainBrush, previousTime ? (time - previousTime) / 1000 : .016)
        previousPoint = brushPoint
        displayTerrain(draft)
      }
      previousTime = time
      animation = requestAnimationFrame(tick)
    }
    const hover = (event: PointerEvent) => {
      if (disabled || tool === 'navigate' || !terrain) return
      const point = hitGround(event)
      if (!point) { brushPoint = null; cursor.visible = false; render(); return }
      brushPoint = point
      cursor.visible = true
      const t = draft ?? terrain,
        vertices: THREE.Vector3[] = []
      const cx =
        terrain.bounds[0] +
        (point[0] / (terrain.size - 1)) * (terrain.bounds[2] - terrain.bounds[0])
      const cy =
        terrain.bounds[3] -
        (point[1] / (terrain.size - 1)) * (terrain.bounds[3] - terrain.bounds[1])
      for (let i = 0; i < 64; i++) {
        const a = (i / 64) * Math.PI * 2
        const divisor = terrainBrush?.shape === 'square' ? Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a))) : 1
        const x = cx + Math.cos(a) / divisor * radius, y = cy + Math.sin(a) / divisor * radius
        vertices.push(
          new THREE.Vector3(
            x - ox,
            groundHeight(
              t,
              ((x - t.bounds[0]) / (t.bounds[2] - t.bounds[0])) * (t.size - 1),
              ((t.bounds[3] - y) / (t.bounds[3] - t.bounds[1])) * (t.size - 1),
            ) -
              base +
              0.1,
            oy - y,
          ),
        )
      }
      cursor.geometry.dispose()
      cursor.geometry = new THREE.BufferGeometry().setFromPoints(vertices)
      if (!terrainBrush && pointer === event.pointerId && tool !== 'move' && tool !== 'water' && tool !== 'erase') {
        const last = points[points.length - 1]
        if (!last || Math.hypot(point[0] - last[0], point[1] - last[1]) > 0.05) points.push(point)
        draft = terrainStroke(terrain, points, tool, radius, strength, level)
        displayTerrain(draft)
      }
      render()
    }
    const down = (event: PointerEvent) => {
      if (disabled || event.button !== 0 || tool === 'navigate' || pointer !== null) return
      const point = hitGround(event)
      if (!point || !terrain) return
      renderer.domElement.focus()
      if (tool === 'move') {
        const item = shown.find((i) => i.id === selectedId)
        if (item?.object_pose)
          callbacks.current.onMove?.(
            terrain.bounds[0] +
              (point[0] / (terrain.size - 1)) * (terrain.bounds[2] - terrain.bounds[0]) -
              item.object_pose.x,
            terrain.bounds[3] -
              (point[1] / (terrain.size - 1)) * (terrain.bounds[3] - terrain.bounds[1]) -
              item.object_pose.y,
          )
        return
      }
      points = [point]
      draft = null
      if (tool === 'water' && terrainBrush) {
        try { draft = pondAt(terrain, point, terrainBrush) }
        catch (error) { callbacks.current.onTerrainMessage?.((error as Error).message); return }
      }
      pointer = event.pointerId
      renderer.domElement.setPointerCapture(pointer)
      callbacks.current.onTerrainGesture?.(true)
      callbacks.current.onTerrainMessage?.('')
      hover(event)
      if (terrainBrush && tool !== 'water') { previousTime = 0; previousPoint = point; animation = requestAnimationFrame(tick) }
    }
    const finish = (cancel: boolean) => {
      if (pointer === null) return
      const id = pointer
      pointer = null
      cancelAnimationFrame(animation)
      if (renderer.domElement.hasPointerCapture(id)) renderer.domElement.releasePointerCapture(id)
      if (cancel && terrain) displayTerrain(terrain)
      else if (draft) callbacks.current.onTerrain?.(draft)
      callbacks.current.onTerrainGesture?.(false)
      draft = null
      points = []
      brushPoint = previousPoint = null
    }
    const up = () => finish(false),
      cancel = () => finish(true)
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        finish(true)
      }
    }
    renderer.domElement.tabIndex = 0
    const previousTouchAction = renderer.domElement.style.touchAction
    renderer.domElement.style.touchAction = 'none'
    renderer.domElement.addEventListener('pointerdown', down)
    renderer.domElement.addEventListener('pointermove', hover)
    renderer.domElement.addEventListener('pointerup', up)
    renderer.domElement.addEventListener('pointercancel', cancel)
    renderer.domElement.addEventListener('lostpointercapture', cancel)
    renderer.domElement.addEventListener('keydown', key)
    renderer.domElement.addEventListener('click', pick)
    const lost = (event: Event) => {
      event.preventDefault()
      finish(true)
      sceneTextures.forEach(texture => texture.dispose())
      delete renderer.domElement.dataset.roadTextures
      delete renderer.domElement.dataset.groundTexture
      if (embedded) delete renderer.domElement.dataset.designTriangles
      setStatus('3D context lost. Map footprints and numeric controls remain available.')
    }
    const restored = () => setViewVersion((value) => value + 1)
    renderer.domElement.addEventListener('webglcontextrestored', restored)
    renderer.domElement.addEventListener('webglcontextlost', lost)
    resize()
    queueMicrotask(() => {
      if (alive)
        setStatus(
          `${shown.length} preset objects; ${ordinary.length} work geometries; ${outlines?.length ?? 0} site/target outlines · orbit, pan and zoom. Concept geometry; no lighting/shade analysis.`,
        )
    })
    return () => {
      if (controls)
        cameraState.current = { position: camera.position.clone(), target: controls.target.clone() }
      finish(true)
      if (embedded) {
        if (mapStyle(geographicMap!) && geographicMap!.getLayer(layerId))
          geographicMap!.removeLayer(layerId)
        navigation.forEach((handler, i) => {
          if (enabled[i]) handler.enable()
          else handler.disable()
        })
        delete renderer.domElement.dataset.designTriangles
      }
      renderer.domElement.style.touchAction = previousTouchAction
      alive = false
      if (redraw.current === render) redraw.current = null
      if (lights.current?.sun === sun) lights.current = null
      cursor.geometry.dispose()
      ;(cursor.material as THREE.Material).dispose()
      renderer.domElement.removeEventListener('pointerdown', down)
      renderer.domElement.removeEventListener('pointermove', hover)
      renderer.domElement.removeEventListener('pointerup', up)
      renderer.domElement.removeEventListener('pointercancel', cancel)
      renderer.domElement.removeEventListener('lostpointercapture', cancel)
      renderer.domElement.removeEventListener('keydown', key)
      observer.disconnect()
      controls?.dispose()
      renderer.domElement.removeEventListener('click', pick)
      renderer.domElement.removeEventListener('webglcontextrestored', restored)
      renderer.domElement.removeEventListener('webglcontextlost', lost)
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
          o.geometry.dispose()
          const materials = Array.isArray(o.material) ? o.material : [o.material]
          materials.forEach((m) => m.dispose())
        }
      })
      renderer.dispose()
      treeResources.dispose()
      plantResources.dispose()
      objectEffects.dispose()
      delete renderer.domElement.dataset.objectLights
      delete renderer.domElement.dataset.objectShadows
      shadowResources.dispose()
      if (!embedded) {
        renderer.forceContextLoss()
        renderer.domElement.remove()
      }
    }
  }, [
    geographicMap,
    mapFrame,
    presets,
    items,
    geometry,
    outlines,
    terrain,
    terrainBoundary,
    terrainWater,
    groundPaint,
    terrainBrush,
    tool,
    radius,
    strength,
    level,
    disabled,
    selectedId,
    cameraState,
    viewVersion,
  ])
  return (
    <div className="object-scene">
      <button
        type="button"
        className="button secondary compact"
        onClick={() => {
          if (geographicMap && mapFrame)
            geographicMap.easeTo({
              center: [
                mapFrame.mercator[0] * 360 - 180,
                (Math.atan(Math.sinh(Math.PI * (1 - 2 * mapFrame.mercator[1]))) * 180) / Math.PI,
              ],
              duration: 300,
            })
          fitRequested.current = true
          setViewVersion((value) => value + 1)
        }}
      >
        {geographicMap ? 'Recenter / retry map scene' : 'Fit / retry 3D scene'}
      </button>
      {geometry && (
        <details className="scene-accuracy">
          <summary>Concept model: accuracy limits</summary>
          <p className="text-xs">
            {geographicMap
              ? `Map-aligned concept scene; sampled horizontal alignment residual ${mapFrame?.residual_m.toFixed(3) ?? 'unknown'} m. Heights are relative to the declared starting surface, not sea level. `
              : 'Local metric scene, grid north. '}
            General polygons use representative-point ground contact; lines follow sampled terrain.
            Boundary and target outlines sample the concept terrain; calibrated images and
            constraint overlays remain in the 2D plan. Unknown heights remain flat. This scene is
            not a shade or earthworks calculation.
          </p>
        </details>
      )}
      {onTerrain && !terrainBrush && (
        <fieldset
          disabled={disabled}
          className="flex flex-wrap gap-3"
          aria-label="Integrated terrain editor"
        >
          <legend>Terrain and objects in one scene</legend>
          <label>
            Scene tool
            <select value={tool} onChange={(e) => setTool(e.target.value as typeof localTool)}>
              <option value="navigate">Navigate / select</option>
              {terrain && (
                <>
                  <option value="raise">Raise terrain</option>
                  <option value="lower">Lower terrain</option>
                  <option value="smooth">Smooth terrain</option>
                  <option value="flatten">Flatten terrain</option>
                  <option value="move" disabled={!onMove}>
                    Move selected object to ground
                  </option>
                </>
              )}
            </select>
          </label>
          <details className="scene-brush-settings" open={tool !== 'navigate'}>
            <summary>Brush settings and limits</summary>
            <label>
              Scene brush radius (m)
              <input
                type="number"
                min="0.1"
                max="2000"
                value={radius}
                onChange={(e) =>
                  setRadius(Math.max(0.1, Math.min(2000, Number(e.target.value) || 0.1)))
                }
              />
            </label>
            <label>
              Scene stroke strength (m)
              <input
                type="number"
                min="0"
                max="100"
                value={strength}
                onChange={(e) =>
                  setStrength(Math.max(0, Math.min(100, Number(e.target.value) || 0)))
                }
              />
            </label>
            <label>
              Scene flatten elevation (m)
              <input
                type="number"
                min="-500"
                max="9000"
                value={level}
                onChange={(e) =>
                  setLevel(Math.max(-500, Math.min(9000, Number(e.target.value) || 0)))
                }
              />
            </label>
            <p>
              {terrain
                ? `${terrain.datum} / ${terrain.metric_crs} / ${terrain.size} x ${terrain.size} nodes. Drag to sculpt; release commits one undo action. Escape cancels. Switch to Navigate to orbit. Edited terrain has no supported shade analysis.`
                : 'Create a sourced terrain surface in the terrain panel to enable sculpting and ground placement.'}
            </p>
          </details>
        </fieldset>
      )}
      <div
        ref={host}
        className="object-scene-viewport w-full overflow-hidden rounded border"
        data-testid="object-scene"
        hidden={Boolean(geographicMap)}
      />
      <p role="status">{status}</p>
    </div>
  )
}
