import { useEffect, useRef, useState, type FormEvent } from 'react'
import { z } from 'zod'
import type { Bounds } from '../domain/projects'
import { geocoderUrl } from '../services/map'
const resultsSchema = z.object({
  features: z.array(
    z.object({
      geometry: z.object({
        type: z.literal('Point'),
        coordinates: z.tuple([z.number().min(-180).max(180), z.number().min(-85).max(85)]),
      }),
      properties: z.object({
        name: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        country: z.string().optional(),
      }),
    }),
  ),
})
type Result = z.infer<typeof resultsSchema>['features'][number]
export default function PlaceSearch({ onSelect }: { onSelect: (bounds: Bounds) => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Result[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const controller = useRef<AbortController | null>(null)
  useEffect(() => () => controller.current?.abort(), [])
  async function search(event: FormEvent) {
    event.preventDefault()
    controller.current?.abort()
    const current = new AbortController()
    controller.current = current
    setBusy(true)
    setMessage('')
    setResults([])
    try {
      if (geocoderUrl === 'offline')
        throw new Error('Search is disabled. Use map selection or coordinates.')
      const url = new URL(geocoderUrl)
      url.searchParams.set('q', query.trim())
      url.searchParams.set('limit', '5')
      const response = await fetch(url, {
        signal: AbortSignal.any([current.signal, AbortSignal.timeout(10000)]),
      })
      if (!response.ok)
        throw new Error('Place search unavailable or rate limited. Use coordinates or retry later.')
      const data = resultsSchema.parse(await response.json())
      if (!current.signal.aborted) {
        setResults(data.features)
        setMessage(
          data.features.length
            ? 'Choose a result, then refine your site extent.'
            : 'No places found. Try another name or enter coordinates.',
        )
      }
    } catch (reason) {
      if (!current.signal.aborted)
        setMessage(
          reason instanceof Error ? reason.message : 'Search unavailable. Use coordinates.',
        )
    } finally {
      if (!current.signal.aborted) setBusy(false)
    }
  }
  return (
    <section className="place-search" aria-label="Find a place">
      <form onSubmit={(event) => void search(event)}>
        <label>
          Search for a place
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            minLength={3}
            maxLength={160}
            required
            placeholder="Town, address or landmark"
          />
        </label>
        <button className="button secondary full" disabled={busy || query.trim().length < 3}>
          {busy ? 'Searching?' : 'Search places'}
        </button>
      </form>
      <p className="fine-print">
        Search sends your query to the configured Photon provider. No automatic location tracking.
      </p>
      <p role="status">{message}</p>
      {results.map((result, index) => (
        <button
          className="button text full"
          key={index}
          onClick={() => {
            const [x, y] = result.geometry.coordinates
            onSelect([
              Math.max(-180, x - 0.001),
              Math.max(-85, y - 0.001),
              Math.min(180, x + 0.001),
              Math.min(85, y + 0.001),
            ])
            setResults([])
            setMessage('Place selected. Refine the extent before creating your project.')
          }}
        >
          {[
            result.properties.name,
            result.properties.city,
            result.properties.state,
            result.properties.country,
          ]
            .filter(Boolean)
            .join(', ') || result.geometry.coordinates.join(', ')}
        </button>
      ))}
    </section>
  )
}
