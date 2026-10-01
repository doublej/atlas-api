import { describe, expect, it, vi } from 'vitest'

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), delete: vi.fn() }))
vi.mock('$app/navigation', () => ({ invalidateAll: vi.fn() }))
vi.mock('$lib/http', async (original) => ({
  ...(await original<typeof import('$lib/http')>()),
  http,
}))

const { HttpError } = await import('$lib/http')
const { follow, job, poll, runJob } = await import('./disk-client.svelte')

const running = (id: string, command: string) => ({
  id,
  args: [command, '--confirmed'],
  pgid: 1,
  startedAt: '',
  done: false,
  exit: null,
})

describe('the followed job', () => {
  it('keeps following a running job when another is started', async () => {
    follow(running('1-archive', 'archive'))
    expect(await runJob('trim', [])).toBe(false) // so a Note keeps its text
    expect(http.post).not.toHaveBeenCalled()
    expect(job.current?.id).toBe('1-archive')
  })

  it('drops a poll answer for a job that is no longer followed', async () => {
    follow(running('1-analyze', 'analyze'))
    let answer: (s: unknown) => void = () => {}
    http.get.mockReturnValueOnce(new Promise((r) => (answer = r)))
    const pending = poll()
    follow(running('2-scan', 'scan'))
    answer({ ...running('1-analyze', 'analyze'), done: true, exit: 0, text: 'old\n', offset: 4 })
    expect(await pending).toBe(false)
    expect(job.current?.id).toBe('2-scan')
    expect([job.text, job.offset]).toEqual(['', 0])
  })

  it('ends a job whose file is gone, so the next one can start', async () => {
    follow(running('3-trim', 'trim'))
    http.get.mockRejectedValueOnce(new HttpError(404, 'no such job'))
    expect(await poll()).toBe(false)
    http.post.mockResolvedValueOnce(running('4-scan', 'scan'))
    expect(await runJob('scan', [])).toBe(true)
    expect(job.current?.id).toBe('4-scan')
  })
})
