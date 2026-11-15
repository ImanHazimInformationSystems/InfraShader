import { z } from 'zod'
import type { Geometry } from './workspace'

export const terrainStudySchema = z.object({
  id: z.string(), workspace_revision: z.number(), stale: z.boolean(), created_at: z.string(),
  payload: z.object({
    scenario: z.string(), terrain_signature: z.string(), metric_crs: z.string(), datum: z.string(), source: z.string(),
    inputs: z.object({ rainfall_mmh: z.number(), duration_minutes: z.number(), infiltration_mmh: z.number(), roughness_n: z.number(), source: z.string() }),
    quantities: z.object({ cut_m3: z.number(), fill_m3: z.number(), net_fill_m3: z.number(), reference: z.string(), method: z.string(), ponds: z.array(z.object({ name: z.string(), storage_m3: z.number() })) }),
    water: z.object({ initial_water_m3: z.number(), rain_m3: z.number(), infiltrated_m3: z.number(), discharged_m3: z.number(), remaining_m3: z.number(), balance_error_m3: z.number(), peak_outlet_ls: z.number(), limited_transfers: z.number(), method: z.string(), time_step_s: z.number(),
      cells: z.array(z.object({ row: z.number(), column: z.number(), bed_m: z.number(), geometry: z.object({ type: z.literal('Polygon'), coordinates: z.array(z.array(z.tuple([z.number(), z.number()]))) }) })),
      frames: z.array(z.object({ seconds: z.number(), depths_m: z.array(z.number()), flow_to: z.array(z.number()) })),
    }),
  }),
})
export type TerrainStudy = z.infer<typeof terrainStudySchema>
export type TerrainWaterPreview = { signature: string; cells: { geometry: Geometry; level: number; depth: number; flowTo?: [number, number] }[] }
