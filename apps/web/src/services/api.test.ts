import { api, ApiError } from './api'

describe('API runtime validation and errors', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('rejects an unexpected healthy response rather than claiming API compatibility', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'ok', service: 'different-api', version: '1' }))))
    await expect(api.health()).rejects.toMatchObject({ code: 'invalid_response', status: 502 })
  })
  it('passes bearer authentication, surfaces a revision conflict and preserves the request ID', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'revision_conflict', message: 'Reload and review.' } }), { status: 409, headers: { 'X-Request-ID': 'request-123' } }))
    vi.stubGlobal('fetch', fetcher)
    await expect(api.update('org', 'project', { expected_revision: 1, name: 'New' }, 'test-token')).rejects.toMatchObject({ name: 'ApiError', code: 'revision_conflict', requestId: 'request-123', status: 409 })
    expect(fetcher.mock.calls[0][1].headers.Authorization).toBe('Bearer test-token')
  })
  it('reports unavailable network separately from an empty project list', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Offline')))
    await expect(api.projects('org', 'token')).rejects.toBeInstanceOf(ApiError)
  })
})
