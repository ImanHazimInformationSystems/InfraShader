import { useState, type FormEvent } from 'react'
import { z } from 'zod'
import type { Project } from '../domain/projects'
import { geometrySchema, type Geometry } from '../domain/workspace'
import { request } from '../services/api'
import { Button } from './ui/button'
const responseSchema = z.object({
  geometry: geometrySchema,
  metric_crs: z.string(),
  rotation_reference: z.string(),
})
export default function RectangleBuilder({
  project,
  token,
  onGeometry,
}: {
  project: Project
  token?: string
  onGeometry: (geometry: Geometry) => void
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('')
  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setBusy(true)
    setError('')
    try {
      const result = await request(
        `/api/v1/organisations/${project.organisation_id}/projects/${project.id}/rectangle-preview`,
        responseSchema,
        token,
        {
          method: 'POST',
          body: JSON.stringify(
            Object.fromEntries(
              ['longitude', 'latitude', 'width_m', 'length_m', 'rotation_deg'].map((key) => [
                key,
                Number(form.get(key)),
              ]),
            ),
          ),
        },
      )
      onGeometry(result.geometry)
      setNotice(
        `Generated in ${result.metric_crs}. ${result.rotation_reference}. Apply the item, then save the workspace.`,
      )
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Rectangle unavailable.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <details className="my-3">
      <summary>Canopy dimensions and rotation</summary>
      <p>
        Generates a rectangular footprint in a suitable projected CRS. Set height and source in the
        item editor. Generating replaces the current coordinate draft.
      </p>
      <form onSubmit={(event) => void generate(event)} className="grid gap-3 md:grid-cols-2">
        <fieldset disabled={busy} className="contents">
          <label>
            Rectangle centre longitude
            <input
              name="longitude"
              type="number"
              step="any"
              min="-180"
              max="180"
              required
              defaultValue={(project.site.bounds[0] + project.site.bounds[2]) / 2}
            />
          </label>
          <label>
            Rectangle centre latitude
            <input
              name="latitude"
              type="number"
              step="any"
              min="-80"
              max="84"
              required
              defaultValue={(project.site.bounds[1] + project.site.bounds[3]) / 2}
            />
          </label>
          <label>
            Rectangle width (m)
            <input
              name="width_m"
              type="number"
              step="0.01"
              min="0.01"
              max="1000"
              required
              defaultValue="10"
            />
          </label>
          <label>
            Rectangle length (m)
            <input
              name="length_m"
              type="number"
              step="0.01"
              min="0.01"
              max="1000"
              required
              defaultValue="10"
            />
          </label>
          <label>
            Clockwise rotation from grid north (degrees)
            <input
              name="rotation_deg"
              type="number"
              step="0.1"
              min="0"
              max="359.9"
              required
              defaultValue="0"
            />
          </label>
          <Button>Generate canopy footprint</Button>
        </fieldset>
      </form>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
    </details>
  )
}
