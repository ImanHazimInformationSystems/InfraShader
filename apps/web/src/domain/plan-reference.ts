import { z } from 'zod'
const point = z.tuple([z.number().finite(), z.number().finite()])
export const planReferenceSchema = z.object({
  evidence_id: z.uuid(),
  source_name: z.string(),
  source_sha256: z.string(),
  page: z.number(),
  rights_confirmed: z.boolean(),
  width: z.number(),
  height: z.number(),
  point_a: point,
  point_b: point,
  anchor: point,
  distance_m: z.number(),
  bearing_deg: z.number(),
  uncertainty_m: z.number(),
  source_note: z.string(),
  locked: z.boolean(),
  visible: z.boolean(),
  opacity: z.number(),
  corners: z.array(point).length(4).optional(),
  metric_crs: z.string().optional(),
  calibration_id: z.string().optional(),
  metres_per_pixel: z.number().optional(),
})
export type PlanReference = z.infer<typeof planReferenceSchema>
export function planInput(reference: PlanReference) {
  const clean = { ...reference }
  delete clean.corners
  delete clean.metric_crs
  delete clean.calibration_id
  delete clean.metres_per_pixel
  return clean
}
