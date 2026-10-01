import { afterEach, describe, expect, it, vi } from 'vitest'
import { HttpError, http } from './http'

function respond(body: string | null, init: ResponseInit = {}) {
  const fetch = vi.fn(async () => new Response(body, init))
  vi.stubGlobal('fetch', fetch)
  return fetch
}

afterEach(() => vi.unstubAllGlobals())

describe('http', () => {
  it('returns the parsed body and sends JSON with a method', async () => {
    const fetch = respond('{"ok":true}')
    expect(await http.put('/api/x', { a: 1 })).toEqual({ ok: true })
    expect(fetch).toHaveBeenCalledWith('/api/x', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: '{"a":1}',
    })
  })

  it('sends no body or content-type on a GET, and an empty 2xx is undefined', async () => {
    const fetch = respond(null, { status: 204 })
    expect(await http.get('/api/x')).toBeUndefined()
    expect(fetch).toHaveBeenCalledWith('/api/x', {
      method: 'GET',
      headers: undefined,
      body: undefined,
    })
  })

  it("throws the API's error field first", async () => {
    respond('{"error":"writes disabled","message":"ignored"}', { status: 403 })
    const err = await http.post('/api/x').catch((e) => e)
    expect(err).toBeInstanceOf(HttpError)
    expect(err).toMatchObject({ status: 403, message: 'writes disabled' })
  })

  it("falls back to SvelteKit's message field", async () => {
    respond('{"message":"Not found"}', { status: 404 })
    await expect(http.get('/api/x')).rejects.toThrow('Not found')
  })

  it('falls back to the status line when the body says nothing', async () => {
    respond('<html>oops</html>', { status: 502, statusText: 'Bad Gateway' })
    await expect(http.delete('/api/x')).rejects.toThrow('502 Bad Gateway')
    respond('{"error":""}', { status: 500 })
    await expect(http.patch('/api/x', {})).rejects.toThrow(/^500$/)
  })
})
