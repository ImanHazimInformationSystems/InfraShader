import { describe, expect, it } from 'vitest'
import { createObjectEffects, nightLighting } from './object-effects'
import { itemSchema } from '../domain/workspace'
import catalogue from '../../public/objects/catalogue.json'
import { catalogueSchema } from '../domain/objects'

describe('illustrative object effects', () => {
  it('fades lights around dusk, hides unknown sun, and updates sun shadows without persistence', () => {
    expect(nightLighting(null)).toBe(0)
    expect(nightLighting({azimuth_deg:0,elevation_deg:20})).toBe(0)
    expect(nightLighting({azimuth_deg:0,elevation_deg:0})).toBe(.5)
    expect(nightLighting({azimuth_deg:0,elevation_deg:-10})).toBe(1)
    const item=itemSchema.parse({ id:crypto.randomUUID(),name:'Test lamp',kind:'object',status:'proposed',count:1,height_m:null,height_source:'',quantity_override:null,rate_id:null,geometry:null,source_note:'Synthetic',provenance:'estimated',object_instance:{asset_id:'light',longitude:101,latitude:3},object_pose:{x:0,y:0,elevation_m:0,ground_elevation_m:0,dimensions:[.8,3.15,.3],footprint:{type:'Polygon',coordinates:[]},license:'MIT',asset_sha256:'fixture',metric_crs:'Test metres'} })
    const before=JSON.stringify(item), effects=createObjectEffects([item],catalogueSchema.parse(catalogue),0,0,0)
    expect(effects.update({azimuth_deg:90,elevation_deg:45},true)).toBe(0)
    const shadow=effects.group.children[0]
    expect(shadow.visible).toBe(true)
    expect(effects.update({azimuth_deg:90,elevation_deg:-10},true)).toBe(1)
    expect(shadow.visible).toBe(false)
    expect(effects.update(null,false)).toBe(0)
    expect(JSON.stringify(item)).toBe(before)
    effects.dispose()
  })
})
