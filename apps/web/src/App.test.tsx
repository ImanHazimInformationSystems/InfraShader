import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react'
import App from './App'
import { DEMO_STORAGE_KEY } from './services/demo'

vi.mock('./services/auth', () => ({ supabase: null, authConfigured: false }))
vi.mock('./components/SiteMap', () => ({ default: ({ bounds }: { bounds: number[] }) => <div aria-label="Test site extent">{bounds.join(', ')}</div> }))

describe('separate Browser Demo workflow', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.stubGlobal('fetch', vi.fn(async (path: string) => path.endsWith('/health')
      ? new Response(JSON.stringify({ status: 'ok', service: 'infrashader-api', version: '0.1.0' }))
      : new Response(JSON.stringify({ error: { code: 'unavailable', message: 'Not configured' } }), { status: 503 })))
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })
  afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

  it.each(['Developer decision', 'Contractor proposal'])('carries the site into a saved %s project, reloads and restores it', async (purpose) => {
    const view = render(<RouterProvider router={createMemoryRouter([{path:'*',element:<App />}])} />)
    fireEvent.click(screen.getByRole('button', { name: /Open Browser Demo/ }))
    await screen.findByRole('heading', { name: 'Find your first site.' })
    fireEvent.click(screen.getAllByRole('button', { name: /Explore Map/ }).at(-1)!)
    fireEvent.change(screen.getByLabelText('West longitude'), { target: { value: '101.681' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply coordinates' }))
    fireEvent.click(screen.getByRole('button', { name: /Continue with this site/ }))
    fireEvent.click(screen.getByRole('radio', { name: new RegExp(purpose) }))
    fireEvent.change(screen.getByLabelText(/Project name/), { target: { value: 'Courtyard test' } })
    fireEvent.change(screen.getByLabelText(/Internal sponsor|Client \/ customer/), { target: { value: 'Site team' } })
    fireEvent.click(screen.getByRole('button', { name: /Create project/ }))
    await screen.findByRole('heading', { name: 'Courtyard test' })
    expect((await screen.findByLabelText('Test site extent')).textContent).toBe('101.681, 3.13, 101.7, 3.15')
    expect(screen.getByText(/Brief incomplete/)).toBeTruthy()
    expect(JSON.parse(localStorage.getItem(DEMO_STORAGE_KEY)!)[0].purpose).toBe(purpose === 'Developer decision' ? 'developer_decision' : 'contractor_proposal')
    view.unmount()
    render(<RouterProvider router={createMemoryRouter([{path:'*',element:<App />}])} />)
    fireEvent.click(screen.getByRole('button', { name: /Open Browser Demo/ }))
    fireEvent.click(await screen.findByRole('button', { name: /Courtyard test/ }))
    await screen.findByRole('heading', { name: 'Courtyard test' })
    fireEvent.click(screen.getByRole('button', { name: /Archive project/ }))
    await screen.findByText('Archived project')
    fireEvent.click(screen.getByRole('button', { name: /Restore project/ }))
    await screen.findByText('Project restored.')
    expect(JSON.parse(localStorage.getItem(DEMO_STORAGE_KEY)!)[0].archived).toBe(false)
    await waitFor(() => expect(screen.getByText(/API reachable/)).toBeTruthy())
    for (const [path] of vi.mocked(fetch).mock.calls) expect(String(path)).toMatch(/\/api\/v1\/(health|readiness)$/)
  })

  it('keeps unsaved form changes when the user cancels navigation', async () => {
    render(<RouterProvider router={createMemoryRouter([{path:'*',element:<App />}])} />)
    fireEvent.click(screen.getByRole('button', { name: /Open Browser Demo/ }))
    fireEvent.click(await screen.findByRole('button', { name: /New project/ }))
    fireEvent.click(screen.getByRole('button', { name: /Continue with this site/ }))
    fireEvent.change(screen.getByLabelText(/Project name/), { target: { value: 'Unsaved project' } })
    vi.mocked(window.confirm).mockReturnValue(false)
    fireEvent.click(screen.getByRole('button', { name: 'All projects' }))
    expect((screen.getByLabelText(/Project name/) as HTMLInputElement).value).toBe('Unsaved project')
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('unsaved'))
  })
})
