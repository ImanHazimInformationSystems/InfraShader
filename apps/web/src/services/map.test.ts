import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Map as MapboxMap } from 'mapbox-gl'

beforeEach(() => {
  sessionStorage.clear()
  vi.stubEnv('VITE_MAP_STYLE_URL', '')
  vi.stubEnv('VITE_MAPBOX_OFFLINE', 'false')
  vi.stubEnv('VITE_MAPBOX_ACCESS_TOKEN', 'pk.synthetic_public_token_for_unit_tests_only')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.resetModules()
})
describe('basemap recovery', () => {
  it('retries a failed load and isolates style copies between consumers', async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          version: 8,
          sources: {},
          layers: [{ id: 'background', type: 'background' }],
        }),
      })
    vi.stubGlobal('fetch', fetcher)
    const { loadBasemap } = await import('./map')
    expect((await loadBasemap()).available).toBe(false)
    const result = await loadBasemap()
    expect(result.available).toBe(true)
    result.style.imports![0].config!.show3dTrees = false
    expect((await loadBasemap()).style.imports![0].config!.show3dTrees).toBe(true)
    expect(fetcher).toHaveBeenCalledTimes(2)
    await loadBasemap(true)
    expect(fetcher).toHaveBeenCalledTimes(3)
  })
  it('explains a provider rate limit separately from a refused token and retries next time', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce({ ok: false, status: 403 })
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({ version: 8 }) })
    vi.stubGlobal('fetch', fetcher)
    const { loadBasemap } = await import('./map')
    const limited = await loadBasemap()
    expect(limited.available).toBe(false)
    expect(limited.message).toContain('busy right now')
    expect(limited.message).toContain('HTTP 429')
    expect(limited.message).not.toContain('token')
    const refused = await loadBasemap()
    expect(refused.message).toContain('refused the public token')
    expect((await loadBasemap()).available).toBe(true)
    expect(fetcher).toHaveBeenCalledTimes(3)
  })
  it('uses a blank coordinate fallback for absent/secret tokens and makes no content requests', async () => {
    vi.stubEnv('VITE_MAPBOX_ACCESS_TOKEN', 'sk.not_a_browser_safe_token')
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    const { loadBasemap } = await import('./map')
    expect((await loadBasemap()).available).toBe(false)
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('adds satellite imagery while preserving Standard trees, project layers and camera', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ version: 8 }) }),
    )
    const { mapboxStyle, switchBasemap } = await import('./map')
    const style = mapboxStyle('standard')
    const layers = new Set(['workspace-fill', 'tree-models']),
      sources = new Set(['workspace'])
    const fake = {
      getSource: (id: string) => sources.has(id),
      getLayer: (id: string) => layers.has(id),
      addSource: vi.fn((id: string) => sources.add(id)),
      addLayer: vi.fn((layer: { id: string }) => layers.add(layer.id)),
      setLayoutProperty: vi.fn(),
      setStyle: vi.fn(),
      jumpTo: vi.fn(),
      getContainer: () => ({ dataset: {} }),
    }
    await switchBasemap(fake as unknown as MapboxMap, 'satellite')
    expect(style.imports![0].config!.show3dTrees).toBe(true)
    expect(fake.addLayer).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'infra-satellite', slot: 'middle' }),
    )
    expect(layers.has('workspace-fill') && layers.has('tree-models')).toBe(true)
    expect(fake.setStyle).not.toHaveBeenCalled()
    expect(fake.jumpTo).not.toHaveBeenCalled()
    await switchBasemap(fake as unknown as MapboxMap, 'standard')
    expect(fake.setLayoutProperty).toHaveBeenLastCalledWith('infra-satellite', 'visibility', 'none')
  })
  it('clears no project data when the provider rejects a style request', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    const { switchBasemap } = await import('./map')
    const fake = { addSource: vi.fn(), setStyle: vi.fn() }
    await expect(switchBasemap(fake as unknown as MapboxMap, 'satellite')).rejects.toThrow(
      'could not load',
    )
    expect(fake.addSource).not.toHaveBeenCalled()
    expect(fake.setStyle).not.toHaveBeenCalled()
  })
  it('retains HTTP status while removing URLs/tokens from provider diagnostics', async () => {
    const { safeMapError } = await import('./map')
    const error = Object.assign(
      new Error('Failure https://provider.invalid/tile?access_token=pk.example.secret'),
      { status: 429 },
    )
    expect(safeMapError(error)).toBe('HTTP 429: Failure [provider URL]')
  })
})
