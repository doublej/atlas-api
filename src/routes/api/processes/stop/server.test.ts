import { describe, expect, it, vi } from 'vitest'

vi.mock('$lib/processes/stop', async (load) => ({
  ...(await load<typeof import('$lib/processes/stop')>()),
  stopProcesses: () => Promise.reject(new Error('/bin/ps took over 5s (load 240)')),
}))

describe('POST /api/processes/stop', () => {
  it('answers a ps that timed out with 503 and the reason', async () => {
    const { POST } = await import('./+server')
    const request = new Request('http://localhost/api/processes/stop', {
      method: 'POST',
      body: JSON.stringify({ targets: [{ pid: 4242, startedAt: 'Wed Oct  1 10:00:00 2026' }] }),
    })
    const res = await POST({ request } as never)
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'stop failed — /bin/ps took over 5s (load 240)' })
  })
})
