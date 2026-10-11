import { describe, expect, it } from 'vitest'
import { fieldsFromMeta, patchFromFields } from './settings-form'

describe('settings form mapping', () => {
  it('reads every umami and domain shape and writes them back as one', () => {
    const fields = fieldsFromMeta({
      domain: 'a.com',
      domains: ['b.com'],
      umami: { websiteIds: ['id1'], instance: 'https://u.example' },
      port: 4100,
      slug: 'x',
    })
    expect(fields.domains).toBe('a.com, b.com')
    expect(fields.umamiIds).toBe('id1')
    expect(patchFromFields(fields)).toMatchObject({
      domain: null,
      domains: ['a.com', 'b.com'],
      umami: { websiteIds: ['id1'], instance: 'https://u.example' },
      port: 4100,
      slug: 'x',
    })
    expect(fieldsFromMeta({ umami: 'solo' }).umamiIds).toBe('solo')
  })

  it('clears what the form left empty instead of pinning an empty string', () => {
    const patch = patchFromFields(fieldsFromMeta({}))
    expect(patch).toMatchObject({ description: null, slug: null, domains: null, umami: null })
    expect(patch.archived).toBeNull()
  })
})
