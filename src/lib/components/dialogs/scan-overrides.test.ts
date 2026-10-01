import { describe, expect, it } from 'vitest'
import { applyScanOverrides } from './scan-overrides'

describe('applyScanOverrides', () => {
  it('changes only this path and keeps the ignore patterns PUT /api/config would otherwise drop', () => {
    const config = {
      maxDepth: 3,
      depth: { 'web/a': 2 },
      force: { 'web/b': true },
      ignore: ['*/app-worktrees/*'],
    }
    expect(applyScanOverrides(config, 'web/a', 'false', '')).toEqual({
      maxDepth: 3,
      depth: {},
      force: { 'web/b': true, 'web/a': false },
      ignore: ['*/app-worktrees/*'],
    })
    expect(config.depth).toEqual({ 'web/a': 2 }) // the loaded config stays the "before" for the diff
  })
})
