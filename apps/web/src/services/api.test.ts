import { api, ApiError, transportFailure } from './api'

describe('API runtime validation and errors', () => {
  it('identifies rejected fields without swallowing the server validation detail', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({error:{code:'validation_error',message:'Check the marked fields.',details:[{field:'body.height_m',message:'Input should be greater than 0'}]}}),{status:422})))
    await expect(api.update('org','project',{expected_revision:1},'token')).rejects.toMatchObject({message:'Check the marked fields. height_m: Input should be greater than 0'})
  })
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
  it('explains a timeout as a slow or starting server, without retrying the read', async () => {
    const slow = vi.fn().mockRejectedValue(new DOMException('signal timed out', 'TimeoutError'))
    vi.stubGlobal('fetch', slow)
    const failure = await api.projects('org', 'token').catch((reason: unknown) => reason)
    expect(failure).toMatchObject({ code: 'timeout', status: 0 })
    expect((failure as ApiError).message).toMatch(/did not answer in time/)
    expect(slow).toHaveBeenCalledTimes(1)
  })
  it('reports offline devices and caller cancellation separately', () => {
    vi.stubGlobal('navigator', { onLine: false })
    expect(transportFailure(new TypeError('Failed to fetch'), false).code).toBe('offline')
    expect(transportFailure(new DOMException('aborted', 'AbortError'), true).code).toBe('aborted')
  })
  it('shows a short reference for server failures, including gateways without JSON', async () => {
    const serverError = { error: { code: 'internal_error', message: 'The operation failed on the server.' }, request_id: 'abcdef12-3456' }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(serverError), { status: 500, headers: { 'X-Request-ID': 'abcdef12-3456' } })))
    await expect(api.project('org', 'p', 'token')).rejects.toMatchObject({ code: 'internal_error', message: 'The operation failed on the server. Reference: abcdef12.' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Bad gateway', { status: 502 })))
    await expect(api.project('org', 'p', 'token')).rejects.toMatchObject({ code: 'upstream_unavailable', status: 502 })
  })
  it('keeps the readiness body so pending migrations can be named', async () => {
    const body = { status: 'unavailable', checks: { database: 'migrations_pending', auth: 'ready', schema: 'behind' } }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 503 })))
    await expect(api.readiness()).rejects.toMatchObject({ status: 503, body })
  })
  it('retries a safe read once after a transient network failure, never a write', async () => {
    const ok = () => new Response(JSON.stringify({ items: [], total: 0, limit: 24, offset: 0 }), { status: 200 })
    const reads = vi.fn().mockRejectedValueOnce(new TypeError('socket reset')).mockResolvedValue(ok())
    vi.stubGlobal('fetch', reads)
    await api.projects('org', 'token').catch(() => undefined)
    expect(reads).toHaveBeenCalledTimes(2)
    const writes = vi.fn().mockRejectedValue(new TypeError('socket reset'))
    vi.stubGlobal('fetch', writes)
    await expect(api.update('org', 'project', { expected_revision: 1 }, 'token')).rejects.toMatchObject({ code: 'network_error' })
    expect(writes).toHaveBeenCalledTimes(1)
  })
})
