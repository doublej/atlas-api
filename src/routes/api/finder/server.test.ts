import { describe, expect, it, vi } from 'vitest'
import { DEV_FOLDER } from '$lib/config'

const child = vi.hoisted(() => ({
  exec: vi.fn((_command: string, cb: (e: Error | null) => void) => cb(null)),
  execFile: vi.fn((_file: string, _args: string[], cb: (e: Error | null) => void) => cb(null)),
}))
vi.mock('node:child_process', () => child)

describe('POST /api/finder', () => {
  it('opens a path with shell syntax in it without a shell', async () => {
    const { POST } = await import('./+server')
    const path = `${DEV_FOLDER}/a"$(touch x)`
    const request = new Request('http://localhost/api/finder', {
      method: 'POST',
      body: JSON.stringify({ path }),
    })
    const res = await POST({ request } as never)
    expect(await res.json()).toEqual({ opened: true })
    expect(child.exec).not.toHaveBeenCalled()
    expect(child.execFile).toHaveBeenCalledWith('open', [path], expect.any(Function))
  })
})
