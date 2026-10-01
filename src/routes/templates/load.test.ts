import { describe, expect, it, vi } from 'vitest'

const scan = vi.hoisted(() => vi.fn())
const discoverTemplates = vi.hoisted(() => vi.fn())
vi.mock('$lib/scanner', () => ({ scan }))
vi.mock('$lib/templates', () => ({ discoverTemplates }))

const { load } = await import('./+page.server')

const template = {
  family: 'web',
  name: 'svelte',
  description: '',
  version: '1.0.0',
  path: '/t/web/svelte',
  variables: [],
}

describe('templates load', () => {
  it('keeps the templates when the scan fails, and says so', async () => {
    discoverTemplates.mockResolvedValue({ templates: [template], errors: [] })
    scan.mockRejectedValue(new Error('cache unreadable'))
    const data = await load()
    expect(data.templates).toHaveLength(1)
    expect(data.failures).toEqual(['scan: cache unreadable'])
  })

  it('renders an empty catalog when the template folder cannot be read', async () => {
    discoverTemplates.mockRejectedValue(new Error('EACCES'))
    scan.mockResolvedValue({ projects: [] })
    const data = await load()
    expect(data.templates).toEqual([])
    expect(data.failures).toEqual(['templates: EACCES'])
  })
})
