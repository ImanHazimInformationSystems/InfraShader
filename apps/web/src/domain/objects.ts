import { z } from 'zod'
export const objectInstanceSchema = z.object({
  asset_id: z.string(),
  version: z.number().int().default(1),
  longitude: z.number(),
  latitude: z.number(),
  rotation_deg: z.number().min(0).lt(360).default(0),
  scale: z.number().min(0.5).max(2).default(1),
  stretch_x: z.number().min(0.25).max(4).default(1),
  stretch_y: z.number().min(0.25).max(4).default(1),
  stretch_z: z.number().min(0.25).max(4).default(1),
  tilt_deg: z.number().min(-80).max(80).default(0),
  lean_deg: z.number().min(-80).max(80).default(0),
  light_on: z.boolean().default(true),
  light_intensity: z.number().min(0).max(2).default(1),
  elevation_offset_m: z.number().min(-10).max(10).default(0),
  snap_m: z.number().min(0).max(10).default(0),
  group: z.string().max(80).default(''),
  locked: z.boolean().default(false),
})
export const objectPoseSchema = z.object({
  x: z.number(),
  y: z.number(),
  ground_elevation_m: z.number(),
  elevation_m: z.number(),
  dimensions: z.tuple([z.number(), z.number(), z.number()]),
  footprint: z.object({
    type: z.literal('Polygon'),
    coordinates: z.array(z.array(z.tuple([z.number(), z.number()]))),
  }),
  license: z.string(),
  asset_sha256: z.string(),
  metric_crs: z.string(),
})
export const catalogueSchema = z.array(
  z.object({
    id: z.string(),
    version: z.number(),
    name: z.string(),
    category: z.string(),
    unit: z.enum(['item', 'm', 'm2']),
    dimensions: z.tuple([z.number(), z.number(), z.number()]),
    pivot: z.array(z.number()),
    units: z.string(),
    license: z.string(),
    source: z.string(),
    author: z.string(),
    scale_min: z.number(),
    scale_max: z.number(),
    triangles: z.number(),
    sha256: z.string(),
    warning: z.string(),
    parts: z.array(
      z.object({
        shape: z.enum(['box', 'cylinder', 'sphere']),
        size: z.tuple([z.number(), z.number(), z.number()]),
        position: z.tuple([z.number(), z.number(), z.number()]),
        color: z.string(),
      }),
    ),
  }),
)
export type ObjectPreset = z.infer<typeof catalogueSchema>[number]
export type ObjectInstance = z.infer<typeof objectInstanceSchema>
