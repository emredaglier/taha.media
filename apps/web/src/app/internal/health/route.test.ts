import { describe, expect, it, vi } from 'vitest'

// A plain function, not a vi.fn: Vitest reports an error that a mock throws as a test failure,
// even when the code under test handles it.
const state = vi.hoisted(() => ({ open: (): Promise<unknown> => Promise.resolve({}) }))
vi.mock('../../../lib/payload', () => ({ getWebPayload: () => state.open() }))

import { GET } from './route'

describe('GET /internal/health (container health check)', () => {
  it('is healthy when the shared database answers a query', async () => {
    const count = vi.fn().mockResolvedValue({ totalDocs: 0 })
    state.open = () => Promise.resolve({ count })
    const response = await GET()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'ok' })
    expect(count).toHaveBeenCalledOnce()
  })

  it('is unhealthy (503) when the database cannot be opened', async () => {
    state.open = () => Promise.reject(new Error('unable to open database file'))
    expect((await GET()).status).toBe(503)
  })

  it('is unhealthy (503) when the query fails', async () => {
    state.open = () =>
      Promise.resolve({ count: () => Promise.reject(new Error('database is locked')) })
    const response = await GET()
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ status: 'unhealthy' })
  })
})
