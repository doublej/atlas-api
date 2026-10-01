import { describe, expect, it, vi } from 'vitest'

vi.mock('$lib/services', () => ({ syncServices: () => Promise.resolve() }))

describe('handle', () => {
  it('forbids framing on every response it lets through', async () => {
    const { handle } = await import('./hooks.server')
    const url = new URL('http://localhost:47891/processes')
    const event = {
      isSubRequest: false,
      request: new Request(url, { headers: { host: 'localhost:47891' } }),
      url,
      route: { id: '/processes' },
    }
    const res = await handle({ event, resolve: async () => new Response('page') } as never)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-security-policy')).toBe("frame-ancestors 'none'")
    expect(res.headers.get('x-frame-options')).toBe('DENY')
  })
})
