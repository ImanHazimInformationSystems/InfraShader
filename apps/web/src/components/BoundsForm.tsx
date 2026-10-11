import { useState } from 'react'
import { Crosshair } from 'lucide-react'
import { boundsSchema, type Bounds } from '../domain/projects'

export default function BoundsForm({ initial, viewport, onApply }: { initial: Bounds; viewport?: Bounds; onApply: (bounds: Bounds) => void }) {
  const [values, setValues] = useState(initial.map(String))
  const [error, setError] = useState('')
  function apply() {
    const parsed = boundsSchema.safeParse(values.map((value) => value.trim() === '' ? NaN : Number(value)))
    if (!parsed.success) { setError(parsed.error.issues[0].message); return }
    setError(''); onApply(parsed.data)
  }
  function useViewport() {
    if (!viewport) return
    const rounded = viewport.map((n) => Number(n.toFixed(6))) as Bounds
    const parsed = boundsSchema.safeParse(rounded)
    if (!parsed.success) { setError(`${parsed.error.issues[0].message} Zoom in and try again.`); return }
    setValues(rounded.map(String)); setError(''); onApply(parsed.data)
  }
  return <form onSubmit={(event) => { event.preventDefault(); apply() }} className="coordinate-form">
    <div className="coordinate-grid">{['West longitude', 'South latitude', 'East longitude', 'North latitude'].map((label, index) => <label key={label}>{label}<input inputMode="decimal" type="number" step="any" required value={values[index]} onChange={(event) => setValues(values.map((value, i) => i === index ? event.target.value : value))} /></label>)}</div>
    {error && <p role="alert" className="field-error">{error}</p>}
    <p className="fine-print">WGS84 longitude / latitude (EPSG:4326). This locator extent is not a surveyed site boundary. Map latitude range: −85° to 85°.</p>
    <button className="button secondary full" type="submit">Apply coordinates</button>
    {viewport && <button type="button" className="button text full" onClick={useViewport}><Crosshair size={16} />Use current map view</button>}
  </form>
}
