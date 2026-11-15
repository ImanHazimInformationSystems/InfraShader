import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { WorkItem } from '../domain/workspace'
import type { ObjectInstance, ObjectPreset } from '../domain/objects'
import type { Solar } from './environment'

export function nightLighting(solar: Solar | null) {
  return solar && Number.isFinite(solar.elevation_deg) ? Math.max(0, Math.min(1, (6 - solar.elevation_deg) / 12)) : 0
}
export function objectRoot(item: WorkItem, ox: number, oy: number, base: number) {
  const obj = item.object_instance!, pose = item.object_pose!
  const root = new THREE.Object3D()
  root.position.set(pose.x - ox, pose.elevation_m - base, oy - pose.y)
  root.rotation.set(obj.tilt_deg * Math.PI / 180, -obj.rotation_deg * Math.PI / 180, obj.lean_deg * Math.PI / 180, 'YXZ')
  root.scale.set(obj.scale * obj.stretch_x, obj.scale * obj.stretch_y, obj.scale * obj.stretch_z)
  root.updateMatrixWorld(true)
  return root
}
export function previewObject(item: WorkItem, form: ObjectInstance, preset: ObjectPreset): WorkItem {
  const pose = item.object_pose!
  const provisional = { ...item, object_instance: form, object_pose: { ...pose, elevation_m: 0 } }
  const [w,h,d] = preset.dimensions
  const bounds = new THREE.Box3(new THREE.Vector3(-w/2,0,-d/2),new THREE.Vector3(w/2,h,d/2))
    .applyMatrix4(objectRoot(provisional,pose.x,pose.y,0).matrixWorld)
  return { ...provisional, object_pose: { ...pose, elevation_m: pose.ground_elevation_m+form.elevation_offset_m-bounds.min.y } }
}
function hull(points: THREE.Vector2[]) {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y)
  const cross = (a: THREE.Vector2, b: THREE.Vector2, c: THREE.Vector2) => (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x)
  const half = (list: THREE.Vector2[]) => { const result: THREE.Vector2[] = []; for (const point of list) { while (result.length > 1 && cross(result.at(-2)!, result.at(-1)!, point) <= 0) result.pop(); result.push(point) } return result }
  return [...half(sorted).slice(0,-1), ...half(sorted.reverse()).slice(0,-1)]
}

/** Visual solid part-bound shadows and warm light pools; no lux or analytical coverage. */
export function createObjectEffects(items: WorkItem[], presets: ObjectPreset[], ox: number, oy: number, base: number) {
  const group = new THREE.Group()
  const shadowMaterial = new THREE.MeshBasicMaterial({ color: '#26362d', transparent: true, opacity: .23, depthWrite: false, side: THREE.DoubleSide })
  const shadow = new THREE.Mesh(new THREE.BufferGeometry(), shadowMaterial); group.add(shadow)
  const data = new Uint8Array(64 * 64 * 4)
  for (let y=0;y<64;y++) for(let x=0;x<64;x++) {
    const alpha = Math.max(0, 1 - Math.hypot(x-31.5,y-31.5)/31.5)
    data.set([255,255,255,Math.round(alpha*alpha*255)], (y*64+x)*4)
  }
  const texture = new THREE.DataTexture(data,64,64); texture.needsUpdate = true
  const poolGeometry = new THREE.PlaneGeometry(1,1).rotateX(-Math.PI/2)
  const bulbGeometry = new THREE.SphereGeometry(.11,8,6)
  const fixtures = items.filter((item) => presets.find((preset) => preset.id === item.object_instance!.asset_id)?.category === 'Lighting').map((item,index) => {
    const asset = presets.find((p) => p.id === item.object_instance!.asset_id)!, root = objectRoot(item,ox,oy,base)
    const position = new THREE.Vector3(0,asset.dimensions[1]*.94,0).applyMatrix4(root.matrixWorld)
    const bulbMaterial = new THREE.MeshStandardMaterial({ color:'#fff0b5',emissive:'#ffd995',emissiveIntensity:0 })
    const bulb = new THREE.Mesh(bulbGeometry,bulbMaterial); bulb.position.copy(position)
    const poolMaterial = new THREE.MeshBasicMaterial({ color:'#ffd393', map:texture, transparent:true, opacity:0, depthWrite:false, side:THREE.DoubleSide })
    const pool = new THREE.Mesh(poolGeometry,poolMaterial), range = Math.max(2.5,Math.min(6,asset.dimensions[1]*1.7+2))
    pool.position.set(position.x,item.object_pose!.ground_elevation_m-base+.05,position.z); pool.scale.setScalar(range*2)
    const light = index<8 ? new THREE.PointLight('#ffddab',0,range*2,2) : null
    if(light) { light.position.copy(position);group.add(light) }
    group.add(bulb,pool)
    return { item, bulb, bulbMaterial, pool, poolMaterial, light }
  })
  let previous = '', lit = 0
  return { group,
    update(solar: Solar | null, flat: boolean) {
      const key = JSON.stringify([solar,flat]); if(key===previous) return lit; previous=key
      const amount=nightLighting(solar);lit=0
      for(const fixture of fixtures) {
        const strength=fixture.item.object_instance!.light_on ? fixture.item.object_instance!.light_intensity*amount : 0
        fixture.bulb.visible=strength>0;fixture.pool.visible=strength>0&&flat
        fixture.bulbMaterial.emissiveIntensity=strength*2;fixture.poolMaterial.opacity=Math.min(.9,strength*.6)
        if(fixture.light) fixture.light.intensity=strength*20
        if(strength>0) lit++
      }
      shadow.visible=Boolean(flat&&solar&&solar.elevation_deg>=5)
      if(shadow.visible&&solar) {
        const az=solar.azimuth_deg*Math.PI/180, tangent=Math.tan(solar.elevation_deg*Math.PI/180), geometries:THREE.BufferGeometry[]=[]
        for(const item of items) {
          const preset=presets.find((p)=>p.id===item.object_instance!.asset_id)!, root=objectRoot(item,ox,oy,base), ground=item.object_pose!.ground_elevation_m-base
          for(const part of preset.parts) {
            const points:THREE.Vector2[]=[]
            for(const dx of [-.5,.5])for(const dy of [-.5,.5])for(const dz of [-.5,.5]) {
              const p=new THREE.Vector3(part.position[0]+dx*part.size[0],part.position[1]+dy*part.size[1],part.position[2]+dz*part.size[2]).applyMatrix4(root.matrixWorld)
              const distance=Math.max(0,p.y-ground)/tangent
              points.push(new THREE.Vector2(p.x-Math.sin(az)*distance,-p.z-Math.cos(az)*distance))
            }
            const outline=hull(points)
            if(outline.length<3)continue
            const geometry=new THREE.ShapeGeometry(new THREE.Shape(outline)).rotateX(-Math.PI/2)
            geometry.translate(0,ground+.07,0);geometries.push(geometry)
          }
        }
        shadow.geometry.dispose();shadow.geometry=geometries.length ? mergeGeometries(geometries,false)! : new THREE.BufferGeometry()
        for(const geometry of geometries)geometry.dispose()
      }
      return lit
    },
    dispose() { shadow.geometry.dispose();shadowMaterial.dispose();texture.dispose();poolGeometry.dispose();bulbGeometry.dispose();for(const f of fixtures){f.bulbMaterial.dispose();f.poolMaterial.dispose()} }
  }
}
