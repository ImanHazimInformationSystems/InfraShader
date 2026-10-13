import { useEffect, useState, type FormEvent } from 'react'
import { rateListSchema, rateSchema, type Rate } from '../domain/calculations'
import { request } from '../services/api'
import { Button } from './ui/button'

export default function CatalogueBrowser({
  endpoint,
  token,
  basis,
  refresh,
  onRates,
  onEdit,
}: {
  endpoint: string
  token?: string
  basis: 'cost' | 'indicative_budget'
  refresh: number
  onRates: (rates: Rate[]) => void
  onEdit: (rate: Rate) => void
}) {
  const [query, setQuery] = useState('')
  const [unit, setUnit] = useState('')
  const [category, setCategory] = useState('')
  const [archived, setArchived] = useState(false)
  const [changing, setChanging] = useState(false)
  const [filter, setFilter] = useState({
    query: '',
    unit: '',
    category: '',
    archived: false,
    offset: 0,
  })
  const [page, setPage] = useState<{ items: Rate[]; total: number; offset: number } | null>(null)
  const [settled, setSettled] = useState('')
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const requestKey = JSON.stringify([endpoint, token, basis, filter, refresh, retry])
  const busy = settled !== requestKey
  useEffect(() => {
    let active = true
    const params = new URLSearchParams({
      query: filter.query,
      category: filter.category,
      archived: String(filter.archived),
      basis,
      offset: String(filter.offset),
      limit: '20',
    })
    if (filter.unit) params.set('unit', filter.unit)
    request(`${endpoint}/rates?${params}`, rateListSchema, token)
      .then((result) => {
        if (active) {
          setError('')
          setPage(result)
          onRates(result.items)
        }
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Catalogue unavailable.')
      })
      .finally(() => {
        if (active) setSettled(requestKey)
      })
    return () => {
      active = false
    }
  }, [endpoint, token, basis, filter, refresh, onRates, retry, requestKey])
  async function archive(rate: Rate) {
    if (
      !window.confirm(
        `${rate.archived ? 'Restore' : 'Archive'} ${rate.code} v${rate.version}? Existing assignments and issued prices remain unchanged.`,
      )
    )
      return
    setChanging(true)
    setError('')
    try {
      const saved = await request(`${endpoint}/rates/${rate.id}`, rateSchema, token, {
        method: 'PATCH',
        body: JSON.stringify({
          expected_revision: rate.metadata_revision,
          archived: !rate.archived,
        }),
      })
      onRates([saved])
      setRetry((value) => value + 1)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Archive update failed.')
    } finally {
      setChanging(false)
    }
  }
  function search(event: FormEvent) {
    event.preventDefault()
    setFilter({ query: query.trim(), unit, category: category.trim(), archived, offset: 0 })
  }
  return (
    <section
      aria-label="Browse rate catalogue"
      className="my-4 rounded border border-stone-300 p-4"
    >
      <h3>Browse rate versions</h3>
      <form onSubmit={search} className="grid gap-3 md:grid-cols-3">
        <label>
          Search rate code or description
          <input maxLength={160} value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <label>
          Filter rate unit
          <select value={unit} onChange={(event) => setUnit(event.target.value)}>
            <option value="">All units</option>
            <option value="m2">Square metres</option>
            <option value="m">Metres</option>
            <option value="item">Items</option>
          </select>
        </label>
        <label>
          Filter rate category
          <input
            maxLength={80}
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={archived}
            onChange={(event) => setArchived(event.target.checked)}
          />{' '}
          Show archived rate versions
        </label>
        <Button type="submit" disabled={busy || changing}>
          Search catalogue
        </Button>
      </form>
      {busy && <p role="status">Loading catalogue...</p>}
      {error && (
        <div role="alert">
          {error}
          <Button variant="outline" onClick={() => setRetry((value) => value + 1)}>
            Retry catalogue
          </Button>
        </div>
      )}
      {!busy && !error && page && (
        <>
          <p role="status">
            {page.total === 0
              ? 'No matching rates.'
              : `Rate versions ${page.offset + 1}-${page.offset + page.items.length} of ${page.total}`}
          </p>
          <p>
            Versions shown here become available in the rate assignment selectors below. Existing
            assignments retain their original version.
          </p>
          {page.items.map((rate) => (
            <article key={rate.id} className="my-2 border-t border-stone-300 py-3">
              <strong>
                {rate.code} v{rate.version} - {rate.description}
              </strong>
              <p>
                {rate.amount === undefined
                  ? 'Internal amount restricted'
                  : `MYR ${rate.amount}/${rate.unit}`}{' '}
                | effective {rate.effective_date}
              </p>
              <p>
                {rate.category} / {rate.source_note}
              </p>
              <Button
                type="button"
                variant="outline"
                disabled={rate.amount === undefined}
                onClick={() => onEdit(rate)}
              >
                Revise {rate.code} v{rate.version}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={changing || busy || rate.amount === undefined}
                onClick={() => void archive(rate)}
              >
                {rate.archived ? 'Restore' : 'Archive'} {rate.code} v{rate.version}
              </Button>
            </article>
          ))}
          <Button
            type="button"
            variant="outline"
            disabled={page.offset === 0}
            onClick={() =>
              setFilter((value) => ({ ...value, offset: Math.max(0, value.offset - 20) }))
            }
          >
            Previous rate page
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={page.offset + page.items.length >= page.total}
            onClick={() => setFilter((value) => ({ ...value, offset: value.offset + 20 }))}
          >
            Next rate page
          </Button>
        </>
      )}
    </section>
  )
}
