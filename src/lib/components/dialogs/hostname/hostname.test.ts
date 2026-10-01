import { describe, expect, it } from 'vitest'
import type { SlugCheck } from '$lib/hostnames/types'
import { slugBlocker } from './hostname.svelte'

const verdict = (status: SlugCheck['status']): SlugCheck => ({
  slug: 'foo',
  status,
  reason: `${status} reason`,
  local: 'https://foo.atlas.local.jurrejan.com',
  remote: null,
})

describe('slugBlocker', () => {
  it('lets an unchanged taken slug save, like the server, and blocks the rest', () => {
    expect(slugBlocker(verdict('taken'), 'foo', 'foo')).toBeNull()
    expect(slugBlocker(verdict('taken'), null, null)).toBeNull() // folder slug, unchanged
    expect(slugBlocker(verdict('taken'), 'foo', null)).toBe('taken reason')
    expect(slugBlocker(verdict('invalid'), 'Foo', 'Foo')).toBe('invalid reason')
    expect(slugBlocker(verdict('free'), 'foo', null)).toBeNull()
  })
})
