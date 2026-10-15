import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import PlaceSearch from './PlaceSearch'

vi.mock('../services/map', () => ({ geocoderUrl: 'https://example.invalid/search' }))
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it('keeps timed-out input and retries successfully without changing the site until selected', async () => {
  const select = vi.fn()
  const fetch = vi
    .fn()
    .mockRejectedValueOnce(new DOMException('signal timed out', 'TimeoutError'))
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          features: [
            {
              geometry: { type: 'Point', coordinates: [101.69, 3.14] },
              properties: { name: 'Kuala Lumpur' },
            },
          ],
        }),
      ),
    )
  vi.stubGlobal('fetch', fetch)
  render(<PlaceSearch onSelect={select} />)
  fireEvent.change(screen.getByLabelText('Search for a place'), {
    target: { value: 'Kuala Lumpur' },
  })
  fireEvent.click(screen.getByText('Search places'))
  await screen.findByText(/Place search timed out/)
  expect((screen.getByLabelText('Search for a place') as HTMLInputElement).value).toBe(
    'Kuala Lumpur',
  )
  expect(select).not.toHaveBeenCalled()
  fireEvent.click(screen.getByText('Retry place search'))
  fireEvent.click(await screen.findByRole('button', { name: 'Kuala Lumpur' }))
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(select).toHaveBeenCalledOnce()
})

it('cancels pending search and ignores a late response', async () => {
  let resolve!: (response: Response) => void
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Promise<Response>((done) => {
          resolve = done
        }),
    ),
  )
  render(<PlaceSearch onSelect={vi.fn()} />)
  fireEvent.change(screen.getByLabelText('Search for a place'), { target: { value: 'Old query' } })
  fireEvent.click(screen.getByText('Search places'))
  fireEvent.click(screen.getByText('Cancel search'))
  resolve(
    new Response(
      JSON.stringify({
        features: [
          {
            geometry: { type: 'Point', coordinates: [101.69, 3.14] },
            properties: { name: 'Stale place' },
          },
        ],
      }),
    ),
  )
  await waitFor(() => expect(screen.getByText(/Search cancelled/)).toBeTruthy())
  expect(screen.queryByRole('button', { name: 'Stale place' })).toBeNull()
})
