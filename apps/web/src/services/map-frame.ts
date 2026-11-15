import { z } from 'zod'
import { Matrix4, Vector3, Raycaster, Vector2 } from 'three'

const pair = z.tuple([z.number().finite(), z.number().finite()])
export const mapFrameSchema = z.object({
  origin: pair,
  mercator: pair,
  east: pair,
  north: pair,
  scale: z.number().positive(),
  residual_m: z.number().nonnegative(),
  supported: z.boolean(),
})
export type MapFrame = z.infer<typeof mapFrameSchema>

// Existing scene axes: x east, y up, z south. Preserve grid convergence.
export function mapModelMatrix(frame: MapFrame, x: number, northing: number) {
  const dx = x - frame.origin[0],
    dy = northing - frame.origin[1]
  return new Matrix4().set(
    frame.east[0],
    0,
    -frame.north[0],
    frame.mercator[0] + dx * frame.east[0] + dy * frame.north[0],
    frame.east[1],
    0,
    -frame.north[1],
    frame.mercator[1] + dx * frame.east[1] + dy * frame.north[1],
    0,
    frame.scale,
    0,
    0,
    0,
    0,
    0,
    1,
  )
}

export function mapRay(point: Vector2, projection: Matrix4) {
  const inverse = projection.clone().invert()
  const near = new Vector3(point.x, point.y, -1).applyMatrix4(inverse)
  const far = new Vector3(point.x, point.y, 1).applyMatrix4(inverse)
  return new Raycaster(near, far.sub(near).normalize())
}
