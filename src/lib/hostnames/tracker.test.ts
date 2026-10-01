import { afterEach, describe, expect, it, vi } from 'vitest'
import { markSyncing, trackedState, watchLive } from './tracker'

afterEach(() => vi.useRealTimers())

describe('watchLive', () => {
  it('goes syncing → issuing → live once the name answers over valid TLS', async () => {
    vi.useFakeTimers()
    markSyncing('a')
    expect(trackedState('a')?.state).toBe('syncing')
    let calls = 0
    const done = watchLive('a', 'a.example', async () => ++calls > 2)
    expect(trackedState('a')?.state).toBe('issuing')
    await vi.advanceTimersByTimeAsync(5000)
    await done
    expect(trackedState('a')).toEqual({ state: 'live' })
    expect(calls).toBe(3)
  })

  it('fails after two minutes without a certificate', async () => {
    vi.useFakeTimers()
    const done = watchLive('b', 'b.example', async () => false)
    await vi.advanceTimersByTimeAsync(121_000)
    await done
    expect(trackedState('b')).toMatchObject({
      state: 'failed',
      error: expect.stringContaining('2 min'),
    })
  })

  it('lets a newer push supersede an older watch', async () => {
    vi.useFakeTimers()
    const old = watchLive('c', 'c.example', async () => false)
    markSyncing('c')
    await vi.advanceTimersByTimeAsync(3000)
    await old
    expect(trackedState('c')?.state).toBe('syncing')
  })
})
