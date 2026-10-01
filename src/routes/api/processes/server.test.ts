import { describe, expect, it, vi } from 'vitest'

vi.mock('$lib/processes/snapshot', () => ({
  getSnapshot: () => Promise.reject(new Error('/bin/ps took over 5s (load 96)')),
}))

describe('GET /api/processes', () => {
  it('answers a snapshot that timed out with 503 and the reason', async () => {
    const { GET } = await import('./+server')
    const res = await GET({ url: new URL('http://localhost/api/processes') } as never)
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({
      error: 'process snapshot failed — /bin/ps took over 5s (load 96)',
    })
  })
})
